import { L, withKind } from '../../course-builders.ts'

export const L63 = withKind(
  L(
    'L63',
    18,
    'hitl（下）：per-call interrupts 与审批流',
    3,
    ['L62'],
    ['lc-hitl-approval'],
    [
      '从零搭一个带 checkpointer 的审批流 agent：per_call 模式触发 tool_approval interrupt，解析 __interrupt__ 后用 Command({ resume }) 跑通 approve/edit/reject 三种决策',
      '构建带 when 谓词与 editNotice 的精细审批中间件配置，并验证 edit 后模型收到的提示前缀',
      '打通 per_call 模式下 hitl 与容错中间件的叠放顺序：验证 resume 重放时上游中间件无副作用约束',
    ],
    `### 定位：从「一次打包」到「逐个精准」

L62 讲了 batched 模式的整包审批，本课拆 per_call 模式与实战。per_call 的动机：batched 把所有审批捆成一个大 interrupt，客户端要一次性渲染 N 个表单、一次提交 N 个决策，交互粒度粗且校验全靠客户端自觉。per_call 反其道而行：**每个被 gate 的工具调用在即将执行时单独暂停，interrupt 载荷是单个 ToolApprovalRequest，答复带 responseSchema 由 LangGraph 在保存前校验**——粗放变精准，代价是多次暂停/恢复的往返。实战主线是搭一条从 invoke 到审批 UI 到 resume 的完整审批流。

一句话结论：**per_call = wrapToolCall 里逐调用 interrupt + 服务端 schema 校验答复 + editNotice 告知模型调用被换。**

### per_call 的执行骨架

模式在构造期选定并校验（951-970），两种模式互斥：per_call 时 wrapToolCall 有实现、afterModel 直接 return。

\`\`\`ts
wrapToolCall: async (request, handler) => {
  const { toolCall } = request;
  const { interruptOn } = interopParse(contextSchema, { ...options, ...(request.runtime.context || {}) });
  const toolConfig = resolveInterruptOn(interruptOn)[toolCall.name];
  if (!toolConfig || (toolConfig.when && !(await toolConfig.when(request)))) {
    return handler(request);              // 未配置或 when 放行
  }
  if (toolCall.id == null) {
    throw new Error("Tool call \`...\` has no ID, so its result can't be matched to it...");
  }
  const value: ToolApprovalRequest = {
    type: "tool_approval",
    tool_call_id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
    description: actionRequest.description ?? "",
  };
  const responseSchema = decisionSchema(toolConfig.allowedDecisions, toolCall.name, request.tool);
  const decision = interrupt<ToolApprovalRequest, ToolApprovalDecision>(value, { responseSchema });
  if (decision.type === "approve") return handler(request);
  if (decision.type === "reject") return new ToolMessage({ /* error */ });
  if (decision.type === "respond") return new ToolMessage({ /* success 代答 */ });
  // edit：用编辑后的 args 执行，工具名被 schema 钉死
  const result = await handler({ ...request, toolCall: { ...toolCall, args: executed.args } });
  return withEditNotice(result, toolCall.id, executed, editNotice);
}
\`\`\`

*— libs/langchain/src/agents/middleware/hitl.ts:980-1054（commit 7704471，有裁剪）*

与 batched 的关键差别全在这段里：interrupt 发生在 wrapToolCall（工具即将执行的瞬间），request.tool 是真实工具实例——这使 decisionSchema 能拿到工具的 Zod v4 schema 做 args 校验；interrupt 的第二参数 { responseSchema } 是 LangGraph 侧「保存前校验」的挂钩点；edit 后不是换 toolCall 原样执行，而是替换 args 后放行，再由 withEditNotice 给结果消息拼上编辑告知。

### ToolApprovalRequest 的载荷协议：snake_case 与客户端分流

per_call 的 interrupt 载荷有独立的 schema 与类型守卫，客户端对接要按它的形状来。ToolApprovalRequestSchema 五个字段全部 snake_case：type/tool_call_id/name/args/description（hitl.ts:313-324），注释明说键风格「snake_case, as in Python」——审批载荷刻意跨语言对齐，让 TS 客户端与 Python 服务端共享同一套 UI 协议；而 HITLResponse 的 decisions 数组是 camelCase。两套命名并存不是疏忽：interrupt 值是「给外部审批人看的合同」（跨语言稳定优先），决策对象是「框架内部消费的输入」（TS 习惯优先），边界处各按受众选风格。分流判定用导出的类型守卫 \`isToolApprovalInterrupt(interrupt)\`——内部就是 \`ToolApprovalRequestSchema.safeParse(interrupt?.value).success\`（386-391）。为什么用 safeParse 而不是 instanceof 或查 type 字段？因为 interrupt.value 在 resume 往返中经过序列化，原型链信息不保——schema 校验是唯一对序列化稳的判型方式，这与 L05 的 Symbol.for 判型纪律是同一类「跨边界判型」问题的两种解法。一个 agent 可能同时有 batched 式 HITLRequest 与 per_call 式 ToolApprovalRequest（不同 agent 或不同模式），客户端按守卫分流渲染是标准姿势。

### withEditNotice：编辑告知的拼装协议

edit 决策生效后，模型怎么知道「自己发的调用被换了」？答案在 withEditNotice（hitl.ts:530 起）：它把编辑说明拼在结果 ToolMessage 的 content 前部，默认文案是固定英文段落——"Note: a human reviewer replaced this tool call before it ran. The call recorded in ..."（476 行起）——随后拼接 \`Executed instead: \${executed.name} with arguments \${JSON.stringify(...)}\`（509），把实际执行的工具名与参数明示给模型。这段告知解决的是模型侧的一个真实风险：模型的上下文里记录的调用（原 to 地址）与实际执行的调用（新地址）不一致，模型若不被告知，很可能判定「邮件没发成功」而重发原参数——**editNotice 是把「外部修改」翻译成「模型可理解的事实」的桥**。配置项 editNotice 传 null 可关闭（自建提示词方案时用），传字符串则完全替换默认文案。这层设计也解释了 L62 决策表里 edit 行「无 ToolMessage」的另一半：edit 的结果消息由真实工具执行产生，告知文本只是它的前缀——approve 与 edit 的结果消息因此是同构的，模型视角里两者的差别只剩这段前缀。

### responseSchema：答复即合同

decisionSchema 按 allowedDecisions 动态生成判别联合：

\`\`\`ts
const toolApprovalDecisions = (name, tool) => ({
  approve: z4.object({ type: z4.literal("approve") }),
  edit: z4.object({
    type: z4.literal("edit"),
    edited_action: z4.object({
      name: z4.literal(name),          // 不能换工具
      args: editArgs(tool),            // 工具 Zod v4 schema 的输入侧
    }),
  }),
  reject: z4.object({ type: z4.literal("reject"), message: z4.string().optional() }),
  respond: z4.object({ type: z4.literal("respond"), message: z4.string() }),
});
// 去重后组 discriminatedUnion；单决策工具直接返回单分支 schema
\`\`\`

*— libs/langchain/src/agents/middleware/hitl.ts:355-412（commit 7704471，有裁剪）*

editArgs 的取法体现 Zod 互操作细节（呼应 L101）：只取 transform 之前的输入侧（interopZodTransformInputSchema(schema, true)），这样 transform 在工具执行时才跑一次，不会在审批校验和执行时跑两遍；非 Zod v4 对象工具退化为 z4.record 任意对象。JSDoc 对批量答复的警告要复述一遍：**一起发送的多个答复中若有一个非法，其余工具可能已经执行，再次作答会重复执行**——客户端要么发送前本地按 responseSchema 校验，要么逐个发送。

### 实战：从零搭一条审批流

\`\`\`ts
import { MemorySaver, Command } from "@langchain/langgraph";
import { createAgent, humanInTheLoopMiddleware } from "langchain";

const hitl = humanInTheLoopMiddleware({
  interruptMode: "per_call",
  interruptOn: {
    send_email: {
      allowedDecisions: ["approve", "edit", "reject"],
      description: (tc) => \`即将向 \${tc.args.to} 发送邮件，主题：\${tc.args.subject}\`,
      when: (req) => req.toolCall.args.to !== "safe@example.com", // 白名单地址免审批
    },
    delete_records: { allowedDecisions: ["approve", "reject"] },
    read_schema: false,                    // 自动放行
  },
});

const agent = createAgent({
  model: "openai:gpt-4o",
  tools: [sendEmail, deleteRecords, readSchema],
  middleware: [hitl],                       // 容错件要放它后面（内层）
  checkpointer: new MemorySaver(),          // interrupt 依赖 checkpoint
});

const config = { configurable: { thread_id: "t-1" } };
// 第一跳：暂停在 send_email 的审批上
const paused = await agent.invoke(
  { messages: [{ role: "user", content: "给 boss@example.com 发周报" }] },
  config
);
const intr = paused.__interrupt__?.[0];
if (intr && isToolApprovalInterrupt(intr)) {
  console.log(intr.value.description);      // 渲染审批界面
}
// 审批人选择 edit：改地址后放行
await agent.invoke(new Command({
  resume: { type: "edit", edited_action: {
    name: "send_email",
    args: { to: "boss@corp.example.com", subject: "周报", body: "..." },
  } },
}), config);
// 结果 ToolMessage 前自动拼上 editNotice：告知模型调用被替换
\`\`\`

这条链覆盖 per_call 的全部要点：MemorySaver 提供 checkpoint（batched/per_call 都必需）；when 让安全地址免打扰；__interrupt__ 里 isToolApprovalInterrupt 守卫载荷类型；resume 按 interrupt ID 关联答复；edit 的 args 必须匹配工具 schema 输入侧，非法答复抛 ZodError 且可重新作答。跑通验收：edit 后检查 messages 里该 ToolMessage 的 content 开头是 editNotice 文本（「Note: a human reviewer replaced this tool call...」+ Executed instead: ...）。

再补几条深入断言，把本课的机制逐个钉死。**断言一（responseSchema 的拒答面）**：用 Command({ resume: { type: "edit", edited_action: { name: "delete_records", args: {} } } }) 去答 send_email 的审批——edit 的 name 被 z4.literal 钉死为原工具名（hitl.ts:360-366），换工具名的答复抛 ZodError 且不保存，同一 interrupt 原样等待重新作答；这验证了「答复即合同」不是文档修辞而是运行时强校验。**断言二（when 的 resume 重跑）**：第一轮 when 拦下了 send_email，审批挂起期间把该地址加入白名单再 resume——谓词重跑返回 false，审批人的答复被跳过、工具直接执行，第一轮的挂起「凭空消失」。这个实验比文档警告更直观，也再次印证 L62 的幂等纪律。**断言三（respond 的代答语义）**：对 read_schema 风格的查询工具用 respond 决策代答一条 success ToolMessage，验证下一轮模型把它当真实工具结果消费——respond 与 reject 的 status 差别（success/error）在这里变成模型行为差别。三条断言跑完，per_call 的「逐调用精准」就不是口号而是可复现的运行事实。

### 叠放顺序与重放纪律

per_call 的暂停点在 wrapToolCall 洋葱里，这带来一条硬纪律——文档原文：「The review happens as the tool call starts, inside the tool-call middleware chain. List this middleware before tool retry or error-handling middleware so it wraps them. On resume, each paused tool call runs the middleware listed before this one again up to the pause, so that middleware must not have side effects before calling handler.」展开说：resume 从 checkpoint 恢复时，工具节点重新进入，排在 hitl **之前**（外层）的中间件会重新执行到暂停点——如果 retry 中间件在 handler 之前就记了日志/计数器，重放会导致重复计数。所以合规排法是 \`[hitl, toolRetry, toolError]\`：hitl 最外层先拦截，容错件在内层只处理「审批放行后」的真实执行。这与 L58 的 emulator→error→retry 栈合并时，完整顺序是 emulator、hitl、error、retry。

### 本课小结

- per_call：每个 gated 调用在 wrapToolCall 里单独 interrupt，载荷 ToolApprovalRequest，interrupt ID 关联答复，toolCall.id 缺失直接抛错。
- responseSchema 是服务端校验合同：edit 钉死工具名、args 走工具 Zod v4 输入侧；非法答复 ZodError 不保存、可重答；批量答复有「重复执行」陷阱。
- editNotice 让模型知道调用被替换——不补这个说明，模型可能重发原参数。
- 叠放纪律：hitl 放容错件外层；resume 重放上游中间件，handler 之前不得有副作用。
- 下一课收束模块五：路由与选择族五件套——modelRouter、llmToolSelector、providerToolSearch、todoList、autoMode。
`,
    null,
    [
      {
        text: 'per_call 模式下，审批答复在保存前会经历什么处理？',
        options: [
          '直接保存，运行时再验证',
          'LangGraph 用中间件提供的 responseSchema（按 allowedDecisions 生成的 discriminated union）解析答复，不合法的抛 ZodError 且不保存，同一 interrupt 可重新作答',
          '只检查 decisions 数组长度',
          '答复会自动转换成 approve',
        ],
        answer: 1,
        explain:
          "per_call 的 interrupt 调用带第二参数 { responseSchema }（hitl.ts:1021-1024），schema 由 decisionSchema 按 allowedDecisions 生成 z4.discriminatedUnion（400-412）；文档注释写明「LangGraph parses the answer against responseSchema before saving it... An invalid answer throws a ZodError and isn't saved, so the same interrupt can be answered again」（445-458）。C 是 batched 模式的校验方式；D 无此行为。",
        concept: 'lc-hitl-approval',
      },
      {
        text: 'per_call 模式的 edit 决策在服务端的校验范围是？',
        options: [
          '不做任何校验',
          '工具名被 schema 钉死（name 是 z4.literal(原工具名)，不能换工具）；args 用 editArgs 校验——Zod v4 对象 schema 的输入侧，无声明字段按工具对模型的处理方式对待',
          'name 和 args 都必须与原调用完全一致',
          'args 必须匹配 argsSchema 配置',
        ],
        answer: 1,
        explain:
          "toolApprovalDecisions 里 edit 分支的 name 是 z4.literal(name)（hitl.ts:360-366），注释「The edit can't switch tools: its name is pinned」；editArgs 从工具的 Zod v4 schema 取输入侧（interopZodTransformInputSchema，跳过 transform 让其在工具执行时运行），非 Zod v4 对象的工具退化为 z4.record 任意对象（338-348）。argsSchema 配置是 batched 模式的字段（144 行注释「Not used in per_call mode」）。C 违背 edit 的本意；D 正说反。",
        concept: 'lc-hitl-approval',
      },
      {
        text: '多个审批答复一起发送、其中一个不合法时，文档警告的副作用是？',
        options: [
          '全部答复都会被拒绝',
          '其他合法答复对应的工具可能已经执行（即使仍显示 pending），再次作答会导致工具重复执行；应先本地按 responseSchema 校验或逐个发送',
          '框架自动把非法项替换为 approve',
          'agent 直接崩溃无法恢复',
        ],
        answer: 1,
        explain:
          "HumanInTheLoopMiddlewareConfig 的 interruptMode 注释原文：「If one of several answers sent together is invalid, the others' tools may already have run even if they still show as pending, and answering them again would run them twice. Check answers against responseSchema before sending them together, or send one at a time.」（hitl.ts:452-458）。B 正确。A 过度悲观——合法项照常生效；C/D 无此机制。",
        concept: 'lc-hitl-approval',
      },
      {
        text: 'per_call 模式下审批工具调用时，对 toolCall.id 的要求与原因是？',
        options: [
          '没有要求',
          'id 为 null 时抛错：没有 ID 就无法把工具结果匹配回调用（空字符串 id 可以接受）',
          'id 必须是 UUID',
          'id 为空时自动生成一个',
        ],
        answer: 1,
        explain:
          'wrapToolCall 里的检查：if (toolCall.id == null) throw new Error("Tool call `...` has no ID, so its result can\'t be matched to it...")，注释强调「Only a missing ID: an empty one still runs, as in batched mode」（hitl.ts:995-1000）。原因是审批答复要按 interrupt ID 关联回具体调用。B 的「null 抛错、空串放行」正是源码语义；C 无格式校验；D 无自动生成。',
        concept: 'lc-hitl-approval',
      },
    ],
    [
      [
        'interruptMode',
        'hitl 的暂停模式（构造期固定）：batched 默认（afterModel 一次打包）/ per_call（wrapToolCall 逐调用暂停，每个 gating 调用一个 ToolApprovalRequest）',
      ],
      [
        'ToolApprovalRequest',
        'per_call 的 interrupt 载荷：type: "tool_approval" + tool_call_id/name/args/description，snake_case 键与 Python 对齐（hitl.ts:313-330）',
      ],
      [
        'editNotice',
        'per_call 专属：审批人编辑过的调用执行后，结果 ToolMessage 前会拼上告知模型「你发的调用不是实际执行的调用」的说明文字，默认一段固定英文，传 null 关闭',
      ],
      [
        'isToolApprovalInterrupt',
        '类型守卫函数：用 ToolApprovalRequestSchema.safeParse 判断一个 interrupt 是否为 per_call 审批请求，客户端分流渲染时用',
      ],
    ],
    [
      '把 hitl 排在 toolRetry/toolError 之后——文档明确要求「List this middleware before tool retry or error-handling middleware so it wraps them」（hitl.ts:459-461）；放外层的 hitl 才能先拦住调用，且 resume 时排在前面的中间件会重跑到暂停点，它们在 handler 之前不能有副作用',
      'per_call 模式下给无 Zod v4 schema 的工具期待严格 args 校验——editArgs 对非 Zod v4 对象工具退化为任意对象 record，参数合法性由工具运行时自检',
      'batched 与 per_call 混淆 afterModel 行为——per_call 时 afterModel hook 直接 return（1059-1062），所有暂停都发生在 wrapToolCall；给 per_call agent 找 afterModel 闸门逻辑会扑空',
      '审批编辑后忘记模型视角——editNotice 默认文案告诉模型「记录在你消息里的调用没有执行，实际执行的是另一个，这是授权行为，不要重发原调用」；自建审批 UI 若改写 args，不补这个说明模型可能反复重试原参数',
    ],
  ),
  'practice',
)
