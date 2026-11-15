import { L, withKind } from '../../course-builders.ts'

export const L113 = withKind(
  L(
    'L113',
    31,
    '旧 Agent 协议族退役：ZeroShot/Chat/StructuredChat/OpenAI/XML 五套协议收敛为 tool_calls',
    2,
    ['L112'],
    ['lc-agent-protocol-retire'],
    [
      '能画出五套旧协议各自的 prompt 注入方式与输出解析器配对关系，并指出它们共享的 AgentAction/AgentFinish 二元返回协议',
      '能解释 tool_calls 原生协议为什么让输出解析器层整体消失，并用 ToolCallingAgentOutputParser 的源码证明过渡期的衔接方式',
      '拿到任意 classic 旧 agent 代码时，能判断它属于哪套协议并给出 createAgent 等价改写',
    ],
    `### 一、五套协议，一个循环，一个共同的终点结构

上一课（L112）我们把 AgentExecutor 的主循环和构造参数逐项搬到了 createAgent，但刻意跳过了一个维度：循环里那个 agent 对象本身。0.x 的 agent 不是一种，是五套——ZeroShotAgent、ChatAgent、StructuredChatAgent、OpenAIAgent、XMLAgent，各带一套 prompt 模板和输出解析器。本课回答两个问题：这五套协议是怎么组织的？为什么 1.x 敢把它们全部退役、收敛为 tool_calls？

先看类族谱（全部位于 \`langchain-classic/src/agents/\`）：

| 协议族 | 类（文件:行） | 动作表达方式 | 输出解析器 |
|---|---|---|---|
| ReAct 文本 | \`ZeroShotAgent\`（mrkl/index.ts:59）、\`ChatAgent\`（chat/index.ts:44） | Thought/Action/Action Input 文本行 | \`ZeroShotAgentOutputParser\`（mrkl/outputParser.ts:12） |
| 结构化 JSON | \`StructuredChatAgent\`（structured_chat/index.ts:65） | JSON 代码块（含 action/action_input 字段） | \`StructuredChatOutputParser\`（structured_chat/outputParser.ts:19） |
| OpenAI 函数 | \`OpenAIAgent\`（openai_functions/index.ts:98） | 旧版 function_call 字段 | \`OpenAIFunctionsAgentOutputParser\`（openai_functions/output_parser.ts:47） |
| XML | \`XMLAgent\`（xml/index.ts:38） | \`<tool>\` 标签 | \`XMLAgentOutputParser\`（xml/output_parser.ts:26） |
| 原生工具调用 | tool_calling 目录 | AIMessage.tool_calls | \`ToolCallingAgentOutputParser\`（tool_calling/output_parser.ts:75） |

五套的差别只在「怎么让模型把动作说出来」，但它们共享同一个终点结构——解析器统一返回 \`AgentAction | AgentFinish\`：

\`\`\`ts
export type {
  AgentAction,
  AgentFinish,
  AgentStep,
} from "@langchain/core/agents";
\`\`\`

*— langchain-classic/src/agents/index.ts:100-104（commit 7704471）*

这组类型定义在 core，但 1.x 主线包没有任何地方 import 它——它是给 classic 供类型的兼容残留，也是识别「协议族整体退役」的考古标记。

### 二、以 ZeroShotAgent 为样本：文本协议的脆弱性

五套里最经典的是 mrkl（Multi-Action-ReAct-Knowledge-Learning，即 ReAct）家族。它的解析器是纯文本正则：

\`\`\`ts
export class ZeroShotAgentOutputParser extends AgentActionOutputParser {
  async parse(text: string) {
    if (text.includes(this.finishToolName)) {
      const parts = text.split(this.finishToolName);
      const output = parts[parts.length - 1].trim();
      return { returnValues: { output }, log: text };
    }
    const match = /Action:([\\s\\S]*?)(?:\\nAction Input:([\\s\\S]*?))?$/.exec(text);
    if (!match) {
      throw new OutputParserException(\`Could not parse LLM output: \${text}\`);
    }
    // ...
  }
}
\`\`\`

*— langchain-classic/src/agents/mrkl/outputParser.ts:12-40（commit 7704471，节选）*

逐行读：先找终止哨兵 \`Final Answer:\`，命中就把剩余文本当答案返回；否则用正则抽 \`Action:\` 与 \`Action Input:\` 两行。这套机制的死穴一眼可见——**协议靠字符串约定维系，模型少一个冒号、多一个空格就抛 OutputParserException**。AgentExecutor 的 \`handleParsingErrors\` 开关（executor.ts:383-392，L112 讲过）存在的唯一理由就是把这种解析失败回喂给模型让它重试——一个为自身脆弱性打补丁的开关。

再看类工厂如何绑定协议。ZeroShotAgent 构造时默认塞入自家的解析器：

\`\`\`ts
export class ZeroShotAgent extends Agent {
  constructor(input: ZeroShotAgentInput) {
    const outputParser =
      input?.outputParser ?? ZeroShotAgent.getDefaultOutputParser();
    super({ ...input, outputParser });
  }
  _agentType() {
    return "zero-shot-react-description" as const;
  }
}
\`\`\`

*— langchain-classic/src/agents/mrkl/index.ts:59-74（commit 7704471，节选）*

\`_agentType()\` 返回的字符串正是 initializeAgentExecutor 的 switch 分支名（initialize.ts:26-63）——字符串选型、prompt 工厂、解析器三者在这里闭环。1.x 里这个三元组整体消失：\`createAgent({ model, tools })\` 没有 agentType 参数，因为**协议不再由 prompt 约定，而由模型 API 原生保证**。

### 三、过渡证据：ToolCallingAgentOutputParser 的桥接写法

退役不是一夜完成的。classic 里最晚出现的 tool_calling 族已经暴露了方向——它不再让模型输出约定文本，而是直接读 AIMessage 上的原生 tool_calls 字段，再映射回旧协议的终点结构：

\`\`\`ts
export class ToolCallingAgentOutputParser extends AgentMultiActionOutputParser {
  async parse(text: string): Promise<AgentAction[] | AgentFinish> {
    throw new Error(
      \`ToolCallingAgentOutputParser can only parse messages.\\nPassed input: \${text}\`
    );
  }
  async parseResult(generations: ChatGeneration[]) {
    if ("message" in generations[0] && isBaseMessage(generations[0].message)) {
      return parseAIMessageToToolAction(generations[0].message);
    }
    throw new Error(
      "parseResult on ToolCallingAgentOutputParser only works on ChatGeneration output"
    );
  }
}
\`\`\`

*— langchain-classic/src/agents/tool_calling/output_parser.ts:75-94（commit 7704471，节选）*

注意两个细节：\`parse(text)\` 直接抛错——它根本不接受纯文本输入；\`parseResult\` 从 ChatGeneration 里取出 BaseMessage，交给 \`parseAIMessageToToolAction\` 把 \`message.tool_calls\` 映射成 \`AgentAction[]\`（同文件 :52-73，每个 toolCall 生成 \`{ tool, toolInput, toolCallId, log, messageLog }\`）。这就是过渡期的桥：**旧协议的下游结构（AgentAction）还在服务 AgentExecutor，但数据上游已经换成原生 tool_calls**。1.x 走完最后一步：连这个映射层也拆掉，ReactAgent 的 AgentNode 直接消费 tool_calls 字段，解析器层整体不存在。

### 四、迁移对照表：五套协议各自的 1.x 去向

| 旧 API（classic 路径） | 1.x 对应物 | 关系 |
|---|---|---|
| \`mrkl/index.ts:59\` ZeroShotAgent | \`createAgent\`（langchain/src/agents/index.ts:672，内部即 ReactAgent） | 概念替代：ReAct 语义由图循环承接，文本协议换原生 tool_calls |
| \`chat/index.ts:44\` ChatAgent / \`chat_convo/index.ts:54\` ChatConversationalAgent | \`createAgent\`（消息模型本就是 messages 进出） | 概念替代 |
| \`structured_chat/index.ts:65\` StructuredChatAgent | 需要结构化中间产物时用 \`responseFormat\`（L116）或工具参数 schema | 概念替代 |
| \`openai_functions/index.ts:98\` OpenAIAgent | 无对应物：旧 function_call API 已被各家 tool calling 取代 | 已在 classic 保留无替代 |
| \`xml/index.ts:38\` XMLAgent | 无对应物：XML 协议专为不支持 function calling 的模型设计，该前提消失 | 已在 classic 保留无替代 |
| 五套 OutputParser + \`AgentAction/AgentFinish\` | 无对应物：新 agent 免解析 | 已在 classic 保留无替代 |

迁移动作高度一致：删掉 agent 类、prompt 工厂和解析器的引用，把 tools 列表原样交给 \`createAgent\`，模型指定改成 \`model: "<provider>:<name>"\` 字符串或模型实例。唯一要留心的是行为差异——旧协议下模型的「格式纪律」由 few-shot prompt 教，新协议下由模型 API 保证；如果你的旧代码曾依赖「模型偶尔输出解析失败、被 handleParsingErrors 拉回」的软行为，新架构里对应物是 toolError/toolRetry middleware（L123 走查会实操）。

### 五、另三套协议的样本课：JSON 块、XML 标签与 core 里的协议类型

前两节解剖了 mrkl，这里把剩下三套的「prompt 约定」各抽一句源码，看清五套协议的分化点到底在哪。StructuredChatAgent 的格式指令（structured_chat/prompt.ts:2）：

\`\`\`ts
export const AGENT_ACTION_FORMAT_INSTRUCTIONS = \`Output a JSON markdown code snippet containing a valid JSON blob (denoted below by $JSON_BLOB).\`;
\`\`\`

*— langchain-classic/src/agents/structured_chat/prompt.ts:2（commit 7704471，节选）*

比 mrkl 的正则抽取前进了一步：要求模型输出 JSON 代码块，解析器再从 markdown 代码围栏里抠出 action/action_input 两个字段——但协议本质仍是 prompt 约定，模型输出半截 JSON 照样抛异常。XMLAgent 的 prompt（xml/prompt.ts:7）则干脆用标签包裹动作：

\`\`\`text
In order to use a tool, you can use <tool></tool> and <tool_input></tool_input> tags.
\`\`\`

*— langchain-classic/src/agents/xml/prompt.ts:7（commit 7704471，节选）*

它的历史使命最明确：给不支持 function calling 的模型一个「标签即协议」的降级方案——一旦模型 API 原生支持 tool calling，这套标签协议就没有存在理由。最后补看五套共享的终点类型的真身（core agents.ts:1-15）：

\`\`\`ts
export type AgentAction = {
  tool: string;
  toolInput: object;
  log: string;
};
export type AgentFinish = {
  returnValues: Record<string, any>;
  log: string;
};
export type AgentStep = {
  action: AgentAction;
  observation: string;
};
\`\`\`

*— langchain-core/src/agents.ts:1-15（commit 7704471，节选）*

三个类型全部住在 core 的 agents.ts 顶层——它们是 0.x 时代的核心类型，1.x 只剩 classic 消费。注意 \`AgentStep.action + observation\` 这对字段：L123 走查会见到旧版 returnIntermediateSteps 输出的 intermediateSteps 就是 \`AgentStep[]\`，新形态里被 messages 状态自带的 tool_calls + ToolMessage 对自然取代。

### 本课小结

- 五套旧协议共享同一终点结构 \`AgentAction | AgentFinish\`（classic agents/index.ts:100-104），分野只在 prompt 格式与解析器；1.x 主线不再消费这组类型，它是协议退役的考古标记。
- ZeroShotAgent 的正则解析器（mrkl/outputParser.ts:35-37）示范了文本协议的脆弱性——AgentExecutor 的 handleParsingErrors 开关就是为它打的补丁。
- ToolCallingAgentOutputParser（tool_calling/output_parser.ts:75）证明收敛路径：上游先换原生 tool_calls、下游暂留旧结构，1.x 最后连映射层一起退役。
- initializeAgentExecutor 的 agentType 字符串在 createAgent 里没有对应参数——协议选择这个维度整体消失。
- 下一课看协议族的邻居：Toolkits 与垂类链（SQL/Graph QA）在 1.x 里的去向——它们的问题不是协议，而是「工具集合体」这个组织形态没有新家。
`,
    null,
    [
      {
        text: '旧五套 Agent 协议（ZeroShot/Chat/StructuredChat/OpenAI functions/XML）的共同抽象是什么？',
        options: [
          '它们都继承 AgentExecutor，靠 executor 分发',
          '它们都是 BaseChain 的子类，复用 call/values 协议',
          '它们都实现同一套输出解析协议：parse 返回 AgentAction 或 AgentFinish 二元结果',
          '它们都依赖模型原生 tool_calls 字段',
        ],
        answer: 2,
        explain:
          '五套协议分野在 prompt 格式与解析器，但共享同一抽象：输出解析器把 LLM 文本解析成 AgentAction（继续调工具）或 AgentFinish（结束），类型定义在 core 的 agents.ts 且只有 classic 消费。A 错：AgentExecutor 是运行时不是协议基类，五套 agent 继承的是 classic agents/agent.ts 的 Agent/BaseSingleActionAgent；B 错：BaseChain 是链的基类，Agent 不走 call/values 协议；D 错：五套协议里只有 tool_calling 一族用原生 tool_calls，其余全是文本协议。',
        concept: 'lc-agent-protocol-retire',
      },
      {
        text: 'ZeroShotAgent（mrkl）让 LLM 输出什么格式、解析器靠什么识别动作？',
        options: [
          'JSON 块，靠 JSON.parse',
          'ReAct 文本协议：Action / Action Input 行，解析器用正则 /Action:...\\nAction Input:.../ 抽取',
          'XML 标签，靠标签匹配',
          'OpenAI function call 语法',
        ],
        answer: 1,
        explain:
          'classic agents/mrkl/outputParser.ts:35-37 的 parse 实现就是用正则 /Action:([\\s\\S]*?)(?:\\nAction Input:([\\s\\S]*?))?$/ 抽取工具名与入参，FINAL_ANSWER_ACTION="Final Answer:" 作为终止哨兵——这是纯文本协议，模型稍微偏离格式就抛 OutputParserException。A 错：structured chat 才用 JSON-ish 块；C 错：XML 是 XMLAgent 那套；D 错：OpenAI functions 是 openai_functions 目录那套，与 mrkl 无关。',
        concept: 'lc-agent-protocol-retire',
      },
      {
        text: '为什么说 ToolCallingAgentOutputParser（classic agents/tool_calling/output_parser.ts:75）是协议族退役的过渡证据？',
        options: [
          '它是 1.x 新包里唯一的解析器',
          '它把模型原生 tool_calls 映射成旧 AgentAction[] 结构，证明 1.x 收敛点是用原生 tool_calls 取代文本协议',
          '它负责解析 XML 协议',
          '它是 AgentExecutor 内部专用的错误处理解析器',
        ],
        answer: 1,
        explain:
          '它的 parseResult 直接从 AIMessage 的 tool_calls 字段读出 tool/toolInput/toolCallId 并组装成旧的 AgentAction 数组——旧协议的终点结构还在，但数据来源已换成模型原生字段。1.x 新 agent（createAgent）连这层映射都不要了，直接消费 tool_calls。A 错：它在 classic 不在新包；C 错：XML 解析是 xml/output_parser.ts；D 错：它服务于 tool_calling agent 而非 executor。',
        concept: 'lc-agent-protocol-retire',
      },
      {
        text: 'initializeAgentExecutor（classic agents/initialize.ts:26）的字符串 agentType 参数在 1.x 的对应物是什么？',
        options: [
          'createAgent({ agentType: "zero-shot-react-description" })，字符串原样保留',
          '没有对应参数：createAgent 不再区分 agent 类型，只传 model 与 tools，模型能力决定协议',
          '换成 middleware 数组参数',
          '换成 responseFormat 参数',
        ],
        answer: 1,
        explain:
          'initialize.ts:26-63 用 switch 把 "zero-shot-react-description" 等字符串分发到不同 prompt 工厂；1.x 的 createAgent 签名里没有 agentType——协议选择这个维度整个消失了，模型只要支持 tool calling 就走统一循环。字符串参数的语义从「选 agent 类型」变成了「选模型」（model: "openai:gpt-4o"）。C 错：middleware 是行为扩展点不是协议选择器；D 错：responseFormat 只管结构化输出。',
        concept: 'lc-agent-protocol-retire',
      },
    ],
    [
      [
        'AgentAction/AgentFinish',
        '旧 agent 输出解析的二元协议：AgentAction 表示继续调工具（tool/toolInput/log），AgentFinish 表示返回最终答案（returnValues/log）；类型在 core，消费者只剩 classic',
      ],
      [
        'ReAct 文本协议',
        'ZeroShotAgent 家族的约定：Thought/Action/Action Input/Observation 文本交替，靠正则解析，模型格式漂移即抛 OutputParserException',
      ],
      [
        'tool calling',
        '模型 API 原生能力：请求时声明工具清单，响应里返回结构化 tool_calls 字段——1.x agent 循环的唯一动作协议',
      ],
    ],
    [
      '在 1.x 里找 AgentAction/AgentFinish 的新替代物——它们没有替代物，整个解析层随协议族一起退役；新 agent 直接消费 AIMessage.tool_calls',
      '以为五套旧协议各有 1.x 等价参数——没有，五套收敛为一套，createAgent 连 agentType 参数都没有',
      '把 classic agents/index.ts:98 导出的 createReactAgent 当成 1.x 新入口——那是旧包的 ReAct 预制图入口（来自 langgraph prebuilt），与 langchain 新包的 createAgent（camelCase）是两个不同的东西（L119 详细点破）',
    ],
  ),
  'framework',
)
