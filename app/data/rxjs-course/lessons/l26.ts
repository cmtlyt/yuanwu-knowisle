import { L, prose, code, call, q } from '../../course-builders.ts'

export const L26 = L(
  'L26',
  5,
  'marble 测试与 TestScheduler 深入',
  30,
  3,
  ['L23'],
  ['c-testing'],
  ['给时间算子写可断言的 marble 测试', '理解帧-毫秒映射与冷/热 marble'],
  [
    prose(
      'marble 图语言',
      'marble 测试用字符串描述「哪个值在哪个帧发射」：字符按帧（每帧默认 20ms）排布，小写为普通值、(x|) 表示同帧多事件、# 表示 error、- 表示该帧无值。TestScheduler 把调度器换成虚拟时间，让时间算子可精确断言。',
    ),
    code(
      '给 debounceTime 写 marble 断言',
      'import { TestScheduler } from "rxjs/testing"\nimport { debounceTime } from "rxjs"\n\nconst ts = new TestScheduler((a, b) => Math.abs(a - b) < 0.5)\nts.run(({ cold, expectObservable }) => {\n  const src = cold("-a-b-c-")      // 帧1发a、帧2发b、帧3发c\n  const out = src.pipe(debounceTime(40)) // 40ms = 2 帧\n  expectObservable(out).toBe("-----x", { x: "c" })  // 静默 2 帧后才发最后一个\n})',
      'TestScheduler（rxjs/testing）把真实计时换成虚拟帧，debounceTime/switchMap/timer 的时间逻辑首次变得可断言、不 flaky。',
    ),
    call(
      'deep',
      '虚拟时间是可测试性的根基',
      '把 Scheduler 抽离为可注入依赖后，测试注入 TestScheduler 即可冻结时间；这与「把时间注入系统」（L22）是一体两面——先会注入时间，才会断言时间。',
    ),
  ],
  'rxScheduler',
  [
    q(
      'marble 字符串 "-a-b-|" 表示？',
      ['帧1发a、帧3发b、帧5 complete', '帧0发a、帧1发b', '只发 a、b 两个值', '以错误结束'],
      0,
      '每个字符一帧（0 起）：- 无值、字母为该帧值、| 为 complete；位置 1=a、3=b、5=complete。',
      'c-testing',
    ),
    q(
      '默认帧=20ms 时 debounceTime(40) 等于多少帧的静默？',
      ['1 帧', '2 帧', '4 帧', '无法测试'],
      1,
      '40ms ÷ 20ms = 2 帧；虚拟时间把毫秒换算成帧，让时间算子可被精确断言。',
      'c-testing',
    ),
    q(
      'marble 字符串里的 # 表示？',
      ['该帧无值', '该帧发射 error', 'complete', '同帧两个值'],
      1,
      '# 表示该帧发 error 并终结；| 是 complete、- 是空帧、(x|) 表示同帧多个事件。',
      'c-testing',
    ),
  ],
  [
    ['marble 图', '用字符序列描述「值在何时（帧）发射」的测试语法'],
    ['TestScheduler', '虚拟时间调度器，使时间算子可测试'],
  ],
  [
    '用真实 setTimeout 测时间算子，测试又慢又 flaky（应使用 TestScheduler 虚拟时间）。',
    '混淆 frame 与 ms：忘按「帧=20ms」换算 debounce/interval 的时长。',
  ],
)
