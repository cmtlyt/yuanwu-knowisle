import { L, withKind } from '../../course-builders.ts'

export const L36 = withKind(
  L(
    'L36',
    10,
    '回调传播机制（执行树视角）：getChild 逐层下发、run 树生长——可观测消费视角见 L92/L93',
    3,
    ['L35'],
    ['lc-callback-propagation'],
    [
      '画出一次 invoke 中 run 树的生长序列：handleChainStart(uuidv7) → delete runId → patchConfig+getChild(tag) → 子 handleChainStart → handleChainEnd/Error',
      '解释 getChild 只复制 inheritableHandlers/inheritableTags/inheritableMetadata 的设计含义：本地 handler 不下沉到子 run',
      '说出 handler 的六个开关字段（ignoreLLM/ignoreChain/ignoreAgent/ignoreRetriever/ignoreCustomEvent/raiseError）与 awaitHandlers 的语义边界',
    ],
    `### 回调不是事件总线，是一棵树

模块三收官。L30-L35 里 runManager?.getChild(...) 出现了十余次——每次组合子调用子 Runnable 都带着它。本课把这条线收拢：**回调传播的单位不是 handler 列表，而是 CallbackManager 的树**。每次 invoke 生成一个 run（uuidv7），getChild 产出以该 run 为父的子 manager，子 run 的 start/end/error 事件沿树逐层上报。run 树由回调系统「养」出来，Tracer/LangSmith 只是消费这棵树的客户端——本课只讲执行树如何生长，消费端（tracer 上报、streamEvents 事件流）留给 L92/L93。

### 事件面：可选方法群与六个开关

\`\`\`ts
abstract class BaseCallbackHandlerMethodsClass {
  handleLLMStart?(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<any> | any;
  ...
  handleChainStart?(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    runType?: string,
    ...
  ): Promise<any> | any;
  ...
  handleToolStart?(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    ...
  ): Promise<any> | any;
\`\`\`

*— libs/langchain-core/src/callbacks/base.ts:63-200（commit 7704471，有裁剪）*

handler 的方法群全部是**可选**的（handleLLMStart/handleLLMNewToken/handleChatModelStart/handleChatModelStreamEvent/handleChainStart/Error/End/handleToolStart/Error/End/handleRetrieverStart...，base.ts:58-300），实现哪个就收哪个事件。每个事件签名都带 runId 与 parentRunId——树结构的两个坐标。开关字段集中在 BaseCallbackHandler：

\`\`\`ts
abstract name: string;

ignoreLLM = false;
ignoreChain = false;
ignoreAgent = false;
ignoreRetriever = false;
ignoreCustomEvent = false;
raiseError = false;

awaitHandlers =
  getEnvironmentVariable("LANGCHAIN_CALLBACKS_BACKGROUND") === "false";
\`\`\`

*— libs/langchain-core/src/callbacks/base.ts:400-415（commit 7704471）*

分发侧的模式高度一致（manager.ts 里重复几十次）：先查开关（如 handleChainStart 查 ignoreChain，:1010；handleToolStart 查 ignoreAgent，:1080），tracer 类 handler 还会同步预建 run（isBaseTracer 分支，:1013-1027，注释说明为避免回调后台化时的竞态）；然后 consumeCallback 包裹真正调用，出错先 console.warn/error（raiseError 为 true 时改 console.error 并上抛）。**默认哲学：回调是尽力而为的后台任务，不干扰主流程**；raiseError=true 的 handler 才获得「我的错误就是主流程错误」的权力。工具事件挂在 ignoreAgent 下（没有 ignoreTool）是个容易踩的边界——ToolRun 的 handleToolError/End/Event 也查 ignoreAgent（manager.ts:684,713,735）。

### run 树生长：一次 invoke 的完整序列

以 RunnableSequence.invoke 为标本串起全链（各片段在前几课都见过，现在拼成时序）：

\`\`\`ts
const config = ensureConfig(options);            // ① ALS + 默认值归一化
const callbackManager_ = await getCallbackManagerForConfig(config);
const runManager = await callbackManager_?.handleChainStart(
  this.toJSON(),
  _coerceToDict(input, "input"),
  config.runId,                                   // ② runId=undefined → uuidv7 新身份
  ...
);
delete config.runId;                             // ③ 身份用完即焚
const promise = step.invoke(
  nextStepInput,
  patchConfig(config, {
    callbacks: runManager?.getChild(\`seq:step:\${i + 1}\`),  // ④ 子 manager
  })
);
nextStepInput = await raceWithSignal(promise, config.signal);
...
await runManager?.handleChainEnd(_coerceToDict(finalOutput, "output"));  // ⑤ 收尾
\`\`\`

*— 时序摘自 libs/langchain-core/src/runnables/base.ts:1991-2040 与 callbacks/manager.ts:997-1066（commit 7704471）*

五步序列就是 run 树的生长协议：① ensureConfig 归一化（L35）；② handleChainStart 在 runId 缺省时生成 uuidv7（manager.ts:1000），返回 CallbackManagerForChainRun——「本 run 的管理器」；③ delete config.runId 防止父 id 泄漏给兄弟分支；④ getChild 产出以本 runId 为 parent 的子 manager，子 Runnable 递归走同样的五步——树向下生长；⑤ end/error 事件把 run 关账。getCallbackManagerForConfig（config.ts:33-47）是入口转换器：把 config.callbacks（数组或 manager）经 CallbackManager._configureSync 统一成 manager——环境变量注入的 ConsoleCallbackHandler/LangChainTracer（LANGCHAIN_VERBOSE/环境开关，manager.ts:1387-1433）也在这里挂进来。

### getChild：继承集复制与本地标签

\`\`\`ts
getChild(tag?: string): CallbackManager {
  const manager = new CallbackManager(this.runId);
  manager.setHandlers(this.inheritableHandlers);
  manager.addTags(this.inheritableTags);
  manager.addMetadata(this.inheritableMetadata);
  if (tag) {
    manager.addTags([tag], false);
  }
  return manager;
}
\`\`\`

*— libs/langchain-core/src/callbacks/manager.ts:521-531（commit 7704471）*

CallbackManager 持有六份集合：handlers/inheritableHandlers、tags/inheritableTags、metadata/inheritableMetadata，外加 _parentRunId（manager.ts:783-797）。getChild 的三行继承决定了传播规则：**只有显式标记可继承的 handler/tag/metadata 会下沉**。addHandler(handler, true) 注册进继承集；configure 里用户 invoke 传入的 callbacks 默认走 setHandlers(..., true)（manager.ts:1371-1374），而 getChild 的 tag 走 addTags([tag], false)——seq:step:N、map:key:X 这些结构性标签只贴在当层 run 上，不继续下传（否则孙 run 会带着祖父步的标签）。这套「继承集 + 本地集」的双列表设计，让「全局追踪器」与「单次调试 handler」共存：前者 inheritable 跟全程，后者只在注册的那一层收事件。

事件面还有一条兼容层值得点名：handleChatModelStart 分发时若 handler 未实现，降级调 handleLLMStart 且消息组先 getBufferString 转文本（manager.ts:942-967）——老 handler 不改一行代码也能继续收 chat 事件。加上 awaitHandlers 的 LANGCHAIN_CALLBACKS_BACKGROUND 开关（base.ts:414-415，默认后台执行、显式 false 才同步等待），回调体系的「演进兼容 + 时序可调」两条工程线就齐了。

**划界**：本课讲的是 run 树如何生长（传播协议）；这棵树被谁消费——Tracer 家族的 persistRun、RunTree 上报 LangSmith、streamEvents 的事件泵——是可观测消费视角，归 L92/L93。

### 不分叉树的事件：custom event

run 树上还有一类不打新节点的叶事件——自定义事件。分发入口在 run 级管理器上：

\`\`\`ts
async handleCustomEvent(eventName, data, ...): Promise<void> {
  await Promise.all(
    this.handlers.map((handler) =>
      consumeCallback(async () => {
        try {
          await handler.handleCustomEvent?.(
            eventName, data, this.runId, this.tags, this.metadata
          );
        } catch (err) {
          const logFunction = handler.raiseError
            ? console.error
            : console.warn;
          logFunction(
            \`Error in handler \${handler.constructor.name}, handleCustomEvent: \${err}\`
          );
          if (handler.raiseError) {
            throw err;
          }
        }
      }, handler.awaitHandlers)
    )
  );
}
\`\`\`

*— libs/langchain-core/src/callbacks/manager.ts:258-292 裁剪（commit 7704471）*

事件被盖上**当前 run 的 id/tags/metadata** 分发（\`this.runId\`），不创建新 run——自定义事件是挂在既有节点上的注记，不会让树分叉，消费端按 runId 把事件归位到对应节点。错误处理与 start/end 事件同款：默认 console.warn 记录、raiseError 才上抛，awaitHandlers 决定同步或后台。这补全了执行树的完整事件面：结构性 run（chain/tool/llm/retriever）分叉生长，custom event 是叶子上的标注——两类事件共用 consumeCallback 原语与 handler 开关体系（ignoreCustomEvent 决定 handler 是否接收），但只有前者改变树的形状。

### 本课小结

- 回调传播 = CallbackManager 的树：每个 run 由 handleChainStart（uuidv7）创建，getChild 以本 runId 为 parent 产出子 manager，子 run 的五步序列递归生长。
- getChild 只复制继承集（inheritableHandlers/Tags/Metadata），本地 handler 与结构性标签（seq:step:N / map:key:X / retry:attempt:N）止步当层。
- handler 开关六字段决定事件过滤（注意工具事件查 ignoreAgent，无 ignoreTool）；raiseError 决定 handler 错误是否上抛；awaitHandlers 由 LANGCHAIN_CALLBACKS_BACKGROUND 控制，默认回调后台尽力而为。
- handleChatModelStart → handleLLMStart（getBufferString 转文本）的降级分发是事件面演进的兼容层，老 handler 零改动可用。
- 模块三至此收官：Runnable 四支柱、组合子家族、config 双轨、回调执行树——下一课（模块四）回到最高层，createAgent 的 14 个重载如何把这些原语组装成 agent。
`,
    null,
    [
      {
        text: 'CallbackManagerForChainRun.getChild(tag?) 返回的新 CallbackManager 中，handlers 来自哪里？',
        options: [
          '复制当前 run 的全部 handlers',
          '只复制 inheritableHandlers（外加 inheritableTags/inheritableMetadata），并以 this.runId 作为新 manager 的 _parentRunId',
          '空的，由调用方自行填充',
          '从全局单例重新加载',
        ],
        answer: 1,
        explain:
          'manager.ts:521-531：const manager = new CallbackManager(this.runId); manager.setHandlers(this.inheritableHandlers); manager.addTags(this.inheritableTags); manager.addMetadata(this.inheritableMetadata); tag 走 addTags([tag], false)（不可继承的本地标签）。选项 A 是关键误区——handlers 与 inheritableHandlers 是两个列表，本地 handler（inheritable=false 注册）**不会**出现在子 run；选项 C 错：继承集自动带入；选项 D 无此机制。',
        concept: 'lc-callback-propagation',
      },
      {
        text: 'RunnableSequence.invoke 里 patchConfig(config, { callbacks: runManager?.getChild(`seq:step:${i + 1}`) }) 的效果是？',
        options: [
          '每步共享同一个 callbackManager，无树结构',
          '每步获得一个以序列 run 为父的新 manager，子 run 带上 seq:step:N 本地标签——追踪树上序列的每个子步骤各自成 run',
          '只给第一步建子回调，后续步骤直接用父的',
          '把序列自己的 handlers 全量传给每一步',
        ],
        answer: 1,
        explain:
          'base.ts:2014-2018（last 步在 :2029-2032 同款）：getChild 以序列的 runId 为 parent 建子 manager，patchConfig 换掉 callbacks 并删 runName（L35）。于是「chain → step1/step2/step3」的执行树逐层生长，每步标签 seq:step:N 让树可读。选项 A 错：getChild 正是树分叉机制；选项 C 错：每步都有 getChild；选项 D 错：只传继承集（上一题），非全量。',
        concept: 'lc-callback-propagation',
      },
      {
        text: 'handleToolStart 与 CallbackManagerForToolRun 的各事件方法检查的开关是？',
        options: [
          'ignoreTool——存在专门的 ignoreTool 字段',
          'ignoreAgent——工具事件挂在 agent 开关之下，BaseCallbackHandler 没有 ignoreTool 字段',
          'ignoreChain',
          '不检查任何开关',
        ],
        answer: 1,
        explain:
          'BaseCallbackHandler 的开关字段是 ignoreLLM/ignoreChain/ignoreAgent/ignoreRetriever/ignoreCustomEvent/raiseError（base.ts:402-412）——没有 ignoreTool。handleToolStart 里检查的是 handler.ignoreAgent（manager.ts:1080），ToolRun 的 handleToolError/Event/End 同样检查 ignoreAgent（manager.ts:684,713,735）。想要「只忽略工具」的 handler 得同时小心 ignoreAgent 会连带 agent 事件。选项 A/C 的字段不存在；选项 D 错：每个 handle* 分发都先查开关。',
        concept: 'lc-callback-propagation',
      },
      {
        text: 'handler 没有实现 handleChatModelStart 时，chat model 的 start 事件会怎样分发？',
        options: [
          '事件被丢弃',
          '降级调用 handleLLMStart，消息组先经 getBufferString 转成字符串数组',
          '抛错，要求必须实现',
          '自动生成一个默认 handler',
        ],
        answer: 1,
        explain:
          'manager.ts:942-967：if (handler.handleChatModelStart) {...} else if (handler.handleLLMStart) { const messageString = getBufferString(messageGroup); await handler.handleLLMStart?.(llm, [messageString], ...) }。这是事件面演进的兼容层：老 handler 只认识 LLMStart，新事件降级喂给它。选项 A 错：有降级路径；选项 C 错：handleChatModelStart 是可选方法（base.ts:133-143）；选项 D 无此机制。',
        concept: 'lc-callback-propagation',
      },
      {
        text: 'awaitHandlers 字段的取值由什么决定？',
        options: [
          '固定为 true',
          '环境变量 LANGCHAIN_CALLBACKS_BACKGROUND === "false" 时为 true——即回调默认后台执行、awaitHandlers 为 true 时同步等待',
          '由 raiseError 反转而来',
          '由 handler 数量决定',
        ],
        answer: 1,
        explain:
          'base.ts:414-415：awaitHandlers = getEnvironmentVariable("LANGCHAIN_CALLBACKS_BACKGROUND") === "false"。默认（变量未设）回调经 consumeCallback 后台尽力执行、失败只打日志（raiseError 才决定是否上抛）；显式设 false 让回调同步阻塞等待——代价是主流程延迟，收益是回调完成时序确定。选项 A/C/D 均无出处。',
        concept: 'lc-callback-propagation',
      },
    ],
    [
      [
        'run 树',
        '一次顶层调用生成的执行树：每个 Runnable 的 start 事件是一个 run（uuidv7 id），getChild 使子 run 挂到父 run 下——回调树即运行树',
      ],
      [
        'getChild(tag?)',
        'run 级管理器的方法：以当前 runId 为 _parentRunId 新建 CallbackManager，只带继承集，tag 作为不可继承的本地标签附加（manager.ts:521-531）',
      ],
      [
        'inheritableHandlers',
        '标记为可继承的 handler 集合；addHandler(handler, true) 注册、getChild 复制——决定「哪些回调会跟着调用链往下走」',
      ],
      [
        'consumeCallback',
        '按 handler.awaitHandlers 决定后台/同步执行单次回调的分发原语；错误先打日志、raiseError 才上抛',
      ],
    ],
    [
      '以为传入 invoke 的 callbacks 会自动传给所有嵌套子 run——经 ensureConfig/_configureSync 注册的 handler 默认 inheritable=true 没错，但 run 级 getChild 只复制继承集，本地注册（inheritable=false）的 handler 止步当前 run',
      '以为工具事件有独立开关——工具事件的分发检查的是 ignoreAgent，想静默工具回调时可能连 agent 事件一起静默',
      '在 handler 里抛错以为会中断主流程——默认只 console.warn/error，raiseError=true 才把错误上抛；回调体系的默认哲学是尽力而为不干扰主流程',
    ],
  ),
  'theory',
)
