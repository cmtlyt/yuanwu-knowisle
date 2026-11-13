import { L, code, call, list, q } from '../../course-builders.ts'

export const L18 = L(
  'L18',
  4,
  '状态型 Subject：Behavior / Replay / Async',
  28,
  3,
  ['L17'],
  ['c-state-subj'],
  ['按需求选对状态型 Subject', '理解「初始值/缓冲」的语义'],
  [
    code(
      '三种状态型',
      'import { BehaviorSubject, ReplaySubject, AsyncSubject } from "rxjs"\n\nconst b = new BehaviorSubject(0)          // 必须有初始值，新订阅者立刻拿到「当前值」\nb.next(10)\nb.subscribe((v) => console.log(v))         // 立刻 10，之后随 next\n\nconst r = new ReplaySubject(3)             // 缓存最近 3 个\nr.next(1); r.next(2); r.next(3); r.next(4)\nr.subscribe((v) => console.log(v))         // 2,3,4（最早 1 被挤掉）\n\nconst a = new AsyncSubject()              // 只发「最后一个」，且 complete 时才发\na.next(1); a.next(2)\na.complete()\na.subscribe((v) => console.log(v))         // 2',
      'Behavior「最新值」、Replay「最近 N 个」、Async「完成时给最后一个」——语义差异极大。',
    ),
    list('怎么选', [
      '需要「订阅即拿当前值」（如表单初始值、开关状态）→ BehaviorSubject。',
      '需要「新订阅者补看最近 N 条」（聊天历史、日志回放）→ ReplaySubject(N)。',
      '需要「等完成才给最终结果」（如某次任务结束后的最终值）→ AsyncSubject。',
    ]),
    call(
      'warn',
      'ReplaySubject 会一直持有缓冲',
      '不设容量上限的 ReplaySubject 在长期运行的热流上会无限堆积内存；务必给 bufferSize 或改用 shareReplay({ bufferSize })。',
    ),
  ],
  'rxSubject',
  [
    q(
      '「新订阅者立刻拿到最近一个值」应使用？',
      ['普通 Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject'],
      1,
      'BehaviorSubject 需要初始值，并把「当前值」立即发给新订阅者，之后随 next 更新。',
      'c-state-subj',
    ),
    q(
      '「等整个流 complete 时才把最后一个值发给订阅者」是？',
      ['BehaviorSubject', 'ReplaySubject', 'AsyncSubject', '普通 Subject'],
      2,
      'AsyncSubject 只在 complete 时发一次「最终值」，若流从未 complete 则订阅者什么都拿不到。',
      'c-state-subj',
    ),
    q(
      'BehaviorSubject 的构造有什么硬性要求？',
      ['无要求，可选初始值', '必须提供初始值', '必须提供缓冲上限', '必须传清理函数'],
      1,
      'BehaviorSubject(v) 强制要求初始值，新订阅者立即收到「当前值」，之后随 next 更新。',
      'c-state-subj',
    ),
  ],
  [
    ['BehaviorSubject', '需初始值，新订阅者立即拿到当前值'],
    ['ReplaySubject', '缓存最近 N 个值供新订阅者重放'],
  ],
  [
    '长期运行的热流用无上限 ReplaySubject，内存无限增长。',
    '期望 AsyncSubject 在未 complete 时就有值（它只在完成时发最后一个）。',
  ],
)
