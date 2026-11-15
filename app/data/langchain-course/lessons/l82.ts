import { L, withKind } from '../../course-builders.ts'

export const L82 = withKind(
  L(
    'L82',
    23,
    'supervisor vs swarm：中心化 handoff vs activeAgent 状态接力',
    2,
    ['L81'],
    ['lc-supervisor-swarm'],
    [
      '走读 createSupervisor：说出 handoff 工具如何生成（transfer_to_<agent>）、supervisor 图的星型双向边结构与 RemoteGraph 的 thread_id 隔离',
      '走读 createSwarm：说出 SwarmState 的 activeAgent 键、START 条件边路由与 handoff 工具写入 activeAgent 的接力闭环',
      '产出一份两种模式的选型对照表（控制权归属/消息历史/扩展新代理的成本）并用手写最小图验证各自的路由实现',
    ],
    `### 定锚：两种「谁在控制」的答案

L81 的 createReactAgent 是单代理终点，也是多代理的积木。本课对照同仓两个官方编排库：**langgraph-supervisor 把控制权交给一个中心 agent，用 handoff 工具表达调度**；**langgraph-swarm 不设中心，控制权随状态键 activeAgent 在代理间接力**。两者的源码量都不大（各约 400 行），但拼装方式恰好把 L68 的编译接线、L76 的 Command.PARENT、L81 的 Command 透传全部用了一遍。核心结论：**supervisor = createReactAgent + N 个 handoff 工具 + 星型边；swarm = START 条件边 + activeAgent 状态机**。

### supervisor：编排降维成工具调用

\`\`\`ts
const handoffTools = agents.map((agent) => {
  const agentName = agent.name!;
  const agentDescription =
    "description" in agent && typeof agent.description === "string"
      ? agent.description : undefined;
  return createHandoffTool({ agentName, description: agentDescription, addHandoffMessages });
});
const allTools = [...(tools ?? []), ...handoffTools];
...
const supervisorAgent = createReactAgent({
  name: supervisorName, llm: supervisorLLM, tools: allTools, prompt,
  responseFormat, stateSchema: schema, preModelHook, postModelHook,
});
let builder = new StateGraph(schema, contextSchema)
  .addNode(supervisorAgent.name!, supervisorAgent, { ends: [...agentNames] })
  .addEdge(START, supervisorAgent.name!);
for (const agent of agents) {
  builder = builder.addNode(agent.name!, makeCallAgent(agent, outputMode,
    resolvedAddHandoffBackMessages, supervisorName),
    { subgraphs: isRemoteGraph(agent) ? undefined : [agent] });
  builder = builder.addEdge(agent.name!, supervisorAgent.name!);
}
return builder;
\`\`\`

*— libs/langgraph-supervisor/src/supervisor.ts:332-418（commit fa426b2）*

三个装配事实。**supervisor 本身就是 createReactAgent 的产物**（L81 的全部机制照单全收），只是工具列表里混进了 N 个 handoff 工具——「中心化」不是一个新图引擎，而是工具调用循环的自然结果。**图结构是星型双向边**：supervisor 的 \`ends\` 列出所有 agent 名（条件边可达），每个 agent 一条固定边回 supervisor。**绑定细节**：支持 parallel_tool_calls 参数的 provider 会被显式 \`bindTools(allTools, { parallel_tool_calls: false })\`（supervisor.ts:348-353）——多代理调度不希望模型一次转给好几个人。名字校验先行：agent 必须有 name 且不重复、不能是默认的 \\"LangGraph\\"（315-330）。

handoff 工具的本体：

\`\`\`ts
const toolName = \`transfer_to_\${_normalizeAgentName(agentName)}\`;
const handoffTool = tool(
  async (_, config) => {
    const state = getCurrentTaskInput() as (typeof MessagesAnnotation)["State"];
    let messages = state.messages;
    if (addHandoffMessages) {
      const toolMessage = new ToolMessage({
        content: \`Successfully transferred to \${agentName}\`,
        name: toolName, tool_call_id: config.toolCall.id,
      });
      messages = messages.concat(toolMessage);
    } else {
      messages = messages.slice(0, -1);
    }
    return new Command({
      goto: agentName,
      graph: Command.PARENT,
      update: { messages },
    });
  },
  { name: toolName, schema: z.object({}) },
);
\`\`\`

*— libs/langgraph-supervisor/src/handoff.ts:51-81（commit fa426b2）*

工具体四步：\`getCurrentTaskInput()\` 拿 supervisor 图的当前状态；补一条「Successfully transferred to X」的 ToolMessage（或按 addHandoffMessages=false 掐掉 handoff 往返，服务严格校验消息序列的 provider）；返回 **Command.PARENT**——工具在 supervisor 子图内运行，goto 目标（agent 节点）在父图，这正是 L76/L81 里 \`graph: Command.PARENT\` 跨图跳转机制的实战用法；消息随 update 带走。代理侧的 makeCallAgent 还有两个旋钮：outputMode（last_message 默认/full_history）与 addHandoffBackMessages（supervisor.ts:74-115）；RemoteGraph 用 uuidv5 派生独立 thread_id（90-102）。

### swarm：activeAgent 状态接力

\`\`\`ts
const SwarmState = Annotation.Root({
  ...MessagesAnnotation.spec,
  activeAgent: Annotation<string>,
});
...
const routeToActiveAgent = (state: typeof SwarmState.State) => {
  return state.activeAgent || defaultActiveAgent;
};
builder.addConditionalEdges(START, routeToActiveAgent, routeTo);
...
// createSwarm 内：
if (stateSchema && !("activeAgent" in stateSchema.spec)) {
  throw new Error("Missing required key 'activeAgent' in stateSchema");
}
for (const agent of agents) {
  builder.addNode(agent.name!, agent, {
    ends: getHandoffDestinations(agent),
    subgraphs: [agent],
  });
}
\`\`\`

*— libs/langgraph-swarm/src/swarm.ts:14-150（commit fa426b2）*

swarm 的图没有中心节点：**START 一条条件边**读 activeAgent 决定执行者（首轮空值落到 defaultActiveAgent）。接力闭环靠 swarm 版 handoff 工具（swarm/handoff.ts:82-89）——它比 supervisor 版多写一个键：

\`\`\`ts
return new Command({
  goto: agentName,
  graph: Command.PARENT,
  update: {
    messages: state.messages.concat(toolMessage),
    activeAgent: agentName,
  },
});
\`\`\`

*— libs/langgraph-swarm/src/handoff.ts:82-89（commit fa426b2）*

\`activeAgent: agentName\` 写进共享状态，下一轮 START 条件边（或当前代理的 handoff 目标边）就能据此路由——**控制权 = 一个状态键 + 一条条件边**。\`ends: getHandoffDestinations(agent)\` 从每个代理自己声明的 handoff 工具推导允许的跳转目标，编译期就把「谁能转给谁」固定进图。自定义 stateSchema 必须含 activeAgent 键（116-118），否则直接抛错。

### 对照与手写验证

| 维度 | supervisor | swarm |
|---|---|---|
| 控制权归属 | 中心 agent（handoff 工具即调度权） | 无中心，activeAgent 接力 |
| 图拓扑 | 星型双向边（supervisor ↔ agents） | START 条件边 + 按代理声明的能力边 |
| 新增代理的成本 | 加 handoff 工具 + 一对边 | 代理自带 handoff 工具 + ends 声明 |
| 消息历史 | outputMode 控制回填粒度 | 共享消息列表，接力即追加 |
| 结构化输出 | responseFormat 直通 createReactAgent | 需自行扩展 SwarmState |
| 返回类型 | StateGraph（builder，未编译） | StateGraph（builder，未编译） |

\`\`\`ts
// 手写最小 supervisor 核心（验证星型拓扑与 handoff 协议）
import { StateGraph, MessagesAnnotation, Command, getCurrentTaskInput, tool }
  from "@langchain/langgraph";
import { z } from "zod";

const transfer = (to: string) => tool(
  async () => {
    const state = getCurrentTaskInput();
    return new Command({
      goto: to, graph: Command.PARENT,
      update: { messages: [...state.messages] },
    });
  },
  { name: \`transfer_to_\${to}\`, schema: z.object({}) },
);
// builder：supervisor 节点 ends:["a","b"]；每个 agent 节点 addEdge 回 supervisor

// 手写最小 swarm 核心（验证 activeAgent 接力）
const builder = new StateGraph(SwarmState)
  .addConditionalEdges("__start__",
    (s) => s.activeAgent || "agentA", ["agentA", "agentB"]);
// agentA 的工具返回 Command({ goto: "agentB", graph: Command.PARENT,
//   update: { activeAgent: "agentB", messages: [...] } })
\`\`\`

手写对照的结论：两个库的「魔法」都只有一层——**supervisor 的魔法是 handoff 工具返回 Command.PARENT，swarm 的魔法是条件边读一个字符串键**。除此之外全部是 L68 接线与 L81 ReAct 循环的组合。选型上：任务分工清晰、需要统一质量门与结构化输出选 supervisor；代理能力平权、协作路径灵活多变的探索型场景选 swarm。

### makeCallAgent 走读：代理产出后的消息整形

supervisor 图里每个 agent 节点的 runnable 不是编译图本体，而是 \`makeCallAgent\` 包出来的函数——agent 的调用、输出裁剪、handoff 回传全在这一层：

\`\`\`ts
const makeCallAgent = (agent, outputMode, addHandoffBackMessages, supervisorName) => {
  if (!["full_history", "last_message"].includes(outputMode)) {
    throw new Error(\`Invalid agent output mode: \${outputMode}. ...\`);
  }
  return async (state, config) => {
    let conf = config;
    if (isRemoteGraph(agent)) {
      const threadId = config?.configurable?.thread_id;
      const agentThreadId =
        threadId && agent.name ? uuidv5(agent.name, threadId) : null;
      conf = { ...(config ?? {}), configurable: { ...(config?.configurable ?? {}),
        ...{ thread_id: agentThreadId } } };
    }
    const output = await agent.invoke(state, conf);
    let { messages } = output;
    if (outputMode === "last_message") messages = messages.slice(-1);
    if (addHandoffBackMessages) {
      messages.push(...createHandoffBackMessages(agent.name, supervisorName));
    }
    return { ...output, messages };
  };
};
\`\`\`

*— libs/langgraph-supervisor/src/supervisor.ts:74-115（commit fa426b2）*

三个整形步骤的动机。**outputMode="last_message" 的 slice(-1)**：代理子图内部跑了很多轮（ReAct 循环的中间 AIMessage/ToolMessage 全在里面），回填中心时只留最后一条——supervisor 的决策只需要「结论」，不需要看见 agent 的推理全程；"full_history" 则用于需要完整上下文的协作场景。**addHandoffBackMessages 的成对注入**：\`createHandoffBackMessages\` 造的是一组 (AIMessage, ToolMessage)（handoff.ts:92-117）——AIMessage 带 \`transfer_back_to_<supervisor>\` 的 tool_call，紧随一条对应 tool_call_id 的 ToolMessage。为什么必须成对？**消息序列完整性**：tool_calls 与 ToolMessage 必须一一配对，很多 provider（严格校验序列的模型）看到悬空 tool_call 或悬空 ToolMessage 都会拒收——这组「虚构的往返」让交回控制权的动作在消息历史上也留下合法痕迹，supervisor 下一轮读历史时能看见「X 把控制权还给了我的事实」。**RemoteGraph 的 thread_id 派生**：uuidv5(agent.name, threadId) 以代理名为命名空间——同一主线程对不同远程代理派生不同的持久化命名空间，且同一代理跨多个主线程天然隔离；\`isRemoteGraph\` 的判据是 \`lc_id\` 数组拼串等于 \`langgraph.pregel.RemoteGraph\`（supervisor.ts:57-68），类型守卫走运行时标记而非 instanceof——与 L05 讲的 Symbol.for 跨包判型是同一设计哲学。

### swarm 的 defaultActiveAgent 校验与选型动机补遗

swarm 构造里有一处防御校验容易被当噪音略过：

\`\`\`ts
if (!routeTo.includes(defaultActiveAgent)) {
  throw new Error(
    \`Default active agent '\${defaultActiveAgent}' not found in routes \${routeTo}\`);
}
\`\`\`

*— libs/langgraph-swarm/src/swarm.ts:58-61（commit fa426b2）*

为什么值得抛错而不静默回退？因为 activeAgent 是**运行时状态**而非编译期边——编译器无法知道「用户传的 defaultActiveAgent 是不是拼写错误的代理名」，一旦放行，首轮空 activeAgent 时 START 条件边会落到一个不存在节点，错误要等到第一次 invoke 才在图深处爆发。把校验提到 createSwarm 装配期，是把运行时故障前移为构造期报错——这个手法与 L81 的「messages 键缺失编译期抛错」同源。选型补充两条源码层面的理由：**其一**，supervisor 的 responseFormat 直通 createReactAgent（CreateSupervisorParams 里逐字转发），意味着「多代理协作产出结构化结论」在 supervisor 模式是免费能力；swarm 要同样能力得自己扩 SwarmState 并加节点——选型差异不只是拓扑，还有**可复用的装配面宽度**。**其二**，两个库都返回未编译 builder，意味着你可以把 supervisor 的星型拓扑与 swarm 的 activeAgent 键**混编在同一张图里**：比如一个顶层 swarm，其中两个「代理」实际是子 supervisor 编译图——builder 未编译这个事实正是嵌套组合的接口。这也回应了本课开头的话：两个库的「魔法」只有一层，剩下的全部是可组合的普通图语义。

### 本课小结

- supervisor = createReactAgent（中心）+ transfer_to_* 工具 + 星型双向边；调度是模型工具调用，parallel_tool_calls 显式关闭。
- handoff 工具协议：getCurrentTaskInput → 补 ToolMessage → Command({ goto, graph: PARENT, update })；跨图跳转复用 L76 机制。
- swarm = SwarmState.activeAgent + START 条件边；代理 handoff 工具写 activeAgent 完成接力，ends 由代理声明推导。
- 两库都返回未编译 builder；RemoteGraph 获得独立 thread_id（uuidv5）且不挂 subgraphs。
- 模块六至此收束：从 StateGraph 泛型到多代理编排，下一模块进入全栈能力（加载/切分/检索环）。
`,
    null,
    [
      {
        text: 'supervisor 的「中心化」在图结构上的体现是？',
        options: [
          '所有代理共享同一个 state 对象',
          'START → supervisor 节点，supervisor 通过条件边可达所有 agent（ends 列表），每个 agent 又有回到 supervisor 的固定边——星型双向拓扑',
          '代理之间两两互联',
          '没有图结构，靠函数调用',
        ],
        answer: 1,
        explain:
          'createSupervisor 的 builder：`addNode(supervisorAgent.name!, supervisorAgent, { ends: [...agentNames] })` + `addEdge(START, supervisor)`，再对每个 agent `addNode(...)` + `addEdge(agent.name!, supervisor)`。控制权只在 supervisor 与 agent 之间流动，代理间不直连（要协作必须经 supervisor 中转）。A 是 swarm 的特征；C 是错误的直觉；D 与源码不符。',
        concept: 'lc-supervisor-swarm',
      },
      {
        text: 'swarm 的路由判定函数读的是哪个状态键？',
        options: [
          'messages 的最后一条',
          'state.activeAgent——START 处的条件边 `state.activeAgent || defaultActiveAgent` 决定路由，handoff 工具通过 Command.update 写入该键',
          '每个代理的本地变量',
          'checkpointer 的版本号',
        ],
        answer: 1,
        explain:
          'addActiveAgentRouter 注册 `routeToActiveAgent = (state) => state.activeAgent || defaultActiveAgent` 作为 START 条件边（swarm.ts:64-69）；swarm 的 handoff 工具返回 `Command({ goto: agentName, graph: Command.PARENT, update: { messages, activeAgent: agentName } })`（handoff.ts:82-89）——控制权接力由状态键驱动。A 是 supervisor 判断 tool_calls 的方式；C/D 无此机制。',
        concept: 'lc-supervisor-swarm',
      },
      {
        text: '两种模式返回值类型的共同点是？',
        options: [
          '都返回 CompiledStateGraph',
          '都返回 StateGraph（未编译的 builder）——supervisor 还额外用 createReactAgent 造内部 supervisor 子图',
          '都返回 RunnableLambda',
          'supervisor 返回编译图，swarm 返回 builder',
        ],
        answer: 1,
        explain:
          'createSupervisor 的返回类型标注与 createSwarm 的 return 都是 `StateGraph<...>`——两个库都把「加节点、加边」的选择权留给调用方，由用户自行 compile（传 checkpointer 等）。这解释了为什么两者的文档示例都以 `.compile()` 收尾。D 是常见误记。',
        concept: 'lc-supervisor-swarm',
      },
      {
        text: 'supervisor 对 RemoteGraph 类型 agent 的特殊处理是？',
        options: [
          '直接拒绝',
          '不挂 subgraphs（跨进程无本地子图），并给每次调用派生独立 thread_id：uuidv5(agent.name, threadId)——远程代理的持久化状态与主线程隔离',
          '转成本地副本执行',
          '只转发消息不传配置',
        ],
        answer: 1,
        explain:
          'makeCallAgent 里 `if (isRemoteGraph(agent))` 用 uuidv5(agent.name, threadId) 派生 agentThreadId 替换 config 的 thread_id（supervisor.ts:90-102）；addNode 时 `subgraphs: isRemoteGraph(agent) ? undefined : [agent]`（412-413）。B 完整覆盖两处；A 错——RemoteGraph 正是一等公民（CreateSupervisorParams 的注释明确支持）；C/D 无据。',
        concept: 'lc-supervisor-swarm',
      },
    ],
    [
      [
        'handoff tool',
        '把「把控制权交给某代理」包装成的普通工具：transfer_to_<agent_name>，工具体返回 Command({ goto, graph: Command.PARENT, update })',
      ],
      [
        'activeAgent',
        'swarm 状态里的字符串键：记录当前接力的代理名；START 条件边读它决定第一个/下一个执行者',
      ],
      ['outputMode', 'supervisor 调用代理后回填消息历史的模式：last_message（默认）或 full_history'],
      [
        'addHandoffBackMessages',
        '是否在代理交回控制权时把 handoff 往返消息（AIMessage+ToolMessage 对）加进历史，默认跟随 addHandoffMessages',
      ],
    ],
    [
      '给 swarm 传自定义 stateSchema 时漏掉 activeAgent 键——createSwarm 会显式抛 "Missing required key \'activeAgent\' in stateSchema"，路由依赖该键存在',
      '给 supervisor 的 agent 忘了起名或重名——两个库都会抛错（name 为空或 "LangGraph" 默认名、name 重复均不被接受），因为 handoff 工具与路由都以名为锚',
      '以为 supervisor 模式下代理可以互相求助——handoff 工具的 goto 目标固定为 supervisor（agent 节点只有回 supervisor 的边），代理间协作必须经中心中转；需要点对点协作要选 swarm 或自定义图',
    ],
  ),
  'framework',
)
