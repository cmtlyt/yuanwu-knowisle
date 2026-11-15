import { L, withKind } from '../../course-builders.ts'

export const L122 = withKind(
  L(
    'L122',
    32,
    '走查②：对话助手迁移（ConversationChain → createAgent+summarization+MemorySaver）',
    3,
    ['L109'],
    ['lc-walkthrough-chatbot'],
    [
      '从零复原 ConversationChain + ConversationSummaryBufferMemory 的旧对话助手并跑通多轮长对话，定位其摘要触发与窗口裁剪的隐式参数',
      '实现迁移：createAgent + summarizationMiddleware（逐参数映射旧摘要配置）+ MemorySaver，跑通同一段长对话在新旧两版下的摘要行为对照',
      '打通 thread 模型验收：同一助手多会话隔离、摘要触发后的消息重组（RemoveMessage + REMOVE_ALL_MESSAGES）、上下文 token 上限三组断言',
    ],
    `### 一、走查对象：一个会「滚动摘要」的旧对话助手

走查②的对象比走查①更纯粹：不带检索的对话助手，但带长对话摘要——这是 ConversationSummaryMemory 族的主场。先复原旧版（含升级版记忆 ConversationSummaryBufferMemory：摘要+窗口混合策略，classic memory/summary_buffer.ts:59）：

\`\`\`ts
// ── before/app.ts：0.x 对话助手（ConversationChain 版）────────
import { ConversationChain } from "langchain/chains/conversation";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.7 });

// 摘要+缓冲混合记忆：超过 maxTokenLimit 的部分滚动成 summary
const memory = new ConversationSummaryBufferMemory({
  llm: model,
  maxTokenLimit: 1000,          // 触发阈值：超过即把窗口外内容压成摘要
  memoryKey: "chat_history",
  returnMessages: true,
});

const chain = new ConversationChain({ llm: model, memory });

// 多轮长对话：状态全在 chain 实例里
await chain.call({ input: "我叫小赵，我负责的产品叫云帆，是做物流 SaaS 的。" });
await chain.call({ input: "云帆的核心客户是中小货运站。" });
await chain.call({ input: "我们最大的痛点是司机接单率低。" });
const r = await chain.call({ input: "帮我把前三轮聊的产品信息写一段简介。" });
// r.response 里应含「小赵 / 云帆 / 物流 SaaS」——摘要记忆在托底
\`\`\`

隐式参数盘点（迁移清单）：摘要由 ConversationSummaryMemory 家族内部驱动——\`llm\` 既是记忆的摘要引擎也是对话模型（一物两用）；\`maxTokenLimit\` 是触发阈值；摘要在 memory.saveContext 内静默发生，调用方无感知也无控制点。这三件事在新形态里分别变成：摘要模型独立参数（summarizationMiddleware 的 model 配置）、显式触发配置（tokenThreshold/messagesToKeep）、可观测的 middleware 切面。

### 二、迁移主体：createAgent + summarizationMiddleware 逐参数对照

新形态的对话助手就是 createAgent + summarization middleware + checkpointer 三件套。先把逐参数映射表立起来（左列旧记忆配置，右列 summarizationMiddleware 的 config，行号均已核实）：

| 旧参数（ConversationSummaryBufferMemory/SummaryMemory） | 新参数（SummarizationMiddlewareConfig） | 说明 |
|---|---|---|
| llm（记忆专用模型实例） | model（middleware 配置项） | 摘要模型与对话模型解耦，可单独降级用便宜模型 |
| maxTokenLimit（触发阈值） | tokenLimit（默认 DEFAULT_TRIM_TOKEN_LIMIT = 4000，summarization.ts:66） | 计数器可换：TokenCounter 类型（middleware/index.ts:8 导出） |
| returnMessages / memoryKey | 无对应（新架构统一 messages） | 变量渲染协议整体退役（L109） |
| summaryPrompt（自定义摘要提示词） | prompt（默认 DEFAULT_SUMMARY_PROMPT，summarization.ts:36） | 新默认提示词按「提取最重要上下文」设计，与旧版输出格式不同 |
| ——（无对应旧参数） | messagesToKeep（默认 DEFAULT_MESSAGES_TO_KEEP = 20，:65） | 摘要后保留的最近原文条数，旧版没有 |
| ——（无对应旧参数） | triggerType/trigger（tokens/messages/fraction 触发模式） | 旧版只有单一 token 阈值 |

落地代码：

\`\`\`ts
// ── after/app.ts：createAgent + summarization + MemorySaver ──
import { createAgent } from "langchain";
import { summarizationMiddleware } from "langchain";   // middleware/index.ts:6 导出
import { MemorySaver } from "@langchain/langgraph-checkpoint";

const checkpointer = new MemorySaver();

const agent = createAgent({
  model: "openai:gpt-4o",
  prompt: "你是「云帆」的客服助手，负责解答产品使用问题。",
  middleware: [
    summarizationMiddleware({
      model: "openai:gpt-4o-mini",      // 摘要引擎独立：旧版一物两用的解耦
      tokenLimit: 1000,                 // ← 旧 maxTokenLimit: 1000 的直接对应
      messagesToKeep: 20,               // 摘要后保留最近 20 条原文（默认值，显式写出便于验收）
    }),
  ],
  checkpointer,
});

const thread = { configurable: { thread_id: "chat-user-42" } };

const msgs = [
  "我叫小赵，我负责的产品叫云帆，是做物流 SaaS 的。",
  "云帆的核心客户是中小货运站。",
  "我们最大的痛点是司机接单率低。",
  "帮我把前三轮聊的产品信息写一段简介。",
];
let last;
for (const m of msgs) {
  last = await agent.invoke({ messages: [{ role: "user", content: m }] }, thread);
}

import { expect, it } from "vitest";
it("摘要/记忆托底：跨多轮信息可召回", () => {
  const text = String(last!.messages.at(-1)!.content);
  expect(text).toMatch(/云帆/);
  expect(text).toMatch(/物流|SaaS/);
  expect(text).toMatch(/小赵/);
});
\`\`\`

与旧版运行差异最关键的一点：**摘要不再静默**。旧版摘要在 saveContext 里黑盒发生；新版摘要发生在 middleware 的 beforeModel 切面——它经 RemoveMessage 协议（summarization.ts:465，\`new RemoveMessage({ id: REMOVE_ALL_MESSAGES })\`）把触发点前的消息替换为摘要消息，再拼上保留窗口的原文。这个替换动作发生在图状态层，因此**摘要结果会随 checkpointer 快照持久化**——重启进程、换设备接入，摘要与消息状态原样恢复，这是旧架构完全不存在的持久化语义。

### 三、状态可观测：走查新形态的调试面

迁移后的助手有一个旧版没有的调试面——状态可查询。展开验证消息重组的结果：

\`\`\`ts
// ── after/debug.ts：观察摘要触发后的状态 ────────────────────
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const state = await agent.getState(thread);
const history = state.values.messages as Array<InstanceType<typeof HumanMessage | typeof AIMessage>>;

console.log("messages 总数:", history.length);
// 摘要触发前的形态：[..., 摘要占位消息, 保留窗口内最近 messagesToKeep 条原文]

// 可观测断言：摘要触发后旧原文不保留（被 RemoveMessage 删除）
it("长对话触发摘要后状态被压缩", async () => {
  // 压 60 轮短消息进同一 thread，强制触发（tokenLimit=1000 很快越过）
  for (let i = 0; i < 60; i++) {
    await agent.invoke(
      { messages: [{ role: "user", content: \`第 \${i} 轮：请回复 OK-\${i}\` }] },
      thread);
  }
  const s = await agent.getState(thread);
  const ms = s.values.messages;
  expect(ms.length).toBeLessThanOrEqual(30);   // 远小于 120 条原始消息（含回复）
  // 且首条消息应为摘要形态（含 DEFAULT_SUMMARY_PREFIX 风格的前缀或摘要正文）
  const first = String(ms[0].content);
  expect(first.length).toBeGreaterThan(20);
});
\`\`\`

这个调试面是迁移的隐藏收益：旧版你只能靠 \`memory.buffer\` 属性偷看内部状态（还得 cast），新版 \`agent.getState(thread)\` 返回的类型化状态就是模型真实看到的上下文——摘要质量、保留窗口、消息顺序全部可断言。调摘要参数时用这个面做 A/B 对照，比旧版翻 memory 内部字段可靠得多。调试面还有时间维度：getState 只返回 thread 的最新快照，要回溯「摘要触发前消息长什么样」得走图级历史 API（getStateHistory，L44 讲过的透传面），它按 checkpoint 版本串列出整个 thread 的快照时间线——验证摘要算法改动效果时，用历史快照对比「触发前/触发后」两个切面，比每次重跑长对话压测省得多。唯一要注意的是 MemorySaver 不落盘，进程重启后两个调试 API 都拿不到旧数据——需要保留调试证据的团队，把 saver 换成持久实现（Postgres/Redis）后再做 A/B，这也是第四节生产前置清单的另一个理由。

### 四、多会话验收：thread 隔离与生产前置

最后一组验收针对会话模型本身：

\`\`\`ts
// ── after/acceptance.ts：多会话与生产前置 ───────────────────
import { expect, it, describe } from "vitest";

describe("对话助手迁移验收", () => {
  it("两个 thread 状态互不污染", async () => {
    const t1 = { configurable: { thread_id: "isol-1" } };
    const t2 = { configurable: { thread_id: "isol-2" } };
    await agent.invoke({ messages: [{ role: "user", content: "我叫小赵" }] }, t1);
    const r2 = await agent.invoke(
      { messages: [{ role: "user", content: "我叫什么名字？" }] }, t2);
    // t2 没有见过「小赵」——隔离成立的表现是模型明确表示不知道或反问
    expect(String(r2.messages.at(-1)!.content)).not.toMatch(/小赵/);
  });

  it("摘要中间件在 tokenLimit 越界时触发（消息数收缩）", async () => {
    const hot = { configurable: { thread_id: "sum-1" } };
    for (let i = 0; i < 40; i++) {
      await agent.invoke(
        { messages: [{ role: "user", content: \`长对话压测 \${i}：\`.repeat(40) }] }, hot);
    }
    const ms = (await agent.getState(hot)).values.messages;
    expect(ms.length).toBeLessThan(80);   // 若未触发应为 80
  });

  it("thread 内信息跨摘要边界仍可召回（信息在摘要里活下来）", async () => {
    const hot = { configurable: { thread_id: "sum-2" } };
    await agent.invoke(
      { messages: [{ role: "user", content: "我的客户编号是 KH-20260315。" }] }, hot);
    for (let i = 0; i < 40; i++) {
      await agent.invoke(
        { messages: [{ role: "user", content: \`闲聊第 \${i} 轮。\` }] }, hot);
    }
    const r = await agent.invoke(
      { messages: [{ role: "user", content: "我的客户编号是多少？" }] }, hot);
    expect(String(r.messages.at(-1)!.content)).toMatch(/KH-20260315/);
  });
});
\`\`\`

第三条断言是摘要迁移的灵魂：**关键信息在「原文被删除、摘要接管」的边界上存活**。旧 ConversationSummaryMemory 的已知痛点是摘要提示词不稳定导致信息丢失；新形态里你要验证的正是这条——若 KH 编号丢失，先调 prompt（middleware 的 prompt 参数）与 messagesToKeep（把关键轮次留在保留窗口），而不是调大 tokenLimit 硬扛。生产前置清单两件事：MemorySaver 换 Postgres/Redis saver（LangGraph 官方同名包），thread_id 换成业务主键（用户 ID/会话表主键），让快照可回溯。走查③见：工具调用 Agent 的迁移，把 L113/L115 的协议退役与开关映射放进实战。

### 五、保留窗口的工程细节：keep 与工具对保护

逐参数映射表里有旧版没有的两个新维度，值得走到源码层看它们的实现细节。第一个是保留条数的配置形式：SummarizationMiddlewareConfig 里除了 messagesToKeep，还有 keepSchema（summarization.ts:114）定义的 keep 参数（KeepSize 类型，:148）——它支持按 messages 数量或按 token 数量两种保留口径。源码里 messagesToKeep 已带废弃迁移逻辑（:324-334）：传入时打印提示并内部转换为 \`keep = { messages: value }\`——与 L115 见过的 toolRetry 弃用别名同一套「接受旧写法、归一化、劝迁移」模式。新代码建议直接写 keep，一步到位避开运行时警告。

第二个是工具对保护。摘要截断点如果恰好落在「ai(tool_calls) → tool 结果」这对消息中间，会把没有结果的工具调用留在保留窗口、结果却被删进摘要——模型再次看到悬空 tool_call 会混乱。summarization.ts 的处理是 SEARCH_RANGE_FOR_TOOL_PAIRS = 5（:68）：计算截断点后在 ±5 条消息范围内搜索，把截断点吸附到不破坏工具对的边界（:781-784 的 searchStart/cutoffIndex+SEARCH_RANGE_FOR_TOOL_PAIRS 逻辑）。这是旧版 ConversationSummaryBufferMemory 完全没有的保护——旧摘要按消息列表线性滚动，从不检查截断位置落在哪里。迁移后在带工具调用的长对话里，这正是「摘要行为变好了」这类主观感受的客观来源：**新版摘要对工具循环有结构感知，旧版没有**。

### 六、token 计数与 contextSize：触发阈值的三种口径

参数表里 tokenLimit 的默认值 4000（DEFAULT_TRIM_TOKEN_LIMIT）只讲了一半，另一半是「怎么数 token」与「对多大的上下文设限」。源码里有两个配套类型：TokenCounter（summarization.ts:74）——一个 \`(messages: BaseMessage[]) => Promise<number>\` 形式的自定义计数函数，替换默认的 tiktoken 估算；contextSizeSchema（:78）定义 ContextSize（:112）——目标模型的上下文窗口大小声明，tokenLimit 与它配合才能算出 fraction 触发模式的比例。三个口径对齐旧版行为的方式：ConversationSummaryBufferMemory 只有 maxTokenLimit 一个数字（旧版内部用自己的 tokenizer），迁移时把它填进 tokenLimit 行为最接近；但要获得「接近模型上下文上限才摘要」的省预算策略，要补上 contextSize 并用 triggerType: "fraction"——这是旧版根本不存在的触发模式（参数表第五行）。调参建议：先跑第二节的多轮对话脚本让摘要触发一次，用 getState 观察摘要后的消息形态，再决定 messagesToKeep/keep 的值——摘要参数的「正确值」依赖模型对摘要质量的实际反应，盲调不如对照实验，这正是第三节调试面存在的意义。

### 本课小结

- ConversationChain 的「开箱即隐」：默认模板 + 默认 BufferMemory（conversation.ts:36-53），状态藏实例；新版一切状态显式（messages + thread 快照）。
- 逐参数映射表是本课交付物：llm→model、maxTokenLimit→tokenLimit、summaryPrompt→prompt，外加旧版没有的 messagesToKeep/trigger 两个新维度（summarization.ts:65-68）。
- 摘要写入走 RemoveMessage + REMOVE_ALL_MESSAGES 状态修订协议（summarization.ts:465），摘要结果随 checkpointer 持久化——旧架构做不到的持久化语义。
- 验收三组：thread 隔离、触发收缩、关键信息跨摘要边界存活； getState 调试面让摘要参数调优从盲调变对照实验。
`,
    null,
    [
      {
        text: 'ConversationChain（classic chains/conversation.ts:30-54）构造时默认注入什么？',
        options: [
          '什么也不注入，全靠用户传参',
          '默认 prompt（history/input 两变量模板）与默认 BufferMemory——对话状态从此藏在 chain 对象里',
          '默认 summarizationMiddleware',
          '默认 MemorySaver',
        ],
        answer: 1,
        explain:
          'constructor 源码：prompt ?? new PromptTemplate({ template: DEFAULT_TEMPLATE, inputVariables: ["history", "input"] })，memory ?? new BufferMemory()（conversation.ts:36-53）——两个默认值把「对话状态」做成了隐式能力。这正是 L104 讲的 memory 隐式读写协议的落点：调用方只看到 chain.call({ input })，history 的读写全在 BaseChain 协议内。C/D 错：这两个是 1.x 形态，ConversationChain 没有。',
        concept: 'lc-walkthrough-chatbot',
      },
      {
        text: 'summarizationMiddleware（langchain/src/agents/middleware/summarization.ts:280）默认保留多少条消息、token 触发阈值是多少？',
        options: [
          '保留 10 条，阈值 2000 token',
          'DEFAULT_MESSAGES_TO_KEEP = 20，DEFAULT_TRIM_TOKEN_LIMIT = 4000（summarization.ts:65-68）',
          '保留 50 条，阈值 8000 token',
          '无默认值，必须显式配置',
        ],
        answer: 1,
        explain:
          'summarization.ts:65-68 依次定义 DEFAULT_SUMMARY_PREFIX、DEFAULT_MESSAGES_TO_KEEP = 20、DEFAULT_TRIM_TOKEN_LIMIT = 4000、DEFAULT_FALLBACK_MESSAGE_COUNT = 15、SEARCH_RANGE_FOR_TOOL_PAIRS = 5——摘要触发后保留最近 20 条原文，token 计数默认阈值 4000。旧 ConversationSummaryMemory 没有这些精细参数（它只有 summaryPrompt 与消息渲染），是迁移后的能力升级。',
        concept: 'lc-walkthrough-chatbot',
      },
      {
        text: '摘要写入状态时用什么机制替换旧消息？（summarization.ts:465 附近）',
        options: [
          '直接覆盖 messages 数组变量',
          '构造 new RemoveMessage({ id: REMOVE_ALL_MESSAGES }) 清空全部旧消息，再写入摘要消息 + 保留的原文——LangGraph 状态修订专用协议',
          '调用 memory.clear() 再 saveContext',
          '不删旧消息，只在头部加标记',
        ],
        answer: 1,
        explain:
          'summarization.ts:465 显式构造 RemoveMessage({ id: REMOVE_ALL_MESSAGES })（常量 import 自 @langchain/langgraph，:28）——这是 LangGraph 状态里「按 id 删除消息」的专用协议（core messages/modifier.ts:22 定义 RemoveMessage 类）。旧 memory 的 saveContext 只会追加，从不修订历史——「摘要替换原文」在旧架构是做不到的，因为状态没有删除语义。',
        concept: 'lc-walkthrough-chatbot',
      },
      {
        text: '走查里 thread_id 与旧 ConversationChain 的「会话」概念对应关系是？',
        options: [
          '完全等价，都是全局单例',
          '旧版一个 chain 实例 = 一个会话（状态藏实例里，多会话要多实例）；新版一个 agent + checkpointer 可服务任意多 thread，thread_id 是状态快照的寻址键',
          '新版不支持多会话',
          'thread_id 只是日志标签',
        ],
        answer: 1,
        explain:
          '旧架构的状态载体是 chain 对象本身（memory 藏在实例里），并发服务 N 个会话要 new N 个 ConversationChain；新架构状态在 checkpointer 里按 thread_id 分桶（MemorySaver 的 storage 是 threadId → namespace → checkpointId 三层映射，memory.ts:106-120），一个 agent 实例可寻址全部会话。D 错：thread_id 是持久化寻址键，不是标签。',
        concept: 'lc-walkthrough-chatbot',
      },
    ],
    [
      [
        'ConversationSummaryBufferMemory',
        '旧版「摘要+缓冲」混合记忆（classic memory/summary_buffer.ts:59）：超窗口部分滚动成摘要，窗口内保留原文——summarizationMiddleware 的旧前身',
      ],
      [
        'DEFAULT_MESSAGES_TO_KEEP',
        'summarizationMiddleware 摘要后保留的最近原文条数（summarization.ts:65，默认 20）',
      ],
      [
        'RemoveMessage',
        'core 消息修订协议（messages/modifier.ts:22）：按 id 标记删除；id 用 REMOVE_ALL_MESSAGES 表示全量——LangGraph 状态内删除消息的唯一合法方式',
      ],
      ['thread_id', 'checkpointer 的会话寻址键：同一 agent 实例下每个 thread 一串独立的状态快照'],
    ],
    [
      '把 ConversationSummaryMemory 的 summaryPrompt 原样复制进 summarizationMiddleware——新中间件有自己的 DEFAULT_SUMMARY_PROMPT（summarization.ts:36，按「提取最重要上下文」设计），旧提示词的输出格式假设不同，直接替换会导致摘要质量下降',
      '以为摘要触发后历史消息还在——REMOVE_ALL_MESSAGES 会把触发点之前的原文全部删掉（只留摘要 + 保留窗口），依赖「回溯完整历史」的功能要改从 checkpointer 快照取',
      '开发用 MemorySaver、部署忘了换持久 saver——进程重启即丢全部会话；thread_id 若用随机数还会让「换 saver」变成不可回溯的断档',
    ],
  ),
  'practice',
)
