import { L, withKind } from '../../course-builders.ts'

export const L109 = withKind(
  L(
    'L109',
    31,
    'Memory 族迁移：BufferMemory/WindowMemory/TokenBuffer → messages + trimMessages',
    2,
    ['L104'],
    ['lc-memory-migration'],
    [
      '实现 BufferMemory（memoryKey="history" + getBufferString 渲染）到显式 messages 数组的改写，跑通 humanPrefix/aiPrefix 渲染语义的等价迁移',
      '构建 BufferWindowMemory 的 trimMessages 等价物（按条数滑窗）与 ConversationTokenBufferMemory 的 token 裁剪版本，并对齐 returnMessages 双形态差异',
      '搭一个「messages 状态 + checkpointer」的最小对话闭环，产出可复用的 Memory 迁移模板',
    ],
    `### 从 memoryKey 变量到 messages 数组

Memory 族是旧协议里「魔法最多」的部分，也是迁移后心智模型变化最大的部分。核心改写思想：**把「记忆是链对象里的隐藏变量」翻译成「记忆是 messages 状态数组」——读在明处、写在明处、裁剪是显式管线一环、持久化是 checkpointer 配置。**本课逐条迁移 BufferMemory、BufferWindowMemory、ConversationTokenBufferMemory 三个实现，commit 7704471 取证。

### BufferMemory：先解剖再翻译

旧实现的读路径（buffer_memory.ts:50-96）在 L104 解剖过，这里聚焦改写。旧 0.x 对话代码的典型形状：

\`\`\`ts
// 旧：ConversationChain 默认注入 BufferMemory（conversation.ts:30-53）
import { ConversationChain } from "@langchain/classic/chains";
import { BufferMemory } from "@langchain/classic/memory";

const chain = new ConversationChain({ llm: model });
await chain.call({ input: "我叫小明" });      // memory 自动写
await chain.call({ input: "我叫什么？" });    // history 自动读进模板
\`\`\`

新世界的等价物——状态显式化 + checkpointer：

\`\`\`ts
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph/checkpoint";

const agent = createAgent({
  model: "openai:gpt-4o",
  systemPrompt: "你是一个健谈的助手。",
  checkpointer: new MemorySaver(),
});

const config = { configurable: { thread_id: "user-42" } };
await agent.invoke({ messages: [{ role: "user", content: "我叫小明" }] }, config);
const out = await agent.invoke(
  { messages: [{ role: "user", content: "我叫什么？" }] },
  config,
);
// agent 状态里的 messages 已含前两轮，模型看得见——没有 memory 对象参与
\`\`\`

三处翻译要点。**其一，history 字符串没了**：不再有 getBufferString 渲染层与 {history} 占位符，模型直接消费结构化消息。**其二，读写时机可见**：旧协议「链执行前读、后写」的自动行为，变成图节点对 messages 状态的显式增改。**其三，多会话隔离从惯例变协议**：同一个 agent 实例 + 不同 thread_id 就是不同会话，不用再「每个用户 new 一个链」。顺带处理一个迁移评审高频疑问：旧 ConversationChain 里那段 DEFAULT_TEMPLATE（conversation.ts:30-53 构造时注入的 history/input 模板）去哪了？答案是整个模板消失——新 agent 的提示词面是 systemPrompt 参数与 middleware 的动态改写，对话历史以消息身份出现在 messages 数组里，不再需要占位符拼接。若你依赖旧模板里的自定义措辞（比如在模板里写死的角色设定），迁移时把它搬进 systemPrompt 或一个 dynamicSystemPromptMiddleware，语义等价且更可控。

### BufferWindowMemory：滑窗的 trimMessages 等价

旧 BufferWindowMemory（buffer_window_memory.ts:44）保留最近 k 轮消息。1.x 的等价物是 trimMessages：

\`\`\`ts
import { trimMessages } from "@langchain/core/messages";
import { countTokensApproximately } from "@langchain/core/messages";

const windowed = await trimMessages(messages, {
  maxTokens: 500,
  tokenCounter: countTokensApproximately,
  strategy: "last",          // 保留尾部（滑窗语义）
  includeSystem: true,       // SystemMessage 始终保留
  startOn: "human",          // 窗口起点从 human 消息开始，避免孤悬的 AI 回复
});
\`\`\`

注意最后两个选项暴露了裸切片 \`messages.slice(-k)\` 会踩的坑：**裁剪可能落在 AI/Tool 配对中间**，tool_call_id 对不上，模型 API 直接报错。startOn/allowPartial 等参数就是框架层的配对保护——旧 BufferWindowMemory 也有类似逻辑（只按轮次整段滑动），迁移时这些语义要对齐验证。如果用 createAgent 且希望裁剪内建于执行环，用 contextEditingMiddleware 或直接在管线里 trim。

### ConversationTokenBufferMemory：token 预算裁剪

旧 ConversationTokenBufferMemory（buffer_token_memory.ts:52）按 token 上限裁剪。等价改写只需换约束维度：

\`\`\`ts
// token 预算版：真实 tokenCounter 换成模型适配的计数器
import { trimMessages } from "@langchain/core/messages";

const tokenTrimmed = await trimMessages(history, {
  maxTokens: 3000,
  tokenCounter: async (msgs) => {
    // 旧 ConversationTokenBufferMemory 内部也是「估算/计数器」二选一
    return approximateTokens(msgs);
  },
  strategy: "last",
  includeSystem: true,
  startOn: "human",
});
\`\`\`

三种旧 Memory 到此全部有对应物：**BufferMemory→messages 状态本身；BufferWindowMemory→trimMessages maxMessages/条数；TokenBuffer→trimMessages maxTokens**。差别只有一个：旧版把裁剪藏在 saveContext/loadMemoryVariables 里，新版把它写在你看得见的地方。

值得单独强调的是裁剪与工具调用的交互，这是迁移测试最容易漏的一环。旧 BufferWindowMemory 按轮滑动，天然以「一轮对话」为最小单位，不会切到轮中间；trimMessages 的窗口切在消息级，如果没有 startOn/allowPartial 这类保护，窗口边界完全可能落在一个 AI 消息与它对应的 ToolMessage 之间——ToolMessage 的 tool_call_id 找不到配对的 AI 消息，下一次模型调用直接报 400 错误。所以迁移验证清单里必须有一条：**构造一段含工具调用的对话，反复调整窗口大小，确认任何窗口边界下配对完整。**旧版靠「按轮滑动」被动规避的问题，新版要靠配置显式保证——这也是 L104 说的「渲染时机被库决定」的反面：1.x 把控制权交给你，也把责任交给你。

### trimMessages 深一层：双形态、内部校验与部分保留

上面三组改写都把 trimMessages 当黑盒用，迁移评审时值得多打开一层。首先是**双形态签名**（transformers.ts:619-641，commit 7704471）：只传 options 返回一个 Runnable（内部是 \`RunnableLambda.from(...).withConfig({ runName: "trim_messages" })\`），可以直接 pipe 进管线当裁剪环节；传 \`messages + options\` 则直接返回 Promise 立刻计算。两种形态对应两种迁移姿势——管线内嵌裁剪用前者，调用前预处理历史用后者；旧 BufferWindowMemory 语义最贴近后者（存取之间裁），旧「滑窗作为链一环」的想象更贴近前者。

其次是**参数间的耦合校验**（transformers.ts:655-663）：\`startOn\` 与 \`includeSystem\` 都只允许搭配 \`strategy: "last"\`，配了 "first" 直接 throw——这不是文档建议而是运行时强约束，因为这两个选项的语义（从 human 消息开始、始终保留 SystemMessage）只在「从尾部保留」的窗口方向上成立。迁移时如果把窗口方向反转成 "first"（保留开头），要记得这两个选项必须删掉，否则拿到的是异常而不是静默错误。

第三处是 tokenCounter 的**双形态适配**（transformers.ts:665-675）：计数器带 \`getNumTokens\` 方法（模型实例）则逐条求和，是纯函数则直接调用——旧 ConversationTokenBufferMemory 内部「估算函数或模型计数器」二选一的约定在这里原样延续，迁移时两边的计数器可以直接对换。

最后是 allowPartial 与 textSplitter 的**部分保留能力**（transformers.ts:690-760 区段的 partial 分支）：窗口放不下整条边界消息时，把该消息 content 按文本块切分、逐块试探塞进剩余预算——粒度细到消息内。旧 BufferWindowMemory 按「轮」滑动永远做不到这一点，这是迁移后反而更强的能力，长消息场景值得开启。还有一个 JSDoc 里反复出现在示例中的选项 \`endOn\`（transformers.ts:331，类型是消息类型或其数组）：约束窗口**末端**必须落在指定类型的消息上——典型值 "human"（下一轮对话必须以用户消息收尾的窗口才有意义）。它与 startOn 成对使用，一个是窗口起点协议、一个是窗口终点协议，两者都只在 strategy: "last" 下可用（前述耦合校验的另一半）。迁移 BufferWindowMemory 时按 startOn+endOn 双端配置，能比旧版「只按轮数切」更精确地保证窗口形状合法。

分工上再补一句边界：trimMessages 是**读时裁剪**——每次调用前对历史算一次窗口，不改存储；RemoveMessage（modifier.ts:22）是**写时修订**——作为状态更新把消息从 LangGraph 状态里删掉，配合 REMOVE_ALL_MESSAGES 用于摘要替换（L110 的场景）。两者名字里都有「删」，机制完全不同：trim 的输出不落盘，RemoveMessage 的效果进 checkpoint。迁移时把「窗口」交给 trim、「替换」交给 RemoveMessage，不要混用。

### 最小闭环模板：可复用的迁移样板

把三个改写合成一个可复用样板（生产用换 Postgres saver）：

\`\`\`ts
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph/checkpoint";
import { trimMessages } from "@langchain/core/messages";

// 1. agent + checkpointer：持久化地基
const agent = createAgent({
  model: "openai:gpt-4o",
  checkpointer: new MemorySaver(),
});

// 2. 每轮调用前对历史做窗口裁剪（可选：交给 middleware 内建）
async function chat(threadId: string, userText: string) {
  const state = await agent.getState({ configurable: { thread_id: threadId } });
  const history = trimForWindow(state.values.messages ?? []);
  const res = await agent.invoke(
    { messages: [...history, { role: "user", content: userText }] },
    { configurable: { thread_id: threadId } },
  );
  return res.messages.at(-1)?.content;
}
\`\`\`

验证清单：同 thread 两轮调用后 getState 能取回完整消息序列（等价于旧 memory.loadMemoryVariables 的可观测性测试——旧协议要靠 loadMemoryVariables 显式「读记忆」，新协议 getState 直接拿全部状态，读取路径更短）；不同 thread 互不串线（旧版要用两个链实例才能做到的事）；裁剪后 tool_call_id 配对完整。三条都过，Memory 迁移的闭环才算成立。

### 本课小结

- BufferMemory 的 history 字符串渲染层整体退役：messages 数组就是状态，getBufferString 只在摘要场景由中间件内部使用。
- BufferWindowMemory→trimMessages（strategy: "last" + includeSystem + startOn/endOn 双端协议）；TokenBuffer→maxTokens 维度 + 自定义 tokenCounter 双形态适配。
- trimMessages 有 Runnable/直算双形态、first/last 双策略、allowPartial 部分保留三重能力面，按迁移姿势选形态。
- 持久化与裁剪是两个职责：trim 只裁不存，跨调用记忆必须配 checkpointer + thread_id。
- 迁移模板三件套：createAgent 挂 checkpointer、invoke 传 thread_id、按需 trim。
- 下一课对照最戏剧性的一组映射：ConversationSummaryMemory → summarizationMiddleware，摘要提示词与参数逐项对齐。
`,
    null,
    [
      {
        text: 'BufferMemory 默认把记忆渲染成什么？对应的新世界等价物是什么？',
        options: [
          'BaseMessage[]；新世界也是 BaseMessage[]，完全相同',
          'getBufferString 渲染的 Human:/AI: 前缀字符串；新世界直接传 BaseMessage[]，不再需要字符串渲染层',
          'JSON 字符串；新世界是 YAML',
          '记忆摘要文本；新世界是全量消息',
        ],
        answer: 1,
        explain:
          'buffer_memory.ts:80-96：returnMessages=false（默认）时 `getBufferString(messages, this.humanPrefix, this.aiPrefix)` 渲染成字符串塞进 {history}。1.x 的模型输入统一是 BaseMessage[]（langchain/src/index.ts:4-18 全量导出消息类），字符串渲染层消失——模板占位符拼 history 字符串的做法整体退役。A 错在形态不同；C/D 都是编造。concept=lc-memory-migration。',
        concept: 'lc-memory-migration',
      },
      {
        text: 'BufferWindowMemory 的滑窗语义在 1.x 用什么表达？',
        options: [
          'summarizationMiddleware 的 messages 参数',
          'trimMessages（langchain-core messages/transformers.ts:619）按 token/条数裁剪，或搭配 contextEditingMiddleware',
          '没有替代，需要手写数组切片',
          'RemoveMessage 无条件删除全部历史',
        ],
        answer: 1,
        explain:
          '台账条目 16：窗口/token/摘要四种裁剪策略在 1.x 全部由 middleware 与 trimMessages 吸收。trimMessages（transformers.ts:619-626，双重载）支持 maxMessages/maxTokens 等约束、可配置 tokenCounter 与 strategy，正是 BufferWindowMemory（滑窗）与 ConversationTokenBufferMemory（token 预算）的统一替代。A 错，summarization 是摘要触发不是滑窗语义；C 错，有标准工具；D 错，RemoveMessage 是定向删除配合 REMOVE_ALL_MESSAGES 用在摘要替换场景，不是无条件清空。concept=lc-memory-migration。',
        concept: 'lc-memory-migration',
      },
      {
        text: '新对话应用的持久化起点配置长什么样？',
        options: [
          'new ConversationChain({ memory: new BufferMemory() })',
          'createAgent({ model, tools }) + invoke({ messages }, { configurable: { thread_id } })，checkpointer 挂在 createAgent 参数里',
          '手动维护一个 chatHistory 数组，每轮自己拼',
          'trimMessages({ maxTokens }) 直接当存储用',
        ],
        answer: 1,
        explain:
          '新协议：状态=messages 数组，持久化=checkpointer，会话路由=thread_id。createAgent 支持 checkpointer 参数（ReactAgent 透传图级 API，L44），invoke 时传 configurable.thread_id 即可跨调用续会话。A 是旧 API 原型；C 错在放弃框架能力倒退手写；D 错，trimMessages 是裁剪工具不负责存储。concept=lc-memory-migration。',
        concept: 'lc-memory-migration',
      },
      {
        text: '旧协议里「Human:/AI: 前缀字符串」的渲染需求，在 1.x 还有正规出口吗？',
        options: [
          '彻底删除，无任何对应',
          '有——getBufferString 仍在 core messages 导出，summarization 中间件内部就用它生成喂给摘要模型的文本（summarization.ts:4-13 的 import 可证）',
          '只能自己手写拼接函数',
          '归 MoveMessage 类负责',
        ],
        answer: 1,
        explain:
          '积木与协议要分开看：渲染积木 getBufferString 存活（summarization.ts:4-13 的 import 列表里就有它），死掉的是「读记忆时自动渲染」的协议环节。A 错在积木仍在；C 错，标准导出可用；D 错，RemoveMessage 是状态修订消息（modifier.ts:22），不负责渲染。concept=lc-memory-migration。',
        concept: 'lc-memory-migration',
      },
    ],
    [
      [
        'trimMessages',
        'core 的消息裁剪工具（transformers.ts:619）：按 token/条数约束保留尾部消息，BufferWindow/TokenBuffer 两类的统一替代',
      ],
      [
        'RemoveMessage',
        'LangGraph 状态修订专用消息（modifier.ts:22）：配合 REMOVE_ALL_MESSAGES 定向删除历史，摘要替换的标配',
      ],
      [
        '显式 messages 协议',
        '1.x 记忆模型：messages 数组既是输入也是输出状态，读写全部可见，无隐藏 memory 对象',
      ],
      ['thread_id', 'checkpointer 的会话路由键：同一 agent 多会话并存的标准姿势，取代旧「每用户一个链实例」'],
    ],
    [
      '迁移时保留「先 getBufferString 再拼模板」的习惯——新 API 直接吃 BaseMessage[]，多做一层字符串转换既浪费又丢结构信息',
      'trimMessages 裁掉 ToolMessage 后忘配 Ai/Tool 配对保护——裸裁会破坏 tool_call_id 配对，模型 API 会报错',
      '以为 messages 状态会自动持久化——不配 checkpointer 就没有跨调用记忆，trim 只是裁剪不是存储',
    ],
  ),
  'practice',
)
