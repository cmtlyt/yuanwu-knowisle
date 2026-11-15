import { L, withKind } from '../../course-builders.ts'

export const L46 = withKind(
  L(
    'L46',
    13,
    'ToolNode：客户端工具执行与 returnDirect',
    2,
    ['L41'],
    ['lc-tool-node'],
    [
      '实现一个直接可运行的 ToolNode 验证脚本：注册成功/失败两个工具，用带 tool_calls 的 AIMessage 驱动 ToolNode.invoke，产出并断言 ToolMessage 结果',
      '跑通三种错误策略（默认 / handleToolErrors=false / 自定义函数）对照实验，记录每种策略下 ToolMessage 的 status 与 content 差异',
      '构建一个 wrapToolCall 中间件拦截工具调用，验证 missing tool 的优雅降级消息与 wrapToolCall 存在时的执行身份变化',
    ],
    `L45 讲完流水线的决策端，本课走向执行端：\`nodes/ToolNode.ts\`，594 行，节点名固定为 \`tools\`。核心结论先行：**ToolNode 的设计哲学是「错误即数据」——工具失败默认转成带 status: error 的 ToolMessage 喂回模型，让循环自我修正；但三类控制流信号（中断、排水、abort）永远上抛**。本课以动手验证为主：我们先读透执行与错误处理机制，再从零搭一个可运行的验证脚本把每种策略跑一遍。

### 输入形状与并行执行

\`ToolNode.run\` 接受两种输入。第一种是 v2 的 Send 单调用输入——对象里带 \`lg_tool_call\` 键：

\`\`\`ts
const isSendInput = (
  input: unknown
): input is { lg_tool_call: ToolCall; jumpTo?: string } =>
  typeof input === "object" && input != null && "lg_tool_call" in input;
\`\`\`

*— libs/langchain/src/agents/nodes/ToolNode.ts:104-107（commit 7704471）*

L48 讲过 \`#createModelRouter\` 在 v2 下把每个工具调用包成 \`Send(TOOLS_NODE_NAME, { lg_tool_call: toolCall })\` 独立分发，这里就是落点。紧凑的 Send 输入不含完整状态，ToolNode 用 \`config.configurable.__pregel_read\` 读回 stateKeys 声明的图通道（ToolNode.ts:489-504），\`stateKeys\` 由 ReactAgent 构造器传入——排除 jumpTo 的全部通道键。

第二种是整段消息状态输入（v1 或直接调用 ToolNode）。此时它先收集已有的 tool_call_id 集合，再倒序找最近一条 AIMessage：

\`\`\`ts
const toolMessageIds: Set<string> = new Set(
  messages
    .filter((msg) => msg.getType() === "tool")
    .map((msg) => (msg as ToolMessage).tool_call_id)
);
let aiMessage: AIMessage | undefined;
for (let i = messages.length - 1; i >= 0; i -= 1) {
  const message = messages[i];
  if (AIMessage.isInstance(message)) { aiMessage = message; break; }
}
...
outputs = await Promise.all(
  aiMessage.tool_calls
    ?.filter((call) => call.id == null || !toolMessageIds.has(call.id))
    .map((call) => this.runTool(call, config, state)) ?? []
);
\`\`\`

*— libs/langchain/src/agents/nodes/ToolNode.ts:518-541（commit 7704471）*

两处细节：过滤掉已有 ToolMessage 的调用让**断点恢复（resume）不重放已执行的工具**；\`Promise.all\` 让一条消息里的多个调用并行执行。注意过滤条件的两个分支各自有语义：\`call.id == null\` 的调用**每次都会执行**——没有 id 就无法与任何 ToolMessage 配对，也没有「已执行」的证据可查，重复执行是唯一安全的选择；\`!toolMessageIds.has(call.id)\` 才是真正的 resume 过滤。把这两个分支想反了会得出错误结论（「无 id 的调用会被跳过」）。另外 \`__pregel_scratchpad.currentTaskInput = { ...toolState, ...state }\`（ToolNode.ts:498-500）这段小动作是给恢复语义留的便签：把 Send 携带的紧凑输入合并回完整状态，供上游重放逻辑对齐。

### 输出合并的三岔口：纯消息、混合与父图 Send

所有 runTool 跑完后，输出合并有一个清晰的分流结构（ToolNode.ts:544-588）。第一岔口：全部是 ToolMessage、没有任何 Command 时走兼容路径——输入是裸消息数组就原样返回数组，否则包成 \`{ messages: outputs }\`（545-548）。第二岔口开始处理 Command：逐个输出判断，父图方向的 Send 类 Command（\`graph === Command.PARENT\` 且 goto 全是 Send 实例）被单独收拢——多个工具同时向上抛 Send 时合并进**同一个 parentCommand**，而不是产生多条父图命令；其余 Command 与消息进入 combinedOutputs。第三岔口：parentCommand 存在则追加到列表尾部。这条合并规则解释了一个实战现象：多工具并行且都做 handoff（多 agent 交接场景）时，父图收到的是一条打包了全部 Send 的命令，交接目标被一次性调度——单发与并发的语义在这里统一。

### 两种输入形态的判定优先级

run 的入口只问一个问题：输入里有没有 \`lg_tool_call\` 键（isSendInput 判定）。有则走 v2 的 Send 单调用路径，且先做一次键剥离——\`const { lg_tool_call: _, jumpTo: __, ...newState } = state\`（ToolNode.ts:488），把路由信号与调用载荷从状态里摘掉再喂给工具。**jumpTo 出现在这里正好对上 L50 的清位纪律**：跳转信号进工具节点时被就地剥除，工具状态里永远不会残留旧信号。剥离后若 newState 为空且声明了 stateKeys，才触发 \`__pregel_read\` 补读；补读结果还要过 \`isMessagesState\` 校验，不过就抛 "ToolNode could not read messages from graph state."——这两条报错只在「紧凑 Send 输入 + 声明了 stateKeys」的组合下出现，直接用消息数组调用 ToolNode（本课实验的做法）永远不会碰到它们。

没有 \`lg_tool_call\` 键则走消息路径，输入校验按三档拒绝：裸 BaseMessage[] 直接收；带 messages 键的状态对象取其 messages；两者都不是抛 "ToolNode only accepts BaseMessage[] or { messages: BaseMessage[] } as input."。倒序找 AIMessage 的循环也有一条边界：消息列表里**没有任何 AIMessage** 时抛 "ToolNode only accepts AIMessages as input."——这挡住了「只喂 ToolMessage 历史」的误用。三档报错合起来构成 ToolNode 的输入契约：**要么一个调用（Send），要么一段含 AIMessage 的历史**，中间形态一律显式报错而非猜测。

### runTool：ToolRuntime 注入与执行身份

每个调用走 \`runTool\`，核心是 baseHandler。工具实例的取用有一条 override 链：\`request.tool ?? this.tools.find(...)\`——middleware 可以在 wrapToolCall 里通过展开 request 提供动态工具实现，这是 L44/L46 证据里「wrapToolCall 使 ToolNode 在零客户端工具时也创建」的执行基础。工具缺失时不抛异常，返回 \`Error: X is not a valid tool, try one of [...]\` 的错误 ToolMessage，让模型自己改名重试。真正的调用长这样：

\`\`\`ts
const output = await invokableTool.invoke(
  { ...toolCall, type: "tool_call" },
  {
    ...config,
    config,
    toolCallId: toolCall.id!,
    state,
    signal: mergeAbortSignals(this.signal, config.signal),
  }
);
\`\`\`

*— libs/langchain/src/agents/nodes/ToolNode.ts:390-402（commit 7704471）*

第二个参数就是 L23 讲过的 ToolRuntime 注入契约：toolCallId、state、signal 三个字段在这里挂载，\`mergeAbortSignals\` 用 \`AbortSignal.any\` 把节点级信号与 Pregel 传播的 config.signal 合并。非 ToolMessage/Command 的返回值被 JSON 序列化包成 ToolMessage；\`ToolInputParsingException\` 被重包装为 \`ToolInvocationError\` 上抛交由调用方处置（ToolNode.ts:413-425）。

baseHandler 内部还有一条容易漏看的注释边界（ToolNode.ts:345）：**当 wrapToolCall 中间件存在时，baseHandler 不再自行捕获工具执行错误**——错误从 baseHandler 冒出后由 runTool 的外层统一交给 #handleError，并打上 isMiddlewareError=true 的标记（433-452）。这条设计把「错误分类」收口到单一位置：无论错误来自裸执行还是洋葱内层，都走同一个 #handleError 决策树，避免了「两条错误路径两套规则」的漂移。而默认错误消息的拼接格式在 defaultHandleToolErrors 里一眼可见：\`content: \\\`\${error}\\n Please fix your mistakes.\\\`\`（ToolNode.ts:135）——原始错误文本在前、提示语在后，模型读到的是「错误现场 + 行动指令」的组合。本课实验①断言里 \`r1.messages[0].content.includes("boom")\` 能过，正是因为原始错误文本被完整保留在这个模板里。

### 错误处理三态与 cause 链解包

\`#handleError\` 是本文件最精密的函数，优先级依次为：interrupt/drain 上抛 → signal 已 abort 上抛 → middleware 错误的 cause 链解包 → middleware 错误默认冒泡（除非 handleToolErrors === true）→ false 全抛 → 自定义函数（返回 ToolMessage 则补 status: error，返回 undefined 则重抛）→ true 全转 ToolMessage。cause 链解包这段值得细看：

\`\`\`ts
let effectiveError = error;
let errorFromMiddleware = isMiddlewareError;
if (isMiddlewareError) {
  let unwrapped: unknown = error;
  while (MiddlewareError.isInstance(unwrapped)) {
    unwrapped = unwrapped.cause;
  }
  if (ToolInvocationError.isInstance(unwrapped)) {
    effectiveError = unwrapped;
    errorFromMiddleware = false;
  }
}
\`\`\`

*— libs/langchain/src/agents/nodes/ToolNode.ts:262-273（commit 7704471）*

场景还原：middleware 的 wrapToolCall 调 handler 时，内层工具因入参不合法抛了 ToolInvocationError，经过 MiddlewareError 包裹后抵达这里。如果不解包，自愈路径就断了。逐层剥开 MiddlewareError 找到根因后，错误被还原为工具级失败，\`defaultHandleToolErrors\` 照常把它变成 error ToolMessage——**模型的自愈能力穿过中间件层依然有效**。真 middleware 错误（如权限拒绝逻辑抛错）则默认致命，这是「工具错误可自愈、中间件错误须人查」的分界。

### 实操：从零搭一个错误策略对照验证

下面脚本可直接落盘运行（Node 20+，\`npm i langchain @langchain/core zod\` 后 \`npx tsx toolnode-lab.ts\`），把本课三条机制各断言一遍：

\`\`\`ts
import { ToolNode } from "langchain";
import { tool } from "@langchain/core/tools";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod/v3";

const ok = tool(({ n }: { n: number }) => \`doubled=\${n * 2}\`, {
  name: "double",
  description: "doubles a number",
  schema: z.object({ n: z.number() }),
});

const broken = tool(({ s }: { s: string }) => {
  // 模拟运行时崩溃：非法输入时抛错
  throw new Error(\`boom: \${s}\`);
}, {
  name: "explode",
  description: "always throws",
  schema: z.object({ s: z.string() }),
});

const call = (name: string, args: Record<string, unknown>) =>
  new AIMessage({
    content: "",
    tool_calls: [{ name, args, id: \`call_\${name}\`, type: "tool_call" }],
  });

// ① 默认策略：运行时错误被转成 error ToolMessage（错误即数据）
const tnDefault = new ToolNode([ok, broken]);
const r1 = (await tnDefault.invoke({
  messages: [call("explode", { s: "x" })],
})) as { messages: ToolMessage[] };
console.assert(r1.messages[0].status === "error", "default -> error status");
console.assert(r1.messages[0].content.includes("boom"), "default -> 原始消息回喂");

// ② 成功路径：非字符串返回值被 JSON 序列化
const r2 = (await tnDefault.invoke({
  messages: [call("double", { n: 21 })],
})) as { messages: ToolMessage[] };
console.assert(r2.messages[0].content === "doubled=42", "success content");

// ③ handleToolErrors=false：错误原样上抛
const tnStrict = new ToolNode([ok, broken], { handleToolErrors: false });
try {
  await tnStrict.invoke({ messages: [call("explode", { s: "x" })] });
  console.assert(false, "should have thrown");
} catch (e) {
  console.assert((e as Error).message.includes("boom"), "false -> rethrow");
}

// ④ 自定义 handler：返回 ToolMessage 定制回喂文案，返回 undefined 则重抛
const tnCustom = new ToolNode([ok, broken], {
  handleToolErrors: (error, tc) =>
    new ToolMessage({
      content: \`工具 \${tc.name} 失败，请改参数重试\`,
      tool_call_id: tc.id!,
      status: "error",
    }),
});
const r4 = (await tnCustom.invoke({
  messages: [call("explode", { s: "x" })],
})) as { messages: ToolMessage[] };
console.assert(r4.messages[0].content.includes("请改参数重试"), "custom handler");

// ⑤ 未注册工具：优雅降级消息而非崩溃
const r5 = (await tnDefault.invoke({
  messages: [call("nope", {})],
})) as { messages: ToolMessage[] };
console.assert(
  r5.messages[0].content.includes("is not a valid tool"),
  "missing tool -> graceful"
);

console.log("all assertions passed");
\`\`\`

跑通后你会观察到两个与直觉相符但值得确认的现象：默认策略下回喂给模型的内容就是 \`boom: x\`（外加一句 Please fix your mistakes.），模型下一轮据此改参数；而 handleToolErrors=false 把控制权完全还给调用方——适合把错误交给上层重试中间件的架构。把 ① 里的调用换成带两个 tool_calls 的 AIMessage，还能验证 Promise.all 并行：两条 ToolMessage 的顺序取决于完成先后，断言时按 tool_call_id 匹配而不是按数组下标。

再补一组 wrapToolCall 的最小接入，验证「中间件提供动态工具」的执行身份机制（这也是 L55 的预告）：

\`\`\`ts
const tnWrapped = new ToolNode([], {
  wrapToolCall: async (request, handler) => {
    if (request.toolCall.name === "remote_tool" && !request.tool) {
      // 动态工具：middleware 自带实现
      const dynamic = tool(({ q }: { q: string }) => \`echo:\${q}\`, {
        name: "remote_tool",
        description: "provided by middleware",
        schema: z.object({ q: z.string() }),
      });
      return handler({ ...request, tool: dynamic });
    }
    return handler(request);
  },
});
const r6 = (await tnWrapped.invoke({
  messages: [call("remote_tool", { q: "hi" })],
})) as { messages: ToolMessage[] };
console.assert(r6.messages[0].content === "echo:hi", "dynamic tool via wrapToolCall");
\`\`\`

这里 ToolNode 的注册表是空的，但执行依然成功——wrapToolCall 的 handler 接受被展开的 request，\`request.tool ?? find(...)\` 的 override 链让中间件成为动态工具的执行者。对照 ReactAgent 构造器里「有客户端工具**或** middleware 定义了 wrapToolCall 才创建 ToolNode」（ReactAgent.ts:403-414），你就理解了这条条件的完整动机。

### 本课小结

- ToolNode 节点名固定为 tools；v2 走 Send 单调用输入 + \`__pregel_read\` 补读状态，消息输入则过滤已完成的 tool_call_id 再 Promise.all 并行。
- 错误哲学是「错误即数据」：默认把运行时错误转成 status: error 的 ToolMessage 回喂；interrupt/drain/abort 三类信号无条件上抛；middleware 错误默认冒泡，但 cause 链根因为 ToolInvocationError 时解包自愈。
- 工具缺失返回优雅降级消息而非异常；\`request.tool ?? find(...)\` 让 wrapToolCall 中间件成为动态工具的执行者，这是「零客户端工具也创建 ToolNode」条件的执行侧支点。
- 下一课看这些节点是怎么被组装的：middleware hook 如何变成图里的真实节点，插进 before/after 流水线。
`,
    null,
    [
      {
        text: 'ToolNode 的默认错误处理器对哪类错误转换为 ToolMessage？',
        options: [
          '只转换 ToolInvocationError，其他错误上抛',
          '所有工具执行错误都转换为 ToolMessage',
          '所有错误都上抛，从不转换',
          '只转换 abort 信号中断',
        ],
        answer: 1,
        explain:
          'defaultHandleToolErrors 对 ToolInvocationError 返回带 status: error 的 ToolMessage，对其余错误也返回 ToolMessage（内容附加 Please fix your mistakes.）——源码注释明说 Catches all tool errors and converts to ToolMessage。选项 A 描述的是文档里「匹配 Python 默认行为」的旧口径在 TSV1 的残留理解，实际实现两条分支都返回 ToolMessage；选项 C 与 D 都与源码相反，interrupt/drain/abort 才是上抛的三类。',
        concept: 'lc-tool-node',
      },
      {
        text: '哪些错误即使在 handleToolErrors = true 时也会被重新抛出？',
        options: [
          'ToolInvocationError 与 ToolInputParsingException',
          '图中断（isGraphInterrupt）、排水（isGraphDrained）与 signal 已 abort 的错误',
          '所有 TypeError',
          'middleware 包裹的 MiddlewareError',
        ],
        answer: 1,
        explain:
          '#handleError 开头三个分支：isGraphInterrupt/isGraphDrained 是人工介入断点与排水信号，agent 无法自愈，注释明说 re-throw them even when handleToolErrors = true；signal.aborted 时也要把错误冒泡给 invoke 调用方。选项 A 恰恰是被转换成 ToolMessage 的自愈类错误；选项 C 无特判；选项 D 会先走 cause 链解包——若根因是 ToolInvocationError 仍会被转成 ToolMessage，不是无条件重抛。',
        concept: 'lc-tool-node',
      },
      {
        text: '模型调用了未注册的工具名时，ToolNode 的行为是？',
        options: [
          '抛出异常终止运行',
          '返回一条 Error: X is not a valid tool, try one of [...] 的错误 ToolMessage 让模型重试',
          '静默忽略',
          '返回空字符串的 ToolMessage',
        ],
        answer: 1,
        explain:
          'baseHandler 找不到工具时返回 getInvalidToolError 生成的错误 ToolMessage（status: error），注释写明 This allows the LLM to see the error and potentially retry。选项 A 与设计意图相反——错误即数据是这里的哲学；选项 C、D 都不存在。注意无 wrapToolCall 时这条优雅降级在 baseHandler 外还有一份对称实现。',
        concept: 'lc-tool-node',
      },
      {
        text: 'v2 工具行为版本下，模型一次发出 3 个普通工具调用，路由层如何分发？',
        options: [
          '整条 AIMessage 发给单个 ToolNode，内部 Promise.all 并行',
          '每个工具调用包成 Send(TOOLS_NODE_NAME, { lg_tool_call }) 作为独立任务',
          '串行依次执行',
          '只执行第一个工具调用',
        ],
        answer: 1,
        explain:
          '#createModelRouter 在非 v1 时返回 regularToolCalls.map((toolCall) => new Send(TOOLS_NODE_NAME, { lg_tool_call: toolCall }))——每个调用一个 Send 任务，这正是 v1 hitl per_call 必须要求 v2 的原因（v1 一个任务里所有调用共享 interrupt ID）。选项 A 是 v1 的行为；选项 C、D 无对应实现。',
        concept: 'lc-tool-node',
      },
    ],
    [
      ['TOOLS_NODE_NAME', 'ToolNode 在图中注册的节点名，固定字符串 tools'],
      [
        'ToolInvocationError',
        '工具入参解析失败（ToolInputParsingException）被重包装的错误类型，是自愈路径的识别标记',
      ],
      ['lg_tool_call', 'v2 Send 输入里携带单个 ToolCall 的约定键，配合 stateKeys 从图状态补读上下文'],
      [
        'handleToolErrors',
        'ToolNode 的错误策略开关：默认函数（只自愈）、true（全转 ToolMessage）、false（全上抛）、自定义函数（返回 ToolMessage 或 undefined 重抛）',
      ],
    ],
    [
      '以为 handleToolErrors: true 能兜住一切——interrupt、drain、abort 三类信号错误一律上抛，它们不是「工具失败」而是控制流',
      '在 v1 工具行为版本下使用 per_call 模式的 hitl——构造器直接抛错，因为 v1 所有调用在一个任务里执行，per-call interrupt 会共享同一个 ID',
      '给 wrapToolCall 中间件链里的错误套上 handleToolErrors: true 就以为万无一失——middleware 错误默认冒泡，只有显式 true 才转换，且 cause 链里根因是 ToolInvocationError 时会被解包自愈',
    ],
  ),
  'practice',
)
