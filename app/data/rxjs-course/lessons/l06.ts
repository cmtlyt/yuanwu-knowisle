import { L, code, call, list, q } from '../../course-builders.ts'

export const L06 = L(
  'L06',
  1,
  '过滤与取舍：filter / take / skip / distinctUntilChanged',
  26,
  2,
  ['L05'],
  ['c-filter'],
  ['按条件取舍元素', '用 distinctUntilChanged 去抖重复'],
  [
    code(
      '常用过滤操作符',
      'import { from } from "rxjs"\nimport { filter, take, skip, distinctUntilChanged, first, last } from "rxjs/operators"\n\nfrom([1, 1, 2, 3, 4, 5, 5, 6])\n  .pipe(\n    distinctUntilChanged(), // 去掉相邻重复 → 1,2,3,4,5,6\n    filter((n) => n % 2 === 0), // 偶数 → 2,4,6\n    take(2),              // 取前 2 个 → 2,4\n  )\n  .subscribe((n) => console.log(n)) // 2, 4\n\nfrom(["a", "b"]).pipe(first()).subscribe((x) => console.log(x)) // "a"',
      'distinctUntilChanged 只对「相邻」去重；要全量去重需配合 Set 自己写或 distinct(keySelector)。',
    ),
    list('取舍操作符', [
      'take(n)：取前 n 个后 complete；takeUntil(other)：另一流发信号即截断。',
      'skip(n)：丢弃前 n 个。',
      'elementAt(n)：只取第 n 个；first / last：取第一个/最后一个（配合谓词）。',
      'takeWhile(pred)：满足谓词前全取，遇到不满足即 complete。',
    ]),
    call(
      'warn',
      'takeUntil 要喂一个不会立刻 complete 的信号',
      '常见写法 takeUntil(this.destroyed$)，其中 destroyed$ 是组件卸载时 next() 一次的 Subject。喂错信号（比如自己会 complete 的流）会导致管道提前静默终止。',
    ),
  ],
  'rxFilter',
  [
    q(
      'distinctUntilChanged 的去重范围是？',
      ['整条流去重', '仅相邻重复', '可配置去重窗口', '按 key 全量去重'],
      1,
      '它只比较「上一个」值；全量去重要么自己维护 Set，要么用 distinct(keySelector)。',
      'c-filter',
    ),
    q(
      'take(3) 之后流的状态是？',
      ['继续发射', 'complete，不再发射', '挂起等待', '抛错'],
      1,
      'take(n) 取到第 n 个值就自动 complete，下游不再收到任何值——这是「截断」的内置语义。',
      'c-filter',
    ),
  ],
  [
    ['filter', '按谓词保留元素、改变发射次数'],
    ['take / skip', '按数量截断 / 丢弃前 n 个'],
  ],
  [
    '以为 distinctUntilChanged 能跨非相邻去重。',
    'takeWhile 与 take 混用：takeWhile 遇到首个不满足即停，take 是固定数量。',
  ],
)
