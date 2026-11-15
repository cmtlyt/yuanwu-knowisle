import { L, withKind } from '../../course-builders.ts'

export const L11 = withKind(
  L(
    'L11',
    2,
    '扁平化的选择决策树',
    3,
    ['L10'],
    ['c-flatten'],
    [
      '说清四类扁平化算子的选择判据顺序',
      '解释「是否保序 / 是否取消旧内流 / 是否限制并发」三问的优先级',
      '用一张决策表覆盖搜索、提交、轮询、上传四类场景',
      '说清决策树不替代压测与时序断言',
    ],
    `
### 一次事故：同一个团队，四条链路四种选法

复盘一个季度的线上问题时发现，四个几乎相同的「输入 → 请求 → 渲染」链路分别用了 \`mergeMap\`、\`concatMap\`、\`switchMap\`、\`exhaustMap\`，问起来答案都是「当时觉得这个合适」。搜索链路用 \`mergeMap\` 出过竞态，提交链路用 \`switchMap\` 出过重复记录，批量上传用 \`exhaustMap\` 丢过文件，轮询链路用 \`concatMap\` 因为一次不返回而永久卡住。四次修复都是换一个算子，但没有任何两次修复能互相复用。缺的不是 API 知识，而是一张**把业务约束翻译成算子的决策表**：只要把「旧结果是否有效、新输入能不能丢、要不要保序」三问写下来，四种策略的选择就是唯一解，不需要凭手感。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 选算子的第一问是什么 | 「新外值到来时，旧内流的结果还有效吗」——无效就取最新 |
| 第二问是什么 | 「活跃期内的新输入允许丢弃吗」——允许且不能取消旧任务就排空 |
| 第三问是什么 | 「结果必须按外值顺序分组吗」——必须是排队，否则并发 |
| 决策树不能替代什么 | 压测、超时、并发上限与真实时序断言 |

### 三问优先级与决策表

| 优先级 | 判据 | 若为「是」 | 为什么排在这个位置 |
|---|---|---|---|
| 1 | 旧内流结果在新外值出现后失效 | \`switchMap\` | 只要允许旧结果写回就会错乱，必须最先排除 |
| 2 | 活跃期内的新输入可以静默忽略 | \`exhaustMap\` | 「防重复触发」比顺序更优先；忽略与排队是不同语义 |
| 3 | 必须按外值顺序 | \`concatMap\` | 保序要付串行成本，确认前两问都不成立才付 |
| 4 | 以上都不成立 | \`mergeMap\`（并设并发上限） | 追求吞吐，但要显式控制容量 |

顺序不能调换：如果把「是否保序」放在第一问，搜索框会因为「想按输入顺序展示」而选 \`concatMap\`，结果旧请求仍旧会写回，竞态一点没解决；如果把「能否并发」放在第一问，提交按钮就会选 \`mergeMap\`，连点两次发两次请求。**前两问管的是「旧值有效性」与「触发次数」，第三、四问管的才是「顺序与吞吐」**，两类约束不在同一层。

| 场景 | 旧结果 | 新输入 | 顺序 | 选择 | 额外约束 |
|---|---|---|---|---|---|
| 搜索建议 / 自动补全 | 失效 | 取最新 | 不要求 | \`switchMap\` | 配 \`debounceTime\` 削峰（L23） |
| 提交 / 支付 / 防连点 | 有效 | 可忽略 | 不要求 | \`exhaustMap\` | UI 给「处理中」反馈 |
| 批量上传 / 顺序写入 | 有效 | 不可丢 | 必须 | \`concatMap\` | 内流必须有超时，防不终结 |
| 独立拉取 / 轮询合并 | 有效 | 不可丢 | 不要求 | \`mergeMap\` + 并发上限 | 显式容量（L12） |

\`\`\`ts title="四条链路按决策表落地" note="四条链的数据形状相同，差别只在新外值到来时的处理；并发上限一律显式给出。"
import { fromEvent, of, from, defer } from "rxjs"
import {
  map,
  debounceTime,
  switchMap,
  exhaustMap,
  concatMap,
  mergeMap,
  take,
} from "rxjs/operators"

const call = (payload: unknown) => defer(() => from(Promise.resolve({ payload })))

// ① 搜索：旧结果失效 → switchMap
const search = (el: HTMLInputElement) =>
  fromEvent(el, "input").pipe(
    map((e) => (e.target as HTMLInputElement).value),
    debounceTime(200),
    switchMap(call),
  )

// ② 提交：活跃期忽略新输入 → exhaustMap
const submit = (el: HTMLButtonElement) =>
  fromEvent(el, "click").pipe(map(() => ({ at: Date.now() })), exhaustMap(call))

// ③ 顺序写入：不可丢、必须保序 → concatMap
const ordered = (ids: string[]) => of(...ids).pipe(concatMap(call), take(ids.length))

// ④ 独立拉取：不可丢、不保序 → mergeMap + 显式并发
const parallel = (ids: string[]) => of(...ids).pipe(mergeMap(call, 4))

void [search, submit, ordered, parallel]
\`\`\`

### 用最小模型把「决策唯一」变成可断言的事实

下面不依赖 RxJS 包：把三问写成一个纯函数，对四个场景逐一断言选择结果，并用一个负例证明「把提交误判成旧结果失效」会立刻被检查器抓到。

\`\`\`ts
import assert from "node:assert/strict"

type Scene = {
  name: string
  staleResultInvalid: boolean
  mayIgnoreNewInput: boolean
  mustKeepOrder: boolean
}

function decide(s: Scene): string {
  if (s.staleResultInvalid) return "switchMap"
  if (s.mayIgnoreNewInput) return "exhaustMap"
  if (s.mustKeepOrder) return "concatMap"
  return "mergeMap+limit"
}

const scenes: Scene[] = [
  { name: "搜索建议", staleResultInvalid: true, mayIgnoreNewInput: true, mustKeepOrder: false },
  { name: "提交按钮", staleResultInvalid: false, mayIgnoreNewInput: true, mustKeepOrder: false },
  { name: "顺序写入", staleResultInvalid: false, mayIgnoreNewInput: false, mustKeepOrder: true },
  { name: "独立拉取", staleResultInvalid: false, mayIgnoreNewInput: false, mustKeepOrder: false },
]

const byName = Object.fromEntries(scenes.map((s) => [s.name, decide(s)]))
assert.equal(byName["搜索建议"], "switchMap", "旧结果失效优先于忽略新输入")
assert.equal(byName["提交按钮"], "exhaustMap")
assert.equal(byName["顺序写入"], "concatMap")
assert.equal(byName["独立拉取"], "mergeMap+limit")
assert.equal(new Set(Object.values(byName)).size, 4, "四个场景恰好四种选择，无歧义")

// 负例：把提交误判成「旧结果失效」会得到危险的 switchMap
const wrong: Scene = { ...scenes[1], staleResultInvalid: true }
assert.equal(decide(wrong), "switchMap", "误判后确实会选到错误算子")
function assertNotCancelOld(scene: Scene, chosen: string) {
  if (scene.name === "提交按钮" || scene.name === "支付") {
    assert.notEqual(chosen, "switchMap", "提交 / 支付绝不能取消旧内流")
  }
}
assert.throws(() => assertNotCancelOld(scenes[1], decide(wrong)))
assert.doesNotThrow(() => assertNotCancelOld(scenes[1], decide(scenes[1])))
\`\`\`

第一处断言特意让「搜索建议」同时满足前两问（旧结果失效、新输入可忽略），用来验证优先级：结果仍是 \`switchMap\`。真实需求里这种重叠很常见，若没有固定的优先级，两个人就会给出两个答案。最后的 \`assert.throws\` 则把评审规则变成了可执行检查：不是靠记忆「提交不能用 switchMap」，而是让误判在断言里失败。

### 一次评审的完整记录

以「批量上传」为例，把三问与额外约束写成可归档的评审表：

| 评审项 | 记录 | 结论 |
|---|---|---|
| 旧结果在新文件加入后是否失效 | 否，每个文件都要落盘 | 排除 switchMap |
| 活跃期内新文件能否丢弃 | 否，一个都不能少 | 排除 exhaustMap |
| 是否必须按列表顺序 | 是，后端索引按顺序写 | 选 concatMap |
| 内流会不会不终结 | 网络异常时可能，需加超时 | 补 take / timeout 约束 |
| 是否允许并发提吞吐 | 不允许，顺序优先 | 不设并发上限 |
| 回归断言 | 三条任务输出顺序 a、b、c | 用 L09 的推演断言 |

这张表说明决策树给出的不是「一个算子」，而是**一个算子 + 一组必须补齐的约束**。批量上传选了 \`concatMap\`，就必须同时解决「内流不终结会永久阻塞」；独立拉取选了 \`mergeMap\`，就必须同时给出并发上限（L12）。把算子与约束分开记录，下次需求变化时才不会只改算子、忘了改配套保护。

:::deep

### 决策树不能替代压测与时序断言

三问解决的是**语义正确性**：旧结果该不该失效、输入能不能丢、顺序要不要保。它回答不了容量问题：并发设多少、超时给多长、下游能承受多少 QPS。这些必须用真实数据压测，并在 L26 用虚拟时间把边界固定成回归断言。同样，决策树也假设「内流最终会终结或失败」，这个假设在弱网、第三方 SDK、长连接场景下并不总成立；一旦不成立，任何策略都可能挂住（排队策略尤其明显）。因此正确的用法是把决策树当成**选型起点与评审清单**，而不是终点：先得到算子，再补齐超时、并发、取消后的用户反馈，最后用断言把时序写死。把「选对算子」当成任务完成，是 S2 最常见的收尾错误。

:::

:::warn

### 三个决策树踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把「是否保序」当第一问 | 搜索链路选了 concatMap，旧请求仍写回，竞态没解决 | 固定三问顺序：旧结果有效性 → 触发次数 → 顺序与吞吐 |
| 选完算子就收工 | concatMap 卡在不终结的内流、mergeMap 打爆下游 | 算子与配套约束一起记录：超时、并发上限、UI 反馈 |
| 把 exhaustMap 的「忽略」写成排队 | 用户连点无反应，却以为请求在队列里等着 | 明确区分忽略与排队（L09）；忽略必须给可见反馈 |

第三条在用户体验上尤其容易被漏掉：\`exhaustMap\` 的行为是静默的，没有任何 \`next\` 通知下游「这次点击被跳过了」。若不在 UI 上把按钮置为处理中，用户会反复点击并怀疑功能坏了。语义正确不等于交互完整，这是决策表最后一列「额外约束」存在的理由。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 优先级 | 三问顺序固定，重叠场景下仍得到唯一答案 |
| 场景覆盖 | 搜索 / 提交 / 顺序写入 / 独立拉取分别对应四种策略 |
| 误判防护 | 「提交选 switchMap」的负例能被断言抓到 |
| 配套约束 | 每个算子都记录了超时、并发上限或 UI 反馈中的至少一项 |
| 边界认知 | 能说清决策树回答不了的容量与挂起问题 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L08 嵌套流心智模型 | 四种策略的取消语义总表 | 本课把它压成三问，不重复机制表 |
| L09 排队与并发 | 两种策略的耗时与顺序推演 | 本课只引用结论作为决策依据 |
| L10 取最新与排空 | 取消 / 忽略与副作用不可撤销 | 本课把两个场景纳入决策表，不重推时间线 |
| L12 并发限制 | \`mergeMap\` 第二参数、\`race\`、\`startWith\` | 本课只要求「必须设上限」，不实现 |
| L23 / L26 | 削峰与虚拟时间回归断言 | 本课只说明决策树不替代压测与断言 |
`,
    'rxCross',
    [
      {
        text: '「任务必须按提交顺序逐个执行，前面的完成才开始下一个」用？',
        options: ['mergeMap', 'switchMap', 'concatMap', 'exhaustMap'],
        answer: 2,
        explain: 'concatMap 串行保序，前一个内层完成才启动下一个，正好满足顺序执行。',
        concept: 'c-flatten',
      },
      {
        text: '「只保留最新一次输入的结果，旧请求作废」用？',
        options: ['exhaustMap', 'concatMap', 'switchMap', 'mergeMap'],
        answer: 2,
        explain: 'switchMap 会取消旧内层、订阅新内层，是搜索/最新值竞态的标准解。',
        concept: 'c-flatten',
      },
      {
        text: '「进行中不可打断，做完前忽略新值、做完接受下一次」用？',
        options: ['switchMap', 'concatMap', 'mergeMap', 'exhaustMap'],
        answer: 3,
        explain: 'exhaustMap「排空」语义：当前内层未完成时新外值被忽略，完成后放行下一个，适合防重复提交。',
        concept: 'c-flatten',
      },
    ],
    [
      ['时序策略', '多个内层流重叠时的合并规则'],
      ['取消 vs 忽略', 'switchMap 取消旧内层；exhaustMap 忽略新外值'],
    ],
    [
      '把四个操作符都当成「能扁平就行」，不区分取消/忽略/保序语义。',
      '对需要顺序的资源分配用 mergeMap 造成乱序与过载。',
    ],
  ),
  'theory',
)
