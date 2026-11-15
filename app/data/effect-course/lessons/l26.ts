import { L, withKind } from '../../course-builders.ts'

export const L26 = withKind(
  L(
    'L26',
    5,
    '生态、稳定性与渐进落地',
    2,
    ['L15', 'L23'],
    ['ecosystem'],
    [
      '实现渐进引入 Effect 的迁移检查器与边界适配层',
      '写出稳定性标记的版本锁定检查',
      '跑通旧 Promise 模块与新 Effect 模块共存的集成断言',
      '产出一份可执行的落地路线与回滚清单',
    ],
    `
### 一次「顺手升级」把实验版 API 带进了生产

团队给某个模块单独升了小版本，没动其它依赖。构建通过、测试通过，上线后某个分支偶发行为异常，查到最后是那个新版本里一个标记为 experimental 的接口形状变了。META 里写过两条基线：**全生态版本锁步**、**模块带 @stability 标记**。前者意味着不能只升一个包，后者意味着「能 import」不等于「可以依赖」。渐进引入 Effect 的最后一课，讲的不是怎么把库用得更熟，而是**怎么在旧系统旁边放一段新代码，并且随时能退回去**。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 版本锁步与稳定性标记怎么变成可执行的检查 | 前面 25 课的运行时机制（不再重复） |
| 旧 Promise 模块与新 Effect 模块怎么共存、边界放在哪 | 具体 API 清单（以 META 锁定的 4.1.4 文档为准） |
| 落地路线与回滚清单怎么写成可验收的条目 | 生产监控与值班流程 |

### 两条基线，三档稳定性

| 基线 / 标记 | 含义 | 违反后的表现 |
|---|---|---|
| 全生态版本锁步 | 所有 effect 相关包保持同一版本 | 类型对得上、行为对不上，偶发异常 |
| stable | 可以长期依赖，语义受兼容承诺保护 | —— |
| unstable | 可用但形状可能调整 | 小版本升级后编译失败 |
| experimental | 仅供试验，不建议进生产 | 小版本升级后行为静默改变 |

把这张表变成检查器，比写进 README 有效：文档会被跳过，脚本不会。下面两段程序分别交付「迁移检查器」与「边界适配层」，合起来就是这一课的可运行物。

### 迁移检查器与版本锁定

\`\`\` title="版本锁步与稳定性检查" note="自包含程序，只依赖 node:assert；把 META 的两条基线变成可执行断言。"
import assert from "node:assert/strict"

type Dep = { name: string; version: string }
type Module = { path: string; stability: "stable" | "unstable" | "experimental" }

const PINNED = "4.1.4"
const assertLocked = (deps: Dep[]): void => {
  for (const d of deps) {
    assert.ok(!/latest|preview|floating/i.test(d.version), "不允许浮动版本: " + d.name)
    assert.equal(d.version, PINNED, "版本未锁定: " + d.name)
  }
}

const STABILITY_RANK = { stable: 0, unstable: 1, experimental: 2 } as const
const assertAdmissible = (mods: Module[], allow: Module["stability"]): string[] =>
  mods
    .filter((m) => STABILITY_RANK[m.stability] > STABILITY_RANK[allow])
    .map((m) => m.path + " is " + m.stability)

const deps: Dep[] = [
  { name: "effect", version: "4.1.4" },
  { name: "@effect/platform", version: "4.1.4" },
]
assertLocked(deps)
assert.throws(() => assertLocked([{ name: "effect", version: "latest" }]), /不允许浮动版本/)

const used: Module[] = [
  { path: "effect/Effect", stability: "stable" },
  { path: "effect/Schedule", stability: "stable" },
  { path: "effect/experimental/AI", stability: "experimental" },
]
assert.deepEqual(assertAdmissible(used, "stable"), ["effect/experimental/AI is experimental"])

// 迁移前后引用的模块集合必须可比较，不能悄悄多出一个实验模块
const detectDrift = (before: string[], after: string[]): string[] =>
  after.filter((x) => !before.includes(x))
assert.deepEqual(detectDrift(["effect/Effect"], ["effect/Effect", "effect/experimental/AI"]), [
  "effect/experimental/AI",
])
console.log("t1 通过：版本锁步、稳定性白名单、引用漂移可检测")
\`\`\`

### 边界适配层与共存断言

\`\`\` title="旧模块与新模块共存" note="自包含程序；适配层是唯一允许调用运行边界的位置，回滚只需换回旧实现。"
import assert from "node:assert/strict"

type Blueprint<A> = { readonly run: () => Promise<A> }
const describe = <A>(f: () => Promise<A>): Blueprint<A> => ({ run: f })

// 旧模块：仍然是普通 Promise，不做任何改造
const legacyFetch = async (id: number): Promise<string> => "legacy-" + id

// 适配层：把旧调用包成蓝图，运行边界只在这里出现一次
interface Gateway {
  get(id: number): Promise<string>
}
const fromEffect = (): Gateway => ({
  get: (id) => describe(() => Promise.resolve("effect-" + id)).run(),
})
const fromLegacy = (): Gateway => ({
  get: (id) => legacyFetch(id),
})

const integrate = async (gw: Gateway): Promise<string[]> => [await gw.get(1), await gw.get(2)]

assert.deepEqual(await integrate(fromLegacy()), ["legacy-1", "legacy-2"])
assert.deepEqual(await integrate(fromEffect()), ["effect-1", "effect-2"], "两侧形状一致")

// 回滚：换回旧实现即可，调用方零改动
let active: Gateway = fromEffect()
assert.deepEqual(await integrate(active), ["effect-1", "effect-2"])
active = fromLegacy()
assert.deepEqual(await integrate(active), ["legacy-1", "legacy-2"])

// 描述阶段不执行：构造网关不能产生副作用
let calls = 0
const counted = describe(() => {
  calls += 1
  return Promise.resolve("x")
})
assert.equal(calls, 0, "构造蓝图不得发起调用")
await counted.run()
assert.equal(calls, 1)
console.log("t2 通过：新旧共存、边界唯一、可回滚、描述不执行")
\`\`\`

\`t2\` 最后两条断言把 L01 的第一条不变量带到了课程末尾：迁移再复杂，适配层依然必须守住「构造不执行、执行只一次」。这也是整门课唯一一条从头到尾没有变过的判据。

### 落地路线（六步，每步可独立回滚）

| 步 | 动作 | 验收 | 回滚 |
|---|---|---|---|
| 1 | 锁定版本，跑 t1 检查器 | 无浮动版本、无实验模块 | 移除新增依赖 |
| 2 | 选一个无外部副作用的纯函数试点 | 描述阶段零副作用 | 换回原函数 |
| 3 | 在适配层内接上旧模块 | 新旧实现结果逐字一致 | 切换网关实现 |
| 4 | 给这段逻辑补超时与分类恢复 | L10 四条负例断言通过 | 摘掉策略，保留纯调用 |
| 5 | 扩大到一个完整请求链路 | 中断后无 running 残留 | 分桶回退到旧链路 |
| 6 | 逐步把 Stream / STM 引入热点 | 峰值内存与总额守恒达标 | 按模块开关回退 |

六步共享一个原则：**每一步都只引入一种新能力，且回滚不需要改调用方**。第 3 步的网关接口是关键——它把「用哪套实现」变成一个可替换的值，而不是散落在业务代码里的 import。

### 回滚清单

| 检查项 | 不通过时的后果 |
|---|---|
| 版本是否单一且可一键还原 | 无法定位是哪个包引入的行为变化 |
| 每个试点是否有独立开关 | 一处出问题要整体下线 |
| 适配层是否是唯一运行边界 | 上层策略失效，回滚后仍有后台任务 |
| 新旧实现结果是否有对照断言 | 回滚后数据语义悄悄变了 |
| 中断与释放路径是否都验过 | 回退时连接与子任务泄漏 |

:::deep

### 26 课其实只在讲一件事

回头看六个阶段：S0 把描述与执行拆开，S1 让类型沿组合链长出来，S2 把失败变成可诊断的数据，S3 把依赖与资源变成可装配、可关闭的结构，S4 让运行时能统一看见并回收它启动的一切，S5 把这套能力用到流、策略、事务与真实项目落地。表面上是六个主题，主线只有一句：**把原本隐含在执行过程中的信息显式变成数据，能力才可以被检查、被组合、被回归**。蓝图、三通道、Cause、Layer、Fiber 树、Stream、Schedule，都是这句话在不同维度上的落点。所以评价一段重构有没有真的用上 Effect，仍然只需 L01 那个动作：把运行边界那一行删掉，业务逻辑是否完整存在、且仍能被断言检查。删掉之后什么都不剩，说明写的还是立即执行的代码，只是换了层皮。

:::

:::warn

### 三个落地阶段最容易踩的坑

第一件是只升一个包，开头的事故属于此类；类型检查通过，行为却对不上，且问题只在特定分支出现。第二件是在业务代码里直接 import 新模块、跳过适配层，结果「回滚」变成全仓改 import，灰度开关形同虚设。第三件是试点选了带外部副作用的函数，冲突重试或事务重放时把通知、扣款重复执行了一遍——L25 已经把这条列为硬边界。三者都不会在构建期报错。纠偏顺序固定：先跑 t1 锁版本，再确认适配层是唯一运行边界，最后才挑试点，并且试点必须能通过 t2 的「构造不执行」断言。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 所有依赖版本等于锁定值 | 版本漂移，行为不可复现 |
| 实验模块被白名单拦下 | 生产依赖了随时会变的形状 |
| 新旧实现结果逐字一致 | 迁移悄悄改了语义 |
| 切换网关即可回滚 | 调用方被绑死在一套实现上 |
| 构造蓝图时调用计数为 0 | 适配层没守住描述 / 执行分界 |

### 带走什么

| 判据 | 最早出现在 | 最后一课还在用的地方 |
|---|---|---|
| 删掉运行边界，业务逻辑仍完整 | L01 | t2 的适配层断言 |
| 三通道按集合累积、只收敛该收敛的 | L02 / L06 | 版本与依赖的白名单检查 |
| 失败信息不要用一句文案压扁 | L09 / L12 | 引用漂移检测保留具体模块名 |
| 属于同一个可关闭容器的东西才能统一收尾 | L16 / L21 | 回滚时连接与子任务不泄漏 |
| 描述先于执行，数据先于结论 | L19 / L23 / L24 | 六步落地路线每步可独立验收 |

### 结束时的一次自检

| 自问 | 答不上来说明什么 |
|---|---|
| 我这段代码里，运行边界有几处 | 多于一处就说明描述与执行又混了 |
| 失败信息是数据还是一句文案 | 是文案就说明诊断链条已经断了 |
| 我启动的东西都属于同一个可关闭容器吗 | 不属于就会有收不到的计算、连接或队列 |
| 换掉一个实现，调用链要不要改 | 要改就说明需求与供给焊死了 |
| 有没有一条断言能在不改业务的前提下被重复跑 | 没有就说明能力还没变成可回归的资产 |

这五问分别对应 S0、S2、S4、S3、S5，顺序故意不按课号排——真实项目里它们从来不是按顺序出现的。能在自己的代码库里逐条答上来，比记住多少个算子都重要；答不上来的那一问，就是下一轮重构该从哪里下手。

这门课到这儿就结束了。剩下的不是更多 API，而是把上面五条判据带回自己的代码库，逐条问一遍。
`,
    'layer',
    [
      {
        text: 'v4 生态包的版本规则是？',
        options: ['各包独立版本', '全生态统一版本、同步发布', '固定 0.x', '跟随 Node 版本'],
        answer: 1,
        explain: 'effect@4.1.4 对应 @effect/*@4.1.4，避免兼容性矩阵。',
        concept: 'ecosystem',
      },
      {
        text: 'ManagedRuntime 首次构建失败会？',
        options: ['自动重试直到成功', '缓存该失败，后续运行都失败', '回退默认 runtime', '静默忽略'],
        answer: 1,
        explain: '应在 Layer 内部用 Effect.retry 处理瞬时故障。',
        concept: 'ecosystem',
      },
    ],
    [
      ['@stability', 'v4 模块的稳定性标记：stable / unstable / experimental'],
      ['ManagedRuntime', '从根 Layer 构建一次、可复用并负责释放资源的运行时'],
    ],
    [
      '把 unstable 模块直接用到长期维护的核心路径上而不做隔离。',
      '在 React / Serverless 每个请求里重新构建一次根 Layer。',
    ],
  ),
  'practice',
)
