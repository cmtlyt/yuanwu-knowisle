import { L, withKind } from '../../course-builders.ts'

export const L52 = withKind(
  L(
    'L52',
    15,
    '六个 hook 的类型与调用时机：wrapModelCall/wrapToolCall/before*/after*',
    3,
    ['L51'],
    ['lc-mw-hooks'],
    [
      '说出六个 hook 的签名差异：wrap 型收（request, handler）返回响应类型，before/after 型收（state, runtime）返回状态补丁或 void',
      '解释 WrapModelCallHandler 对 systemPrompt/systemMessage 的 Omit 再放宽设计及其互斥校验的呼应',
      '画出六个 hook 一次完整 invoke 的执行时序（含 afterModel/afterAgent 逆序与 wrapModelCall 洋葱方向）',
      '解释 MiddlewareError 与 downstreamErrors 的错误归属协议在模型侧与工具侧的一致性',
    ],
    `L51 拆完接口的配置槽，本课进入六个 hook 本体。核心结论：**六个 hook 分成两族——wrap 型（2 个）是「洋葱协议」：拿 request 与 handler、返回响应；before/after 型（4 个）是「补丁协议」：拿 state 与 runtime、返回状态增量。两族共用一套错误归属协议，时序上 before 系列正序、after 系列逆序、wrap 洋葱从数组第一个开始向外**。

### 六个 hook 一览与完整时序

接口上六个 hook 按声明顺序排列（types.ts:554-624）：wrapToolCall/wrapModelCall/beforeAgent/beforeModel/afterModel/afterAgent。先按时序把它们钉进一次 invoke 的生命周期（结合 L47/L48 的接线结论）：

| 阶段 | hook | 实现形态 | 执行次数与顺序 |
|---|---|---|---|
| invoke 开始 | beforeAgent | 图节点 | 一次，数组正序 |
| 每轮循环开始 | beforeModel | 图节点 | 每轮一次，正序 |
| 模型调用 | wrapModelCall | AgentNode 内函数洋葱 | 每次模型调用，第一个中间件最外层 |
| 模型返回后 | afterModel | 图节点 | 每轮一次，**逆序** |
| 工具执行 | wrapToolCall | ToolNode 内函数洋葱 | 每个工具调用，组合方向同洋葱 |
| invoke 结束 | afterAgent | 图节点 | 一次，**逆序** |

三张时序关系最容易搞混的是 beforeModel 与 wrapModelCall：前者是图节点、后者是 model_request 节点内部的函数洋葱，所以文档才特意强调 *called before the model is invoked and before the wrapModelCall hook*（types.ts:597）——不是同层竞争，而是隔了一跳。after 系列的逆序在 L47 已用接边代码证实；wrap 型洋葱的方向由 AgentNode 的 for 循环（从后往前包）与工具侧 chainToolCallHandlers 的 compose right-to-left 共同锁定，注释都是同一句话的变体：*Middleware are composed so the first middleware is the outermost wrapper*。

### wrapModelCall：洋葱协议与可重置的系统提示

\`\`\`ts
export type WrapModelCallHandler<
  TSchema extends StateDefinitionInit | undefined = undefined,
  TContext = unknown,
> = (
  request: Omit<
    ModelRequest<NormalizedSchemaInput<TSchema>, TContext>,
    "systemPrompt" | "systemMessage"
  > & { systemPrompt?: string; systemMessage?: SystemMessage }
) => PromiseOrValue<AIMessage>;

export type WrapModelCallHook<...> = (
  request: ModelRequest<NormalizedSchemaInput<TSchema>, TContext>,
  handler: WrapModelCallHandler<TSchema, TContext>
) => PromiseOrValue<AIMessage | Command>;
\`\`\`

*— libs/langchain/src/agents/middleware/types.ts:215-247（commit 7704471）*

两个类型细节。其一，hook 的 request 是完整的 ModelRequest（model/messages/systemPrompt/systemMessage/tools/state/runtime/modelSettings 十一项，见 nodes/types.ts:15-118），middleware 可以改写其中任何一项再调 handler——包括换模型（modelFallback 中间件就是这么做的）。其二，handler 版本把 systemPrompt/systemMessage 从必填放宽为可选：不传即沿用当前值，传了即重置。运行侧的呼应链在 L45 已经走读：变更检测 → 单改则重建 SystemMessage → 双改抛互斥错。返回类型的 Command 分支是给重试类中间件的逃生舱（如结构化输出失败后 goto 回 model_request）。

### wrapToolCall：请求里有工具，动态工具靠展开

\`\`\`ts
export interface ToolCallRequest<TState, TContext> {
  toolCall: ToolCall;
  /**
   * This will be \`undefined\` for dynamically registered tools that aren't
   * declared upfront when creating the agent. In such cases, middleware
   * should provide the tool implementation by spreading the request with
   * the tool property.
   */
  tool: ClientTool | ServerTool | undefined;
  state: TState & AgentBuiltInState;
  runtime: Runtime<TContext>;
}

export type WrapToolCallHook<...> = (
  request: ToolCallRequest<NormalizedSchemaInput<TSchema>, TContext>,
  handler: ToolCallHandler<NormalizedSchemaInput<TSchema>, TContext>
) => PromiseOrValue<ToolMessage | Command>;
\`\`\`

*— libs/langchain/src/agents/middleware/types.ts:146-206（commit 7704471）*

与 wrapModelCall 最大的不同：request 里带着 tool 实例与 toolCall（含 args），handler 收到的是可能被改写的 request——改参数、换工具、短路返回 ToolMessage 都在协议内。接口 JSDoc 用三个示例锚定典型用法：日志、鉴权（检查 runtime.context 后直接返回 Unauthorized ToolMessage）、缓存（按 name+args 做键）。工具侧洋葱的运行时实现在 agents/utils.ts 的 wrapToolCall 组合器（550-638 行）：每个中间件被包一层 wrappedHandler，内部先按 middleware.stateSchema 重切状态切片（工具侧的 state 切片逻辑与图节点侧一致），返回值做类型校验，错误走 downstreamErrors 协议。

### before/after 型：补丁协议与 void 直通

四个生命周期 hook 的类型完全同构（以 BeforeModelHook 为例，types.ts:285-303）：handler 签名 \`(state, runtime) => PromiseOrValue<MiddlewareResult<Partial<...>>>\`，MiddlewareResult 即 \`TState & { jumpTo?: JumpToTarget } | void\`。三个要点：返回 Partial——只写你要改的键，未写的键不触发通道更新；返回 undefined/void 直通，图节点层只发 \`{ jumpTo: undefined }\` 哨兵（L47）；带 jumpTo 时受该 hook 的 canJumpTo 白名单约束（L50）。状态切片由框架完成：hook 拿到的 state 已按 middleware.stateSchema 解析过（图节点侧 interopParse、洋葱侧 parseMiddlewareState），不同中间件互不见对方的私有字段。

### 错误归属：两侧同一协议

最后把 L45 与 L46 各自见过的错误处理收拢成一个协议。模型侧 AgentNode 每层洋葱维护 downstreamErrors；工具侧组合器一模一样：

\`\`\`ts
try {
  const result = await originalHandler({ ...request, state: {...} }, wrappedInnerHandler);
  if (!ToolMessage.isInstance(result) && !isCommand(result)) {
    throw new Error(
      \`Invalid response from "wrapToolCall" in middleware "\${m.name}": ...\`
    );
  }
  return result;
} catch (error: unknown) {
  if (downstreamErrors.has(error)) { throw error; }
  throw MiddlewareError.wrap(error, m.name);
}
\`\`\`

*— libs/langchain/src/agents/utils.ts:600-633（commit 7704471，有裁剪）*

AgentNode 里对应段落（AgentNode.ts:731-742）的注释把设计意图说破：*Mirrors wrapToolCall in utils.ts, so the model-call and tool-call paths treat pass-through errors the same*——穿透错误保真（retryOn 等消费方靠原始错误类型分派），自身错误带名入桶（MiddlewareError 让 ToolNode 的 cause 链解包与日志定位成为可能）。返回值校验也对称：模型侧 isInternalModelResponse 检查 AIMessage/Command/结构化形状，工具侧检查 ToolMessage/Command，非法返回都抛带中间件名的 Invalid response 错误。**两个 wrap 型 hook 共享同一套「校验层 + 归属层」骨架，这是六 hook 协议里最值得复用的一课。**

### 本课小结

- 六 hook 两族：wrap 型（request + handler → AIMessage|Command / ToolMessage|Command）与 before/after 型（state + runtime → Partial 补丁 + jumpTo 或 void）。
- 时序总表：beforeAgent 一次正序 → 每轮 beforeModel 正序 → wrapModelCall 洋葱 → afterModel 逆序 → wrapToolCall 洋葱 → afterAgent 逆序；beforeModel 先于 wrapModelCall 一整跳。
- WrapModelCallHandler 的 Omit+可选放宽让系统提示可重置，与运行时互斥校验成对；ToolCallRequest.tool 可为 undefined，动态工具靠展开 request 补实现。
- 错误归属协议两侧同构：downstreamErrors 保穿透、MiddlewareError.wrap 带名归桶、非法返回值抛 Invalid response——读懂一侧即读懂两侧。
- 下一课把契约变成代码：createMiddleware 工厂如何在 292 行里把配置对象变成合格中间件。
`,
    null,
    [
      {
        text: 'beforeModel 与 wrapModelCall 的先后关系是？',
        options: [
          'wrapModelCall 先执行',
          'beforeModel 先执行——文档明确写 called before the model is invoked and before the wrapModelCall hook',
          '两者并行',
          '顺序取决于 middleware 数组位置',
        ],
        answer: 1,
        explain:
          '接口对 beforeModel 的注释原文：This function is called before the model is invoked and before the wrapModelCall hook。机制上也顺理成章：beforeModel 是图节点（在 model_request 之前的一跳），wrapModelCall 是 AgentNode 内部的函数洋葱——节点必然先于节点内部的洋葱。选项 A 顺序颠倒；选项 C 无并行实现；选项 D 与两者的实现机制无关。',
        concept: 'lc-mw-hooks',
      },
      {
        text: 'wrapModelCall 的 handler 参数类型为什么对 systemPrompt/systemMessage 做 Omit 再放宽？',
        options: [
          '这两个字段是只读的，handler 不能传',
          '允许 handler 重置系统提示：ModelRequest 里它们是必填 string/SystemMessage，handler 版本改为可选，缺失时沿用当前值',
          '为了节省内存',
          '历史遗留的兼容写法',
        ],
        answer: 1,
        explain:
          'WrapModelCallHandler 的返回请求类型是 Omit<ModelRequest, systemPrompt | systemMessage> & { systemPrompt?: string; systemMessage?: SystemMessage }，注释写明 allow to reset the system prompt or system message——运行时配合 L45 的变更检测：改了其一就重建 SystemMessage，两个都改则抛互斥错误。选项 A 与「可重置」语义相反；选项 C、D 无依据。',
        concept: 'lc-mw-hooks',
      },
      {
        text: 'wrapToolCall 的 handler 返回类型是？',
        options: [
          '只能是 string',
          'ToolMessage | Command（PromiseOrValue 包裹）——Command 用于高级控制流',
          'AIMessage',
          '任意对象',
        ],
        answer: 1,
        explain:
          'WrapToolCallHook 声明为 (request, handler) => PromiseOrValue<ToolMessage | Command>；接口 JSDoc 明确列了 Return Command objects for advanced control flow 的能力，运行侧 wrapToolCall 组合器还会校验返回类型并抛 Invalid response from wrapToolCall 错误。选项 A 是原始 tool() 层面的返回习惯；选项 C 是模型侧的类型；选项 D 太宽，非法返回会被校验拦截。',
        concept: 'lc-mw-hooks',
      },
      {
        text: 'middleware 自身逻辑抛出的错误与从内层 handler 穿透的错误，框架如何区分？',
        options: [
          '不区分，一律抛给用户',
          '都包进 MiddlewareError',
          '穿透错误经 downstreamErrors 集合识别后原样上抛，middleware 自身错误才包成 MiddlewareError 并带上 middleware 名',
          '都静默吞掉',
        ],
        answer: 2,
        explain:
          '模型侧（AgentNode）与工具侧（utils.ts 的 wrapToolCall 组合器）用同一协议：每层维护 downstreamErrors Set，内层已抛错误被记下后 re-throw 原样穿透；只有本层新产生的错误走 MiddlewareError.wrap(error, m.name)——源码注释明说模型与工具两条路径 treat pass-through errors the same。选项 A 丢失归属信息；选项 B 会把纯转发误判为 middleware 失败；选项 D 与设计相反。',
        concept: 'lc-mw-hooks',
      },
    ],
    [
      [
        'wrap 型 hook',
        '签名 (request, handler) => 响应 的洋葱型 hook：wrapModelCall 返回 AIMessage | Command，wrapToolCall 返回 ToolMessage | Command',
      ],
      [
        'before/after 型 hook',
        '签名 (state, runtime) => MiddlewareResult | void 的补丁型 hook：返回部分状态更新（可带 jumpTo）或 undefined 直通',
      ],
      [
        'handlerWithValidation',
        'AgentNode 洋葱每层内嵌的校验 handler：工具增改校验、systemPrompt/systemMessage 互斥、错误归属都发生在这里',
      ],
      [
        'MiddlewareError',
        '带 middleware 名的错误包装类型；ToolNode 的 cause 链解包（L46）依赖它识别错误来源',
      ],
    ],
    [
      '在 wrapModelCall 的 handler 调用里同时提供 systemPrompt 与 systemMessage——运行时抛 Cannot change both systemPrompt and systemMessage in the same request；只改其一即可',
      '以为 wrapModelCall 洋葱在图级别执行——它是 AgentNode 节点内部的函数洋葱，所以 beforeModel 节点永远先于它执行，调试断点顺序别搞反',
      '在 wrapToolCall 里返回既不是 ToolMessage 也不是 Command 的值——组合器的类型校验会抛 Invalid response from "wrapToolCall" in middleware "X"，不会静默转换',
    ],
  ),
  'theory',
)
