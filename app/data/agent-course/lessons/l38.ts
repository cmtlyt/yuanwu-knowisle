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
      '理解 Function Calling 的协议：tools 声明、tool_calls 返回、tool 结果回填',
      '厘清「模型只填参数、不执行工具」的职责边界',
      '认识协议层的三种失败与对应的防御手段',
    ],
    `
### 从「让模型输出 JSON」说起

在 Function Calling 普及之前，让模型调工具的做法是：在提示词里写清格式，要求它输出 \`{"tool":"search","args":{...}}\`，然后在代码里 \`JSON.parse\`。

这套做法能跑，但失败率高得惊人：模型会在 JSON 前后加解释（「好的，我来搜索：」）、会用单引号、会把数字写成字符串、会在嵌套对象里少一个括号。于是每个项目都长出一套「容错解析器」——剥围栏、找第一个 \`{\`、补括号、猜字段名。

Function Calling 把这件事从「提示词约定」变成了**协议**：你把工具清单连同 JSON Schema 一起传给模型，模型返回结构化的 \`tool_calls\` 字段，而不是一段需要解析的文本。解析器那套东西基本可以删掉了。

理解这个协议，是后面所有工具设计的基础。

### 一次完整的往返：五步

\`\`\`ts title="Function Calling 的完整往返" note="注意第 4 步：工具结果要作为 role: 'tool' 的消息回填，且必须带 tool_call_id 对上号。"
// ① 声明工具：JSON Schema 描述参数
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，如「北京」' },
          unit: { type: 'string', enum: ['c', 'f'], description: '温度单位' },
        },
        required: ['city'],
      },
    },
  },
]

// ② 调用：把工具清单与消息一起送出
const res = await client.chat({ messages, tools, tool_choice: 'auto' })

// ③ 模型返回：可能带 tool_calls，也可能直接给文本
// res = {
//   finish_reason: 'tool_calls',
//   message: {
//     role: 'assistant',
//     content: null,
//     tool_calls: [{ id: 'call_a1', function: { name: 'get_weather', arguments: '{"city":"北京"}' } }],
//   },
// }

// ④ 由你的代码执行工具，把结果以 tool 角色回填
for (const tc of res.message.tool_calls ?? []) {
  const args = JSON.parse(tc.function.arguments) // arguments 是字符串，不是对象
  const out = await registry.run(tc.function.name, args)
  messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) })
}

// ⑤ 再调一次，模型基于工具结果继续
const final = await client.chat({ messages, tools })
\`\`\`

五步里有三个容易出错的地方：

**第一，\`arguments\` 是字符串，不是对象。** 协议规定它是 JSON 编码后的字符串，你需要自己 \`JSON.parse\`。很多人第一次接 FC 时会写成 \`tc.function.arguments.city\`，拿到 \`undefined\`。

**第二，\`tool_call_id\` 必须对得上。** 回填结果时如果 id 错了或漏了，模型无法把「这次结果」和「刚才那个调用」关联起来。多工具并行时这个 id 是唯一的区分依据。

**第三，\`finish_reason\` 是判断依据。** \`'tool_calls'\` 表示「这一轮它想调工具」，\`'stop'\` 表示「它给出了最终回答」。用它而不是「\`tool_calls\` 数组是否非空」来判断，能在边界情况（模型同时给了文本和空数组）下更稳。

### 职责边界：模型只填参数

协议最容易误解的一点是「模型调用了工具」。它没有。模型做的事情只有一件：**输出一个「工具名 + 参数」的结构化请求**。

真正的执行永远在你的代码里。这条边界带来两个推论：

- **模型无法绕过你的校验**。它说「删除所有记录」，你的 \`delete_records\` 实现仍然可以要求二次确认。权限、配额、审计全在执行侧。
- **模型不知道执行结果**，除非你回填。它不会「看到」数据库返回了什么——它只看到你写进 \`role: 'tool'\` 消息的那段文本。

这条边界是 L40 的安全设计基础：**所有安全控制都在执行侧，不在提示词里**。

### 与「手写 JSON 解析」的真实差异

| 维度 | 手写 JSON 解析 | Function Calling |
|---|---|---|
| 格式保证 | 靠提示词 + 容错解析 | 协议层约束，通常是 grammar 级解码 |
| 工具名 | 可能拼错或编造 | 限定在声明的枚举内（多数实现） |
| 并行调用 | 需自己设计语法 | 协议原生支持多个 \`tool_calls\` |
| 出错表现 | 解析失败、字段错位 | \`arguments\` 类型错、缺必填字段 |
| 可观测性 | 一段文本 | 结构化的调用记录（id / name / args） |

「grammar 级解码」值得展开：多数 provider 在生成时会用 JSON Schema 约束采样（constrained decoding），即在每个 token 位置上屏蔽掉不合法选项。这让「输出不是合法 JSON」的概率大幅下降——但它不等于零，原因见下面的深水区。

:::deep

### 为什么「协议保证」不等于「一定正确」

即使有 schema 约束，\`arguments\` 仍可能出问题，原因有四类：

**① 约束的是语法，不是语义。** Schema 能保证 \`{"city":"..."}\` 结构正确，但保证不了「city 的值是个真实城市」。模型可能填 \`"北京朝阳区"\`、\`"Bei Jing"\`、甚至 \`"未知"\`——这些在语法上合法，在语义上不可用。

**② 约束的是类型，不是范围。** \`type: "number"\` 不限制大小。模型可以填 \`2019\`（年份）给一个期望「数量」的字段。

**③ 枚举也不足够。** 你声明 \`enum: ['c','f']\`，模型大概率选对，但它也可能在中文语境下填 \`"摄氏度"\`——取决于 provider 对 enum 的约束强度。

**④ 多工具的 schema 会互相干扰。** 工具数量多时（比如 30 个），模型可能选错工具、或把 A 工具的参数格式套到 B 上。这不是协议问题，是上下文里的「工具清单过长」导致的注意力问题。

结论是：**协议消除了「解析失败」，但没有消除「参数不可用」**。所以执行侧必须有校验（类型、范围、必填），校验失败时回填一条明确的错误让模型修正——这条通路就是 L36 里 \`validate\` 与 \`recordFailure\` 的用武之地。

:::

### 三种失败与防御

**失败一：编造工具名。** 模型返回一个你没声明的工具（\`get_weather_v2\`）。防御：执行前查注册表，未命中时回填「未知工具，可用工具是……」——不要静默忽略，否则模型会以为调用成功了。

**失败二：参数不可用。** 上面深水区讲过。防御：执行前跑 schema 校验（运行时校验，不是只靠声明），失败时回填具体缺什么。

**失败三：该调不调。** 模型选择直接回答而不是调工具，给出一个基于「记忆」的答案。防御：在系统提示里写清「涉及实时数据必须调工具」，并在评测里加「必须调用指定工具」的断言。

第三种最隐蔽，因为它不报错、答案还挺像。它的检出依赖评测（L77）而不是单元测试。

### 一个最小但完整的执行环

把上面的步骤收成一个函数，可以直接接进 L36 的运行时：

\`\`\`ts title="执行环：校验 → 执行 → 回填" note="未命中工具与参数非法都走同一条回填通道，模型下一轮就能自我修正。"
interface ToolDef {
  name: string
  schema: { required?: string[]; properties?: Record<string, { type: string }> }
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export async function executeToolCalls(
  calls: { id: string; function: { name: string; arguments: string } }[],
  registry: Map<string, ToolDef>,
): Promise<{ role: 'tool'; tool_call_id: string; content: string }[]> {
  const out: { role: 'tool'; tool_call_id: string; content: string }[] = []

  for (const c of calls) {
    const def = registry.get(c.function.name)
    if (!def) {
      out.push({
        role: 'tool',
        tool_call_id: c.id,
        content: \`ERROR 未知工具 \${c.function.name}，可用：\${[...registry.keys()].join(', ')}\`,
      })
      continue
    }

    let args: Record<string, unknown>
    try {
      args = JSON.parse(c.function.arguments || '{}')
    } catch {
      out.push({ role: 'tool', tool_call_id: c.id, content: 'ERROR 参数不是合法 JSON' })
      continue
    }

    const missing = (def.schema.required ?? []).filter((k) => args[k] === undefined)
    if (missing.length) {
      out.push({
        role: 'tool',
        tool_call_id: c.id,
        content: \`ERROR 缺少必填参数：\${missing.join(', ')}\`,
      })
      continue
    }

    try {
      const data = await def.run(args)
      out.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(data) })
    } catch (e) {
      out.push({ role: 'tool', tool_call_id: c.id, content: 'ERROR ' + (e as Error).message })
    }
  }
  return out
}
\`\`\`

注意所有失败路径都返回 **\`role: 'tool'\` 的普通消息**，而不是抛异常。这不是「吞掉错误」，而是「把错误变成模型能读到的观测」——它下一轮就能换个工具名、补上参数，或告诉你「这个工具不能做这件事」。

:::warn

### 别把工具清单当「文档」写

一个常见误区：把所有工具都塞进一次请求，觉得「反正模型自己会选」。

工具清单是上下文的固定成本，而且会稀释注意力。30 个工具、每个 200 token 的 schema，就是 6000 token 的固定开销，每一轮都要付一次。更糟的是，工具越多，选错的概率越高。

实用的做法是**按场景分组加载**：客服场景只加载订单/物流/退款三个工具；数据分析场景只加载查询/绘图两个。这叫「工具集路由」，是 L45 的主题。现在只需记住：**工具清单不是越长越强，越长越容易选错、越贵**。

:::

### 收束：协议解决了格式，schema 决定了可用性

Function Calling 把「模型输出格式」这件事标准化了：你不再需要容错解析器，也不再需要教模型写 JSON。但它只解决了**格式**，没解决**可用性**——参数填得对不对、工具选得准不准、该不该调，仍然取决于你的 schema 设计与执行侧校验。

L39 就讲 schema：怎么描述参数才能让模型填对，尤其是那些「模型总是填错」的字段该怎么处理。

`,
    null,
    [
      {
        text: 'Function Calling 中模型实际做的事情是？',
        options: [
          '执行工具并返回结果',
          '输出「工具名 + 参数」的结构化请求，执行永远在代码侧',
          '修改工具注册表',
          '直接访问数据库',
        ],
        answer: 1,
        explain: '模型只填参数，不执行；结果靠 role: tool 回填。',
        concept: 'function-calling',
      },
      {
        text: '`tool_calls` 里的 `arguments` 是什么类型？',
        options: ['对象', 'JSON 编码的字符串，需要自己 parse', '数组', '数字'],
        answer: 1,
        explain: '协议规定是字符串，直接取属性会得到 undefined。',
        concept: 'function-calling',
      },
      {
        text: '回填工具结果时 `tool_call_id` 的作用是？',
        options: ['用于计费', '把结果与对应调用关联，多工具并行时是唯一区分依据', '用于排序', '用于鉴权'],
        answer: 1,
        explain: 'id 错或漏会导致模型无法关联结果。',
        concept: 'function-calling',
      },
      {
        text: '为什么 schema 约束不能保证参数「可用」？',
        options: [
          'schema 太短',
          '约束的是语法与类型，不保证语义、范围与业务有效性',
          '模型不读 schema',
          'schema 只能用于文本',
        ],
        answer: 1,
        explain: '合法 JSON 里可能填「未知」这种语法正确但不可用的值。',
        concept: 'function-calling',
      },
      {
        text: '工具清单过长的主要代价是？',
        options: ['编译变慢', '固定 token 开销 + 注意力稀释导致选错工具', '日志变多', '无法并行'],
        answer: 1,
        explain: '按场景分组加载（工具集路由）是常见解法。',
        concept: 'function-calling',
      },
    ],
    [
      ['tool_calls', '模型返回的结构化调用请求，含 id / name / arguments'],
      ['tool_call_id', '把工具结果与具体调用关联的标识'],
      ['constrained decoding', '用 schema 在采样时屏蔽不合法 token 的做法'],
      ['工具集路由', '按场景只加载相关工具，降低开销与误选'],
    ],
    [
      '以为模型「执行了工具」，把权限校验放进提示词。',
      '`arguments` 当对象直接取属性，得到 undefined。',
      '未命中工具或参数非法时静默忽略，模型以为调用成功。',
    ],
  ),
  'theory',
)
