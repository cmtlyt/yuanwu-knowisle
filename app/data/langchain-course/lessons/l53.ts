import { L, withKind } from '../../course-builders.ts'

export const L53 = withKind(
  L(
    'L53',
    15,
    'createMiddleware 工厂与 MIDDLEWARE_BRAND',
    2,
    ['L51'],
    ['lc-create-middleware'],
    [
      '实现一个 audit + 敏感信息掩码中间件：用 createMiddleware 组合 stateSchema 私有计数、contextSchema 必填配置、beforeModel 前置审计、wrapToolCall 参数掩码与 afterAgent 汇总报告',
      '跑通该中间件接入 createAgent 的完整链路，产出运行断言：掩码生效、私有状态跨轮持久、afterAgent 报告与调用次数一致',
      '验证 MIDDLEWARE_BRAND 的运行时形态（Symbol.for 与 typeof 检查）并解释为什么普通函数无法通过中间件类型检查',
    ],
    `模块五理论收束后的第一堂实践课。L51/L52 把契约读透了，本课回答「契约怎么落地」：createMiddleware 工厂 292 行里几乎全是 JSDoc 与类型，真正的执行体只有十几行——**它的全部价值是「把配置对象的类型钉死」，运行时增强一概发生在消费端**。我们先解剖工厂与品牌，再从零实现一个审计中间件接入 createAgent 验证整条链路。

### 工厂解剖：一个返回字面量的纯类型函数

剥掉文档注释，工厂的骨架一目了然：

\`\`\`ts
export function createMiddleware<
  TSchema extends StateDefinitionInit | undefined = undefined,
  TContextSchema extends InteropZodObject | undefined = undefined,
  const TTools extends readonly (ClientTool | ServerTool)[] = readonly (...)[],
  const TStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>> = readonly [],
>(config: {
  name: string;
  stateSchema?: TSchema;
  contextSchema?: TContextSchema;
  tools?: TTools;
  streamTransformers?: TStreamTransformers;
  tracePolicy?: TracePolicy;
  wrapToolCall?: WrapToolCallHook<TSchema, NormalizeContextSchema<TContextSchema>>;
  wrapModelCall?: WrapModelCallHook<TSchema, NormalizeContextSchema<TContextSchema>>;
  beforeAgent?: BeforeAgentHook<TSchema, NormalizeContextSchema<TContextSchema>>;
  beforeModel?: BeforeModelHook<TSchema, NormalizeContextSchema<TContextSchema>>;
  afterModel?: AfterModelHook<TSchema, NormalizeContextSchema<TContextSchema>>;
  afterAgent?: AfterAgentHook<TSchema, NormalizeContextSchema<TContextSchema>>;
}): AgentMiddleware<TSchema, TContextSchema, NormalizeContextSchema<TContextSchema>, TTools, TStreamTransformers> {
  const middleware: AgentMiddleware<...> = {
    [MIDDLEWARE_BRAND]: true as const,
    name: config.name,
    stateSchema: config.stateSchema,
    contextSchema: config.contextSchema,
    wrapToolCall: config.wrapToolCall,
    wrapModelCall: config.wrapModelCall,
    beforeAgent: config.beforeAgent,
    beforeModel: config.beforeModel,
    afterModel: config.afterModel,
    afterAgent: config.afterAgent,
    tools: config.tools,
    streamTransformers: config.streamTransformers,
    tracePolicy: config.tracePolicy,
  };
  return middleware;
}
\`\`\`

*— libs/langchain/src/agents/middleware.ts:77-286（commit 7704471，有裁剪）*

四个 const 泛型（L39 的技术在此复用）：TTools/TStreamTransformers 用 const 修饰让字面量数组保持精确元组类型，进而喂给 createAgent 的 CombineTools 等类型级运算。返回对象对 config 做的是**逐字段拷贝而非整体展开**——顺序即文档序，缺的 hook 自然是 undefined，消费端按 undefined 判定「无此 hook」（ReactAgent 构造器的 if (m.beforeAgent) 分支）。类型返回值里第三个泛型 TFullContext 不是原样的 TContextSchema，而是 NormalizeContextSchema 的结果：\`TContextSchema extends InteropZodObject ? InferInteropZodOutput<TContextSchema> : unknown\`（middleware.ts:288-292）——hook 里 runtime.context 的类型是 parse 后的输出形状，默认值已经「进类型」。

拷贝清单里还有两个最冷清的槽位值得单独交代。**streamTransformers**（types.ts:466-471）：中间件也能注册流投影转换器，JSDoc 写明「merged with createAgent({ streamTransformers }) when the agent is compiled」——它不走 hook 节点化，而是像 tools 一样在编译期汇入总池，L43 v3 分支的 extensions 投影形状因此也会被中间件改写。**tracePolicy**（types.ts:480-490）：控制这个中间件的 hook 运行在 LangSmith 追踪里上报什么，JSDoc 原话「Shapes what LangChainTracer sends to LangSmith for this middleware's lifecycle hook runs」，并自带示例 \`tracePolicy: { processInputs: omitPayload }\`——中间件状态里若有敏感数据，从追踪面剔除的正规路径就是它。注意后半句「Execution, streaming, and other callbacks still see the raw values」：tracePolicy 只管 tracer 投影，回调与流里的原始值不受影响——它是**观测面脱敏**，不是数据面脱敏，别和 L61 的 piiRedaction 混为一谈。这两个字段都能原样穿过工厂的逐字段拷贝（middleware.ts:116-118 的 tools/streamTransformers 与 tracePolicy 三行），进一步印证工厂「配置本体、零加工」的定位。

### MIDDLEWARE_BRAND：一个 symbol 的防伪工程

\`\`\`ts
/**
 * Unique symbol used to brand middleware instances.
 * This prevents functions from being accidentally assignable to AgentMiddleware
 * since functions have a 'name' property that would otherwise make them structurally compatible.
 */
export const MIDDLEWARE_BRAND: symbol = Symbol.for("AgentMiddleware");
\`\`\`

*— libs/langchain/src/agents/middleware/types.ts:362-367（commit 7704471）*

这个 8 行文件里的常量解决的是 TypeScript 结构类型的一个真实漏洞：接口要求 name: string，而**函数恰好有 name 属性**——没有品牌时，一个 \`(state) => state\` 的箭头函数能通过 AgentMiddleware 的结构检查（hook 全可选）。品牌字段 readonly [MIDDLEWARE_BRAND]: true 只能由工厂补上，函数声明里长不出这个 symbol 键，类型层就此封死。选 \`Symbol.for\` 而不是 \`Symbol\` 是 L05 讲过的跨包判型纪律：全局注册表保证同一字符串在重复打包场景下返回同一 symbol，品牌跨模块副本依然成立。注意品牌的保护是类型层的——运行时它只是对象上的一个属性，真正的运行时防线在消费端：ReactAgent 构造器的重名检查与 MiddlewareNode 的 jumpTo 校验（L51 quiz 里说的「错误在语义现场兜底」）。

### 一个中间件的完整生命周期：从字面量到节点

把本课的工厂放进前几课的坐标系里，能画出一份「中间件一生」的流水账，每一段都有独立的源码锚点。**出生**：createMiddleware 返回带品牌的配置字面量，此时它只是数据——没有绑定、没有闭包、没有任何行为（middleware.ts:105-121）。**登记**：createAgent 把中间件数组传给 ReactAgent 构造器，构造器逐个检查 hook 存在性，给 beforeAgent/beforeModel/afterModel/afterAgent 各 new 一个 hook 节点并 addNode（L47 的节点化，ReactAgent.ts:269-382）；wrapModelCall/wrapToolCall 不建节点，分别汇入 AgentNode 的 handler 折叠链与 ToolNode 的洋葱层。**点名**：invoke 时 #initializeMiddlewareStates 对每个带 stateSchema 的中间件 safeParse 默认值（L42，ReactAgent.ts:1142-1178）。**上岗**：每次图执行经过 hook 节点时，MiddlewareNode 按名字前缀取出对应 hook 切片，interopParse 中间件自己的 contextSchema，执行后校验返回值的 jumpTo 合法性（L50，nodes/middleware.ts:135-160）。**退役**：afterAgent 节点跑完即终局，中间件对象本身跨 invoke 复用——同一个 agent 上反复 invoke，中间件闭包里的变量（如本课 audit 的 Map）是共享的。

这份流水账有两个实战推论。其一，中间件的 hook 函数是无状态的「切片」——状态要么写进 stateSchema（持久）、要么写进闭包（进程内共享）、要么靠 runtime.context（只读配置），三种载体的持久化半径完全不同，选错载体会直接造成「计数怎么清零」类的疑难杂症。其二，同一个中间件对象可以被多个 agent 复用，但 hook 节点与洋葱层是**每个 agent 编译一份**——闭包变量跨 agent 共享，节点实例不共享。审计中间件跨两个 agent 复用时计数会串账，就是这个机制的直接后果。

### 实操：从零构建 audit 掩码中间件并接入 createAgent

下面是完整可运行的脚本（\`npm i langchain @langchain/core zod\`，\`npx tsx middleware-lab.ts\`），一个中间件同时用上五类配置：

\`\`\`ts
import { createAgent, createMiddleware } from "langchain";
import { tool } from "@langchain/core/tools";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod/v3";

const lookup = tool(({ email }: { email: string }) => \`user found: \${email}\`, {
  name: "lookup_user",
  description: "looks up a user by email",
  schema: z.object({ email: z.string() }),
});

const audit = createMiddleware({
  name: "auditMask",

  // ① 私有状态：跨轮持久、对外不可见（invoke 输入无法注入）
  stateSchema: z.object({
    _modelCalls: z.number().default(0),
    _maskedCount: z.number().default(0),
  }),

  // ② context：必填配置，parse 后冻结进 runtime.context
  contextSchema: z.object({
    tenantId: z.string(),
  }),

  // ③ beforeModel：补丁协议，返回部分状态
  beforeModel: (state, runtime) => {
    return { _modelCalls: ((state as any)._modelCalls ?? 0) + 1 };
  },

  // ④ wrapToolCall：洋葱协议，掩码邮箱参数后放行
  wrapToolCall: async (request, handler) => {
    const masked = { ...request.toolCall.args } as Record<string, unknown>;
    if (typeof masked.email === "string") {
      masked.email = masked.email.replace(/^(..).*(@.*)$/, "$1***$2");
      return new ToolMessage({
        content: "参数含敏感信息，已拦截掩码",
        tool_call_id: request.toolCall.id!,
        status: "error",
      });
    }
    return handler({ ...request, toolCall: { ...request.toolCall, args: masked as any } });
  },

  // ⑤ afterAgent：一次性收尾报告
  afterAgent: (state) => {
    const calls = (state as any)._modelCalls ?? 0;
    console.log(\`[audit] tenant 完整运行结束，模型调用 \${calls} 次\`);
    return undefined;
  },
});

const agent = createAgent({
  model: "openai:gpt-4o-mini",
  tools: [lookup],
  middleware: [audit],
});

const r = await agent.invoke(
  { messages: [new HumanMessage("查一下 alice@example.com 的资料")] },
  { context: { tenantId: "t-001" } }
);
console.log(r.messages.at(-1)?.content);
\`\`\`

断言清单（跑通后逐条核对）：wrapToolCall 里含 email 的调用被拦截为 error ToolMessage，模型下一轮会看到「已拦截掩码」而不是原始结果——这正是错误即数据哲学在中间件层的应用；contextSchema 的必填 tenantId 让不带 context 的 invoke 直接抛 Zod 校验错（MiddlewareNode 的 interopParse 兜底，L47）；把 ④ 里掩码分支换成 \`masked.email = "...***"\` 并放行 handler，则能观察到参数改写对工具执行的真实生效。再补两个小实验验证品牌与动态工具：

这里还有两条值得提前写下来的行为边界。其一，beforeModel 的返回值 \`{ _modelCalls: ... }\` 是补丁协议——MiddlewareNode 把它作为部分 state 更新交给 reducer，下划线前缀让这个字段对 invoke 输入不可见（L42/L49 的契约），但 hook 之间**可见且持久**：同一轮 afterAgent 里 \`state._modelCalls\` 读到的就是累计值，这正是 ⑤ 能输出「模型调用 N 次」的机制。其二，contextSchema 的 parse 发生在**每个消费点各自做一次**（MiddlewareNode 解析一次给 hook、AgentNode 的 wrapModelCall 包装层又解析一次，AgentNode.ts:509-515 可见同样的 interopParse），而不是解析一次全局缓存——这保证了中间件的 contextSchema 只约束自己的上下文切片，多个中间件的 contextSchema 互不干扰，合并在 InferMiddlewareContextInputs 的类型运算里完成（runtime.ts 的 invoke 泛型，L42 见过）。

\`\`\`ts
// 实验 A：品牌的运行时形态与跨实例语义
import { MIDDLEWARE_BRAND } from "langchain/agents";
console.log(typeof MIDDLEWARE_BRAND);              // "symbol"
console.log(MIDDLEWARE_BRAND.toString());          // "Symbol(AgentMiddleware)"
console.log((audit as any)[MIDDLEWARE_BRAND]);     // true —— 工厂补上的必需品牌

// 实验 B：普通函数在类型层的下场
const fake = (state: unknown) => state;
fake.name = "fake";
// const bad: AgentMiddleware = fake;  // 编译期报错：缺 MIDDLEWARE_BRAND 必需属性
// （无品牌的函数因结构兼容漏洞本可冒充，品牌封死后只能走工厂）

// 实验 C：动态工具注册——tools 声明 + wrapToolCall 执行（L51 纪律的完整闭环）
const withDyn = createMiddleware({
  name: "dynToolMw",
  tools: [
    tool(() => \`now=\${Date.now()}\`, {
      name: "get_time",
      description: "returns current time",
      schema: z.object({}),
    }),
  ],
  wrapToolCall: async (request, handler) => {
    if (request.toolCall.name === "get_time" && !request.tool) {
      const impl = tool(() => \`now=\${Date.now()}\`, {
        name: "get_time",
        description: "returns current time",
        schema: z.object({}),
      });
      return handler({ ...request, tool: impl });
    }
    return handler(request);
  },
});
const agent2 = createAgent({
  model: "openai:gpt-4o-mini",
  tools: [lookup],
  middleware: [audit, withDyn],
});
\`\`\`

实验 C 验证了 L45/L51 反复强调的纪律：\`tools\` 槽位把 get_time 送进模型视野，但它的执行者必须是 wrapToolCall——\`request.tool\` 为 undefined 时由中间件展开补实现；如果只有声明没有 wrapToolCall，AgentNode 的 added 工具校验会在下一次 wrapModelCall 里抛 "This is not supported unless a middleware provides a wrapToolCall handler"。

### 验证清单与常见报错对照

收尾把本课实操会撞到的报错与归口对齐：缺 context 必填键 → MiddlewareNode interopParse 抛 Zod 错（消费端）；同名中间件 → ReactAgent 构造器抛 Middleware X is defined multiple times（构造端）；非法 jumpTo → MiddlewareNode 抛 Invalid jump target（节点端）；wrapToolCall 返回非法类型 → 组合器抛 Invalid response from wrapToolCall（洋葱端）；无 wrapToolCall 执行者的新增工具 → AgentNode 校验抛不支持（模型端）。**createMiddleware 自己一个校验都不做——每条约束都在语义现场被兜底**，这五条报错归口表建议作为调试 middleware 时的第一张查表。

### 本课小结

- createMiddleware 是纯类型函数：const 泛型四件套 + NormalizeContextSchema 接住 parse 后的 context 输出类型，执行体只是带品牌的字面量拷贝。
- MIDDLEWARE_BRAND = Symbol.for("AgentMiddleware")，用全局注册表语义封死「函数靠 name 属性结构兼容冒充中间件」的类型漏洞；跨包判型与 L05 的 MESSAGE_SYMBOL 同源。
- 运行时防线全部在消费端：构造器查重名、MiddlewareNode 校验 jumpTo 与 context、洋葱层校验返回值与工具增改——工厂零校验是分层设计而非疏漏。
- 实操五断言覆盖五类配置：私有状态持久、context 必填切片、before 补丁、wrapTool 洋葱掩码、afterAgent 收尾；动态工具必须「tools 声明 + wrapToolCall 执行」成对出现。
- 下一课进入 wrapModelCall 的专题：改写模型请求的统一入口与官方中间件的实现范式。
`,
    null,
    [
      {
        text: 'createMiddleware 的返回值是什么？',
        options: [
          '一个 Runnable 子类实例',
          '一个带 MIDDLEWARE_BRAND: true 的普通对象字面量，配置字段原样拷贝',
          '一个被 Proxy 包装的响应式对象',
          '一个闭包函数',
        ],
        answer: 1,
        explain:
          'middleware.ts 的函数体就是构造一个对象字面量（[MIDDLEWARE_BRAND]: true as const, name, stateSchema, ... tracePolicy）并返回——没有任何运行时包装、校验或闭包，全部价值在类型层（const 泛型推断）。选项 A 是 RunnableCallable 层面的节点实现；选项 C 无 Proxy；选项 D 是 AgentMiddleware 接口明确要阻止的形态（品牌标记的存在动机）。',
        concept: 'lc-create-middleware',
      },
      {
        text: 'NormalizeContextSchema<TContextSchema> 在类型层做了什么？',
        options: [
          '把 contextSchema 转成 StateSchema',
          'TContextSchema 是 InteropZodObject 时提取 InferInteropZodOutput（hook 拿到的 runtime.context 是解析后的输出类型），否则落到 unknown',
          '给 context 加上 readonly 修饰',
          '把 optional 字段变成必填',
        ],
        answer: 1,
        explain:
          'middleware.ts 末尾的类型别名：type NormalizeContextSchema<T> = T extends InteropZodObject ? InferInteropZodOutput<T> : unknown——六个 hook 的 TFullContext 参数都传它，让 hook 里的 runtime.context 拿到 Zod parse 之后的精确输出类型（含默认值应用）。选项 A 无此转换；选项 C 的 readonly 语义由 Object.freeze 在运行时保证，不在类型别名里；选项 D 无字段修饰逻辑。',
        concept: 'lc-create-middleware',
      },
      {
        text: 'MIDDLEWARE_BRAND 的值是？',
        options: [
          '字符串 "AgentMiddleware"',
          'Symbol.for("AgentMiddleware")——跨模块/跨包实例共享同一 symbol',
          '随机生成的每包唯一 symbol',
          '数字版本号',
        ],
        answer: 1,
        explain:
          'types.ts:367：export const MIDDLEWARE_BRAND: symbol = Symbol.for("AgentMiddleware")。用 Symbol.for 注册到全局 symbol 注册表意味着即使存在重复打包（同一库被 bundle 两次），品牌值依然相等——普通的 Symbol("...") 每次调用都生成新 symbol，会造成跨实例判型失败。选项 A 类型不对；选项 C 正是选 Symbol.for 而非 Symbol 的原因所在；选项 D 无此概念。',
        concept: 'lc-create-middleware',
      },
      {
        text: '为什么 createMiddleware 不做运行时校验（比如检查 name 是否提供）？',
        options: [
          '疏忽遗漏',
          '它的定位是类型安全的配置字面量构造器：缺失 name 等问题由 TypeScript 在编译期拦截，运行时信任类型检查后的对象；真正需要运行时兜底的约束（同名中间件、非法 jumpTo）由 ReactAgent 构造器与 MiddlewareNode 兜底',
          '为了性能，刻意省略',
          '因为中间件会在运行时重新构建',
        ],
        answer: 1,
        explain:
          '函数签名里 name 是必填属性、返回类型是 AgentMiddleware<...>，编译期已经把形状钉死；工厂体只做字面量拷贝。需要运行时把关的约束各有归属：重名在 ReactAgent 构造器抛错（L47），越界 jumpTo 在 MiddlewareNode 抛错（L50）——错误在语义发生的现场被拦截，而不是在工厂里一刀切。选项 A 与源码注释和分层设计不符；选项 C 只对了一半，主要原因是分层；选项 D 无重建机制。',
        concept: 'lc-create-middleware',
      },
    ],
    [
      [
        'createMiddleware',
        'agents/middleware.ts 导出的工厂函数（292 行）：接收配置对象、返回带品牌标记的 AgentMiddleware 字面量，泛型全部 const 推断',
      ],
      [
        'MIDDLEWARE_BRAND',
        'Symbol.for("AgentMiddleware")：接口必需品牌，阻止带 name 属性的函数结构兼容冒充中间件',
      ],
      [
        'NormalizeContextSchema',
        '工厂的类型工具：把 contextSchema 的 Zod 输出类型接到六个 hook 的 runtime.context 上',
      ],
      [
        '审计中间件',
        '本课实操产出的示例：beforeModel 记录输入摘要、wrapToolCall 掩码敏感参数、afterAgent 输出调用报告',
      ],
    ],
    [
      '手写对象字面量冒充中间件——忘了 [MIDDLEWARE_BRAND]: true 会在类型检查报错（缺必需品牌），运行时即使混进去也会在 hook 调用处行为异常；一律走 createMiddleware',
      '在多个 bundle 场景下自己实现品牌比较——必须用 Symbol.for 的全局注册表语义，普通 Symbol 跨包判型必失败（与 L05 的 MESSAGE_SYMBOL 同一教训）',
      '以为 createMiddleware 返回的对象行为会被增强——它就是配置本体，hook 的切片、冻结、校验全发生在 ReactAgent 构造器与 MiddlewareNode/ToolNode 的消费端',
    ],
  ),
  'practice',
)
