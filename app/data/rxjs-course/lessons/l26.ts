import { L, withKind } from '../../course-builders.ts'

export const L26 = withKind(
  L(
    'L26',
    5,
    'marble 测试与 TestScheduler 深入',
    3,
    ['L23'],
    ['c-testing'],
    [
      '实现用 TestScheduler 写一组 marble 断言并跑通',
      '写出自定义算子的虚拟时间测试用例',
      '搭好断言覆盖同步发射、延迟发射与错误终结',
      '产出一份「真实时钟测试为什么不稳定」的排查表',
    ],
    `
### 一次事故：测试在本地通过，CI 上每天挂两次

时间算子的测试写成「订阅之后 \`await new Promise(r => setTimeout(r, 250))\`，再看数组里有哪些值」。开发机上稳定通过，CI 机器负载高时定时器晚几十毫秒，断言偶尔少一个值；重跑又好了，于是大家默认「这条 flaky，忽略」。半年后有人把 \`debounceTime(200)\` 改成 \`throttleTime(200)\`（L23），这条 flaky 测试照样通过，线上却开始丢用户最后输入的词。复盘时最关键的一句话是：**测试没有使用被测代码自己的抽象**。业务代码依赖的是可注入的 Scheduler（L22），测试却绕开它去等真实时钟，既不稳定也测不准。这节课用 \`TestScheduler\` 的虚拟时间把「第几帧发生什么」写成确定断言。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| marble 字符串表达什么 | 每个字符一帧：\`-\` 空帧、字母是值、\`#\` 错误、\`\\|\` 完成、\`(...)\` 同帧多事件 |
| 虚拟时间解决什么 | 不等待真实时间、不受机器负载影响，时间算子的行为可精确断言 |
| \`TestScheduler\` 构造参数是什么 | 7.8.2 是一个**深度相等断言函数**，不是 6.x 那种比较谓词 |
| 本课不回答什么 | 调度器原理（L22）、三个时间算子的窗口语义（L23） |

### marble 语法对照表

| 片段 | 含义 | 帧号示例 |
|---|---|---|
| \`-\` | 该帧无事件，时间前进一帧 | \`-a\` 表示 a 在第 1 帧 |
| \`a\` / \`b\` | 发射一个值，字符对应 \`values\` 映射 | \`-a-b-\` → a@1、b@3 |
| \`#\` | 以 error 终结 | \`-a-#\` → a@1、error@3 |
| \`\\|\` | 以 complete 终结 | \`-a-\\|\` → a@1、complete@3 |
| \`(ab\\|)\` | 同一帧内多个事件 | 三个事件都在同一帧 |
| \` \` | 空白，仅用于对齐可读，不占帧 | 常被用来对齐多串 marble |

最后两行是写长断言时最容易出错的地方：括号里的所有事件**共享同一帧**，而空格只是排版。把 \`-a-b-c-\\|\` 与 \`-a-(b\\|)\` 混用，前者是「b 之后还有两帧才完成」，后者是「b 与 complete 同帧」，语义完全不同。

\`\`\`ts title="TestScheduler 的 7.8.2 写法" note="构造参数接收深度相等断言函数；run 回调里用 cold 造源、expectObservable 写期望。"
import assert from "node:assert/strict"
import { of } from "rxjs"
import { TestScheduler } from "rxjs/testing"
import { map, take, catchError } from "rxjs/operators"

const ts = new TestScheduler((actual, expected) => assert.deepEqual(actual, expected))

// ① 同步变换：值与终结位置逐帧对应
ts.run(({ cold, expectObservable }) => {
  const src = cold("-a-b-c-|")
  const doubled = src.pipe(map((v) => v.toUpperCase()))
  expectObservable(doubled).toBe("-A-B-C-|", { A: "A", B: "B", C: "C" })
})

// ② take(2)：第二个值与 complete 发生在同一帧
ts.run(({ cold, expectObservable }) => {
  const src = cold("-a-b-c-|")
  expectObservable(src.pipe(take(2))).toBe("-a-(b|)")
})

// ③ 错误与恢复：error 帧被 catchError 接住，替代源同帧交付并 complete
ts.run(({ cold, expectObservable }) => {
  const src = cold("-a-#")
  const recovered = src.pipe(catchError(() => of("X")))
  expectObservable(recovered).toBe("-a-(X|)", { X: "X" })
})

// ④ 自定义算子也用同一套断言：不需要真实计时，不需要 sleep
ts.run(({ cold, expectObservable }) => {
  const src = cold("-a-b-|")
  expectObservable(src.pipe(map((v) => v + "!"))).toBe("-A-B-|", { A: "a!", B: "b!" })
})
\`\`\`

### 用最小模型把「帧号」变成可断言的事实

下面不依赖 RxJS 包，实现一个 marble 解析器，断言普通帧、错误帧、完成帧、同帧分组四类语义；再用一个负例说明「忽略分组」会把同帧事件错判成不同帧。

\`\`\`ts
import assert from "node:assert/strict"

type Frame = { at: number; kind: "next" | "complete" | "error"; value?: string }

/** 每个字符一帧；括号内的事件共享同一帧；空白只用于排版。 */
function parseMarble(marble: string): Frame[] {
  const out: Frame[] = []
  let at = 0
  let inGroup = false
  for (const ch of marble) {
    if (ch === " ") continue
    if (ch === "(") { inGroup = true; continue }
    if (ch === ")") { inGroup = false; at += 1; continue }
    if (ch === "-") { if (!inGroup) at += 1; continue }
    if (ch === "|") { out.push({ at, kind: "complete" }); if (!inGroup) at += 1; continue }
    if (ch === "#") { out.push({ at, kind: "error" }); if (!inGroup) at += 1; continue }
    out.push({ at, kind: "next", value: ch })
    if (!inGroup) at += 1
  }
  return out
}

const plain = parseMarble("-a-b-c-|")
assert.deepEqual(plain, [
  { at: 1, kind: "next", value: "a" },
  { at: 3, kind: "next", value: "b" },
  { at: 5, kind: "next", value: "c" },
  { at: 7, kind: "complete" },
])

const failed = parseMarble("-a-#")
assert.deepEqual(failed, [
  { at: 1, kind: "next", value: "a" },
  { at: 3, kind: "error" },
])

const sameFrame = parseMarble("-a-(b|)")
assert.deepEqual(sameFrame, [
  { at: 1, kind: "next", value: "a" },
  { at: 3, kind: "next", value: "b" },
  { at: 3, kind: "complete" },
], "分组内三个事件共享同一帧")

const leadingGroup = parseMarble("(ab|)")
assert.equal(leadingGroup[0].at, 0)
assert.equal(leadingGroup[2].at, 0, "开头分组发生在第 0 帧")

// 负例：不处理分组时，同帧的 b 与 complete 会被错判成两帧
function naiveParse(marble: string): Frame[] {
  const out: Frame[] = []
  let at = 0
  for (const ch of marble.replace(/[()]/g, "")) {
    if (ch === "-") { at += 1; continue }
    if (ch === "|") { out.push({ at, kind: "complete" }); at += 1; continue }
    if (ch === "#") { out.push({ at, kind: "error" }); at += 1; continue }
    out.push({ at, kind: "next", value: ch }); at += 1
  }
  return out
}
const naive = naiveParse("-a-(b|)")
assert.notEqual(naive[1].at, naive[2].at, "忽略分组会让同帧事件错位")

// 真实时钟把「时间起点」变成外部不可控输入
function timedOut(start: number, now: number, limit: number): boolean {
  return now - start >= limit
}
assert.equal(timedOut(0, 100, 100), true)
assert.equal(timedOut(50, 100, 100), false, "起点不同，结论不同；虚拟时间把起点固定为 0")
\`\`\`

最后两条断言把 flaky 的根因写成了可复现的事实：同一段判断，只要起点由真实时钟给出，结论就随运行时变化。虚拟时间不是「跑得更快」，而是**把时间起点与推进方式都变成测试数据**，因此同一串 marble 在任何机器上得到同一组帧号。

### 一次 marble 断言的完整推演

以 \`cold("-a-b-c-|")\` 经 \`take(2)\` 为例：

| 帧 | 源事件 | 算子行为 | 结果流事件 | 断言 marble |
|---|---|---|---|---|
| 0 | 无 | 等待 | 无 | \`-\` |
| 1 | a | 计数 1，放行 | a | \`a\` |
| 2 | 无 | 等待 | 无 | \`-\` |
| 3 | b | 计数 2，放行并立即 complete | b 与 complete | \`(b\\|)\` |
| 4+ | c、complete | 上游已被取消，不再到达 | 无 | 不写 |

把这张表与 \`-a-(b|)\` 逐字符对照，就能读懂 \`expectObservable\` 在断言什么：**不只是「有哪些值」，还包括每个值发生在第几帧、是否与其他事件同帧**。这正是真实时钟测试做不到的部分——它通常只检查最终数组，于是 \`debounceTime\` 换成 \`throttleTime\` 也可能蒙混过关（L23）。

### flaky 排查清单

| 症状 | 根因 | 修正 |
|---|---|---|
| CI 偶发超时，重跑通过 | 测试直接等待真实 \`setTimeout\` | 换 \`TestScheduler\` + marble 断言 |
| 时间算子改错仍通过测试 | 只断言最终数组，不断言帧号 | 用 \`toBe(marble)\` 固定每个事件的帧 |
| 期望 marble 总是差一帧 | 把 6.x 的「每帧 20ms」口径带进 \`run()\` | \`run()\` 模式按字符计帧，别混旧资料 |
| \`TestScheduler\` 报错信息看不懂 | 构造时传了比较谓词而不是断言函数 | 传 \`(actual, expected) => assert.deepEqual(actual, expected)\` |
| 自定义算子不好测 | 算子内部直接调用 \`Date.now()\` | 让算子依赖注入的调度器（L22） |

:::deep

### 虚拟时间是「把时间变成数据」的最后一环

回看整门课的主线：L01 把一段时间里的数据变成可传递的值，L22 把「何时执行」变成可注入的依赖，到这里把时钟本身变成可枚举的帧号。三步之后，时间相关逻辑才真正具备「可检查、可组合、可回归」三个性质。这也解释了为什么 marble 测试不能靠「等一会儿再断言」来近似：近似测试丢掉的恰恰是帧号信息，而时间算子的全部语义都在帧号上。更实际的一点是，\`TestScheduler\` 与业务代码共用同一个 Scheduler 抽象，因此测试不是另写一套模拟逻辑，而是**把真实运行时的时钟换成一个可枚举实现**——被测代码一行都不用改。相比之下，用 \`jest.useFakeTimers()\` 之类从外部劫持全局定时器，虽然也能冻结时间，却绕开了 RxJS 自己的抽象，遇到自定义调度器或嵌套调度时容易失配。

:::

:::warn

### 三个 marble 测试踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 构造 \`TestScheduler\` 时传比较谓词 | 断言失败却没有可读错误，或直接行为异常 | 7.8.2 需要深度相等断言函数；旧资料里 \`(a,b) => Math.abs(a-b) < 0.5\` 是 6.x 口径 |
| 把 \`run()\` 里的帧当成 20ms | 期望 marble 整体偏移，时间算子断言全错 | \`run()\` 模式按字符计帧，具体毫秒数由测试内部换算，不要手写 20ms 假设 |
| 用括号包住不同帧的事件 | 期望与实际帧号对不上，误以为算子写错 | 括号只用于**同一帧**的多个事件，如 take 的「最后一个值 + complete」 |

第一条尤其值得单独记：原文旧示例里出现过比较谓词式的构造参数，那是 6.x 的写法；7.8.2 的 \`TestScheduler\` 把「怎么报断言失败」交给调用方，因此需要一个 \`(actual, expected) => void\` 的断言函数。把 \`assert.deepEqual\` 传进去，失败信息会直接列出实际与期望的帧序列，排查效率比谓词高得多。

:::

### 把 marble 断言变成长期资产

| 资产 | 落盘位置 | 下一次怎么验 |
|---|---|---|
| 自定义算子的帧序列 | 一条 \`expectObservable(...).toBe(marble)\` | 改算子后断言必须仍逐帧一致 |
| 终结路径 | 含 \`#\` 与 \`\\|\` 的负例用例 | 错误兜底改动后重跑 |
| 同帧分组 | \`(b\\|)\` 类断言 | 有人改 take / complete 时机时立刻暴露 |
| 时钟口径 | 一条构造参数说明与版本注释 | 升级 RxJS 时先核对这项 |
| flaky 记录 | 被替换掉的真实等待测试清单 | 确认没有新增 sleep |

把测试写成断言只是第一步，更重要的是让它变成「下一次改动一定会碰到」的资产。每条 marble 对应一个具体的语义承诺：值在第几帧、终结在哪一帧、哪两个事件必须同帧；改算子时这些承诺会先失败，逼开发者确认是有意变更还是回归。特别要留一条「被替换掉的真实等待测试」清单，防止有人在新增用例时又把 sleep 写回来——flaky 往往是慢慢长回来的，不是一次引入的。与 L21 的泄漏探针、L25 的展平不变量一样，这里沉淀的不是某个测试文件，而是一类不变量的检查方式。

### 验收清单

| 检查 | 判据 |
|---|---|
| 帧号精确 | 解析器对 \`-a-b-c-\\|\` 给出 1/3/5/7 帧 |
| 终结事件 | \`#\` 与 \`\\|\` 分别产生 error / complete 帧 |
| 同帧分组 | \`-a-(b\\|)\` 中 b 与 complete 帧号相同 |
| 负例可抓 | 忽略分组的朴素解析被断言判定为错位 |
| 无真实等待 | 测试不含 \`setTimeout\` / \`sleep\`，结论不随机器负载变化 |
| 版本口径 | 构造参数是断言函数；\`run()\` 按字符计帧 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L22 调度器 | 把「何时执行」抽成可注入依赖 | 本课使用 TestScheduler，不重讲任务队列 |
| L23 时间算子 | 防抖 / 节流 / 采样的窗口语义 | 本课只把窗口推演表转成帧号断言 |
| L12 / L25 | 并发上限、批量落地与背压 | 本课不测容量，只测时序 |
| L24 组合多源 | 多路输入的触发权与配对 | 本课只测单条链的帧序列 |
| L13 终结语义 | error / complete 不可逆 | 本课把终结写成 marble 里的 \`#\` 与 \`\\|\` |
`,
    'rxScheduler',
    [
      {
        text: 'marble 字符串 "-a-b-|" 表示？',
        options: ['帧1发a、帧3发b、帧5 complete', '帧0发a、帧1发b', '只发 a、b 两个值', '以错误结束'],
        answer: 0,
        explain: '每个字符一帧（0 起）：- 无值、字母为该帧值、| 为 complete；位置 1=a、3=b、5=complete。',
        concept: 'c-testing',
      },
      {
        text: '默认帧=20ms 时 debounceTime(40) 等于多少帧的静默？',
        options: ['1 帧', '2 帧', '4 帧', '无法测试'],
        answer: 1,
        explain: '40ms ÷ 20ms = 2 帧；虚拟时间把毫秒换算成帧，让时间算子可被精确断言。',
        concept: 'c-testing',
      },
      {
        text: 'marble 字符串里的 # 表示？',
        options: ['该帧无值', '该帧发射 error', 'complete', '同帧两个值'],
        answer: 1,
        explain: '# 表示该帧发 error 并终结；| 是 complete、- 是空帧、(x|) 表示同帧多个事件。',
        concept: 'c-testing',
      },
    ],
    [
      ['marble 图', '用字符序列描述「值在何时（帧）发射」的测试语法'],
      ['TestScheduler', '虚拟时间调度器，使时间算子可测试'],
    ],
    [
      '用真实 setTimeout 测时间算子，测试又慢又 flaky（应使用 TestScheduler 虚拟时间）。',
      '混淆 frame 与 ms：忘按「帧=20ms」换算 debounce/interval 的时长。',
    ],
  ),
  'practice',
)
