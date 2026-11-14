import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L38 = withKind(
  L(
    'L38',
    5,
    'Function Calling 是怎么工作的',
    2,
    ['L36'],
    ['function-calling'],
    [
      '理解 Function Calling 的「模型产出结构化调用」机制',
      '区分 Function Calling 与「解析模型文本」的本质差异',
      '掌握一次完整 Function Calling 的请求-响应-回填闭环',
    ],
    `
### 让模型「叫」工具，而不是「写」工具名

前面 ReAct 里模型用「文本」写 Action（\\\`Action: search(...)\\\`），靠正则解析，脆弱。Function Calling 让模型直接产出**结构化的工具调用**（工具名 + JSON 参数），不再依赖自由文本解析。

\`\`\` title="Function Calling 的闭环" note="关键差异：模型不再「写一个看着像工具名的字符串」，而是产出受 Schema 约束的结构化调用。"
// ① 请求：把工具 Schema 告诉模型
const res = await client.chat({
  messages,
  tools: [{ type: "function", function: {
    name: "search_weather",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  }}],
})

// ② 响应：模型返回结构化的 tool_calls，而非自由文本
// res.choices[0].message.tool_calls = [
//   { id: "call_1", function: { name: "search_weather", arguments: "{\\\\"city\\\\":\\\\"北京\\\\"}" } }
// ]

// ③ 执行 + 回填：执行工具，把结果以 role:"tool" 回填
messages.push({ role: "tool", tool_call_id: "call_1", content: "晴 18°C" })
\`\`\`

:::deep

### Function Calling vs 文本解析

文本解析（ReAct 的 Action）是「猜字符串格式」；Function Calling 是「模型按你给的 JSON Schema 产出参数」。后者更可靠，因为：① 参数受 Schema 约束；② 有唯一 tool_call_id 关联；③ 模型被训练成产出合法 JSON。

:::

### Function Calling 三件事

- 声明工具：告诉模型有哪些工具、每个参数什么类型。
- 解析调用：从响应里取 tool_calls（名字 + JSON 参数）。
- 回填结果：执行后以 tool role 回填，模型再决定下一步。

:::warn

### 参数仍是 JSON 字符串

\\\`arguments\\\` 字段是 JSON **字符串**，不是对象。拿到后要 \\\`JSON.parse\\\`，且要容错（模型偶尔仍会产出不合法的 JSON）。

:::

`,
    null,
    [
      {
        text: 'Function Calling 相对文本解析 ReAct 的核心优势是？',
        options: ['更快', '模型按 JSON Schema 产出结构化调用，更可靠', '更省 token', '不需要工具'],
        answer: 1,
        explain: '结构化调用受 Schema 约束、有唯一 id 关联。',
        concept: 'function-calling',
      },
      {
        text: 'Function Calling 的 `arguments` 字段是？',
        options: ['对象', 'JSON 字符串，需 JSON.parse 并容错', '数组', '二进制'],
        answer: 1,
        explain: '是 JSON 字符串，需解析且容错。',
        concept: 'function-calling',
      },
      {
        text: '一次 Function Calling 的三件事是？',
        options: ['声明、解析、回填', '加密、解密、签名', '训练、推理、部署', '增、删、改'],
        answer: 0,
        explain: '声明工具、解析调用、回填结果。',
        concept: 'function-calling',
      },
    ],
    [
      ['tool_calls', '模型返回的结构化工具调用列表'],
      ['JSON Schema', '描述工具参数结构与类型的声明'],
      ['tool role', '回填工具结果所用的消息角色'],
    ],
    [
      '仍用正则解析模型文本，忽略了 Function Calling 的结构化优势。',
      '把 arguments 当对象直接用，忘了它其实是 JSON 字符串。',
    ],
  ),
  'practice',
)
