import { L } from '../../course-builders.ts'

export const L09 = L(
  'L09',
  2,
  'concatMap 与 mergeMap：排队 vs 并发',
  3,
  ['L08'],
  ['c-concat', 'c-merge'],
  ['区分 concatMap 与 mergeMap 的时序', '按场景选择'],
  `
\`\`\` title="排队 vs 并发" note="concatMap 像「排队点餐」；mergeMap 像「开多个窗口」，默认无界并发。"
import { of, mergeMap, concatMap } from "rxjs/operators"
// concatMap：一个内层完成才启动下一个（保序、防过载）
src.pipe(concatMap((id) => fetchUser(id)))   // 逐个、顺序

// mergeMap：所有内层并发（快、可能乱序、过载风险）
src.pipe(mergeMap((id) => fetchUser(id)))    // 全部并行
// 限流并发：mergeMap 第二参数
src.pipe(mergeMap((id) => fetchUser(id), { concurrent: 2 })) // 最多 2 个并发
\`\`\`

### 何时用哪个

- 必须保序、或对下游限流 → concatMap。
- 彼此独立、越快越好（如批量并行取 N 个不相关资源）→ mergeMap。
- 搜索框每次输入都请求、且要最新 → switchMap（下一课）。
- 防止请求风暴、限制在途数量 → mergeMap 带 { concurrent: N }。

:::warn

### mergeMap 默认无界并发

事件来多少就并发多少，没有节流。高并发场景务必给 { concurrent } 或改用 switchMap/exhaustMap，否则下游被打爆。

:::

`,
  'rxCross',
  [
    {
      text: 'concatMap 与 mergeMap 的核心差异是？',
      options: ['concatMap 更快', 'concatMap 串行保序；mergeMap 并发', '完全相同', 'mergeMap 保序'],
      answer: 1,
      explain: 'concatMap 等前一个内层完成才启动下一个（保序）；mergeMap 让内层并行（乱序风险）。',
      concept: 'c-concat',
    },
    {
      text: '限制在途并发数为 3，最合适的写法是？',
      options: ['concatMap', 'mergeMap(x, {concurrent:3})', 'switchMap', 'exhaustMap'],
      answer: 1,
      explain: 'mergeMap 的第二参 { concurrent } 就是为「有界并发」设计的，既并发又限流。',
      concept: 'c-merge',
    },
    {
      text: '一批彼此独立的 10 张图片，希望尽快全部加载完成，最合适的扁平化是？',
      options: ['concatMap', 'mergeMap', 'switchMap', 'exhaustMap'],
      answer: 1,
      explain: '彼此独立、越快越好 → mergeMap 并发加载；若必须保序或对接口限流才用 concatMap。',
      concept: 'c-merge',
    },
  ],
  [
    ['concatMap', '内层串行合并，保证顺序与限流'],
    ['mergeMap', '内层并发合并（7.x 中 flatMap 是其别名）'],
  ],
  [
    '搜索框输入用 mergeMap，旧请求回来盖掉新结果（应使用 switchMap）。',
    '对高并发事件源用无界 mergeMap，下游被请求打爆。',
  ],
)
