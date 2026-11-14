import { L } from '../../course-builders.ts'

export const L23 = L(
  'L23',
  5,
  '时间算子：debounceTime / throttleTime / sampleTime',
  3,
  ['L22'],
  ['c-time-ops'],
  ['区分去抖/节流/采样', '按交互模式选时间算子'],
  `
### 三种「时间整形」

输入事件太频繁时，用时间算子整形：debounceTime 只在「静默 N 毫秒后」发最后一个（去抖）；throttleTime 每 N 毫秒最多发一次（节流）；sampleTime 每 N 毫秒采样一次最近值（采样）。三者时序语义完全不同。

\`\`\` title="三件套" note="debounceTime 静默才发；throttleTime 固定节奏；sampleTime 定时采样；auditTime 窗口内取最后。"
import { fromEvent } from "rxjs"
import { debounceTime, throttleTime, sampleTime, auditTime } from "rxjs/operators"

input$.pipe(debounceTime(300))            // 停打 300ms 才发最后一次（搜索框）
input$.pipe(throttleTime(200))            // 每 200ms 最多发一次（拖拽/滚动）
stream$.pipe(sampleTime(500))             // 每 500ms 采一次最新值（进度条刷新）
stream$.pipe(auditTime(1000))            // 每个 1s 窗口内只处理「最后」到来的值
\`\`\`

### 按交互选

- 搜索框打字 → debounceTime（静默后发最新）。
- 滚动/拖拽高频 → throttleTime（限频）。
- 轮询刷新 UI → sampleTime（定时取最近值）。
- 批处理，每个时间窗只认最后一个 → auditTime。

:::tip

### debounce 与 throttle 是高频混淆点

debounce「等你停手」才触发；throttle「不管你停没停，固定间隔触发一次」。搜索用 debounce，滑动/滚动用 throttle。

:::

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
)
