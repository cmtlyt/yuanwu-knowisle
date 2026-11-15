import { L, withKind } from '../../course-builders.ts'

export const L123 = withKind(
  L(
    'L123',
    32,
    '走查③：工具调用 Agent 迁移（AgentExecutor+ZeroShot → createAgent+toolError/toolRetry）',
    3,
    ['L112'],
    ['lc-walkthrough-agent'],
    [
      '从零复原 AgentExecutor + createToolCallingAgent + handleParsingErrors/maxIterations 的旧工具 Agent 并跑通工具循环，盘点其错误处理与迭代预算的隐式行为',
      '实现迁移：createAgent + toolErrorMiddleware/toolRetryMiddleware/toolCallLimitMiddleware 组合，跑通「工具抛错→重试→兜错回喂」完整链路并验证与旧开关的语义等价',
      '打通验收：协议替换断言（AgentAction 消失、消息流可见）、错误路径行为对照（回喂文案一致）、步数预算（recursionLimit + 工具级限流）三组断言',
    ],
    `### 一、走查对象：一个「带错误兜底」的旧工具 Agent

走查③收束 L112/L113/L115 三课的映射成果。旧版对象是最典型的存量 Agent：createToolCallingAgent（协议族已换代到 tool calling，但运行时还是 AgentExecutor）+ 全套错误兜底开关。复原：

\`\`\`ts
// ── before/app.ts：0.x 工具调用 Agent（AgentExecutor 版）─────
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const getRate = tool(
  async ({ from, to }) => {
    const table: Record<string, number> = { "USD/CNY": 7.24, "EUR/CNY": 7.85 };
    const rate = table[\`\${from}/\${to}\`];
    if (rate === undefined) {
      throw new Error(\`currency pair not found: \${from}/\${to}\`);  // 会被 handleToolRuntimeErrors 捕获
    }
    return rate;
  },
  { name: "get_rate",
    description: "查询汇率",
    schema: z.object({ from: z.string(), to: z.string() }) }
);

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是外汇助手，用工具查汇率后再回答。"],
  ["human", "{input}"],
]);

const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
const agent = createToolCallingAgent({ llm: model, tools: [getRate], prompt });

const executor = new AgentExecutor({
  agent,
  tools: [getRate],
  maxIterations: 6,                     // 循环预算
  handleParsingErrors: "参数格式有误，请检查后重新调用工具。",   // 解析失败回喂
  handleToolRuntimeErrors: (e) => \`工具执行失败：\${e.message}\`,  // 工具运行时错误回喂
});

const out = await executor.invoke({ input: "100 美元换人民币是多少？另外 GBP/CNY 呢？" });
console.log(out.output, out.intermediateSteps?.length);
// 一个工具成功、一个工具抛错（GBP/CNY 不在表里）：旧版行为 = 错误文案回喂，模型看到后换招或向用户说明
\`\`\`

隐式行为盘点：其一，**错误处理是 executor 的全局开关**——回喂文案对所有工具一刀切，且 handleToolRuntimeErrors 直接把 \`e.message\` 塞给模型（敏感信息无脱敏）；其二，**预算是单一计数器**——maxIterations: 6 数的是总循环；其三，**中间步骤要主动索取**——intermediateSteps 靠 returnIntermediateSteps 开关，默认不可见；其四，**模型动作经 AgentAction 协议流转**——解析器层在 executor 与 agent 之间插了一道。四件事对应迁移的四项改造。

### 二、迁移主体：createAgent + 错误/重试/预算三层组合

新形态把四个隐式面全部换成显式组合。逐项翻译旧开关（对照 L115 映射表）后落地：

\`\`\`ts
// ── after/app.ts：createAgent 版 ────────────────────────────
import { createAgent } from "langchain";
import {
  toolErrorMiddleware,    // middleware/index.ts:73 导出（toolError.ts:72 实现）
  toolRetryMiddleware,    // middleware/index.ts:69 导出（toolRetry.ts:162 实现）
  toolCallLimitMiddleware, // middleware/index.ts:48 导出
} from "langchain";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getRate = tool(
  async ({ from, to }) => {
    const table: Record<string, number> = { "USD/CNY": 7.24, "EUR/CNY": 7.85 };
    const rate = table[\`\${from}/\${to}\`];
    if (rate === undefined) throw new Error(\`currency pair not found: \${from}/\${to}\`);
    return rate;
  },
  { name: "get_rate", description: "查询汇率",
    schema: z.object({ from: z.string(), to: z.string() }) }
);

const agent = createAgent({
  model: "openai:gpt-4o",              // ← llm + createToolCallingAgent 的合体（协议消失，L113）
  prompt: "你是外汇助手，用工具查汇率后再回答。",
  tools: [getRate],
  middleware: [
    // ① 工具级预算 ← 旧 maxIterations 的语义对应
    toolCallLimitMiddleware({ runLimit: 6 }),
    // ② 重试在内层：先重试，穷尽后仍抛出的错误交给外层兜底
    //    （顺序规约：toolError.ts:60-63 官方注释）
    toolRetryMiddleware({ maxAttempts: 2, onFailure: "error" }),
    // ③ 兜错在外层 ← 旧 handleToolRuntimeErrors 的语义对应
    //    按工具过滤作用域（旧开关做不到的新能力）
    toolErrorMiddleware({
      tools: ["get_rate"],
      onError: (error, request) => {
        // 安全规约（toolError.ts:55-57）：标识错误类型，不带原始错误文本
        if (String(error).includes("not found")) {
          return \`工具 \${request.toolCall.name} 未收录该货币对，请改用已有工具或如实告知用户。\`;
        }
        return \`工具 \${request.toolCall.name} 执行失败，请重试或换一种方式回答。\`;
      },
    }),
  ],
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "100 美元换人民币是多少？另外 GBP/CNY 呢？" }],
});
const last = result.messages.at(-1)!;
\`\`\`

三个值得在源码层面展开的对照点。**错误路径的语义保真**：旧 handleToolRuntimeErrors 的回喂文案直接携带 \`e.message\`（内部信息裸奔），新版按 toolError.ts:55-57 的官方安全规约改写——onError 返回标识错误类型的文案而不透传原文，这是迁移中「顺手升级安全」的典型点位。**重试与兜错的包裹关系**：数组顺序 [limit, retry, error] 意味着工具执行被三层包裹——限流最外、兜错中、重试最内；GBP/CNY 抛错先被 retry 拦下重试两次，穷尽后 onFailure: \\"error\\" 重抛，外层 error middleware 才接管转成回喂文案。若把 error 放 retry 之前，错误会被立即转成回喂、重试根本没机会执行。**预算的语义拆分**：toolCallLimitMiddleware({ runLimit: 6 }) 对齐旧计数器「工具往返数」的真实语义；若还需要图级硬保险，在 invoke 时传 \`recursionLimit\`——两层独立配置，不再是一个数字管所有。

### 三、中间步骤可观测：stream 默认可见

旧版要靠 returnIntermediateSteps 打开才有 intermediateSteps；新版「过程即消息流」，stream 天然吐每步状态：

\`\`\`ts
// ── after/observe.ts：过程可观测 ────────────────────────────
const stream = agent.stream(
  { messages: [{ role: "user", content: "100 美元换人民币是多少？GBP/CNY 呢？" }] },
  { configurable: { thread_id: "agent-walk-1" } }
);

const steps: string[] = [];
for await (const update of stream) {
  for (const [node, value] of Object.entries(update) as [string, any][]) {
    for (const m of value.messages ?? []) {
      steps.push(\`\${node}: \${m.getType()}\${m.tool_calls?.length ? \`(\${m.tool_calls.map((c: any) => c.name).join(",")})\` : ""}\`);
    }
  }
}
console.log(steps);
// 形如：[ "agent: ai(get_rate)", "tools: tool", "agent: ai(get_rate)", "tools: tool", "agent: ai" ]

import { expect, it } from "vitest";
it("消息流记录了完整的工具往返", () => {
  expect(steps.filter((s) => s.includes("get_rate")).length).toBeGreaterThanOrEqual(2);
  expect(steps.some((s) => s.includes("tool"))).toBe(true);
});
\`\`\`

对照旧版的 returnIntermediateSteps：那里的 AgentStep 结构（{ action, observation }，classic agents/index.ts:103 类型导出）在新形态没有对应物——每步动作就是一条 ai(tool_calls) 消息、每个结果就是一条 tool 消息，状态里自带的记录比旧版的结构更完整（还带 tool_call_id 关联）。需要「步数统计」这类派生量，从消息流 reduce 即可，不用等开关放行。

还有一个迁移时容易被忽略的行为差异要点名：旧 AgentExecutor 的 earlyStoppingMethod = "force"（executor.ts:369）在触顶后会把一个「强制停止」观察值喂回模型再走完最后一圈；新架构的 recursionLimit 触顶直接抛 GraphRecursionError 中断——语义从「软着陆」变成「硬上限」。如果存量应用依赖 force 的软着陆行为（例如把触顶后的最后一轮输出当作兜底答案），迁移时要显式补一层：用 toolCallLimitMiddleware 的限流在接近上限前主动收束，或在调用侧 catch GraphRecursionError 后降级为固定话术。软硬语义之差是这类「数字相同、行为不同」陷阱的典型，翻译配置时必须逐个验证而不是对照参数名画等号。

### 四、迁移验收：协议、错误、预算三组断言

\`\`\`ts
// ── after/acceptance.ts ─────────────────────────────────────
import { expect, it, describe } from "vitest";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

describe("工具 Agent 迁移验收", () => {
  // 断言组一：协议替换——动作结构消失，消息流自足
  it("结果不含 AgentAction/AgentStep 结构，过程在 messages 里", async () => {
    const r = await agent.invoke({
      messages: [{ role: "user", content: "EUR/CNY 汇率？" }],
    });
    const toolMsgs = r.messages.filter((m: any) => m instanceof ToolMessage);
    expect(toolMsgs.length).toBe(1);                 // 一次工具往返
    expect(toolMsgs[0].tool_call_id).toBeDefined(); // tool_call_id 关联（L13 三字段）
    expect(r.messages.at(-1)!.getType()).toBe("ai"); // 最终回答
  });

  // 断言组二：错误路径行为对照——回喂后模型能自愈
  it("未知货币对触发兜错回喂，模型最终给出可用回答", async () => {
    const r = await agent.invoke({
      messages: [{ role: "user", content: "GBP/CNY 汇率是多少？" }],
    });
    const toolMsgs = r.messages.filter((m: any) => m instanceof ToolMessage);
    const errBackfeed = toolMsgs.some((m: any) =>
      String(m.content).includes("未收录该货币对"));
    expect(errBackfeed).toBe(true);                  // 兜错文案进了消息流
    expect(String(r.messages.at(-1)!.content)).toMatch(/GBP|英镑|无法|抱歉/);
  });

  it("重试确实发生（穷尽前不放弃）", async () => {
    let calls = 0;
    const flaky = tool(async () => {
      calls++;
      if (calls < 2) throw new Error("transient network glitch");
      return "ok";
    }, { name: "flaky", description: "间歇故障工具", schema: z.object({}) });

    const retryAgent = createAgent({
      model: "openai:gpt-4o",
      tools: [flaky],
      middleware: [toolRetryMiddleware({ maxAttempts: 3, onFailure: "error" })],
    });
    const r = await retryAgent.invoke({
      messages: [{ role: "user", content: "调用 flaky 工具" }] });
    expect(calls).toBeGreaterThanOrEqual(2);         // 第二次成功
    expect(String(r.messages.at(-1)!.content)).toMatch(/ok/i);
  });

  // 断言组三：预算——工具级限流生效
  it("工具调用超限被拦截", async () => {
    const limited = createAgent({
      model: "openai:gpt-4o",
      tools: [getRate],
      middleware: [toolCallLimitMiddleware({ runLimit: 1 })],
    });
    await expect(limited.invoke({
      messages: [{ role: "user", content: "帮我查 USD/CNY 和 EUR/CNY，然后相加。" }] }),
    ).rejects.toThrow();                             // 两次调用 > limit=1 → ToolCallLimitExceededError
  });
});
\`\`\`

三组断言各验收一条改造线：协议组验证「AgentAction 消失、消息流自足」（tool_call_id 关联与最终 ai 回答都在状态里）；错误组验证「回喂语义保真 + 重试真实生效」——特别是第三条用一个计数器工具直接观测到第二次调用发生，这是旧架构难以做到的重试可见性；预算组验证限流闸真的会拦。全部转绿后，AgentExecutor 世界观在应用里的最后一块存量也清零了。三堂走查至此闭环：RAG、对话、工具——下一课给无替代 API 的长期共存决策树，为整个迁移模块收尾。

验收套件还有两个补强点值得写进工程规范。其一，预算组的软档位断言：第五节讲过 exitBehavior 默认是 "continue"（超限工具被错误 ToolMessage 替换、agent 继续跑），这类软拦截的行为断言不应写 rejects.toThrow，而应断言消息流里出现了超限错误文案且最终回答正常产出——软行为的验收目标是「agent 自愈」，硬中断断言反而会误报。其二，流式观测的回归价值：第三节 stream 观测脚本 \`steps\` 数组的形状（agent → tools → agent 交替）本身就是回归断言素材——迁移后任何 middleware 组合改动，重跑这段脚本对比节点序列与 tool_calls 名称，就能低成本验证循环行为没有漂移。把这两个补强点固化成测试模板，后续加 toolEmulator、换模型、调限流参数时都有现成验收面。

### 五、toolCallLimitMiddleware 源码走读：thread/run 双层计数与 exitBehavior

第二节的 \`toolCallLimitMiddleware({ runLimit: 6 })\` 是语义示意，真正落地前值得把它的配置面走读一遍——它比旧 maxIterations 多出来的维度都在这里。配置 schema（toolCallLimit.ts:130-160 附近的 ToolCallLimitOptionsSchema）四个字段：

| 字段 | 含义 | 旧架构对应物 |
|---|---|---|
| toolName | 限定单一工具的限流（缺省限全部工具） | 无——旧计数器全局一刀切 |
| threadLimit | 每 thread 累计上限（跨多次 invoke 累计） | 无 |
| runLimit | 每次 invoke 内的上限 | maxIterations 的语义对应 |
| exitBehavior | 超限行为："continue"（默认）/ "error" / "end" | 无——旧版只有「停下」一种 |

实现内部用 stateSchema 维护 threadToolCallCount/runToolCallCount 两个计数（同名 middleware 文件内，紧随 schema 之后），全部工具的计数聚合在 \`__all__\` 键下（DEFAULT_TOOL_COUNT_KEY）。exitBehavior 的三档语义直接决定验收断言怎么写："continue"（默认）不中断执行，把超限的工具调用替换成错误 ToolMessage 喂回模型让 agent 自己调整——对应 L123 验收里「拦截后模型如实告知」的软行为；"error" 抛 ToolCallLimitExceededError（:78 的类定义，携带 threadCount 等现场数据，:116-117）——对应硬中断断言；"end" 立即结束执行并注入收尾消息，多工具并行时抛 NotImplementedError。第二节验收代码里 \`rejects.toThrow()\` 走的是 "error" 档——如果照抄默认配置跑同一个断言会失败，因为默认是 "continue" 软拦截。这个细节是「旧开关 → middleware」迁移的典型暗坑：**同名概念（限流）在新架构里有行为分档，照搬旧数字还要显式选对档位**。

顺手补一条重试件的运行时细节：toolRetryMiddleware 的两个旧别名在实现体里被显式归一化并警告（toolRetry.ts:179-189——"raise" → "error"、"return_message" → "continue"，各打印一条 ⚠️ 弃用提示）。如果存量代码在迁移前用了这些别名，新架构不会报错但会警告——迁移清单里把它们列为「必改项」，别让弃用警告在生产日志里长期存在。

### 本课小结

- 旧工具 Agent 的四个隐式面（全局错误开关、单一计数器、隐藏中间步骤、AgentAction 协议）在新形态分别变成：toolErrorMiddleware 作用域化回喂、toolCallLimitMiddleware + recursionLimit 双层预算、stream 默认可见的消息流、tool_calls 直驱。
- middleware 顺序是行为本身：[limit, retry, error] 的包裹关系决定「先重试后兜错」；顺序颠倒会让重试失效（toolError.ts:60-63 官方规约）。
- 错误回喂要按官方安全规约改写：标识错误类型、不透传原始错误文本（toolError.ts:55-57）——迁移顺手升级安全。
- 验收三组断言里最有价值的是「重试可见性」：计数器工具让重试行为从猜测变成断言。
`,
    null,
    [
      {
        text: '走查中旧 AgentExecutor 的 maxIterations = 15（executor.ts:367）翻译成新架构的哪两层？',
        options: [
          'createAgent({ maxIterations: 15 })',
          '图级 recursionLimit（invoke 配置）+ 工具级 toolCallLimitMiddleware 两层，按语义拆分而非同名照搬',
          'toolRetryMiddleware 的 maxAttempts',
          'summarizationMiddleware 的 tokenLimit',
        ],
        answer: 1,
        explain:
          'L115 的映射结论：旧计数器数的是「循环圈数≈工具往返数」，语义上更接近工具级预算（toolCallLimitMiddleware，middleware/index.ts:48-51 导出），而图级 recursionLimit 兜住整个执行图的步数上限。两层各管一段，旧开关的单一数字反而被拆成了两个可独立配置的维度。A 错：createAgent 无此参数；C 错：maxAttempts 管单次工具失败后的重试次数，不是全程预算；D 错：那是上下文长度参数。',
        concept: 'lc-walkthrough-agent',
      },
      {
        text: 'handleParsingErrors: "Tool failed..."（字符串回喂）在 toolErrorMiddleware 里的等价写法是？',
        options: [
          'onError: true',
          'onError: () => "Tool failed, please retry with valid arguments."——返回 MessageContent 即转成错误 ToolMessage 喂回模型（toolError.ts:17-28 的 ToolErrorHandler 契约）',
          'onError: (e) => { throw e }',
          '没有等价物，错误必须中断',
        ],
        answer: 1,
        explain:
          'ToolErrorHandler 签名 (error, request) => MessageContent | void（toolError.ts:17-23）：返回内容 → 错误被转成错误 ToolMessage 送回模型继续循环（旧 true/string 语义）；返回 void → 原样抛出（旧 false 语义）。三态开关被一个函数类型的返回值形态完整承接。C 错：抛出等价于旧 false，与「回喂」语义相反。',
        concept: 'lc-walkthrough-agent',
      },
      {
        text: '官方对 toolError 与 toolRetry 的组合顺序给出的规约是？',
        options: [
          '顺序无关',
          '要先「重试后兜错」：toolRetryMiddleware({ onFailure: "error" }) 放在 toolErrorMiddleware 之后（toolError.ts:60-63 官方注释）',
          'retry 必须在最外层',
          '两者不能组合',
        ],
        answer: 1,
        explain:
          'toolError.ts:60-63 的 JSDoc 原话：To retry before handling an error, place toolRetryMiddleware({ onFailure: "error" }) after this middleware——middleware 数组顺序 = 包裹内外层，error 在内层先看到「重试穷尽后仍抛出的错误」，retry 在外层先拦住原始错误进行重试。A/C 错：顺序直接决定行为；D 错：这正是官方设计的组合形态。',
        concept: 'lc-walkthrough-agent',
      },
      {
        text: '走查断言「AgentAction 消失」的依据是什么？',
        options: [
          '新 agent 的循环不产出任何中间结构',
          '旧协议下模型动作经解析器变成 AgentAction/AgentFinish 再驱动 executor；新 agent 直接消费 AIMessage.tool_calls，消息流即过程记录（stream 默认可见），解析器层不存在',
          'AgentAction 改名了',
          '类型还在 core，只是不导出',
        ],
        answer: 1,
        explain:
          'L113 的结论：AgentAction/AgentFinish 是 classic 消费的兼容类型（classic agents/index.ts:100-104），1.x 的 AgentNode 直接读 tool_calls 字段执行工具，每一步的结果以 ToolMessage 形态留在 messages 状态里——「过程即消息流」，不需要也不存在平行的动作结构。C/D 错：类型未改名，core 里仍导出但仅服务 classic。',
        concept: 'lc-walkthrough-agent',
      },
    ],
    [
      [
        'toolCallLimitMiddleware',
        '工具调用次数预算闸（middleware/toolCallLimit.ts）：可全程计数或按工具名分别计数，超限抛 ToolCallLimitExceededError',
      ],
      [
        'onFailure',
        'toolRetryMiddleware 的穷尽策略（toolRetry.ts:30-59）："error" 重抛 / "continue" 回喂错误详情 / 自定义函数定制文案；"raise"/"return_message" 是已废弃别名',
      ],
      [
        'recursionLimit',
        'LangGraph 图级步数上限（invoke 配置）：超限抛 GraphRecursionError，是旧 earlyStoppingMethod "force" 的新对应物',
      ],
    ],
    [
      '把旧 handleParsingErrors 直接搬成 onError 的错误原文回喂——toolError.ts:55-57 官方注释提醒：返回内容应标识错误类型而不携带原始错误文本（可能含敏感内部信息），旧字符串开关没有这个安全意识',
      '以为 toolRetry 的默认 onFailure: "continue" 会抛错——默认是回喂错误详情让 agent 继续跑（toolRetry.ts:31-33）；期望「失败即停」必须显式传 onFailure: "error"',
      '按名字把 maxIterations 翻译成 recursionLimit 就完事——两者的计数对象不同（图步 vs 工具往返），照搬数字会出现预算失真；按语义拆两层',
    ],
  ),
  'practice',
)
