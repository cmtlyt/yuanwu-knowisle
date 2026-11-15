import { L, withKind } from '../../course-builders.ts'

export const L125 = withKind(
  L(
    'L125',
    33,
    '需求盘点与迁移计划：给定一个 0.x 应用（Chain+Memory+AgentExecutor+OutputParser 全家桶），产出迁移映射表与风险清单',
    3,
    ['L102'],
    ['lc-capstone-inventory'],
    [
      '产出一份四族 API 盘点清单：对给定的 0.x 客服工单助手应用扫描 import 语句与构造参数，把每个旧 API 锚定到 classic 的 文件:行号 级证据',
      '构建一张三类关系映射表（精确替代 / 概念替代 / 无替代），把盘点清单逐项落入表中并给出 1.x 新家路径',
      '写出迁移风险清单与验收断言方案（golden 输入集 + 消息序列断言 + 输出结构断言），交付物先于迁移代码定稿',
    ],
    `### 定锚：Capstone A 的第一课是「先盘点，再动手」

从本课起进入模块十的 Capstone A：以一个虚构但典型的 0.x 应用为对象——**客服工单助手**。它由四族 API 构成：ConversationChain（内含 BufferMemory）负责多轮对话、RetrievalQAChain 负责知识库问答、AgentExecutor + ZeroShotAgent 负责调用「查工单/建工单」两个工具、StructuredOutputParser 负责把模型输出解析成工单摘要 JSON。这个组合覆盖了模块九讲过的全部主力迁移对象。本课的交付物不是迁移后的代码，而是三份文档级产出：**API 盘点清单、三类关系映射表、风险清单 + 验收断言方案**。与 9C 的三节走查课（L121-L123 给完整改写代码）划清边界：Capstone A 只给映射、关键节点提示与可执行断言，改写过程由学员独立完成。

一句话核心结论：**迁移失败的主因不是不会写新 API，而是没有一份锚定到源码行号的盘点清单——迁移范围从一开始就不完整。**

### 盘点方法：从 import 语句与构造参数反推 API 面

盘点的第一动作是把仓库里所有旧包 import 抓出来。下面的脚本可以直接跑：

\`\`\`bash
# 1. 抓出所有来自旧入口的 import（classic 的根入口只是空壳 + 警告）
grep -rn "from \\"langchain" src/ --include="*.ts" | grep -v "@langchain/core"

# 2. 抓出 core 的旧路径依赖（memory 类型从 core 供给 classic 消费）
grep -rn "from \\"@langchain/core\\"" src/ --include="*.ts" | \\
  grep -E "memory|chat_history|output_parsers"

# 3. 定位每个旧 API 的构造点（new Xxx / createXxx）
grep -rnE "new (ConversationChain|RetrievalQAChain|AgentExecutor|BufferMemory|StructuredOutputParser)" src/

# 盘点脚本的一次真实输出（工单助手仓库，节选）：
# src/assistant/chat.ts:3     import { ConversationChain } from "langchain/chains";
# src/assistant/rag.ts:5      import { RetrievalQAChain } from "langchain/chains";
# src/assistant/agent.ts:8    import { AgentExecutor, initializeAgentExecutor } from "langchain/agents";
# src/assistant/memory.ts:2   import { BufferMemory } from "langchain/memory";
# src/assistant/summary.ts:4  import { StructuredOutputParser } from "langchain/output_parsers";
# src/assistant/agent.ts:21   new ConversationChain({ llm, prompt })
#                             ↑ 未传 memory → 构造器默认注入 BufferMemory（隐式依赖）
\`\`\`

三条命令的产物对应盘点清单的三列：import 来源（旧入口）、类型依赖（core 旧路径）、构造点（实例化参数）。注意第 1 条命令里那个 \`grep -v "@langchain/core"\`：classic 的根入口 \`import "langchain"\` 只会得到一行警告——\`[WARNING]: The root "langchain" entrypoint is empty...\`（langchain-classic/src/index.ts:1-3，commit 7704471），所以真实代码都在子入口 \`langchain/chains\`、\`langchain/memory\` 上，grep 模式要覆盖它们。

盘点清单的第四列是**构造参数里隐式出现的依赖**，这是最容易漏的一列。举例：应用代码只 import 了 ConversationChain，但它的构造器在没传 memory 时默认注入 BufferMemory——\`memory: memory ?? new BufferMemory()\`（langchain-classic/src/chains/conversation.ts:30-53）。这条隐式依赖不出现在任何 import 里，但迁移时必须为它找新家。**盘点完成的标准：每个旧 API 都有 classic 文件:行号 锚点，每个构造参数都已知来源。**

### 版本坐标系：package.json 取证先行

盘点的另一半证据在 package.json——API 清单解决「用了什么」，依赖清单解决「在哪个版本组合下用的」。工单助手仓库的盘点输出里必须包含三份依赖证据。第一份是应用自身的 package.json：langchain 与 @langchain/core 各自的版本号决定行为基线。0.x 应用里两者的版本经常不同步（主包 0.2.x 配 core 0.1.x 很常见），而映射表每一行标注的「关系档位」必须以应用锁定的版本组合下的实测行为为准，不是任何版本下的理论行为——这就是盘点要先把版本坐标钉死的原因。

第二份是被依赖的 classic 包自己的身份证据，三个字段就够定性：

\`\`\`json
// langchain-classic/package.json（节选）
// "name": "@langchain/classic",
// "version": "1.0.61",
// "description": "Old abstractions from LangChain.js"
\`\`\`

*— langchain-classic/package.json:2-4（commit 7704471）*

name、version、description 连读：官方对这批旧 API 的定位就写在描述字段里——**「旧抽象收藏馆」，是迁移缓冲区而不是废弃堆**。这直接决定盘点结论的表述口径：无替代项的处置动作是「保留 + 决策」，不是「紧急清除」，L128 的决策树正是按这个口径跑的。

第三份是 classic 包自身的依赖树，它在盘点阶段就要取好证存档，供 L128 的「留 classic 档」可行性论证直接引用：devDependencies 里同时挂着 @langchain/core（workspace:^）、@langchain/langgraph（1.4.18）与 langchain（workspace:*）三个包（langchain-classic/package.json:123,131,173）——classic 自己的测试代码就同时消费新旧三个包；peerDependencies 只声明 @langchain/core（:200），运行时依赖里有 @langchain/openai、@langchain/textsplitters、zod 等（:216-225）。两份清单合起来读出的结论是：**classic 与新 langchain 运行时独立、core 是共同地基**——同进程并存有官方依赖树背书，无替代项不必阻塞主路径迁移。

版本坐标系还有一层用法值得写进盘点笔记：**同一旧 API 在不同版本下的行为可能不同**。BufferMemory 的前缀渲染、RetrievalQAChain 的 chainType 分支行为都在历史版本里演进过；对应用锁定的版本跑 \`npm ls langchain @langchain/core\` 拿到精确版本号，再对关键行为类核对 changelog 或直接读该版本源码，映射表的关系档位才不会因为「按最新版本理解旧行为」而标错。这条纪律在多仓库并行迁移时尤其重要——每个仓库的盘点结论都绑定各自的版本坐标，不能复制粘贴。

### 四族 API 的源码锚点：盘点清单长什么样

下面把工单助手用到的四个核心类各钉一颗钉子。先看 Chain 族代表 LLMChain 的字段面：

\`\`\`ts
export class LLMChain<T extends string | object = string, Model extends LLMType = LLMType>
  extends BaseChain implements LLMChainInput<T> {
  prompt: BasePromptTemplate;
  llm: Model;
  outputKey = "text";
  outputParser?: BaseLLMOutputParser<T>;
\`\`\`

*— langchain-classic/src/chains/llm_chain.ts:89-133（commit 7704471，有裁剪）*

prompt/llm/outputParser 三字段正是 LCEL 三原语的对位：\`prompt.pipe(llm)\` 组合进 RunnableSequence，outputParser 挂在管道尾部。更有说服力的是这个类自己的 JSDoc 示例（llm_chain.ts:78-87）已经在写 \`const chain = prompt.pipe(llm); const response = await chain.invoke({ adjective: "funny" })\`——**旧类的文档注释在教新写法**，这是映射表里「概念替代」一档的黄金证据。

Memory 族代表 BufferMemory 的关键行为在 loadMemoryVariables：

\`\`\`ts
export class BufferMemory extends BaseChatMemory implements BufferMemoryInput {
  humanPrefix = "Human";
  aiPrefix = "AI";
  memoryKey = "history";
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    const messages = await this.chatHistory.getMessages();
    // ...
    [this.memoryKey]: getBufferString(messages, this.humanPrefix, this.aiPrefix)
\`\`\`

*— langchain-classic/src/memory/buffer_memory.ts:50-96（commit 7704471，有裁剪）*

**BufferMemory = chatHistory（消息存储）+ getBufferString（渲染为字符串）**，产物是 \`{ history: string }\` 变量注入 prompt。这决定了它迁移到 1.x 时要拆成两件事：消息本体进 \`messages: BaseMessage[]\` 状态、持久化交给 checkpointer；如果下游 prompt 确实需要字符串形态，getBufferString 本身在 core messages 里仍然可用（summarization 中间件的 import 就是证据，L126 展开）。

RAG 侧的 RetrievalQAChain 同样钉一颗钉子，它的 \`_call\` 暴露了旧 RAG 的编排本质：

\`\`\`ts
export class RetrievalQAChain extends BaseChain implements RetrievalQAChainInput {
  inputKey = "query";
  retriever: BaseRetrieverInterface;
  combineDocumentsChain: BaseChain;
  // ...
  async _call(values, runManager) {
    const docs = await this.retriever.invoke(question, runManager?.getChild("retriever"));
    const inputs = { question, input_documents: docs, ...values };
    const result = await this.combineDocumentsChain.call(inputs, ...);
\`\`\`

*— langchain-classic/src/chains/retrieval_qa.ts:57-117（commit 7704471，有裁剪）*

三个读点：输入键是 \`query\`（迁移时必须改成新组合的 \`input\`，这是 L126 的键名漂移风险源头）；它内部持有 retriever 与 combineDocumentsChain 两个子组件（BaseChain 包 BaseChain 的套娃结构）；回调经 \`runManager?.getChild("retriever")\` 下发执行树——这三点分别对应新栈的输入键、LCEL 组合与回调传播三处改写。

Agent 族代表 AgentExecutor 的参数面是风险清单的主要来源：

\`\`\`ts
export class AgentExecutor extends BaseChain<ChainValues, AgentExecutorOutput> {
  agent: BaseSingleActionAgent | BaseMultiActionAgent;
  tools: this["agent"]["ToolType"][];
  returnIntermediateSteps = false;
  maxIterations?: number = 15;
  earlyStoppingMethod: StoppingMethod = "force";
  handleParsingErrors: boolean | string | ((e) => string) = false;
\`\`\`

*— langchain-classic/src/agents/executor.ts:352-398（commit 7704471，有裁剪）*

maxIterations=15、handleParsingErrors=false、returnIntermediateSteps=false——这三个散装开关每一个都要在 1.x 找到承接物，找不到承接物的就进风险清单。OutputParser 族代表 StructuredOutputParser 则是最轻的一类：classic 的 \`output_parsers/structured.ts:30\` 与 core 的 \`output_parsers/structured.ts:34\` 是同名同签名类，迁移只是改 import 来源（精确替代），agent 场景的新形态才是 responseFormat（L116 已讲）。

### 映射表产出规则：三类关系定工作量

盘点清单铺开后，逐项填入映射表。本课交付的映射表主体如下（应用范围内）：

| 盘点位（classic 锚点） | 关系 | 1.x 新家 | 工作量预估 |
|---|---|---|---|
| LLMChain（llm_chain.ts:89） | 概念替代 | \`prompt.pipe(llm)\` → RunnableSequence（core runnables/base.ts:1944） | 中 |
| ConversationChain（conversation.ts:30） | 概念替代 | createAgent + checkpointer | 大 |
| BufferMemory（buffer_memory.ts:50） | 概念替代 | messages 状态 + MemorySaver（libs/checkpoint/src/memory.ts:106） | 大 |
| RetrievalQAChain（retrieval_qa.ts:57） | 概念替代 | LCEL 自组或留 classic 的 createRetrievalChain（chains/retrieval.ts:70） | 大 |
| AgentExecutor（executor.ts:352） | 概念替代 | createAgent → ReactAgent（langchain/src/agents/index.ts:672-702） | 大 |
| ZeroShotAgent（mrkl/index.ts:59） | 概念替代 | 原生 tool_calls，协议层消失 | 中 |
| StructuredOutputParser（classic output_parsers/structured.ts:30） | 精确替代 | core output_parsers/structured.ts:34；agent 场景走 responseFormat | 小 |
| initChatModel（classic chat_models/universal.ts:614） | 精确替代 | langchain/src/chat_models/universal.ts 同名同签名 | 小 |
| handleParsingErrors（executor.ts:384-390） | 精确替代（语义） | toolErrorMiddleware / toolRetryMiddleware | 小 |

产出规则有三条。**规则一：每行必须有 classic 文件:行号**，没有锚点的行不允许进表——这是防止「凭记忆迁移」的硬约束。**规则二：关系三档定改写深度**，精确替代排进第一个 PR（纯改 import，零逻辑变化）、概念替代逐项排期、无替代项进决策流程。**规则三：新家路径必须指向 1.x 真实导出**，例如 createAgent 写到 \`langchain/src/agents/index.ts:672\`，实现体 \`return new ReactAgent(params)\` 已在 L37 核实过——写不出新家行号的项，说明你对它的认识还停留在记忆层，先回模块九补证据。

### 盘点盲区补漏：构造器双重形态与迭代器遗物

映射表之外还有两类「grep 常规模式抓不到」的盘点盲区，各钉一颗源码钉子。第一类是**构造器的双重形态**。BaseChain 的构造参数签名是 \`fields?: BaseMemory | ChainInputs\`，运行时靠 \`"saveContext" in fields\` 探测传进来的到底是 memory 实例还是配置对象（langchain-classic/src/chains/base.ts:32-64）——这意味着 \`new SomeChain(memory)\` 这种「直接把 memory 当构造参数」的写法在旧架构里完全合法。这类调用点 grep 构造参数名（如 \`memory:\`）抓不到，必须单独 grep \`new \\w+Chain\\(\` 后逐个人工判读第一个参数的类型。工单助手仓库实跑就命中一处：\`chat.ts:38\` 的 \`new ConversationChain(memory)\`——它和传配置对象的行为完全不同（没有自定义 prompt），映射到 1.x 时改写路径也不同。

第二类是**迭代器遗物**。旧 agent 循环还有一个人形 API 很容易被漏盘：

\`\`\`ts
export class AgentExecutorIterator
  extends Serializable
  implements AgentExecutorIteratorInput {
  lc_namespace = ["langchain", "agents", "executor_iterator"];
  agentExecutor: AgentExecutor;
  inputs: Record<string, string>;
  config?: RunnableConfig;
\`\`\`

*— langchain-classic/src/agents/executor.ts:47-58（commit 7704471，有裁剪）*

AgentExecutorIterator 是把 Executor 主循环拆成可手动推进的迭代器形态——应用如果用了它（\`for await (const step of new AgentExecutorIterator(...))\`），意味着消费端逐步拿中间结果，迁移时对应物是 1.x 的图状态流（stream 或 getStateHistory，L44），而不是一次性 invoke。这类 API 的共同特征是：**它改变的不是行为而是消费节奏**，映射表里要给它单独一行、标注消费方式的变化，不能混进 AgentExecutor 的大行里一笔带过。两个盲区补完，盘点清单才算真正「改写范围完整」。

### 风险清单与验收断言：先定标准，再动代码

映射表回答「迁到哪」，风险清单回答「哪里会漂移」。工单助手的风险清单四个高优项：**其一，迭代上限语义漂移**——AgentExecutor 的 maxIterations=15 是「模型调用轮数」，1.x 的 recursionLimit 是「图超步数」，计数口径不同，必须用剧本验证上限行为而不是想当然等价。**其二，错误吞掉方式漂移**——handleParsingErrors=false 时旧 Executor 直接抛错，toolErrorMiddleware 默认策略是把错误转成 ToolMessage 回喂模型，行为完全不同，选型时要点名确认。**其三，memory 渲染格式漂移**——BufferMemory 用 \`Human:\`/\`AI:\` 前缀渲染字符串，新栈 messages 数组直接携带角色，若 prompt 模板里写死了前缀，改写时会出现双重前缀。**其四，中间步骤获取方式漂移**——returnIntermediateSteps 的布尔开关变成 LangGraph 的流式状态输出，消费端代码要重写。

再补两条中优项凑齐完整清单。**其五，回调执行树漂移**——旧栈在编排代码里手工下发子回调（RetrievalQAChain 的 \`runManager?.getChild("retriever")\`，retrieval_qa.ts:111-115），执行树形状由编排作者决定；1.x 的回调树由图结构自动生长（L36 的执行树视角），同名节点的 trace 路径不同——若业务挂了按节点名过滤的观测规则，迁移后要重新核对节点命名。**其六，chatHistory 分层漂移**——BufferMemory 底层的 chatHistory 持久层（BaseChatMessageHistory，core chat_history.ts:10-40）在新栈被 checkpointer 的 thread 模型取代，历史持久化的粒度从「追加消息」升级为「图状态版本快照」（L106）；若旧应用直接操作 chatHistory 做过「读取历史、导出会话」类旁路功能，这些旁路也要迁移，且取数通道换成 getState 族。

风险清单的每一项都对应验收断言。断言方案的骨架如下（先于迁移代码定稿）：

\`\`\`ts
// 验收断言方案 v1（golden 剧本固定，迁移前后各跑一遍）
// 剧本：用户问「帮我查一下 T-1024 工单状态，然后建一个升级工单」
// 固定剧本：第 1 轮模型调 search_ticket(T-1024)，第 2 轮调 create_ticket(...)，
//          第 3 轮输出最终答复 + 结构化摘要

// 断言一：消息序列类型等价（结构层）
// expect(typesOf(finalMessages)).toEqual([
//   "human", "ai", "tool", "ai", "tool", "ai"
// ]);

// 断言二：最终输出结构等价（协议层）
// expect(finalSummary).toMatchObject({
//   ticketId: expect.any(String),
//   priority: expect.stringMatching(/^(low|mid|high)$/),
//   actionTaken: expect.any(String),
// });

// 断言三：工具调用参数等价（行为层）
// expect(toolCallsByName("search_ticket")[0].args)
//   .toEqual({ ticketId: "T-1024" });

// 断言四：多轮记忆等价（状态层）
// 第二轮 invoke（同一 thread）时，模型上下文里能看到第一轮的
// 工单结果 —— 以消息序列包含性断言表达，而非字符串比对
// expect(secondRoundTypes).toEqual(
//   expect.arrayContaining(["human", "ai", "tool"])
// );
\`\`\`

四个断言层按「结构 → 协议 → 行为 → 状态」排列，逐层收紧。注意断言二不比对字符串文本（模型措辞允许漂移），只比对 JSON 结构与字段约束；断言四用「包含性」而非「全等」，因为新旧栈的消息渲染细节天然不同，全等断言会把无害差异判成失败。**golden 剧本用脚本化假模型跑**：1.x 侧直接用公开导出的 FakeToolCallingModel（langchain/src/agents/index.ts:722），0.x 侧给 ZeroShotAgent 配一个预编排输出的假 LLM——两侧都用剧本，断言才逐条确定性成立。

### 盘点自查：三个必检漏项

盘点清单定稿前，按本节三个必检项自查一遍，每一项都对应本项目或常见 0.x 应用里真实出现过的漏法。**必检一：构造器默认值**——ConversationChain 的默认 BufferMemory（conversation.ts:30-53）、AgentExecutor 的 maxIterations=15 默认、LLMChain 的 outputKey="text" 默认，这些默认值不写在应用代码里，却决定着行为面；自查方法是逐个打开所用旧类的构造器源码，把「没传的字段」过一遍默认值表。**必检二：字符串参数的魔法值**——initializeAgentExecutor 的 agentType 字符串（initialize.ts:26-63）、RetrievalQAChain 的 chainType（"stuff"/"map_reduce"/"refine"）这类字符串参数决定内部分支，盘点时要把字符串值连同分支一起记下，否则映射表会漏掉分支级差异。**必检三：类型级的旧路径依赖**——有些代码只 import 类型不 import 类（如 \`import type { AgentAction } from "@langchain/core/agents"\`），grep 类名抓不到；这层依赖不阻塞运行但污染类型面，迁移时一并清理（core 里 AgentAction/AgentFinish 只有 classic 消费，L127 的退役判据就靠消费方盘点）。三个必检做完，盘点清单才算「改写范围完整」。

### 本课小结

- **盘点清单四列**：import 来源、core 类型依赖、构造点、构造参数隐式依赖（ConversationChain 默认 BufferMemory 是典型漏网项）——每项必须有 classic 文件:行号 锚点。
- **版本坐标系三份证据**：应用依赖版本组合、classic 的 name/version/description 三字段定位、classic 依赖树（共享 core 的并存依据）——映射表的关系档位绑定在实测版本上。
- **映射表三类关系**：精确替代（换 import）、概念替代（语义等价需改写）、无替代（决策树处理）；关系档位决定 PR 排期。
- **两个盲区补漏**：构造器双重形态（BaseMemory | ChainInputs 运行时探测）与 AgentExecutorIterator 型消费节奏 API——grep 类名抓不到，逐个调用点人工判读。
- **风险清单六项**：四个高优（迭代上限口径、错误吞掉方式、memory 渲染格式、中间步骤获取）+ 两个中优（回调执行树命名、chatHistory 旁路消费），每项绑定一条验收断言。
- **断言先行四层**：结构（消息序列类型）→ 协议（输出 JSON 结构）→ 行为（工具调用参数）→ 状态（跨轮记忆包含性）；golden 剧本两侧都用脚本化假模型。
- 下一课进入数据层改写：Chain/Memory 的隐式变量协议如何落成显式 messages 状态，以及数据层等价断言的具体写法。
`,
    null,
    [
      {
        text: '盘点 0.x 应用 API 面时，最可靠的第一手证据来源是什么？',
        options: [
          '官方博客与教程里的示例代码',
          '仓库里的 import 语句与各组件构造参数，逐条锚定到 classic 源码的 文件:行号',
          'package.json 的依赖数量',
          '运行时打印的日志',
        ],
        answer: 1,
        explain:
          '迁移盘点的对象是「这个应用实际用到的 API」，唯一可靠来源是源代码里的 import 与构造参数——它们决定了改写范围。选项 A 的问题是博客示例与实际用法常有版本漂移；选项 C 的依赖列表只给出包级范围，给不出 API 级清单；选项 D 只有运行时错误路径的信息，覆盖不了没用到的分支。本课的盘点脚本正是按这个思路先 grep import 再读构造点。',
        concept: 'lc-capstone-inventory',
      },
      {
        text: '「LLMChain 的官方替代是 prompt.pipe(llm)」这一结论，最硬的源码证据是什么？',
        options: [
          '迁移指南文档里的一张表格',
          'LLMChain 类自身的 JSDoc 示例（llm_chain.ts:78-87）就在示范 prompt.pipe(llm) 的新写法',
          'LLMChain 类名里有 LLM 两个字',
          'core 包里存在一个叫 LLMChainCompat 的导出',
        ],
        answer: 1,
        explain:
          'langchain-classic/src/chains/llm_chain.ts:78-87 的 JSDoc 示例写着 const chain = prompt.pipe(llm); await chain.invoke(...)——旧类自己的文档注释在教新写法，这是「概念替代」的最硬证据。选项 A 是二手材料；选项 C 是望文生义；选项 D 是凭空编造的导出名，core 里不存在 LLMChainCompat。',
        concept: 'lc-capstone-inventory',
      },
      {
        text: '本课产出的迁移映射表把旧 API 到 1.x 的关系分为哪三类？',
        options: [
          '新增 / 删除 / 重命名',
          '精确替代（换 import 即可）/ 概念替代（语义等价需改写）/ 无替代（留 classic 或自组）',
          '同步 / 异步 / 流式',
          'stable / beta / deprecated',
        ],
        answer: 1,
        explain:
          '这三类对应三种工作量：initChatModel、InMemoryStore、StructuredOutputParser 等同名类只需改 import（精确替代）；AgentExecutor→createAgent、BufferMemory→messages 状态是语义等价但必须改写（概念替代）；SqlToolkit、花式 retriever、experimental 族在 1.x 无对应物（无替代，L124 的决策树处理）。选项 A 的三分类是包管理视角，不描述语义；选项 C/D 与迁移语义无关。',
        concept: 'lc-capstone-inventory',
      },
      {
        text: '旧 AgentExecutor 的 maxIterations=15 在 1.x 迁移后落到哪里？',
        options: [
          '被删除，1.x 不再限制循环次数',
          '细化为两层：LangGraph 图级 recursionLimit 与工具级 toolCallLimitMiddleware',
          '原样保留在 createAgent 的 maxIterations 参数',
          '由环境变量控制',
        ],
        answer: 1,
        explain:
          'createAgent 参数面没有 maxIterations（agents/index.ts:76-106），循环上限由 LangGraph 的 recursionLimit 承接，更细粒度的「工具调用次数预算」由 toolCallLimitMiddleware 承接（middleware/index.ts 导出清单）——选项 B 的「细化」正是 L115 讲过的开关映射结论。选项 A 错在仍有上限且默认存在；选项 C 的参数名不存在；选项 D 无据。',
        concept: 'lc-capstone-inventory',
      },
      {
        text: '为什么验收断言方案要在写迁移代码之前定稿？',
        options: [
          '因为断言代码比迁移代码好写',
          '因为断言定义了「行为等价」的客观标准：没有先定标准，迁移完成后无法判定对齐成功，容易按新 API 的默认行为倒推验收',
          '因为框架要求断言先行',
          '因为断言可以替代类型检查',
        ],
        answer: 1,
        explain:
          '迁移验收的本质是「旧应用的可观察行为在新栈上复现」。若不先固定 golden 输入集与消息序列/输出结构断言，实现者会在迁移完成后按新栈的默认行为解释「等价」，验收就失去了客观锚点。选项 A 不是理由；选项 C 框架并无此要求；选项 D 混淆了类型层与行为层——类型对不等于行为等价。',
        concept: 'lc-capstone-inventory',
      },
    ],
    [
      [
        '迁移映射表',
        '旧 API → 1.x 对应物的逐项对照表，每行必须带 classic 文件:行号 与新家路径，关系标注为精确替代/概念替代/无替代三档',
      ],
      [
        'golden 输入集',
        '预先固定的一组输入（消息序列、工具调用剧本），迁移前后都跑同一组输入，让行为等价断言可复现',
      ],
      [
        '行为对齐断言',
        '以可观察行为（消息序列类型、最终输出结构、状态形状）为对象的断言，区别于逐行比对的实现等价',
      ],
      [
        '风险清单',
        '迁移中行为语义可能漂移的点位列表（迭代上限、错误吞掉方式、memory 渲染格式等），每项标注影响面与验证手段',
      ],
    ],
    [
      '只盘点直接 import 的类、漏掉构造参数里传入的依赖——ConversationChain 的默认 BufferMemory（conversation.ts:30-53）不出现在应用 import 里，但迁移时必须为它找新家',
      '把「无替代」项当成阻塞项——SqlToolkit、花式 retriever 等可按 L124 决策树留在 classic 与新包并存（classic package.json 的 peerDependencies 声明共享 @langchain/core），不阻塞主路径迁移',
      '用真实 LLM 跑迁移前后的对比——模型输出天然非确定，必须用脚本化假模型固定剧本，断言才能逐条成立',
    ],
  ),
  'capstone',
)
