import { L, withKind } from '../../course-builders.ts'

export const L23 = withKind(
  L(
    'L23',
    5,
    '时间算子：debounceTime / throttleTime / sampleTime',
    3,
    ['L22'],
    ['c-time-ops'],
    [
      '说清 debounceTime / throttleTime / sampleTime 的窗口语义差别',
      '解释防抖重置计时与节流固定窗口的行为差别',
      '用同一串输入推演三个算子的输出时刻',
      '说清时间算子都依赖调度器，因而可虚拟时间化',
    ],
    `
### 一次事故：用户打完字，最后一个字没被搜

搜索框为了「减少请求」加了 \`throttleTime(200)\`，测试时连打很快，看起来一切正常；上线后用户反馈「输入完停一下再按回车，偶尔搜的是上一步的关键词」。原因不复杂：节流按固定窗口放行第一个值，而用户停止输入后的**最后一个值**落在窗口中间，后面没有新值来触发下一次放行，于是它永远不会被发出。另一个页面用 \`sampleTime(1000)\` 做实时曲线，采样点之间恰好没有新数据，图表就少了几个点。两次问题都不是算子写错，而是**没把三种窗口语义区分开**：防抖看「静默多久」、节流看「窗口内第一个」、采样看「周期末最近一个」。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`debounceTime\` 什么时候发值 | 某个值之后静默满指定时长才发它；新值会重置计时 |
| \`throttleTime\` 什么时候发值 | 每个窗口放行第一个值，窗口内其余丢弃 |
| \`sampleTime\` 什么时候发值 | 每个固定周期末取该周期最近一个值，周期内无值则不发 |
| 三者共同依赖什么 | 调度器（L22），因此都能被虚拟时间精确断言（L26） |

### 三种窗口语义对照表

| 算子 | 触发条件 | 发射哪个值 | 会丢最后一个值吗 | 典型场景 |
|---|---|---|---|---|
| \`debounceTime(ms)\` | 静默满 ms | 静默前的最后一个 | 不会（流终结时会补发） | 搜索建议、输入校验 |
| \`throttleTime(ms)\` | 进入新窗口 | 窗口内第一个 | **会** | 按钮防连点、滚动采样 |
| \`sampleTime(ms)\` | 周期末 | 周期内最近一个 | 会（周期内无值则整段跳过） | 图表抽点、状态快照 |
| \`auditTime(ms)\` | 静默满 ms | 静默期开始时的第一个 | 视实现而定 | 与防抖相近但取值不同 |

表里第三列「发射哪个值」是三者最本质的区别：\`debounceTime\` 与 \`auditTime\` 都以「静默」为触发，但前者取静默前最后一个、后者取静默期开始时的第一个。搜索框要的是「用户最终输入的完整词」，所以必须取最后一个；把两者记混，就会得到「用户打了五个字，搜的是第一个字」的诡异行为。

| 输入时刻 | 0ms | 50ms | 120ms | 300ms |
|---|---|---|---|---|
| 值 | a | b | c | d |
| \`debounceTime(100)\` | 丢弃 | 丢弃 | **发 c** | **发 d** |
| \`throttleTime(100)\` | **发 a** | 丢弃 | **发 c** | **发 d** |
| \`sampleTime(100)\` | — | 周期末发 b | 周期末发 c | 周期末发 d |

同一串输入，三种算子给出三组不同结果，这就是把它们放在一课里对照的价值。特别看 \`debounceTime\` 那一列：a、b 都因为「后面还有新值」被取消，只有 c 后面静默了 180ms 才被放行；d 后面没有新值，在流终结时补发。这正是搜索框需要的「听用户把话说完」。

\`\`\`ts title="三个时间算子的 7.8.2 写法" note="三者都从 rxjs/operators 导入；时间单位由调度器解释，测试时可换成虚拟时间。"
import { fromEvent, of, interval } from "rxjs"
import {
  map,
  debounceTime,
  throttleTime,
  sampleTime,
  auditTime,
  distinctUntilChanged,
  switchMap,
  take,
} from "rxjs/operators"

const input = document.querySelector<HTMLInputElement>("#search")

if (input) {
  // 搜索：等用户停手 200ms 再发请求，取最后一个完整词
  fromEvent(input, "input")
    .pipe(
      map((e) => (e.target as HTMLInputElement).value.trim()),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((k) => of(["result for " + k])),
      take(20),
    )
    .subscribe(console.log)
}

// 按钮防连点：窗口内只认第一次点击
const button = document.querySelector<HTMLButtonElement>("#refresh")
if (button) {
  fromEvent(button, "click")
    .pipe(throttleTime(1000), take(5))
    .subscribe(() => console.log("refresh"))
}

// 图表抽点：每 100ms 取窗口内最近一个值
interval(16)
  .pipe(take(60), sampleTime(100))
  .subscribe((v) => console.log("sample", v))

// auditTime 与防抖接近，但取的是静默期开始时的第一个值
interval(16)
  .pipe(take(30), auditTime(100))
  .subscribe((v) => console.log("audit", v))
\`\`\`

### 用最小模型把「窗口语义」变成可断言的事实

下面不依赖 RxJS 包，用一串输入时刻实现三个算子的窗口逻辑，逐一断言输出，并用一个「防抖不重置计时」的错误实现作为负例。

\`\`\`ts
import assert from "node:assert/strict"

type Event = { at: number; value: string }
const events: Event[] = [
  { at: 0, value: "a" },
  { at: 50, value: "b" },
  { at: 120, value: "c" },
  { at: 300, value: "d" },
]

/** 防抖：只有「后面静默满 quietMs」的值才发射；最后一个值在终结时补发。 */
function debounce(items: Event[], quietMs: number): string[] {
  return items
    .filter((e, i) => {
      const next = items[i + 1]
      return !next || next.at - e.at >= quietMs
    })
    .map((e) => e.value)
}

/** 节流：以上次发射时刻为窗口起点，窗口内只放行第一个。 */
function throttle(items: Event[], windowMs: number): string[] {
  const out: string[] = []
  let last = -Infinity
  for (const e of items) {
    if (e.at - last >= windowMs) { out.push(e.value); last = e.at }
  }
  return out
}

/** 采样：固定对齐的周期，每个周期末取该周期最近一个值；空周期不发。 */
function sample(items: Event[], periodMs: number, endMs: number): string[] {
  const out: string[] = []
  for (let t = periodMs; t <= endMs; t += periodMs) {
    const inWindow = items.filter((e) => e.at >= t - periodMs && e.at < t)
    const last = inWindow.at(-1)
    if (last) out.push(last.value)
  }
  return out
}

assert.deepEqual(debounce(events, 100), ["c", "d"], "静默满 100ms 才放行，末尾补发")
assert.deepEqual(throttle(events, 100), ["a", "c", "d"], "窗口内只认第一个")
assert.deepEqual(sample(events, 100, 400), ["b", "c", "d"], "周期末取最近值，空周期跳过")

// 负例：把防抖写成固定对齐窗口（不因新值重置计时），会错误放行 a
function fixedWindowDebounce(items: Event[], quietMs: number): string[] {
  const out: string[] = []
  let windowIndex = -1
  for (const e of items) {
    const idx = Math.floor(e.at / quietMs)
    if (idx !== windowIndex) { out.push(e.value); windowIndex = idx }
  }
  return out
}
assert.notDeepEqual(fixedWindowDebounce(events, 100), debounce(events, 100))
assert.deepEqual(fixedWindowDebounce(events, 100), ["a", "c", "d"], "固定窗口把本该被重置掉的 a 也放行了")

// 负例：搜索框用节流会吞掉「用户停手后最后一个词」的场景
const typed: Event[] = [
  { at: 0, value: "r" },
  { at: 40, value: "rx" },
  { at: 80, value: "rxjs" }, // 用户停手，之后再无输入
]
assert.deepEqual(debounce(typed, 100), ["rxjs"], "防抖保住了最终词")
assert.deepEqual(throttle(typed, 100), ["r"], "节流只放行窗口内第一个，最终词丢失")
\`\`\`

最后一组断言就是开头那次事故的复现：用户连打三个值后停手，防抖给出完整的 \`rxjs\`，节流只给出 \`r\`。**选型不是「哪个请求少」，而是「最后一个值允不允许丢」**——搜索、表单校验这类场景里，最后一个值才是唯一有意义的那个，用节流就是语义错误。

### 一次窗口推演的完整记录

以输入 a(0) / b(50) / c(120) / d(300)、参数 100ms 为例：

| 时刻 | 事件 | 防抖计时器 | 节流窗口 | 采样周期 | 谁发射 |
|---|---|---|---|---|---|
| 0 | a | 启动，等 100 | 窗口 0–100 | 周期 0–100 | 节流发 a |
| 50 | b | **重置**，等 100 | 窗口内，丢弃 | 周期内 | 无 |
| 100 | — | 未到 | 窗口结束 | 周期末 | 采样发 b |
| 120 | c | **重置**，等 100 | 新窗口 120–220 | 周期 100–200 | 节流发 c |
| 220 | c 静默满 | 发射 c | — | — | 防抖发 c |
| 200 | — | — | — | 周期末 | 采样发 c |
| 300 | d | 启动，等 100 | 新窗口 300–400 | 周期 300–400 | 节流发 d |
| 400 | 流终结 | 补发 d | — | 周期末 | 防抖 / 采样各发 d |

第 50ms 那行「重置」是防抖的定义性动作：只要新值到来，前一个值的计时器就作废。把它写成「固定窗口」就会得到负例里的错误结果。第 400ms 那行则说明为什么「最后一个值不会丢」需要终结配合——源 \`complete\` 时防抖会补发挂起的值；若流永不终结且之后再无新值，这个值其实也一直不会发出，所以搜索框的输入流通常还要配合 \`take\` 或路由级取消（L03、L21）。

:::deep

### 三个算子只依赖同一个抽象

\`debounceTime\`、\`throttleTime\`、\`sampleTime\` 的实现各不相同，但它们都把「计时」交给 Scheduler（L22）：防抖要安排一个延迟任务并在新值到来时取消它，节流要记录窗口起点，采样要周期调度一个「取最近值」的动作。一旦时间是通过可注入的调度器取得的，这些逻辑就都不再依赖真实时钟——测试里换成 \`TestScheduler\`，输入用 marble 字符串描述「第几帧来什么值」，输出用另一串 marble 精确断言（L26）。这也解释了为什么 00090 把「调度器」放在「时间算子」前面、「marble 测试」放在最后：**先有可注入的时间，才有可断言的时间**。反过来，如果业务代码里直接写 \`setTimeout\` 或 \`Date.now()\` 做防抖，无论后面用多强的测试框架都无法把它冻结成虚拟时间。

:::

:::warn

### 三个时间算子踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 搜索框用 \`throttleTime\` | 用户停手后的最后一个词被吞，搜到旧关键词 | 改 \`debounceTime\`，必要时配 \`distinctUntilChanged\` |
| \`sampleTime\` 周期与源节奏不同步 | 某些周期无值，图表缺采样点 | 先确认源在周期内必有值，或补 \`startWith\` 初始值（L16） |
| 用真实时钟写时间算子测试 | CI 偶发超时，重跑通过 | 用 \`TestScheduler\` 虚拟时间 + marble 断言（L26） |

第三条与前两课的调度器结论一致：时间算子的正确性本来就建立在「时间可注入」之上，测试若绕过这个抽象直接等真实时间，等于把可确定性主动丢弃。\`flaky\` 不是测试框架的问题，是测试没有使用被测代码自己的抽象。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 窗口区分 | 同一串输入下三个算子输出互不相同，断言固定 |
| 防抖重置 | 新值会重置计时；错误实现被负例抓到 |
| 最后一个值 | 搜索场景防抖保住最终词，节流丢失 |
| 采样空周期 | 周期内无值时不发射，且不影响后续周期 |
| 虚拟时间 | 能说清三者为何可用 TestScheduler 精确断言 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L22 调度器 | 把「何时执行」抽成可注入依赖 | 本课只使用调度器，不重讲任务队列 |
| L10 取最新 | \`switchMap\` 解决搜索竞态 | 本课只负责削峰，与竞态是两层 |
| L12 有界并发 | 同时在跑的内流数 | 本课不控制并发，只控制发射时机 |
| L16 空流兜底 | \`startWith\` 提供首帧值 | 本课只提示采样需要初始值 |
| L26 marble 测试 | 虚拟时间与 marble 语法 | 本课给出窗口推演表，不写 marble 断言 |
`,
    'rxScheduler',
    [
      {
        text: '「用户停打 300ms 后才触发搜索」最合适？',
        options: ['throttleTime(300)', 'debounceTime(300)', 'sampleTime(300)', 'delay(300)'],
        answer: 1,
        explain: 'debounceTime 在「静默 N ms」后发最后一个值，正是搜索框去抖语义。',
        concept: 'c-time-ops',
      },
      {
        text: 'throttleTime 与 debounceTime 的核心差异是？',
        options: [
          '没有差异',
          'throttle 固定节奏发一次；debounce 要静默才发最后一个',
          'debounce 更快',
          'throttle 会丢值',
        ],
        answer: 1,
        explain: 'throttle「每 N ms 至多发一次」（不管你停没停）；debounce「停 N ms 才发最后一次」。',
        concept: 'c-time-ops',
      },
      {
        text: '「每个 1s 时间窗内只处理最后到达的那个值，静默则不发」是？',
        options: ['debounceTime(1000)', 'throttleTime(1000)', 'auditTime(1000)', 'sampleTime(1000)'],
        answer: 2,
        explain:
          'auditTime 窗口内只放行「最后到达」的值，窗口无值则静默；sampleTime 是每窗口定时采样最近值，语义不同。',
        concept: 'c-time-ops',
      },
    ],
    [
      ['debounceTime', '静默 N ms 后发最后一个值'],
      ['throttleTime', '每 N ms 至多发一次'],
    ],
    [
      '搜索框用 throttleTime 导致「打到一半就请求」（应使用 debounceTime）。',
      '把 sampleTime 当 debounceTime 用，期待它「静默才发」（它是定时采样最近值）。',
    ],
  ),
  'theory',
)
