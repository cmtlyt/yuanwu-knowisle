import { L, withKind } from '../../course-builders.ts'

export const L128 = withKind(
  L(
    'L128',
    33,
    '验收与复盘：迁移前后行为等价断言、遗留项决策、复盘表',
    3,
    ['L125'],
    ['lc-capstone-acceptance'],
    [
      '构建迁移验收总套件：把 L126/L127 的分层断言合并成可一键执行的验收脚本，覆盖数据层、Agent 层、持久化三层，产出全绿验收报告',
      '实现遗留项决策流程：对无替代 API（花式 retriever/SqlToolkit/experimental 族）逐项跑 L124 决策树，产出留 classic/重写/放弃的三档决策记录',
      '产出迁移复盘表：行为漂移点、参数对照偏差、断言失败案例三项归档，形成可复用的组织级迁移检查单',
    ],
    `### 定锚：Capstone A 收口课——验收即证明

前三课完成了盘点（L125）、数据层（L126）、Agent 层（L127），本课是 Capstone A 的收口：把分层的断言合并成验收总套件、给无替代 API 跑决策树、用复盘表沉淀方法论。一句话核心结论：**迁移交付物 = 新栈实现 + 可复验的行为等价证明 + 显式确认的差异清单；三者缺一，迁移都不算完成。** 与 L121-L123 走查课的差别再强调一次：走查课教「怎么改」，本课教「怎么证明改对了」。

### 验收总套件：三层断言合并执行

总套件把前两课的断言按「数据层 → Agent 层 → 持久化」组织成单脚本。骨架如下：

\`\`\`ts
// acceptance.ts —— 迁移验收总套件（可执行版）
// 运行：npx tsx acceptance-migration.ts && echo "MIGRATION VERIFIED"
import { createAgent, tool, FakeToolCallingModel } from "langchain";
import { z } from "zod/v3";

// ── golden fixtures（L125 定稿，两侧共用）──
const GOLDEN_QUERY = "查 T-1024 并建升级工单";
const GOLDEN_SCRIPT = [
  [{ name: "search_ticket", args: { ticketId: "T-1024" },
     id: "c1", type: "tool_call" }],
  [{ name: "create_ticket", args: { title: "escalate T-1024" },
     id: "c2", type: "tool_call" }],
  [],
] as const;

// ── 1.x 侧驱动 ──
const model = new FakeToolCallingModel({ toolCalls: GOLDEN_SCRIPT.map(r => [...r]) });
const searchTicket = tool(({ ticketId }) => \`T-\${ticketId}: open/mid\`, {
  name: "search_ticket", description: "search a ticket",
  schema: z.object({ ticketId: z.string() }),
});
const agent = createAgent({ model, tools: [searchTicket] });
const result = await agent.invoke({ messages: [{ role: "user", content: GOLDEN_QUERY }] });

// ── 数据层 ─────────────────────────────────────────
// D1 渲染等价（全等，L126 断言一）：
//    oldStackHistory === getBufferString(messages, "Human", "AI")
// D2 消息序列包含性（L126 断言二）：同 thread 二轮 invoke，
//    getState().values.messages 包含首轮全部消息类型
// D3 摘要结构（L126 断言三）：小阈值下摘要后恰一条
//    DEFAULT_SUMMARY_PREFIX 消息 + 尾部保留消息（keep=20 上限内）

// ── Agent 层（剧本驱动，可直接执行）────────────────
const types = result.messages.map((m) => m.type);
console.assert(
  JSON.stringify(types) ===
    JSON.stringify(["human", "ai", "tool", "ai", "tool", "ai"]),
  "A1 FAIL: 消息序列类型不等价"
);
const firstCall = result.messages[1].tool_calls?.[0];
console.assert(firstCall?.name === "search_ticket", "A2 FAIL: 工具名漂移");
console.assert(
  JSON.stringify(firstCall?.args) === JSON.stringify({ ticketId: "T-1024" }),
  "A2 FAIL: 工具参数漂移"
);

// ── 持久化 ─────────────────────────────────────────
// P1 thread 隔离：两个 thread_id 各自独立记忆，互不串扰
// P2 重启恢复：新进程内同 thread invoke，历史消息仍可见
//    （MemorySaver 语义下模拟：同 saver 实例新调用）
// A3/A4（既定差异项）用独立 thread 跑，结论归档复盘表：
// A3 1.x 侧 recursionLimit 触发图错误收尾 / 旧栈侧 maxIterations force 收尾
// A4 1.x 侧错误 ToolMessage 回喂 / 旧栈侧 handleParsingErrors 路径
// A5 中间步骤：getState 历史可读出中间消息
\`\`\`

三层组织有一个运行顺序约束值得点破：**A3/A4 必须用独立 thread 跑**——上限触发与工具抛错都会污染线程状态，与 D2/P1 的干净剧本共用 thread 会产生交叉失败。套件执行完输出三类结论：必须等价项（D1-D3、A1-A2、A5、P1-P2）要求全绿；既定差异项（A3/A4）要求「各自成立」且已归档；任何意外红项进复盘表失败案例栏。

### 遗留项决策：决策树跑在证据上

工单助手的盘点清单（L125）里有两类「无替代」项：知识库侧的 MultiQueryRetriever（classic retrievers/multi_query.ts:91 等 12 个花式 retriever）与工具侧的 SqlToolkit（agents/toolkits/sql/sql.ts:37）。决策树的判据按 L124 的框架跑，本课给出这两项的实跑记录。决策树本身的执行逻辑固化为伪代码，后续项目可直接套用：

\`\`\`ts
// 遗留项决策树（L124 框架的执行版）
function decideLegacyItem(item: LegacyItem): Decision {
  // 第一问：1.x 是否有语义等价物？（查映射表，锚点必须可核）
  if (item.exactReplacement) return { action: "replace-import", risk: "low" };
  if (item.conceptualReplacement) return { action: "rewrite", risk: "medium" };

  // 第二问：无替代时，业务是否真的依赖它的全部行为？
  if (!item.businessCritical) return { action: "drop", note: "记录替代路径" };

  // 第三问：它能脱离旧编排独立运行吗？（共享 core 的类型互通是前提）
  if (item.runsWithSharedCore) return { action: "keep-classic", note: "设退出条件" };

  // 兜底：深度耦合旧编排 → 权衡「重写核心部分」vs「整体留 classic」
  return { action: "hybrid", note: "拆分边界，逐子项重跑本树" };
}
\`\`\`

**MultiQueryRetriever：留 classic 档。** 判据链：它是检索策略实现而非编排协议，1.x 主线只保留 BaseRetriever 抽象（core retrievers/index.ts:31-61），重写意味着自研查询改写逻辑——收益低、风险高。并存可行性证据：classic 的 peerDependencies 声明共享 @langchain/core（langchain-classic/package.json:199-204），BaseMessage/Document 类型互通，同进程协作无类型摩擦。决策记录三要素：保留理由（策略实现无官方替代）、并存的类型前提（共享 core）、退出条件（未来官方提供等价 middleware 或自研 LCEL 版成本可接受时再评估）。并存前提的依赖树证据值得放进决策记录附件：

\`\`\`json
// langchain-classic/package.json（节选，commit 7704471）
// "peerDependencies": {
//   "@langchain/core": "workspace:^"          ← 共享 core 的官方声明
// },
// "dependencies": {
//   "@langchain/openai": "...",
//   "@langchain/textsplitters": "...",
//   "zod": "..."
// }
// 注：新 langchain 不在 classic 的 dependencies 里（仅 devDependencies
//     的测试引用）——两包运行时独立、core 是共同地基
\`\`\`

**SqlToolkit：重写档。** 判据链：Toolkit 在 1.x 无对应物，但 L114 给过路径——把 toolkit 里的工具列表拆开直传 createAgent 的 tools 参数。拆开后每个工具成为独立 tool()，schema/description 由应用自持，反而消除了 Toolkit 这个中间抽象。决策记录：重写范围（工具定义层）、验证手段（A2 断言的参数等价直接覆盖）、风险（SQL 方言行为依赖 classic sql_db 的部分，若用到则该部分单列留 classic）。

**experimental 族（本应用未用到，但决策树要过一遍）：放弃档。** autogpt/babyagi/plan_and_execute 整族只活在 classic（classic src 目录清单证据），1.x 的世界观里自主 agent 实验由 LangGraph 手工搭图取代——若无真实业务依赖，决策是放弃并记录替代路径（LangGraph 自组图），不做任何迁移投入。决策树输出的三档记录统一进复盘表附录，格式：项名、classic 锚点（文件:行号）、档位、理由、退出条件。

### 双包并存的运行时取证：依赖树与同进程冒烟

「留 classic 档」不能只写一句结论——并存可行性要有两条取证记录才闭环。第一条是依赖树证据。classic 的 package.json 给出的信号链完整：peerDependencies 声明 \`"@langchain/core": "workspace:^"\`（langchain-classic/package.json:200）、dependencies 里没有新 langchain 包（:216-225 只有 @langchain/openai/@langchain/textsplitters/zod 等运行时依赖）、新 langchain 只出现在 devDependencies 的测试引用里（:173）。三处合读：**classic 的运行时不依赖新 langchain，两者共同依赖且仅共同依赖 core——同进程安装不会产生两份 core，Document/BaseMessage 等类型天然是同一个类**。这也是 L05 讲过的 Symbol.for 跨包判型机制的用武之地没被触发的原因：类型互通靠的是「同一份模块实例」，不是品牌标记。

第二条是同进程冒烟脚本。并存档位上线前跑一次最小验证——classic 的组件与新栈组件在同一个进程里交换数据：

\`\`\`ts
// 并存冒烟：classic 组件与新栈组件同进程协作
import { MultiQueryRetriever } from "@langchain/classic/retrievers";   // 留 classic 的检索策略
import { createAgent } from "langchain";                              // 新栈 agent
import { Document } from "@langchain/core/documents";                 // 共享 core 的类型

const retriever = new MultiQueryRetriever({/* ...classic 配置 */});
const docs: Document[] = await retriever.invoke("工单升级政策");       // classic 产出 Document
// 新栈工具直接消费同一类型，无适配层：
const searchKnowledge = tool(
  ({ query }) => docsFromRetriever(query).map(d => d.pageContent).join("\\n"),
  { name: "search_knowledge", /* schema 略 */ }
);
const agent = createAgent({ model: "openai:gpt-4o", tools: [searchKnowledge] });
\`\`\`

*— 冒烟骨架，依据 classic retrievers/multi_query.ts:91 与共享 core 的类型互通（commit 7704471）*

冒烟通过的两个判定点：类型检查零报错（Document 是同一个类，无 instanceof 失配）与运行时零额外安装（node_modules 里 core 只有一份，\`npm ls @langchain/core\` 验证）。两条取证记录作为附件写进决策记录，「留 classic」从一个口头决定变成有证据支撑的架构事实——这个取证动作本身也应进入 L128 的检查单：**任何「并存」决策都必须带依赖树取证 + 冒烟记录，缺一条就降档为「重写」评估**。

### golden 剧本的资产化管理

总套件的可复验性系于 golden 剧本的质量，剧本本身要当作资产来管理而不是散落在测试代码里的字面量。资产化有四条纪律。**纪律一：剧本文件独立存放**——GOLDEN_SCRIPT 与工具桩（固定返回值的假工具实现）放在 fixtures 目录，验收脚本只引用不内联；两侧（旧栈/新栈）共用同一份剧本文件是「同一剧本、两侧验证」成立的前提，内联字面量迟早会在某一侧被「顺手优化」而失同步。**纪律二：剧本带语义注释**——每一轮 tool_calls 旁边注明业务意图（「查单轮：验证参数 ticketId 提取」），让下一个维护者能判断某轮剧本能否删改；无注释的剧本黑盒化后，没人敢动也就没人维护。**纪律三：负例剧本与正例剧本分文件**——invalid tool_call、工具抛错、超限这三类破坏性剧本不与正例混排（L127 的 A3/A4 已要求独立 thread），文件级隔离让 CI 可以按需选择性跑。**纪律四：剧本变更走评审**——剧本变了等于验收标准变了，任何剧本 diff 要在 PR 里显式说明业务依据，防止「为了让测试通过而改剧本」的倒灌。

资产化的收益在多项目复用时兑现：本课的 fixtures 目录（剧本 + 工具桩 + 假模型配置）就是下一个迁移项目的启动模板——替换业务工具实现、保留剧本结构与断言骨架，L125 的盘点脚本跑完就能直接套用。**验收资产比验收结论更长寿**，这也是为什么本课把资产化纪律写进交付物清单而不是留在工程习惯里。

### 复盘表：把失败案例变成检查单

复盘表三栏的归档纪律决定它是不是废纸。本项目的实跑结果示例：

| 归档项 | 案例描述 | 抽象成的检查条目 |
|---|---|---|
| 行为漂移点 | 迭代上限计数口径：模型轮数 vs 图超步，15 不能照抄 | 迁移前用剧本实测上限触发点，等价换算不许凭参数名 |
| 参数对照偏差 | RetrievalQAChain 输入键 query→input，静默 undefined | 映射表每行的「新家」必须核对输入/输出键名，不只核类名 |
| 断言失败案例 | 模板 {history} 前缀与 buffer 前缀双重渲染 | 字符串形态的记忆变量迁移时，先 grep 模板占位符再定改写方式 |

三栏的抽象方向不同：漂移点栏产出「实测动作」类条目，偏差栏产出「核对清单」类条目，失败案例栏产出「前置检查」类条目。复盘表的最终归宿是组织级迁移检查单——下一个 0.x 项目启动时，L125 的盘点脚本之前先过这份检查单。

归档纪律还有一条升级动作值得执行：三栏之外的**第四栏「零失败验证」**——记录「预判过但实际没发生」的风险项（本项目的例子：回调执行树命名漂移，预判了中优风险，实测观测规则未受影响）。零失败栏的价值常被低估：它校准的是风险清单的**误报率**，让下一轮迁移的风险预判有基线可对照——预判十条命中六条的组织与命中一条的组织，下一步该把精力花在哪一层（盘点深度还是断言密度）答案完全不同。四栏齐全的复盘表才同时记录了「发生了什么」「怎么防」与「什么其实不会发生」。

### 验收报告的产出格式

验收总套件跑完后，报告不是一句「全绿」就完事——格式本身决定它的可评审性。报告分三段。**第一段：结论矩阵**，一张表列出全部断言项的编号、所属层、断言对象、结论（PASS / CONFIRMED-DIFF / FAIL）——必须等价项只允许 PASS，既定差异项标 CONFIRMED-DIFF 并链到复盘表行号，任何 FAIL 阻塞发布。**第二段：既定差异清单**，A3/A4 型条目的差异描述、影响面与业务方确认记录——这段是给非工程读者的，写法上避免源码行号轰炸，用行为语言描述（「超限时新栈显式报错而非静默停止」）。**第三段：复验指引**，golden 剧本文件、假模型配置、执行命令与运行时依赖，任何人 clone 仓库后一条命令可复现全部结论。三段格式的检验标准与 L125 断言先行的原则呼应：**报告第三段若无法让第三方复现第一段的结论矩阵，验收就不算完成**——这是对验收可复验性的最终闭环。

报告归档还有一条纪律：随报告一起归档当次的依赖版本快照（package-lock 或 lock 片段），因为断言结论绑定在具体版本上——迁移验收的全绿不是「永久成立」，而是「在该版本组合下成立」，版本漂移后要按复验指引重跑。版本快照要精确到三包加 classic 四个包：langchain / @langchain/core / @langchain/langgraph / @langchain/classic 的版本组合是断言结论的坐标系，少了任何一个，结论的可追溯性都缺一角。

### Capstone A 终局：交付物清单与自查

Capstone A 的完整交付物按本课口径收束为六件：**一**、API 盘点清单（每项带 classic 文件:行号，含构造参数隐式依赖）；**二**、三类关系映射表（精确/概念/无替代，新家路径可核）；**三**、风险清单（四高优项 + 各自的断言绑定）；**四**、验收总套件（三层断言 + golden 剧本 + 两侧假模型，必须等价项全绿）；**五**、遗留项决策记录（决策树三档，每档有理由与退出条件）；**六**、复盘表（三栏归档，抽象成检查单）。六件交付物之间有明确的依赖方向：清单喂映射表、映射表喂风险清单、风险清单喂总套件、决策树消化无替代项、复盘表回收全程产出——顺序颠倒或跳步，后件就会失去前件的证据支撑。自查的最后一条是反向验证：**拿掉迁移后的代码，仅凭这六件交付物，能否向未参与迁移的工程师完整复述「为什么这样迁、凭什么说迁对了」**——能，则 Capstone A 达标。至此迁移型 Capstone 结束，下一课开启 Capstone B：不再迁移任何旧代码，从零设计一个 1.x 全家桶 agent。

### 本课小结

- **验收即证明**：必须等价项全绿是发布门槛，既定差异项显式归档，意外红项进复盘——三类结论分开出报告，全绿不等于无差异。
- **决策树跑在证据上**：MultiQueryRetriever 留 classic（共享 core 类型互通是前提）、SqlToolkit 重写（拆工具直传）、experimental 放弃（LangGraph 自组取代）——每档记录理由与退出条件。
- **并存决策双取证**：依赖树证据（peerDeps 共享 core、运行时不依赖新包）+ 同进程冒烟（类型零报错、core 单实例）——缺一条降档为「重写」评估。
- **剧本资产化四纪律**：独立 fixtures 文件、语义注释、负例分文件、变更走评审——验收资产比验收结论更长寿。
- **复盘表三栏三方向 + 第四栏**：漂移点→实测动作、偏差→核对清单、失败案例→前置检查、零失败→误报率校准，最终沉淀为组织级迁移检查单。
- **六件交付物反向验证**：不看代码能复述迁移决策链，才算 Capstone A 达标。
- 下一课进入 Capstone B：架构设计先行——带 middleware + 检查点 + RAG + 结构化输出的 agent，每个架构决策都要画得出源码依据。
`,
    null,
    [
      {
        text: '迁移验收总套件的断言对象为什么选「可观察行为」而不是「实现等价」？',
        options: [
          '因为实现等价无法测试',
          '因为迁移的目标是业务行为复现：新旧栈实现机制必然不同（while 循环 vs 编译图、隐式 memory vs messages 状态），逐实现比对既不可行也无意义；可观察行为（消息序列、输出结构、状态形状）才是业务契约',
          '因为框架禁止读源码',
          '因为实现等价断言会拖慢 CI',
        ],
        answer: 1,
        explain:
          '迁移前后实现机制必然不同——这正是迁移的内容本身。若按实现断言，所有结构性变化都会判「失败」，验收失去意义；业务真正依赖的是可观察行为契约。选项 A 过于绝对（实现等价在数据层渲染函数上是可行的，L126 断言一就是例外）；选项 C 无据；选项 D 的性能顾虑不是方法论选择的原因。',
        concept: 'lc-capstone-acceptance',
      },
      {
        text: '无替代 API（如 MultiQueryRetriever）走决策树时，「留 classic 与新包并存」的前提是什么？',
        options: [
          'classic 与新包必须装在两个进程',
          '两包共享同一个 @langchain/core：classic 的 peerDependencies 声明 @langchain/core，类型互通（Document/BaseMessage 是同一个类），同进程可直接协作',
          '必须把 classic 的代码复制进新包',
          '必须先迁移到 Python 版',
        ],
        answer: 1,
        explain:
          'langchain-classic/package.json:199-204 的 peerDependencies 声明 "@langchain/core": "workspace:^"，与新 langchain 共享同一 core——同进程并存、类型互通是官方设计的混合运行路径（L120）。选项 A 与事实相反；选项 C 违背并存设计初衷；选项 D 无稽。',
        concept: 'lc-capstone-acceptance',
      },
      {
        text: '验收报告里「允许不等价」的断言项（如工具抛错的处理路径）应如何归档？',
        options: [
          '当作失败项阻塞发布',
          '归档为「既定行为差异」：断言各自侧的既定行为成立，并把差异与影响面写进复盘表，由业务方确认可接受',
          '直接删除该断言',
          '改成 TODO 注释不执行',
        ],
        answer: 1,
        explain:
          '迁移验收的正确姿势是区分「必须等价」（消息序列、输出结构）与「确认差异」（错误处理路径、迭代上限口径）：前者全绿是发布门槛，后者断言的是「各自按其设计运行」，差异本身要被显式确认而不是掩盖。选项 A 会永远阻塞发布；选项 C/D 把已知差异变成未知风险，违背验收的可追溯原则。',
        concept: 'lc-capstone-acceptance',
      },
      {
        text: '复盘表中「断言失败案例」栏的价值主要在哪？',
        options: [
          '证明迁移很难',
          '失败案例暴露的是盘点盲区与语义漂移点（如输入键名 query→input、渲染双重前缀），归档后成为下一个迁移项目的前置检查项',
          '用于追责',
          '没有价值，删掉即可',
        ],
        answer: 1,
        explain:
          '每个断言失败都对应一处「迁移前未预见的行为差异」——它要么说明盘点清单有漏项，要么说明映射表的关系档位标错了（把概念替代当成了精确替代）。把失败案例抽象成检查条目，是迁移方法论沉淀的核心机制。选项 B 正确；选项 A/C 是情绪化视角；选项 D 与方法论沉淀直接矛盾。',
        concept: 'lc-capstone-acceptance',
      },
      {
        text: 'Capstone A 的最终交付物清单里，为什么验收断言方案与迁移代码并列为一等交付物？',
        options: [
          '因为断言代码量大',
          '因为断言是「行为等价」的客观标准载体：迁移代码交付的是新栈实现，断言交付的是可复验的正确性证明，缺了后者，迁移正确性只能靠口头保证',
          '因为框架要求',
          '因为客户只看测试',
        ],
        answer: 1,
        explain:
          '迁移的可信度来自可复验性：任何人拿到 golden 剧本与断言套件都能重新证明行为等价成立。断言方案在 L125 先于代码定稿、在本课随代码收口——它是贯穿迁移全程的验收契约。选项 A 量无关宏旨；选项 C 无此框架要求；选项 D 视角狭隘。',
        concept: 'lc-capstone-acceptance',
      },
    ],
    [
      [
        '验收总套件',
        '合并数据层/Agent 层/持久化断言的可执行脚本，一键跑出全绿报告；golden 剧本驱动，两侧假模型回放',
      ],
      [
        '既定行为差异',
        '允许不等价但需显式确认的行为项：断言各自侧按其设计运行成立，差异与影响面归档复盘表，由业务方签字',
      ],
      [
        '决策树三档',
        '无替代 API 的处置档位：留 classic（长期共存）/ 重写为 LCEL 或 middleware（新栈化）/ 放弃（功能下线）',
      ],
      ['迁移复盘表', '行为漂移点、参数对照偏差、断言失败案例三栏归档，抽象为可复用的组织级迁移检查单'],
    ],
    [
      '把验收全绿当成「无差异」——全绿只证明「必须等价项等价、既定差异项各自成立」，发布说明必须附上既定差异清单（迭代上限口径、错误处理路径、渲染格式）让业务方确认',
      '遗留项决策时把「留 classic」误执行成「复制代码进新包」——并存的前提是共享 @langchain/core 的类型互通，复制会制造两套类型世界，instanceof 跨包判型问题（L05 的 MESSAGE_SYMBOL 机制）就是教训',
      '复盘表只记成功不记失败——断言失败案例是迁移方法论最有价值的沉淀，只记成功路径的复盘表对下一个项目没有检查单价值',
    ],
  ),
  'capstone',
)
