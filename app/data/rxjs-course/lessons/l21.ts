import { L, withKind } from '../../course-builders.ts'

export const L21 = withKind(
  L(
    'L21',
    4,
    '热流选型与内存泄漏排查：Subject vs share 实战',
    3,
    ['L20'],
    ['c-subject'],
    [
      '实现一个热流生命周期探针并跑通泄漏检测',
      '写出组件卸载后订阅未回收的负例并断言能抓到',
      '搭好无界缓冲与 refCount 失配两项检查',
      '产出一份排障清单',
    ],
    `
### 一次事故：切了十二次页面，浏览器里挂着十二个定时器

后台看板上线后，用户反馈「越用越卡」。性能面板显示定时器与事件监听持续增长：每次从详情页切回列表页，旧的轮询没有被取消，只是界面被隐藏了。团队先补了一个布尔量 \`mounted\`，在回调里判断组件是否还在；后来又加了 WebSocket 监听、动画帧、主题订阅，每一处都要重复这套判断，漏一处就漏一次泄漏。复盘时最有价值的一句话是：**我们一直在检查「回调要不要执行」，却没有检查「源侧还有没有登记听众」**。这节课把热流泄漏拆成三类可探测的成因，做一个生命周期探针，并把「组件卸载后账本是否归还」写成可失败的断言。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 热流泄漏有哪三类 | 订阅未回收、无界缓冲、refCount 配置失配 |
| 为什么布尔量挡不住泄漏 | 它只让下游忽略回调，源侧监听器 / 定时器仍然登记着 |
| 判据应该看哪里 | 看源侧账本：活跃监听数、缓冲长度、归零后是否仍连接 |
| 本课不回答什么 | 共享正常生命周期（L19）、重放语义（L18）、冷流选型（L02） |

### 三类泄漏源对照表

| 成因 | 源侧表现 | 典型代码 | 排查判据 |
|---|---|---|---|
| 订阅未回收 | 监听数不随卸载下降 | \`theme$.subscribe(apply)\` 没有加入父账本 | 卸载后 \`listenerCount > 0\` |
| 无界缓冲 | 缓冲长度单调增长 | 无上限的 \`ReplaySubject\` / 重放配置 | \`bufferLength > max\` |
| refCount 失配 | 订阅数归零但上游仍连接 | 裸 \`Subject\` 桥或常驻共享没写收口 | \`count === 0 && connected === true\` |

三行里最容易误判的是第三行：常驻共享（L20）本来就是「归零不断开」，它是否是泄漏取决于**有没有人负责在应用退出时释放**。所以探针不能只报「归零仍连接」，还要区分「有收口责任登记的常驻连接」与「谁都没管的裸连接」。把收口责任显式登记成数据，才能把「配置选择」与「泄漏」分开。

\`\`\`ts title="热流生命周期探针" note="所有订阅挂到父 Subscription；finalize 覆盖 complete / error / unsubscribe 三条路径。"
import { interval, Subscription, BehaviorSubject, of } from "rxjs"
import { finalize, tap } from "rxjs/operators"

type Report = { listeners: number; connected: boolean; teardowns: number }

function createProbe() {
  const parent = new Subscription()
  const state = new BehaviorSubject<string>("light")
  let teardowns = 0
  let listeners = 0
  let connected = false

  return {
    mount(component: string): void {
      listeners += 1
      connected = true
      // 所有订阅统一挂账本，卸载只需一次 parent.unsubscribe()
      parent.add(
        interval(1000)
          .pipe(
            tap(() => console.log("poll", component)),
            finalize(() => { teardowns += 1 }),
          )
          .subscribe(),
      )
      // BehaviorSubject 自带当前值，不需要再补一次 startWith（L18）
      parent.add(state.subscribe(console.log))
      parent.add(
        of("ready").pipe(finalize(() => console.log("one-shot cleaned"))).subscribe(),
      )
    },
    /** 组件卸载：父账本一次性归还，所有子订阅连带释放。 */
    unmount(): void {
      parent.unsubscribe()
      listeners = 0
      connected = false
    },
    report(): Report {
      return { listeners, connected, teardowns }
    },
  }
}

const probe = createProbe()
probe.mount("dashboard")
console.log("mounted", probe.report())
probe.unmount()
console.log("unmounted", probe.report())

// 有界状态：BehaviorSubject 恒定只存 1 个当前值，不会随推送增长
const bounded = new BehaviorSubject<number>(0)
for (let i = 0; i < 100; i++) bounded.next(i)
console.log("current", bounded.value) // 始终只保留 1 个当前值
\`\`\`

### 用最小模型把「账本是否归还」变成可断言的事实

下面不依赖 RxJS 包，实现一个探针：登记挂载 / 卸载、缓冲、连接状态与收口责任，再用四条断言分别验证「全部卸载干净」与三类泄漏能被抓到。

\`\`\`ts
import assert from "node:assert/strict"

type Issue = "订阅未回收" | "无界缓冲" | "refCount 失配" | "常驻未登记收口"

class Probe {
  private listeners = new Set<string>()
  private buffer: number[] = []
  connected = false
  private hasOwner = false

  mount(id: string): void {
    this.listeners.add(id)
    this.connected = true
  }
  unmount(id: string): void {
    this.listeners.delete(id)
    if (this.listeners.size === 0 && !this.hasOwner) this.connected = false
  }
  emit(v: number): void { this.buffer.push(v) }
  /** 常驻连接必须显式登记「谁负责释放」，否则探针判为泄漏。 */
  declareOwner(): void { this.hasOwner = true; this.connected = true }
  release(): void { this.hasOwner = false; this.connected = false }

  report(maxBuffer: number): { listeners: number; bufferSize: number; connected: boolean; issues: Issue[] } {
    const issues: Issue[] = []
    if (this.listeners.size > 0) issues.push("订阅未回收")
    if (this.buffer.length > maxBuffer) issues.push("无界缓冲")
    if (this.listeners.size === 0 && this.connected && !this.hasOwner) {
      issues.push("refCount 失配")
    }
    if (this.listeners.size === 0 && this.connected && this.hasOwner) {
      issues.push("常驻未登记收口")
    }
    return {
      listeners: this.listeners.size,
      bufferSize: this.buffer.length,
      connected: this.connected,
      issues,
    }
  }
}

function assertClean(p: Probe, maxBuffer = 10): void {
  const r = p.report(maxBuffer)
  assert.equal(r.listeners, 0, "卸载后源侧监听数必须归零")
  assert.equal(r.connected, false, "归零后不得仍保持连接")
  assert.deepEqual(r.issues, [])
}

// 正常路径：三个组件挂载、全部卸载
const clean = new Probe()
for (const id of ["header", "sidebar", "breadcrumb"]) clean.mount(id)
assert.equal(clean.report(10).listeners, 3)
for (const id of ["header", "sidebar", "breadcrumb"]) clean.unmount(id)
assertClean(clean)

// 负例一：少卸载一个组件，布尔量挡住回调也骗不过探针
const leaked = new Probe()
leaked.mount("a")
leaked.mount("b")
leaked.unmount("a")
assert.deepEqual(leaked.report(10).issues, ["订阅未回收", "refCount 失配"])

// 负例二：无界缓冲
const growing = new Probe()
for (let i = 0; i < 50; i++) growing.emit(i)
assert.ok(growing.report(10).issues.includes("无界缓冲"))

// 负例三：订阅数归零但连接未断开（裸 Subject 桥 / 失配的共享）
const mismatched = new Probe()
mismatched.mount("x")
mismatched.unmount("x")
mismatched.connected = true
assert.ok(mismatched.report(10).issues.includes("refCount 失配"))

// 常驻配置：必须登记收口，并在释放后通过检查
const resident = new Probe()
resident.mount("y")
resident.unmount("y")
resident.declareOwner()
assert.ok(resident.report(10).issues.includes("常驻未登记收口"))
resident.release()
assertClean(resident)
\`\`\`

最后一组断言是本课的关键设计：常驻共享不是错误，但**没有登记收口责任的常驻连接是错误**。\`declareOwner()\` 把责任变成数据，探针才能在「还有人管」与「谁都没管」之间做出区分。真实项目里这个「登记」可以是一个应用级的 \`Subscription\`、一个明确的 \`dispose()\`，或者一条写在 DESIGN 里的约定——重点是它必须可被检查，而不是靠口头承诺。

### 一次排障的完整推演

以「用户切页十二次」为例，把布尔量方案与账本方案并排：

| 步骤 | 布尔量方案：源侧监听数 | 账本方案：源侧监听数 | 界面表现 |
|---|---|---|---|
| 首次挂载 | 1 | 1 | 正常 |
| 切走 | 1（回调被挡住） | 0（teardown 执行） | 都「看起来正常」 |
| 第二次挂载 | 2 | 1 | 都正常 |
| 第十二次挂载 | 12 | 1 | 布尔量方案明显卡顿 |
| 探针报告 | 12 个监听、12 个定时器 | 监听数 0/1 | 前者三类 issue 全中 |

第 2 行解释了为什么这类泄漏能潜伏很久：两种方案在界面上完全一样，差别只在**源侧账本**。所以排查必须从「listener 数、缓冲长度、连接状态」这三项入手，而不是从「回调有没有执行」入手。把探针接到预发布环境，切页十次后打一份报告，比等到用户反馈卡顿便宜得多。

### 排障清单

| 检查项 | 判据 | 不通过时的修复 |
|---|---|---|
| 订阅回收 | 卸载后 \`listeners === 0\` | 全部 \`parent.add(sub)\`，卸载只调一次 \`parent.unsubscribe()\` |
| 清理覆盖 | 三条终结路径都触发 \`finalize\` | 用 \`finalize\` 而不是 \`tap\` 的 complete 分支（L03） |
| 缓冲有界 | \`bufferLength <= max\` | 显式 \`bufferSize\`，加 \`assertBufferBounded\`（L20） |
| 连接状态 | 归零后 \`connected === false\`，或已登记收口 | 修 refCount 配置，或补应用级 \`dispose()\` |
| 重放首帧 | 晚订阅者拿到的是有界缓存 | \`shareReplay({ bufferSize: 1, ... })\`（L19 / L20） |
| 自动完成 | 长流有 \`take\` / 超时边界 | 避免 \`NEVER\` 式永不终结的源常驻 |

:::deep

### 泄漏判据在源侧，不在下游

「组件卸载后回调还在跑」是现象，不是根因。真正的根因是源侧还登记着一个 listener、一个定时器句柄或一条连接；下游用布尔量把它挡住，只是让现象消失，资源照样被持有。这与 L03 的账本模型完全一致：\`Subscription\` 是资源句柄，\`unsubscribe()\` 让账本归还，teardown 把 listener 从集合里摘掉。因此所有泄漏排查都应该问同一个问题——**「源那一侧还有多少人在听」**。这个视角还能统一看似不同的三类泄漏：订阅未回收是 listener 没摘、无界缓冲是值没摘、refCount 失配是连接没摘，三者都是「该归还的没归还」。把探针做成这三项计数，就不需要为每种泄漏写一套专门的排查脚本。

:::

:::warn

### 三个热流排障踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 用 \`mounted\` 布尔量代替取消订阅 | 界面不再报错，但监听器 / 定时器持续堆积 | 父 \`Subscription\` 统一收口，卸载必调 \`unsubscribe()\` |
| 在 \`tap\` 的 complete 分支里清理 | 中途取消或 error 时清理被跳过 | 用 \`finalize\` 覆盖三条路径（L03） |
| 常驻共享没有登记收口责任 | 应用生命周期内连接永不释放，测试环境看不出来 | 显式 \`declareOwner()\` / \`dispose()\`，并让探针检查 |

第二条与 L03 完全同源，但在热流里后果更严重：热流的生产独立于订阅（L02），「流自己结束」往往根本不会发生，于是 complete 分支型的清理永远不会触发。凡是长期运行的热源，都应该默认按「取消路径」设计清理。

:::

### 把探针接进预发布的三步

| 步骤 | 动作 | 产出 | 判定 |
|---|---|---|---|
| 1 | 给每条热流登记挂载 / 卸载事件 | 按组件 id 的 listener 计数 | 计数随挂载加一、卸载减一 |
| 2 | 切页十次后打一份报告 | 监听数、缓冲长度、连接状态 | 三项都不随切页次数增长 |
| 3 | 把三项阈值写成断言 | 一条可回归的 CI 检查 | 任一超阈值即失败，并附组件 id 定位 |

这三步的价值在于把「越用越卡」这种主观反馈变成一条可复现的曲线。第一步只做埋点，不修任何代码；第二步用固定动作（切页十次）生成对照数据，若监听数从 1 线性涨到 10，几乎可以断定是订阅未回收而不是渲染性能问题；第三步把阈值固化，后续新增热流时自动纳入检查。特别要注意报告里必须带上组件 id 与流名，否则即使发现泄漏也定位不到是哪一处 subscribe 漏了挂账本。探针不是一次性排查脚本，而是长期挂在预发布环境的结构检查——它和 L20 的缓冲检查器、L03 的账本断言属于同一类资产：把「应该成立的不变量」写成可执行代码，而不是留在文档里等人记得。

### 验收清单

| 检查 | 判据 |
|---|---|
| 账本归零 | 全部卸载后 listener 数 0、connected false、issues 空 |
| 三类可探测 | 少卸载 / 无界缓冲 / refCount 失配各有一条负例断言 |
| 常驻区分 | 登记收口的常驻连接与无人管理的裸连接被区别对待 |
| 清理覆盖 | \`finalize\` 覆盖 complete / error / unsubscribe |
| 判据位置 | 检查源侧计数，而不是下游回调是否执行 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L03 资源账本 | Subscription 树与 teardown 幂等 | 本课把账本做成可运行的探针 |
| L17 多播桥 | 手动连接的四项责任 | 本课检查「连接是否归还」 |
| L19 连接共享 | refCount 自动连接 / 断开 | 本课把「归零仍连接」当成待排查信号 |
| L20 重放边界 | 缓冲上限检查器 | 本课把三类边界合并成统一探针 |
| L18 状态型 Subject | 四种重放语义 | 本课只关心缓冲是否有界 |
`,
    'rxSubject',
    [
      {
        text: '「晚进页面的组件也要立刻拿到最近一次主题值」最合适？',
        options: ['Subject', 'BehaviorSubject / shareReplay(1)', 'ReplaySubject(0)', 'concat'],
        answer: 1,
        explain: 'BehaviorSubject 需初始值并发当前值；shareReplay(1) 重放最近一个；普通 Subject 不重放。',
        concept: 'c-subject',
      },
      {
        text: 'share({ refCount: true }) 下所有订阅者取消后，再次订阅会发生？',
        options: ['复用缓存值不重请求', '重新执行源、可能重发请求', '报错', '永久挂起'],
        answer: 1,
        explain: 'refCount 归零即断开，重订重连是特性，昂贵源要显式设计是否「常驻」。',
        concept: 'c-subject',
      },
      {
        text: '「组件卸载后定时器/监听仍常驻」这类泄漏的直接原因是？',
        options: [
          'ReplaySubject 无上限',
          '卸载时未取消订阅（缺 takeUntil / unsubscribe）',
          'refCount 为 true',
          'next 调用太频繁',
        ],
        answer: 1,
        explain: '泄漏三源之一：订阅未随组件生命周期回收；无界缓冲与 refCount 失配是另外两类，需分别排查。',
        concept: 'c-subject',
      },
    ],
    [
      ['refCount 泄漏', '源昂贵且 refCount 配置失当时重连触发重执行与堆积'],
      ['takeUntil', '组件卸载自动取消订阅，防监听常驻'],
    ],
    [
      '长期热流用无界 ReplaySubject，内存无限增长。',
      '组件卸载忘记取消订阅，定时器/监听堆积（应使用 takeUntil / destroy$）。',
    ],
  ),
  'practice',
)
