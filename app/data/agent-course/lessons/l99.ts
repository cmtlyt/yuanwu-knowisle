import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L99 = withKind(
  L(
    'L99',
    17,
    'LangGraph 可观测性 + 部署（LangSmith / LangGraph Platform）',
    3,
    ['L96', 'L73'],
    ['langgraph-obs'],
    [
      '接入托管追踪，并验证它的三件事（层级 / 截断 / 归因字段）',
      '用「双层记录」把摘要留在平台、全文留在自己手里',
      '把 span 名与 metadata 改成业务语义，否则 trace 只能看拓扑',
      '说清平台托管的三个锁定点，以及迁移前必须先确认的一件事',
    ],
    `
### trace 很漂亮，问题还是查不出来

接上 LangSmith 的那个下午我们把图跑了一遍，trace 面板确实好看：supervisor 下面挂着 plan、exec、judge，每层都有耗时、有输入输出、有 token 数。我们当时觉得「可观测性做完了」。

三周后一次线上超时，打开 trace 想找原因，卡在两个地方：

- **span 的 input 被截断到 1KB**，而我们要看的正是那次 8KB 的工具返回——trace 里只有前 1KB，恰好截在关键字段之前。
- **span 名全是节点名**：\`plan\`、\`exec\`、\`judge\`。那次任务跑了 11 步，「第 3 步查的是哪个 SKU」在 trace 里完全看不出来，只能靠时间戳去猜。

这两个问题的共同点是：**自动追踪让你零成本拿到了「结构」，但没有给你「语义」**。结构是框架的（节点、super-step、模型调用），语义是你的（这一步在干什么、哪个用户、哪个 SKU、哪条规则命中了）。

### 自动追踪给了你什么，又拿走了什么

| 你得到的 | 你失去的 |
|---|---|
| 零代码的嵌套 span 结构 | span 粒度由框架决定：节点、super-step、模型调用，不是你的业务步骤 |
| 输入输出自动记录 | 默认截断与脱敏，出问题时最需要的那段常常缺 |
| 平台侧的检索、对比、回放 | 数据出域，采样率由平台默认值决定 |
| 成本与延迟面板 | 采样策略不透明时，面板上的统计是偏的 |

这不是说托管追踪不好——从零手写 L75 那套 Tracer 的成本是几天，托管追踪的成本是几个环境变量。问题在于**很多人只做了「接入」这一步，以为就完成了**，然后在下一次事故里付出代价。

正确的姿势是：接入之后，立刻做三项验证。

### 上线检查单：三项验证

**① 层级是否等于你的心理模型。** 在白板上画一次典型任务的步骤（用户提问 → 查订单 → 查库存 → 算价 → 等审批 → 回信），数一下几步；然后去 trace 里数 span 的深度。两者差得太远，说明节点粒度不对（L97 讲的假迁移），或者你的心理模型里有些步骤根本没有对应的 span。

**② 最长的输入输出是否完整。** 故意触发一次大返回（把一张 200 行的表塞进工具结果），看 trace 里存了多少。大部分平台的默认上限在 KB 级，需要显式配置。这一步不做，你等于给自己留了一个「关键时刻掉链子」的坑。

**③ 归因字段在不在。** 下面四个字段必须出现在每次 run 的 metadata 里，否则 trace 只能看拓扑，不能算账也不能定责：

| 字段 | 回答什么问题 | 缺了会怎样 |
|---|---|---|
| \`model\`（带快照日期） | 这次是谁答的 | 换模型导致的质量变化无法归因 |
| \`token\` 与 \`cost\` | 这次花了多少 | 成本异常只能看总账 |
| \`thread_id\` | 属于哪个会话 | 无法把多轮拼起来，也复现不了 |
| \`promptVersion\` | 用的哪版提示词 | 提示词改了以后新旧数据混在一起 |

第四行最常被漏掉。提示词是 Agent 最频繁变更的部分，如果 trace 里没有版本号，你会在「上周明明好了这周又坏了」的时候发现无从比对。

\`\`\`ts title="接入托管追踪：语义化的 name + 归因 metadata" note="要点：name 用业务语义，动态信息走 metadata；环境变量与代码分离。"
import { traceable } from 'langsmith/traceable'

// 环境变量（部署配置，不写进代码）
// LANGSMITH_TRACING=true
// LANGSMITH_API_KEY=...
// LANGSMITH_PROJECT=agent-prod

const MODEL_ID = 'gpt-x-2025-01-01' // 带快照日期，禁止 latest

export function makeRunner(app: any, tid: string, tenantId: string) {
  // name 是业务语义：'agent:quote-flow' 比 'StateGraph' 有用一百倍
  return traceable(
    async (input: string, step: number) =>
      app.invoke({ request: input }, { configurable: { thread_id: tid } }),
    {
      name: 'agent:quote-flow',
      run_type: 'chain',
      tags: ['prod', 'quote'],
      metadata: {
        model: MODEL_ID,
        promptVersion: 'quote-p12', // 提示词版本，改了必须 bump
        tenantId,
        threadId: tid,
      },
    },
  )
}

// 关键一步的 span 再包一层，把「干啥」写进名字
export const spanQueryInventory = traceable(
  async (sku: string) => queryInventory(sku),
  { name: 'tool:query-inventory', run_type: 'tool' },
)
\`\`\`

看最后那一段：\`tool:query-inventory\` 比框架默认生成的 \`tools\` 节点名多了什么？多了「这一次是查库存，不是查订单」。SKU 本身不能进名字（基数太高，平台会按名字聚合），它该进 metadata。

### 双层记录：摘要留在平台，全文留在自己手里

L74 讲回放时提过双层记录，托管追踪下它变成了硬需求：平台适合存**拓扑与摘要**（可检索、可对比、可视化），但它的截断策略、保留期、导出能力都不由你控制。所以全文要自己存。

\`\`\`ts title="双层记录：平台存摘要，自有存储存全文，靠 spanId 关联" note="要点：全文落对象存储，把 key 写回平台 metadata，从 trace 一步跳到原文。"
type SpanPayload = {
  id: string // 平台侧的 run id / span id
  name: string
  input: unknown
  output: unknown
  meta: Record<string, unknown>
}

export async function archiveFull(span: SpanPayload, blob: BlobStore) {
  const key = 'traces/' + span.id + '.json'
  await blob.put(
    key,
    JSON.stringify({ ...span, savedAt: Date.now() }),
    'application/json',
  )
  return key // 调用方负责把 key 写进该 span 的 metadata：fullPayloadKey
}

// 上线自检：检测这次 trace 是否被截断（接进 CI 的冒烟测试）
export function assertNotTruncated(observed: string, expectedLen: number): void {
  if (observed.length < expectedLen) {
    throw new Error('trace payload truncated: ' + observed.length + ' < ' + expectedLen)
  }
}

// 检索入口：从平台点进来的链接，直接按 spanId 捞全文
export async function loadFull(spanId: string, blob: BlobStore) {
  const raw = await blob.get('traces/' + spanId + '.json')
  return raw ? JSON.parse(raw) : null
}
\`\`\`

\`assertNotTruncated\` 值得放进冒烟测试：每次发版跑一条「故意大返回」的 case，断言 trace 里的长度等于原始长度。这条断言比任何文档都可靠——平台的默认上限会随版本变化，而断言不会说谎。

### 部署：托管运行是第三种运行形态

L93 讲过运行时位置有三种形态，LangGraph Platform（以及类似的托管方案）是第三种：**你的图由它打包、由它运行、状态存在它那儿**。它替你解决的问题很实在：

- checkpoint 存储与扩展（不用自己搭 Postgres 加运维）
- 长任务的进程生命周期（挂起后不用你保住进程）
- 会话级 API（threads / runs / 流式事件）已经设计好
- 与追踪面板天然打通（同一家的产品）

代价是三个锁定点，每个都要在选型时写清楚：

| 锁定点 | 具体表现 | 迁移时要做什么 |
|---|---|---|
| 状态存储 | thread 与 checkpoint 在它那里，schema 由它定 | 全量导出并改写读取层；导出能力要先验证 |
| 部署形态 | 你的代码由它打包运行，依赖、网络出口、密钥管理受它约束 | 重建构建与部署流水线，重配密钥与出口白名单 |
| API 契约 | assistant / graph 版本、runs 的流式事件协议 | 客户端与前端的事件解析要重写 |

还有一层不那么显性但更麻烦的：**平台会把一部分代码变成配置**。图怎么注册、环境变量怎么注入、密钥怎么轮转，在自建时都是代码和 CI，在平台上变成控制台里的配置项——这些配置不进代码仓库，迁移时容易漏。

所以有一条底线，我建议放在任何托管选型的第一步：**先确认能全量导出 checkpoint 与 trace，再谈别的。** 导出能力是「退出成本」的唯一度量。没有导出，你签的不是服务合同，是长期租约。

:::deep
### span 名是框架的，语义得你自己加

这是「自动追踪」最容易让人丧失调试能力的地方。框架按实现结构生成 span：一个节点一个 span、一次模型调用一个 span、一次工具调用一个 span。这套结构对「这段代码慢不慢」很好用，对「这一次为什么答错了」几乎无用。

排查 Agent 的问题时，你真正要问的是这类问题：

- 第几步开始偏的？
- 那一步用的是哪个工具、传了什么参数？
- 命中的是哪条业务规则？
- 同一个用户在别的时间问同一件事，走的是不是同一条路径？

这四个问题都需要**语义标签**，而它们都不会自动出现。三个做法，从便宜到贵：

1. **把语义写进名字**：节点叫 \`exec:query-inventory\` 而不是 \`exec\`。便宜、立刻生效，缺点是名字成了高基数（每个动作一个名字，平台聚合会碎）。
2. **把动态值写进 metadata**：SKU、订单号、规则 id 放 metadata，按 metadata 检索。基数问题解决，代价是检索比按名字筛麻烦一点。
3. **给关键步骤包一层 traceable**：像上面 \`spanQueryInventory\` 那样，让「查库存」这件事无论被哪个节点调用都产生同名 span。这是最贵的做法，也是最能让 trace 结构对齐业务结构的做法。

我的经验是 1 和 2 必做，3 只对三个以内的关键路径做——全量包会让 span 数量翻倍，而收益集中在最常出问题的那几步。
:::

:::warn
### 一个必须提前想清楚的问题：谁拥有 trace

自动追踪最贵的不是钱，是**数据归属**。trace 里包含完整的用户输入、工具返回、模型输出——它可能包含手机号、地址、订单金额、内部规则文本。把它发到第三方平台，等于把一份「全量对话快照」放到域外。

托管追踪上线前，至少要回答四个问题：

- 平台是否支持**字段级脱敏**（把手机号、证件号在采集端就抹掉）？还是只能整条不采？
- 保留期多长？能不能配置更短？删除请求怎么执行？
- 采样率能不能按项目配？高流量下 100% 采样会把成本抬到你不想付的数字。
- 数据在哪个区域？有没有跨境传输？

如果这四个问题里有任何一个答不上来，正确的做法不是「先上再说」，而是**先用脱敏后的 metadata 跑通，正文留在自有存储**（就是本课的双层记录）。这样你既拿到了拓扑与耗时，又不把原文交出去。

还有一条容易忽略的：**别在 trace 里存密钥与完整提示词**。提示词是资产，也是攻击面——L83 讲注入时，提示词原文泄露会直接降低攻击门槛。
:::

### 与相邻课的分工

- **L73 / L75** 讲自建 trace 的结构与实现（span 树、ALS、跨角色 link）。本课讲「换成托管以后，哪些能力被自动化了、哪些被拿走了」。
- **L74** 的双层记录在本课变成了硬需求：平台的保留期与截断不由你控制。
- **L93** 的运行时位置三形态，本课是第三种形态的实例与锁定点清单。
- **L94** 的「做不到清单」同样适用于平台：迁移前先列出「在平台里我做不到的事」，那份清单就是退出成本。
`,
    null,
    [
      {
        text: '接上托管追踪后，第一件该做的事是？',
        options: [
          '庆祝可观测性做完了',
          '做三项验证：span 层级是否等于心理模型、最长输入输出是否被截断、归因字段是否齐全',
          '把采样率调到 100%',
          '把所有日志删掉',
        ],
        answer: 1,
        explain: '自动追踪给的是结构不是语义。不验证截断与归因字段，关键时刻会查不出问题。',
        concept: 'langgraph-obs',
      },
      {
        text: '为什么要把 span 名改成业务语义（如 exec:query-inventory）？',
        options: [
          '名字更好看',
          '默认 span 名只有节点名，看不出这一步在干什么，无法回答「第几步开始偏的」',
          '能让执行更快',
          '平台要求这样命名',
        ],
        answer: 1,
        explain:
          '结构是框架的（节点/super-step），语义是你的（查库存 vs 查订单）。动态值放 metadata，别塞进名字。',
        concept: 'langgraph-obs',
      },
      {
        text: '双层记录在托管追踪下的具体分工是？',
        options: [
          '平台存全文，自己存摘要',
          '平台存拓扑与摘要（可检索），自有存储存全文（用 spanId 关联）',
          '两边都存全文',
          '只在本地存，不上平台',
        ],
        answer: 1,
        explain: '平台的截断、保留期、导出能力不由你控制，全文必须留在自己手里。',
        concept: 'langgraph-obs',
      },
      {
        text: '评估托管部署（如 LangGraph Platform）时，第一条底线是什么？',
        options: [
          '价格是否最低',
          '先确认能全量导出 checkpoint 与 trace——导出能力就是退出成本的度量',
          '是否支持自定义域名',
          '是否有免费额度',
        ],
        answer: 1,
        explain: '状态存储、部署形态、API 契约三个锁定点里，最致命的是状态无法导出。',
        concept: 'langgraph-obs',
      },
    ],
    [
      ['托管追踪', '平台自动采集 span 结构与输入输出，替代手写埋点'],
      ['截断上限', '平台对单条 payload 的默认上限，常在 KB 级，需显式配置'],
      ['归因字段', 'model / token / thread_id / promptVersion，缺一就无法归因与算账'],
      ['双层记录', '平台存摘要与拓扑，自有存储存全文，用 spanId 关联'],
      ['运行时位置', '进程内库 / 图解释器 + store / 托管服务，托管是第三种'],
      ['锁定点', '状态存储、部署形态、API 契约（外加变成配置的那部分代码）'],
    ],
    [
      '接上托管追踪就以为可观测做完了，出事故才发现 payload 被截断到 1KB。',
      'span 名沿用节点名，排查时无法回答「第几步偏了、那一步在干什么」。',
      'trace 里没有 promptVersion，提示词改了以后新旧数据混在一起无法比对。',
      '选托管部署时不验证导出能力，checkpoint 与 trace 双双锁死。',
      '把含手机号、地址、内部规则的完整 payload 全量发到域外，未做字段级脱敏。',
    ],
  ),
  'framework',
)
