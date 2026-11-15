import { L, withKind } from '../../course-builders.ts'

export const L81 = withKind(
  L(
    'L81',
    23,
    'createReactAgent + ToolNode：预置 ReAct 循环的降维拆解',
    2,
    ['L68'],
    ['lc-prebuilt-react-agent'],
    [
      '逐文件走读 createReactAgent：从参数解构到 compile 的全部图接线，说出节点集如何随 preModelHook/postModelHook/responseFormat/version 动态增减',
      '手写一个等价的两节点 ReAct 图并与 prebuilt 对照，找出 shouldReturnDirect 条件边与 ToolsNode 错误回喂两处手写版最容易漏掉的语义',
      '对照 ToolNode.runTool 的三条输出路径（ToolMessage success/error、Command 透传），解释 GraphInterrupt 为什么必须穿透错误回喂',
    ],
    `### 定锚：预置层是运行时的「压缩快照」

模块六最后一站升到预置层。\`createReactAgent\` 之所以值得在本模块压轴，是因为它是**前 17 课全部机制的浓缩应用**：StateGraph 建图（L65-L68）、通道语义（L69-L73）、tick/runner（L75-L77）、流（L78）、checkpoint（L79）、容错（L80）在一个 350 行的工厂函数里各就各位。**先划界**：本课只讲 \`@langchain/langgraph\` 的 prebuilt；langchain 包的 \`createAgent\` 是模块四的主角，两者同名不同物（L119 再点破）。核心结论：**createReactAgent = 两个固定节点 + 一组随参数动态增删的节点/边 + 一条「错误即数据」的工具执行协议**。

### 图接线全景：节点集是动态的

\`\`\`ts
export function createReactAgent<A, StructuredResponseFormat, C>(
  params: CreateReactAgentParams<A, StructuredResponseFormat, C>
): CompiledStateGraph<...> {
  const { llm, tools, prompt, stateSchema, checkpointer, responseFormat,
    preModelHook, postModelHook, version = "v1", ... } = params;
  ...
  if (!Array.isArray(tools)) {
    toolClasses = tools.tools;
    toolNode = tools;            // 允许直接传入自建 ToolNode
  } else {
    toolClasses = tools;
    toolNode = new ToolNode(toolClasses.filter(isClientTool));
  }
  ...
  const workflow = new StateGraph(schema, contextSchema).addNode("tools", toolNode);
  let entrypoint: "agent" | "pre_model_hook" = "agent";
  if (preModelHook != null) {
    allNodeWorkflows.addNode("pre_model_hook", preModelHook)
      .addEdge("pre_model_hook", "agent");
    entrypoint = "pre_model_hook";
  }
  allNodeWorkflows.addNode("agent", callModel, { input: inputSchema })
    .addEdge(START, entrypoint);
\`\`\`

*— prebuilt/react_agent_executor.ts:669-896（commit fa426b2）*

参数面里有三处「动态节点」。**preModelHook** 把入口从 agent 换成 pre_model_hook（消息裁剪/摘要的挂点，输入 schema 合并了 PreHookAnnotation）。**responseFormat** 增加 generate_structured_response 节点——注意它是**另起一次 LLM 调用**（\`model.withStructuredOutput(...).invoke(messages)\`，react_agent_executor.ts:778-827），不是让主循环模型输出 JSON；解析返回 null/undefined 还会显式报错，防止 \`structuredResponse: undefined\` 静默传播。**version \\"v2\\"** 不增节点，但把路由从单目标改成 Send 扇出（下一段）。还有一个前置校验：state schema 必须含 \`messages\` 键，否则直接抛错（react_agent_executor.ts:860-862）。

### 路由骨架：两处条件边与 returnDirect

\`\`\`ts
if (postModelHook == null) {
  allNodeWorkflows.addConditionalEdges(
    "agent",
    (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        if (responseFormat != null) return "generate_structured_response";
        return END;
      }
      if (version === "v2") {
        return lastMessage.tool_calls.map(
          (toolCall) => new Send("tools", { ...state, lg_tool_call: toolCall })
        );
      }
      return "tools";
    },
    ...
  );
}
...
if (shouldReturnDirect.size > 0) {
  allNodeWorkflows.addConditionalEdges(
    "tools",
    (state) => {
      for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const message = state.messages[i];
        if (!isToolMessage(message)) break;
        if (message.name !== undefined && shouldReturnDirect.has(message.name)) {
          return END;
        }
      }
      return entrypoint;
    },
    ...
  );
} else {
  allNodeWorkflows.addEdge("tools", entrypoint);
}
\`\`\`

*— prebuilt/react_agent_executor.ts:956-1013（commit fa426b2）*

agent 出口与 postModelHook 分支（898-948）的判定同构：**未决 tool_calls → tools，否则 responseFormat 存在去结构化节点、否则 END**。shouldReturnDirect 集合来自工具的 \`returnDirect: true\`（759-766）；tools 出口从尾部反向扫连续 ToolMessage——**最后一段连续工具结果里只要有一个来自 returnDirect 工具就直接 END**，跳过模型总结。postModelHook 存在时这些判定挪进 hook 后的条件边，还多一条规则：最后一条是 ToolMessage 就回 entrypoint（支持 hook 重入模型）。

### 模型装配：静态缓存与动态解析

\`\`\`ts
let cachedStaticModel: Runnable | null = null;
const _getStaticModel = async (llm: LanguageModelLike): Promise<Runnable> => {
  if (cachedStaticModel) return cachedStaticModel;
  let modelWithTools: LanguageModelLike;
  if (await _shouldBindTools(llm, toolClasses)) {
    modelWithTools = await _bindTools(llm, toolClasses);
  } else {
    modelWithTools = llm;
  }
  const promptRunnable = _getPrompt(prompt, stateModifier, messageModifier);
  cachedStaticModel = promptRunnable.pipe(modelRunnable);
  return cachedStaticModel;
};
\`\`\`

*— prebuilt/react_agent_executor.ts:720-740（commit fa426b2）*

静态路径把 prompt → (bindTools 后的) 模型 pipe 起来缓存一次；llm 是函数（每次调用按 state/runtime 现选模型）时走 \`_getDynamicModel\`——**每次重解析、不缓存**（742-757）。callModel 还会把 AIMessage 的 name 与 lc_kwargs.name 标成 agent 名（845-849），供多代理场景识别（L82 的 supervisor 依赖这一点）。

### ToolNode 走读：错误即数据，控制流穿透

\`\`\`ts
export class ToolNode<T = any> extends RunnableCallable<T, T> {
  tools: (StructuredToolInterface | DynamicTool | RunnableToolLike)[];
  handleToolErrors = true;
  trace = false;

  protected async runTool(call, config, state): Promise<ToolMessage | Command> {
    const tool = this.tools.find((tool) => tool.name === call.name);
    try {
      if (tool === undefined) throw new Error(\`Tool "\${call.name}" not found.\`);
      const runtime: ToolRuntime = {
        ...config, state, toolCallId: call.id ?? "", config,
        context: config.context, store: config.store ?? null,
        writer: config.writer ?? config.configurable?.writer ?? null,
      };
      const output = await tool.invoke(toolCall, runtime);
      if ((isBaseMessage(output) && output.getType() === "tool") || isCommand(output)) {
        return output as ToolMessage | Command;
      }
      return new ToolMessage({
        status: "success", name: tool.name,
        content: typeof output === "string" ? output : JSON.stringify(output),
        tool_call_id: call.id!,
      });
    } catch (e: any) {
      if (!this.handleToolErrors) throw e;
      if (isGraphInterrupt(e) || isGraphDrained(e)) throw e;
      return new ToolMessage({
        status: "error",
        content: \`Error: \${e.message}\\n Please fix your mistakes.\`,
        name: call.name, tool_call_id: call.id ?? "",
      });
    }
  }
\`\`\`

*— prebuilt/tool_node.ts:210-281（commit fa426b2）*

三条输出路径对应三种工具世界观：**ToolMessage 透传**（工具自己构造，如需要 artifact 双通道）、**Command 透传**（工具要改控制流，如 L82 的 handoff 工具返回 \`Command({ goto, graph: Command.PARENT })\`）、**普通值包装**（字符串直接用，对象 JSON 序列化）。run 的输入侧同样有讲究：v2 的 Send 输入带 \`lg_tool_call\` 路由键，runTool 前先剥离只留 state（tool_node.ts:290-295）；常规输入则从最后一条 AIMessage 提取 tool_calls 并**跳过已有 ToolMessage 回答的 id**（308-330）——这是 resume 不重跑已答工具的机制。混合 Command 输出还会合并 parentCommand（344-374），多个工具同时向父图 Send 时合成一条。

### 手写对照与差异结论

\`\`\`ts
// 手写等价最小 ReAct（对照 prebuilt）
import { StateGraph, MessagesAnnotation, MemorySaver, ToolNode, toolsCondition }
  from "@langchain/langgraph";

const g = new StateGraph(MessagesAnnotation)
  .addNode("agent", async (state) => {
    const model = await model.bindTools(tools);
    const res = await model.invoke(state.messages);
    return { messages: [res] };
  })
  .addNode("tools", new ToolNode(tools))
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", "__end__"])
  .addEdge("tools", "agent")
  .compile({ checkpointer: new MemorySaver() });
\`\`\`

手写版能跑通主干，但与 prebuilt 对照有四处易漏语义：**其一**，returnDirect 短路（需要额外条件边）；**其二**，已答 tool_call_id 去重（resume 语义）；**其三**，结构化输出另起调用与 null 显式报错；**其四**，动态模型函数支持。差异结论：**prebuilt 的价值不在「省三行代码」，而在把这些横切语义一次配齐**——这正是模块四 createAgent（ReactAgent + middleware 体系）继续演进的起点。

### prompt 四形态与三互斥参数

callModel 里 pipe 进模型的 promptRunnable 由 \`_getPromptRunnable\` 统一装配，五种输入分支值得逐行过：

\`\`\`ts
function _getPromptRunnable(prompt?: Prompt): Runnable {
  let promptRunnable: Runnable;
  if (prompt == null) {
    promptRunnable = RunnableLambda.from(
      (state: typeof MessagesAnnotation.State) => state.messages
    ).withConfig({ runName: PROMPT_RUNNABLE_NAME });
  } else if (typeof prompt === "string") {
    const systemMessage = new SystemMessage(prompt);
    promptRunnable = RunnableLambda.from((state) =>
      [systemMessage, ...(state.messages ?? [])]);
  } else if (isBaseMessage(prompt) && prompt._getType() === "system") {
    promptRunnable = RunnableLambda.from((state) => [prompt, ...state.messages]);
  } else if (typeof prompt === "function") {
    promptRunnable = RunnableLambda.from(prompt).withConfig({
      runName: PROMPT_RUNNABLE_NAME });
  } else if (Runnable.isRunnable(prompt)) {
    promptRunnable = prompt;
  } else {
    throw new Error(\`Got unexpected type for 'prompt': \${typeof prompt}\`);
  }
  return promptRunnable;
}
\`\`\`

*— prebuilt/react_agent_executor.ts:107-134（commit fa426b2）*

四个设计事实。**缺省 prompt 不等于无 prompt**：null 分支生成的 RunnableLambda 把 state.messages 原样透传——这保证 invoke 的 run 树里永远有一个名为 prompt 的节点（PROMPT_RUNNABLE_NAME），可观测性不因配置精简而缺失。**字符串与 SystemMessage 同构**：两者都走「system 头插 + messages 追加」，区别只是前者先包装。**函数与 Runnable 形态**是同一抽象的两端：函数被 RunnableLambda 包装，Runnable 直接放行——你在手写对照里写的「agent 节点内联拼消息」，在 prebuilt 里就是一个函数 prompt。外层还有一道互斥守卫：\`_getPrompt\` 检查 prompt/stateModifier/messageModifier 三者**至多一个非空**，多个直接抛「Expected only one of prompt, stateModifier, or messageModifier, got multiple values」（react_agent_executor.ts:145-168）——后两个是 deprecated 别名（StateModifier/MessageModifier 类型标注可见），messageModifier 传入时经 \`_convertMessageModifierToPrompt\` 换算成 prompt 再走同一管线。手写版最容易漏的正是这道互斥校验与 prompt 节点的 runName：这两个语义决定「配置冲突立刻报错」与「LangSmith 追踪里 prompt 节点可检索」，都不是可运行性层面的东西，却是生产排障的常用抓手。

### PreHookAnnotation：llmInputMessages 通道的写读分离

preModelHook 输入 schema 合并的 PreHookAnnotation 只有一个键，reducer 写法很特别：

\`\`\`ts
const PreHookAnnotation = Annotation.Root({
  llmInputMessages: Annotation<BaseMessage[], Messages>({
    reducer: (_, update) => messagesStateReducer([], update),
    default: () => [],
  }),
});
\`\`\`

*— prebuilt/react_agent_executor.ts:464-470（commit fa426b2）*

reducer 的第一个参数是 \`_\`——**它丢弃通道里的存量值**，任何一步的更新都从空数组重新归并（\`messagesStateReducer([], update)\`）。这行代码的意图：pre_model_hook 节点对 llmInputMessages 的写入应当是「本轮喂给模型的完整消息集」的**整体替换**，而不是与上一轮拼接。为什么需要独立通道而不是直接写 messages？因为 preModelHook 的典型用途（裁剪、摘要、注入临时上下文）只想改变「模型看到什么」，不该污染 checkpoint 里真实的消息历史——agent 节点读 llmInputMessages（存在则用、缺省回退 messages），而持久化状态仍是 messages。这正是 L70 LastValue 与 BinaryOperatorAggregate 语义分野的实战注脚：\`Annotation<BaseMessage[], Messages>\` 不带 reducer 时是覆盖语义的 LastValue，reducer 里显式丢弃旧值的写法等价于「每步覆盖」的归并通道，两条路殊途同归。对照手写版：实现消息裁剪时如果直接在节点里返回裁剪后的 messages，下一轮 reducer 会把它们并回历史——裁剪变成了不可逆删除；prebuilt 用 llmInputMessages 把「给模型的视图」与「进 checkpoint 的事实」拆开，这个设计动机值得在手写图里复刻。

### 本课小结

- 节点集动态增减：preModelHook 改入口、postModelHook 改路由、responseFormat 加结构化节点；固定骨架始终是 agent/tools。
- 路由 = toolsCondition 语义：未决 tool_calls 去 tools；v2 用 Send 按调用扇出；returnDirect 命中直接 END。
- ToolNode 三输出（ToolMessage/Command/包装）+ 错误回喂（"Please fix your mistakes"）+ 控制流穿透（interrupt/drain 必抛）。
- llm 函数走动态解析不缓存；静态模型 pipe 缓存一次。
- 下一课把预置 ReAct 当积木：supervisor 与 swarm 两种多代理拼法。
`,
    null,
    [
      {
        text: 'prebuilt ReAct 图在无任何可选参数时的节点集是？',
        options: [
          '只有 agent 一个节点',
          'agent 与 tools 两个节点：agent 出条件边（有 tool_calls 去 tools，否则 END），tools 无条件回 agent',
          'agent、tools、generate_structured_response 三个节点',
          'start、agent、tools、end 四个节点',
        ],
        answer: 1,
        explain:
          'callModel 与 ToolNode 是仅有的两个固定 addNode；agent 的条件边在 postModelHook == null 分支注册，tools 的回边是 `addEdge("tools", entrypoint)`（shouldReturnDirect 为空时）。generate_structured_response 只有传 responseFormat 才加；preModelHook 会把入口改成 pre_model_hook 节点。C 把可选节点当固定节点；D 把 START/END 当节点（它们是通道常量）。',
        concept: 'lc-prebuilt-react-agent',
      },
      {
        text: 'ToolNode.runTool 捕获异常后，哪类错误会被重新抛出而不是回喂给模型？',
        options: [
          '所有错误都回喂',
          'GraphInterrupt 与 GraphDrained——它们是控制流信号不是工具错误，回喂会把中断吞掉',
          '语法错误',
          '超时错误',
        ],
        answer: 1,
        explain:
          '源码注释写明：「NodeInterrupt errors are a breakpoint to bring a human into the loop, and a drain stops the run to resume it later. Neither is recoverable by the agent, so neither is fed back: re-throw them even when handleToolErrors = true」。A 是 handleToolErrors 默认行为的一般描述，但控制流异常必须穿透；C/D 与普通错误一样走回喂路径（status: "error"）。',
        concept: 'lc-prebuilt-react-agent',
      },
      {
        text: '工具返回的普通值（字符串/对象）如何变成状态更新？',
        options: [
          '原样写入 state',
          '包成 status: "success" 的 ToolMessage（content 为字符串或 JSON.stringify），多个结果汇进 { messages: [...] } 更新',
          '转成 AIMessage',
          '直接返回给调用方，不进状态',
        ],
        answer: 1,
        explain:
          'runTool 的非 Command/非 ToolMessage 输出统一 `new ToolMessage({ status: "success", content: ... , tool_call_id: call.id })`；run 的收尾在无 Command 输出时返回 `{ messages: outputs }`（数组输入时返回数组本身）。C 错——ToolMessage 才能与 tool_call_id 对齐；D 错——工具结果必须进消息历史供下一轮模型读取。',
        concept: 'lc-prebuilt-react-agent',
      },
      {
        text: 'version: "v2" 与默认 "v1" 在路由上的差异是？',
        options: [
          'v2 不支持工具',
          'v2 为每个 tool_call 发一个 Send("tools", { ...state, lg_tool_call: call })，工具并行执行；v1 整体路由到 tools 节点由 ToolNode 内部并发',
          'v2 用不同的消息格式',
          '两者没有路由差异',
        ],
        answer: 1,
        explain:
          'agent 条件边（无 postModelHook 时）与 postModelHook 条件边里都有 `if (version === "v2") return toolCalls.map((call) => new Send("tools", { ...state, lg_tool_call: toolCall }))`——Send 动态扇出让每个工具调用成为独立任务；v1 把整个状态交给单个 tools 节点，ToolNode.run 内部对 tool_calls 做 Promise.all。C 无据；D 与源码矛盾。',
        concept: 'lc-prebuilt-react-agent',
      },
    ],
    [
      [
        'createReactAgent',
        'langgraph prebuilt 的 ReAct 预置工厂：llm + tools 编译成 agent/tools 两节点图，返回 CompiledStateGraph',
      ],
      [
        'toolsCondition',
        '极简路由函数：最后一条 AIMessage 有 tool_calls 返回 "tools"，否则 END——prebuilt 内联实现与它同构',
      ],
      [
        'shouldReturnDirect',
        'returnDirect 工具的集合；工具结果若属于该集合，tools 节点条件边直接去 END 而不回 agent',
      ],
      [
        'handleToolErrors',
        'ToolNode 开关（默认 true）：工具异常包成 status error 的 ToolMessage 回喂模型；false 时原样抛出',
      ],
    ],
    [
      '把 langchain 包的 createAgent 与 langgraph 的 createReactAgent 当成同一个东西——前者是 14 重载的高层 harness 工厂（模块四），后者是 prebuilt 两节点图；同名陷阱在 L119 点破，本课只讲后者',
      '在 ToolNode 里 catch 所有异常想「优雅降级」——把 GraphInterrupt 也吞了，人工介入断点会静默失效；控制流异常必须 rethrow',
      '给 returnDirect 工具的结果继续期待 agent 润色——命中 shouldReturnDirect 时 tools 直接去 END，模型不会再看到加工机会',
    ],
  ),
  'framework',
)
