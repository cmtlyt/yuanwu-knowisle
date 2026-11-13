import { L, code, call, list, q } from '../../course-builders.ts'

export const L24 = L(
  'L24',
  5,
  '组合多源：combineLatest / merge / zip / withLatestFrom',
  30,
  3,
  ['L05'],
  ['c-combine'],
  ['按时序语义选组合操作符', '理解「谁等谁」'],
  [
    code(
      '四种组合',
      'import { of, merge, zip, combineLatest } from "rxjs"\n\n// merge：任一源来值就转发（谁先到转发谁，不等待）\nmerge(a$, b$).subscribe((v) => console.log("任一", v))\n\n// zip：按「配对」同步取，第 1 个配第 1 个……\nzip(a$, b$).subscribe(([x, y]) => console.log("成对", x, y))\n\n// combineLatest：每个源「至少发过一次」后，任一变化就发最新值组合\ncombineLatest(a$, b$).subscribe(([x, y]) => console.log("最新组合", x, y))\n\n// withLatestFrom：只在你「触发」时，带上另一源的最近值\ntrigger$.pipe(withLatestFrom(data$)).subscribe(([t, d]) => console.log(t, d))',
      '一句话：merge「不等待」、zip「按对等步」、combineLatest「要都发过、谁变都触发」、withLatestFrom「我触发、你补最近值」。',
    ),
    list('选择口诀', [
      '多源并发、互不等待、来就处理 → merge。',
      '两个源按步对齐、第 n 配第 n → zip。',
      '要「两个都有最新值」且任一变化就刷新 → combineLatest。',
      '只在我这个触发点，把另一个源的「当前值」捎上 → withLatestFrom。',
    ]),
    call(
      'warn',
      'combineLatest 要等所有源都发过值',
      '若某个源永远不发（或很晚发），combineLatest 就一直不发组合值。务必确认每个源都有初始值（配合 startWith）。',
    ),
  ],
  'rxCombine',
  [
    q(
      '「两个源都要有最新值，且任一变化就发一次组合」最合适？',
      ['merge', 'zip', 'combineLatest', 'withLatestFrom'],
      2,
      'combineLatest 在「每个源至少发过一次」后，任一变化就发出当前所有源的最新值组合。',
      'c-combine',
    ),
    q(
      '「只在用户点击时，把当前选中的数据值捎上」最合适？',
      ['merge', 'withLatestFrom(data$)', 'zip', 'reduce'],
      1,
      'withLatestFrom 在触发源发值时，带上另一源「最近一次」的值，正是「点击时取当前状态」语义。',
      'c-combine',
    ),
    q(
      '用 combineLatest 组合两个源时，「其中一个源还没发过第一个值」会发生什么？',
      [
        '已发出的源会先发',
        '整体不会发射任何值，直到所有源都至少发过一次',
        '跳过该源直接发其它值',
        '立即报错',
      ],
      1,
      'combineLatest 要求每个参与源都「有最新值」才发组合，某源尚未发值时整体静默。这是「组合需各源有初始值」的边界，常需配 startWith 补初始态。',
      'c-combine',
    ),
  ],
  [
    ['combineLatest', '所有源都有最新值后，任一变化即发组合'],
    ['withLatestFrom', '触发时带上另一源的最近值'],
  ],
  [
    '用 zip 期待「任一变化都触发」（那是 combineLatest；zip 是按步对齐）。',
    'combineLatest 中某源无初始值，导致组合流一直沉默（应配合 startWith）。',
  ],
)
