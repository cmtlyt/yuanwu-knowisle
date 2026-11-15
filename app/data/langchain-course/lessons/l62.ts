import { L, withKind } from '../../course-builders.ts'

export const L62 = withKind(
  L(
    'L62',
    18,
    'hitl（上）：interrupt 机制与人工介入',
    3,
    ['L51'],
    ['lc-hitl-interrupt'],
    [
      '说出 humanInTheLoopMiddleware 的 interruptOn 配置三形态（true / false / InterruptOnConfig）与四种决策类型的语义',
      '解释 batched 模式下 afterModel 闸门的完整流程：分类 → 组装 HITLRequest → interrupt → 决策映射 → 消息重建',
      '说出 when 谓词在 resume 时必须幂等的约束及其后果',
    ],
    `### 定位：把「人」插进 agent 循环的最大单件

模块五压轴是 hitl（human-in-the-loop），1233 行的内置中间件之王，分两课讲。上半场解决「怎么停」：LangGraph 的 interrupt 原语把运行中的图冻结在某个节点，状态存进 checkpoint，进程可以死掉，用户审批后用 Command({ resume }) 唤醒——agent 的「暂停等人」不是轮询，是协程级挂起。hitl 中间件把这个原语包装成一份按工具名配置的审批策略表。

一句话结论：**hitl = interruptOn 策略表 + batched（默认）/per_call（下一课）两种暂停模式 + 四种决策的统一落回协议。**

### interruptOn：一份审批策略表

配置即数据，三种形态：

\`\`\`ts
const contextSchema = z.object({
  interruptOn: z.record(z.union([z.boolean(), InterruptOnConfigSchema])).optional(),
  descriptionPrefix: z.string().default("Tool execution requires approval"),
});
// resolveInterruptOn：true → 全决策；false/缺失 → 不进表（自动放行）
for (const [toolName, toolConfig] of Object.entries(interruptOn ?? {})) {
  if (typeof toolConfig === "boolean") {
    if (toolConfig === true) {
      resolved[toolName] = { allowedDecisions: [...ALLOWED_DECISIONS] };
    }
  } else if (toolConfig.allowedDecisions) {
    resolved[toolName] = toolConfig;
  }
}
\`\`\`

*— libs/langchain/src/agents/middleware/hitl.ts:414-498（commit 7704471，有裁剪）*

InterruptOnConfig 四字段：allowedDecisions 圈定审批人能做什么；description 可以是静态字符串或 (toolCall, state, runtime) => string 的动态工厂（默认文案是 prefix + 工具名 + JSON 化参数）；argsSchema 给 edit 决策提供参数校验依据；when 是放行谓词——返回 false 的调用连 interrupt 都不发。四种决策的语义在 ALLOWED_DECISIONS = [\\"approve\\", \\"edit\\", \\"reject\\", \\"respond\\"]（85 行），注意 respond 与 reject 的差别：respond 是「审批人替工具回答」（success ToolMessage），reject 是「不许跑并告知原因」（error ToolMessage）。

HITLRequest 的载荷结构也值得看清，它是审批 UI 的对接面：actionRequests[] 每项含工具名、参数与渲染用的 description；reviewConfigs[] 每项含 allowedDecisions 与校验配置——两个数组按下标一一对应，客户端渲染「一个待审批项 + 一个允许操作集」的组合就是遍历下标。描述工厂的动态形态有个实用细节：它收到的入参里就有 state 与 runtime，所以 description 可以引用业务状态（比如「转账金额 $1200，账户余额 $3500」）而不只是死板的参数罗列——审批人拿到的是决策上下文，不是裸 JSON。批量的描述前缀由 contextSchema 里的 descriptionPrefix 控制（默认 "Tool execution requires approval"，hitl.ts:415-417），多语言或品牌化文案从这里改。

### batched 模式：afterModel 里的一次性审批

默认模式把「停下问人」的时机放在模型输出之后、工具执行之前：

\`\`\`ts
afterModel: {
  canJumpTo: ["model"],
  hook: async (state, runtime) => {
    // 1) 取最后一条带 tool_calls 的 AIMessage，逐个调用分类
    for (const toolCall of lastMessage.tool_calls) {
      const interruptConfig = resolvedConfigs[toolCall.name];
      if (interruptConfig && (await shouldInterrupt(toolCall, interruptConfig, state, runtime))) {
        interruptToolCalls.push(toolCall);
      } else {
        autoApprovedToolCalls.push(toolCall);
      }
    }
    // 2) 组装单个 HITLRequest，发起 interrupt（图在此挂起）
    const hitlResponse = (await interrupt(hitlRequest)) as HITLResponse;
    // 3) 决策逐个映射：approve→保留 call；edit→同 id 换名换参；
    //    reject→error ToolMessage；respond→success ToolMessage
    // 4) 整体替换 lastMessage.tool_calls（一个都不删！），写回消息
    lastMessage.tool_calls = revisedToolCalls;
    const jumpTo = hasPendingToolCalls ? undefined : "model";
    return { messages: [lastMessage, ...artificialToolMessages], jumpTo };
  },
}
\`\`\`

*— libs/langchain/src/agents/middleware/hitl.ts:1056-1232（commit 7704471，有裁剪）*

三个高价值细节。其一，**混合审批**：同一条 AIMessage 里可以既有免审批调用（进 revisedToolCalls 待工具节点执行）又有待审批调用，一次 interrupt 各得其所。其二，**消息完整性铁律**：lastMessage.tool_calls 整体替换为修订列表，被拒绝/代答的调用一个不删——因为 provider API 要求每个 tool_call 必须有配对响应，删掉调用会产生「有响应无调用」的非法序列；代答消息（artificialToolMessages）补上配对。其三，**短路回模型**：当所有剩余调用都已有代答消息（全被 reject/respond）时，jumpTo \\"model\\" 直接回到模型节点，省去空跑工具节点的一跳——这就是 canJumpTo 声明的用途（L48 讲过 jumpTo 的校验机制）。

### 决策映射协议：processDecision

每个决策的落回形态是审批 UI 对接的合同：

| 决策 | revisedToolCall | ToolMessage |
|---|---|---|
| approve | 原 tool_call 原样保留 | 无（等真实执行） |
| edit | 同 id、新 name/args 的 tool_call | 无 |
| reject | 保留原 call | status error，content = 拒绝理由（缺省「User rejected...」） |
| respond | 保留原 call | status success，content = 审批人代答 |

edit 的校验在 processDecision 里：editedAction.name 必须是字符串、args 必须是对象，否则抛错（870-879）——注意 batched 模式的 edit 只做结构校验，argsSchema 的 JSON schema 校验交给客户端层；per_call 模式（L63）才有服务端 Zod 校验。决策数与调用数不一致直接抛错（1173-1177），批量审批是全有全无的。

### when 谓词与幂等约束

shouldInterrupt 的默认行为是无 when 即拦截；有 when 则以 ToolCallRequest（batched 模式下 tool 为 undefined）入参判定。JSDoc 里最容易被忽视的一句话是 resume 语义：**interrupt 恢复是从挂起点重放，when 会在 resume 时再次执行**——若谓词这次返回 false，审批人给的所有答复（包括 reject）都会被跳过，工具直接执行。因此 when 必须是「同输入同输出」的纯函数：可以读 request 里的 args/state/runtime，不能读时钟、随机数或会漂移的外部状态。这个约束源于 LangGraph 的 checkpoint 重放模型，与 L80 讲的「interrupt 按 XXH3 精确路由」是同一套确定性原则。

幂等约束还有一个「审批人在 resume 前改了配置」的衍生场景值得预演：审批挂起期间你重新部署了代码、when 谓词的白名单变了，resume 时谓词按**新逻辑**重跑——结果可能与挂起前相反。这不是 bug 而是重放模型的必然：checkpoint 保存的是图状态，不是代码版本。生产上的对策有二：审批流涉及的中间件配置纳入变更冻结（挂起未决期间不发布）；或把易变的判定条件放进 args/state（随 checkpoint 持久）而不是谓词的闭包引用里。与 batched 模式的另一处对照也补上：本课的 when 在 afterModel 分类阶段决定「谁进 interrupt 名单」，而 per_call（下一课）的 when 在 wrapToolCall 入口决定「这个调用要不要挂起」——同一个谓词字段在两种模式里的评估时机不同，跨模式迁移审批配置时要检查 when 的入参假设（比如依赖 request.tool 的谓词在 batched 下拿到 undefined）。

### 本课小结

- interruptOn 三形态：true 全决策 / false 或缺失自动放行 / 对象精细配置（allowedDecisions、description、argsSchema、when）。
- batched 默认模式：afterModel 一次 interrupt 打包本轮全部待审批调用，支持混合审批（部分放行、部分询问）。
- 消息铁律：tool_calls 整体替换、一个不删，reject/respond 用配对 ToolMessage 补齐；全代答时 jumpTo \\"model\\" 短路。
- 四决策的落回合同：approve/edit 改 tool_calls，reject/respond 造 ToolMessage（error/success 两种 status）。
- when 谓词在 resume 时重跑，必须幂等——否则审批结果可能被静默无视。
- 下一课 hitl（下）：per_call 模式如何用 responseSchema 在保存前校验每个答复，以及审批流实战。
`,
    null,
    [
      {
        text: 'interruptOn 里某工具配成 false（或根本不配置）意味着什么？',
        options: [
          '该工具每次都触发审批',
          '自动放行：resolveInterruptOn 只保留值为 true（映射为全决策）或带 allowedDecisions 的对象配置，false 与缺失项都不进拦截表',
          '该工具被禁用，模型无法调用',
          '抛配置错误',
        ],
        answer: 1,
        explain:
          'resolveInterruptOn 遍历 interruptOn：boolean true → { allowedDecisions: 全部四种 }；对象且带 allowedDecisions → 原样保留；false 与缺失 → 不进 resolved 表（hitl.ts:484-498）。afterModel 循环里 interruptConfig 为 undefined 的调用直接进 autoApprovedToolCalls（1101-1116）。C 混淆了「免审批」与「禁用」——工具照常执行；A/D 与源码相反。',
        concept: 'lc-hitl-interrupt',
      },
      {
        text: 'batched 模式（默认）的 interrupt 在哪个 hook 里发起？',
        options: [
          'wrapToolCall，每个工具调用前各发一次',
          'afterModel：本轮所有待审批调用合并成一个 HITLRequest（actionRequests + reviewConfigs），一次 interrupt 全部打包',
          'beforeAgent，整轮开始前统一询问',
          'wrapModelCall',
        ],
        answer: 1,
        explain:
          'batched 模式的 wrapToolCall 为 undefined，闸门在 afterModel hook（hitl.ts:1056-1232）：收集本轮全部需审批的 tool_calls，组装单个 HITLRequest 后 await interrupt(hitlRequest)，一次暂停处理所有审批。JSDoc 也写明「multiple tools requiring approval are bundled into a single interrupt request, raised in the afterModel phase before any tool runs」（769-771）。A 是 per_call 模式（L63）；C 时机太早——模型还没产出调用；D 无此实现。',
        concept: 'lc-hitl-interrupt',
      },
      {
        text: '审批后 reject 决策如何落回消息序列？',
        options: [
          '把该 tool_call 从 AIMessage 上删除',
          '保留 tool_call，生成一条 status:"error" 的 ToolMessage（内容为拒绝理由或默认文案），与修订后的 tool_calls 一起写回 state',
          '直接终止 agent，什么都不写',
          '把拒绝理由作为新的 HumanMessage 插入',
        ],
        answer: 1,
        explain:
          'processDecision 的 reject 分支构造 error ToolMessage（content 为 message ?? 默认拒绝文案，hitl.ts:892-920），approve/edit 产出 revisedToolCall。关键注释在 1204-1210：「Keep every tool call on the AI message: a dropped call would never receive a ToolMessage, which provider APIs reject」——所以 lastMessage.tool_calls 被整体替换为修订列表，没有任何 call 被删掉。A 会造成「有响应无调用」的非法序列；C 错——审批流要继续跑；D 无此路径。',
        concept: 'lc-hitl-interrupt',
      },
      {
        text: 'when 谓词在 run 恢复（resume）时会怎样？约束是什么？',
        options: [
          'resume 时不再执行 when，直接用暂停前的判定',
          'when 在 resume 时会再次运行：必须对同一调用返回相同答案；若 resume 时返回 false，审批人的答复会被跳过、工具直接执行（即使他拒绝了）',
          'resume 时 when 抛错会自动放行',
          'when 只能是同步函数',
        ],
        answer: 1,
        explain:
          "WhenPredicate 的 JSDoc 明文（hitl.ts:31-38）：「In both modes the predicate runs again when the run resumes, so it must return the same answer for the same call. If it returns `false` on resume, the reviewer's answer is skipped and the tool runs, even if they rejected it.」—— because interrupt 恢复是从暂停点重放 hook，谓词属于重放的一部分。A 错——会重跑；C 无此降级；D 错——schema 允许返回 Promise（WhenFunctionSchema 的 returns 是 union 含 promise）。",
        concept: 'lc-hitl-interrupt',
      },
    ],
    [
      [
        'interruptOn',
        '按工具名配置审批策略的 record：true 全决策、false/缺失自动放行、InterruptOnConfig 精细控制（allowedDecisions/description/argsSchema/when）',
      ],
      [
        'HITLRequest',
        'batched 模式的 interrupt 载荷：actionRequests[]（含 description）+ reviewConfigs[]（含 allowedDecisions），客户端据此渲染审批界面',
      ],
      [
        'Decision',
        '四种决策联合类型：approve（照原样执行）/ edit（换名换参，同 id）/ reject（error ToolMessage）/ respond（success ToolMessage 代答）',
      ],
      [
        'canJumpTo: ["model"]',
        'batched afterModel hook 声明的跳转能力：当所有剩余调用都已有代答消息时 jumpTo "model" 回到模型，跳过工具节点',
      ],
    ],
    [
      '忘了配 checkpointer——interrupt 暂停依赖 checkpoint 保存现场，JSDoc 明示「Requires a checkpointer to maintain state across interruptions」（hitl.ts:772）；无 checkpointer 时审批流根本无法恢复',
      '在 when 谓词里放非确定性逻辑（时间、随机、远程查询波动）——resume 时谓词重跑，答案翻转会导致审批结果被无视或产生诡异行为；谓词必须是入参的纯函数',
      '假设 decisions 数组长度可以和待审批调用数不一致——afterModel 显式校验并抛错（hitl.ts:1173-1177），批量审批必须逐个给决策',
      '把 reject 的 message 当成给用户的通知——它写进的是给模型的 error ToolMessage；通知用户要在客户端层处理 __interrupt__ 时做',
    ],
  ),
  'theory',
)
