import { L, code, call, list, q } from '../../course-builders.ts'

export const L11 = L(
  'L11',
  2,
  '扁平化的选择决策树',
  24,
  3,
  ['L10'],
  ['c-flatten'],
  ['能按交互模式选对扁平化操作符', '理解「取消 vs 忽略 vs 排队 vs 并发」'],
  [
    list('决策树', [
      '要不要取消旧的？→ 是（搜索/最新值）：switchMap。',
      '要不要忽略新的（进行中排空）？→ 是（防重复提交）：exhaustMap。',
      '要不要严格保序、一个一个来？→ 是（顺序敏感、限流）：concatMap。',
      '要不要并发、越快越好？→ 是（批量独立请求）：mergeMap（可带 { concurrent }）。',
    ]),
    code(
      '一图四例',
      'import { mergeMap, concatMap, switchMap, exhaustMap } from "rxjs/operators"\n\nsearch$.pipe(switchMap(q => api(q)))     // 取消旧、取最新\njobs$.pipe(concatMap(j => run(j)))        // 排队、保序\ntasks$.pipe(mergeMap(t => fetch(t), { concurrent: 3 })) // 有界并发\nsubmit$.pipe(exhaustMap(() => save()))     // 进行中忽略',
      '把四个操作符当「时序策略旋钮」来记：顺序 / 并发 / 取最新 / 排空。',
    ),
    call(
      'tip',
      '记法',
      '「搜索框永远 switchMap，批量独立任务 mergeMap，顺序任务 concatMap，进行中不可打断用 exhaustMap」。把场景和操作符绑定记忆，比背定义牢得多。',
    ),
  ],
  'rxCross',
  [
    q(
      '「任务必须按提交顺序逐个执行，前面的完成才开始下一个」用？',
      ['mergeMap', 'switchMap', 'concatMap', 'exhaustMap'],
      2,
      'concatMap 串行保序，前一个内层完成才启动下一个，正好满足顺序执行。',
      'c-flatten',
    ),
    q(
      '「只保留最新一次输入的结果，旧请求作废」用？',
      ['exhaustMap', 'concatMap', 'switchMap', 'mergeMap'],
      2,
      'switchMap 会取消旧内层、订阅新内层，是搜索/最新值竞态的标准解。',
      'c-flatten',
    ),
    q(
      '「进行中不可打断，做完前忽略新值、做完接受下一次」用？',
      ['switchMap', 'concatMap', 'mergeMap', 'exhaustMap'],
      3,
      'exhaustMap「排空」语义：当前内层未完成时新外值被忽略，完成后放行下一个，适合防重复提交。',
      'c-flatten',
    ),
  ],
  [
    ['时序策略', '多个内层流重叠时的合并规则'],
    ['取消 vs 忽略', 'switchMap 取消旧内层；exhaustMap 忽略新外值'],
  ],
  [
    '把四个操作符都当成「能扁平就行」，不区分取消/忽略/保序语义。',
    '对需要顺序的资源分配用 mergeMap 造成乱序与过载。',
  ],
)
