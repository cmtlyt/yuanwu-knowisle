import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L117 = withKind(
  L(
    'L117',
    23,
    '数据 Agent：说人话查数',
    2,
    ['L42', 'L49'],
    ['data-agent'],
    [
      '跑通「自然语言 → 口径选择 → 参数化查询 → 结果校验」的数据 Agent 管线',
      '实现语义层渲染器与只读执行闸，把不可写和口径唯一落成代码',
      '写出错数验收清单，能区分安全边界与正确性边界',
    ],
    `
### 一句没写错的 SQL，让报表多了 12%

运营在群里问「上季度各区域销售额怎么样」，数据 Agent 生成了一条语法完全正确、执行零报错、只读账号也没拦的查询：按 \`orders.created_at\` 过滤上季度，按 \`region\` 分组求和 \`amount\`。数字出来了，看板也刷新了。三周后财务对账发现销售额比口径多 12%——退款单、取消单、内部测试单全被算了进去，还有一批跨季度的订单因为按创建时间而不是支付时间归期，落错了季度。

复盘时最难受的一点是：这条链路上**没有任何一个组件「出错」**。模型没胡说，SQL 没报错，数据库没被写，权限没越界，结果也不是空的。错的是「销售额」这三个字在业务里有一套没人写进代码的口径，而模型只能从表名和列名去猜。数据 Agent 里的第一约束因此不是「别让它写库」，而是**口径唯一**：让模型选中一个已经定好的口径，而不是让它自由拼装查询。本课就围绕这条约束把管线重搭一遍。

### 三类失效，三种完全不同的防线

| 失效类型 | 典型表现 | 现有防线能否拦住 | 该补的防线 |
|---|---|---|---|
| 写操作 | 生成 \`DELETE\` / \`UPDATE\`，或注释里夹带 DML | 只读账号能拦，属于「能不能」 | 账号隔离 + 语句类型白名单 |
| 资源失控 | 漏掉 \`LIMIT\` 的笛卡尔积、全表扫描 | 只读账号拦不住 | 超时、行数上限、执行计划预估 |
| 口径错误 | SQL 合法、结果非空，但算错了对象/时间/过滤条件 | **所有安全防线都拦不住** | 语义层 + 金标准回归 + 结果校验 |

第三行是这一课真正要解决的问题。L85 的最小权限把「能不能」这条轴做到满分，也依然会对 12% 的偏差毫无知觉——因为它管的是权限，不是定义。**安全边界和正确性边界是两条轴，别用一条的成就感替代另一条的验收。**

### 语义层：让模型选口径，而不是拼表

把「销售额」「活跃用户」「复购率」这类业务概念固化成带版本的定义，模型只输出三样东西：口径 id、维度、时间范围。SQL 由服务端按模板渲染出来，模型不接触表名、不自由写 \`WHERE\`、不决定归期字段。这一步把「生成 SQL」降级成「填几个可枚举的参数」，好处是可测、可审计、可回归——你能对「模型有没有选对口径」写断言，但很难对「模型有没有写出正确的 SQL」写穷尽的断言。

\`\`\`ts title="语义层定义与参数化渲染器" note="要点：模型只产出 metricId / dims / range，SQL 由服务端模板渲染；口径定义带 version 与 owner，便于追溯是谁改的。"
type MetricId = 'sales_amount' | 'active_users' | 'repurchase_rate'

type MetricDef = {
  id: MetricId
  version: string
  owner: string
  baseSql: string
  dateColumn: string
  defaultFilters: string[]
  unit: 'CNY' | 'count' | 'percent'
}

const METRICS: Record<MetricId, MetricDef> = {
  sales_amount: {
    id: 'sales_amount', version: 'v3', owner: 'finance',
    baseSql: 'SELECT {dim}, SUM(amount) AS value FROM orders',
    dateColumn: 'paid_at',
    defaultFilters: ["status = 'PAID'", 'refunded = 0', 'is_test = 0'],
    unit: 'CNY',
  },
  active_users: {
    id: 'active_users', version: 'v2', owner: 'growth',
    baseSql: 'SELECT {dim}, COUNT(DISTINCT user_id) AS value FROM events',
    dateColumn: 'event_date', defaultFilters: ["event_type = 'OPEN'"],
    unit: 'count',
  },
  repurchase_rate: {
    id: 'repurchase_rate', version: 'v1', owner: 'growth',
    baseSql: 'SELECT {dim}, AVG(reordered) AS value FROM user_rollup',
    dateColumn: 'stat_month', defaultFilters: ['cohort_size >= 100'],
    unit: 'percent',
  },
}

const ALLOWED_DIMS = new Set(['region', 'channel', 'month'])

function renderMetric(input: { metricId: string; dim: string; from: string; to: string }) {
  const def = METRICS[input.metricId as MetricId]
  if (!def) throw new Error('unknown metric: ' + input.metricId)
  if (!ALLOWED_DIMS.has(input.dim)) throw new Error('dim not allowed: ' + input.dim)
  const sql = def.baseSql.replace('{dim}', input.dim)
    + ' WHERE ' + def.dateColumn + ' >= $1 AND ' + def.dateColumn + ' < $2'
    + ' AND ' + def.defaultFilters.join(' AND ')
    + ' GROUP BY ' + input.dim + ' ORDER BY value DESC LIMIT 200'
  return { sql, params: [input.from, input.to], version: def.version, unit: def.unit }
}
\`\`\`

注意 \`paid_at\` 而不是 \`created_at\`：那条 12% 的偏差里有一半来自归期字段选错，而它现在写在口径定义里，由财务签字，模型无权改。版本号的用处是当口径变更时，历史回答能标明「按 v2 口径」，避免同一句话在不同月份给出不可比的数字。

:::deep
### 为什么这一层必须放在服务端

有人会问：把口径写进 prompt 不也一样吗？不一样。写进 prompt 的定义是**建议**，模型可以忽略、可以改写、可以在长上下文里被稀释；写进服务端渲染器的定义是**约束**，模型连绕过的路径都没有。更关键的是可测性——\`renderMetric('sales_amount','region',…)\` 是一个纯函数，可以进单元测试、可以进 L80 的回归基线；而「prompt 里那段话模型这次听没听」只能靠抽检。

这和 L86 输出护栏是同一个思路：**凡是能写成确定性校验的规则，就不要交给模型的注意力**。模型擅长的是把「上季度各区域」映射成 \`{metricId:'sales_amount', dim:'region', from:'2026-07-01', to:'2026-10-01'}\` 这一步语义理解，剩下的都应该由代码接管。
:::

### 执行闸：只读之外还要有五道

语义层解决了「查什么」，执行层还要解决「怎么查才不会把库拖垮、把脏数据带回来」。下面是一个最小但完整的执行闸，每一道都对应一类真实事故：

\`\`\`ts title="只读执行闸" note="要点：语句类型白名单、表白名单、参数化、超时、行数上限、结果校验，六项缺一不可。"
const ALLOWED_TABLES = new Set(['orders', 'events', 'user_rollup'])
const FORBIDDEN = /\\b(insert|update|delete|drop|truncate|alter|create|grant|copy)\\b/i

function assertSafeSql(sql: string) {
  const compact = sql.replace(/\\s+/g, ' ').trim()
  if (!compact.toUpperCase().startsWith('SELECT')) throw new Error('only SELECT allowed')
  if (FORBIDDEN.test(compact)) throw new Error('DML/DDL keyword found')
  if (compact.includes(';')) throw new Error('no multi-statement')
  const tables = [...compact.matchAll(/\\b(?:FROM|JOIN)\\s+([a-z_]+)/gi)].map((m) => m[1])
  if (tables.some((t) => !ALLOWED_TABLES.has(t))) throw new Error('table not allowed: ' + tables.join(','))
  if (!/\\bLIMIT\\s+\\d+/i.test(compact)) throw new Error('missing LIMIT')
}

type QueryResult = { rows: Record<string, unknown>[]; unit: string; version: string }

async function safeExec(input: { metricId: string; dim: string; from: string; to: string }): Promise<QueryResult> {
  const { sql, params, version, unit } = renderMetric(input)
  assertSafeSql(sql)
  const client = await readonlyPool.connect() // 只读账号：物理上无写权限
  try {
    await client.query('SET LOCAL statement_timeout = 5000')
    const res = await client.query('SET LOCAL default_transaction_read_only = on')
    void res
    const out = await client.query(sql, params)
    if (out.rows.length > 200) throw new Error('row limit exceeded')
    validateResult(out.rows, unit)
    return { rows: out.rows, unit, version }
  } finally {
    client.release()
  }
}

function validateResult(rows: Record<string, unknown>[], unit: string) {
  if (rows.length === 0) throw new Error('empty result: 需要区分「真没有」和「过滤条件写错」')
  for (const r of rows) {
    if (r.value === null || Number.isNaN(Number(r.value))) throw new Error('null/NaN in value')
    if (unit === 'CNY' && Number(r.value) < 0) throw new Error('negative amount')
  }
}
\`\`\`

六道里最容易被跳过的是 \`validateResult\`。空结果必须区分「这个区域上季度真的没单」和「过滤条件把所有行都滤掉了」——这两种情况在界面上都是「暂无数据」，但后者是 bug。做法是给每个口径配一条探测查询（不带业务过滤的同期总量），两者同时为零才允许回答「没有数据」。

### 查完不等于答完：结果校验的三层

| 层次 | 检查什么 | 不通过时怎么处理 |
|---|---|---|
| 结构性 | 行数、空值率、单位、负数、上限截断 | 抛错重试或换口径，不交给模型解释 |
| 一致性 | 同一参数重跑结果是否相同、总量与分组求和是否吻合 | 标记「数据波动」，禁止给结论 |
| 业务性 | 同比/环比波动是否超阈值、是否有新出现的维度值 | 只陈述数字，附「请人工复核」标签 |

第三层直接连到 L86：模型很擅长把「销售额同比涨了 400%」解释成「活动效果显著」，而真实原因往往是新接入了一个渠道的数据。**异常值不允许由模型自动归因**，这不是提示词能约束住的，得在执行层把「波动超阈值」变成一条结构化标记，让生成阶段只能复述、不能发挥。

还有一条容易忘的：L90 的语义缓存在这里风险最高。「A 产品保修多久」答错只是一次投诉，「上季度销售额」被缓存成错数，会顺着所有看板和下游报表污染好几周。所以带时间范围的查数请求要么不缓存，要么把 \`metricId + version + 时间范围 + 数据版本号\` 一起放进 key，并在上游数据变更时主动失效。

:::warn
### 两个必踩的坑

- **把全库 schema 一股脑塞进 prompt**。几十张表、几百列，模型只会挑名字最像的那张，准确率反而下降，还把无关表的列名带进 SQL。正确做法是只注入当前问题相关的口径定义与维度枚举，把「猜表」这个动作整个删掉。
- **让模型自己解释异常波动**。它会编出一个听起来很合理的业务原因，而人很难逐条去证伪。异常只能标记、不能归因，归因要回到数据侧查来源。
:::

### 错数验收清单（可写成回归用例）

\`\`\`ts title="金标准回归：把「口径对不对」变成断言" note="要点：固定问题集 + 金标准结果，断言 metricId、SQL 安全性、数值误差三项。"
const GOLDEN = [
  { q: '上季度各区域销售额', metricId: 'sales_amount', dim: 'region', expect: 8_420_000 },
  { q: '最近三个月各渠道活跃用户', metricId: 'active_users', dim: 'channel', expect: 132_400 },
  { q: '华东区复购率', metricId: 'repurchase_rate', dim: 'region', expect: 0.238 },
]

async function runGoldenCase(c: typeof GOLDEN[number]) {
  const pick = await model.classifyIntent(c.q) // 只输出 metricId/dim/range
  if (pick.metricId !== c.metricId || pick.dim !== c.dim) {
    throw new Error('口径选择错误: ' + c.q + ' -> ' + JSON.stringify(pick))
  }
  const { sql } = renderMetric(pick)
  assertSafeSql(sql) // 安全性断言
  const out = await safeExec(pick)
  const total = out.rows.reduce((s, r) => s + Number(r.value), 0)
  const err = Math.abs(total - c.expect) / c.expect
  if (err > 0.001) throw new Error('数值偏离金标准: ' + (err * 100).toFixed(2) + '%')
  return { version: out.version, unit: out.unit, rows: out.rows.length }
}
\`\`\`

这三条断言分别盯住三个不同环节：口径选择（语义理解）、SQL 安全（权限边界）、数值一致（口径定义）。把 Goldens 接进 L81 的 Eval harness，每次改口径定义、换模型、动 prompt 都跑一遍——**数据 Agent 的回归必须包含数字，只断言「回答里有没有出现销售额」是没用的**。

### 与相邻课的分工

- **L42 / L38**：工具调用与 Function Calling 的通用机制，本课只把它收敛成「选口径 + 填参数」这一种工具形态。
- **L49 / L50**：RAG 检索与重排，解决「找文档」；数据 Agent 查的是结构化数据，难点在口径而非召回。
- **L85 / L86**：最小权限管「能不能」、输出护栏管「说什么」，本课补上它们都不管的「算得对不对」。
- **L90**：语义缓存，本课的结论是带时间范围的查数默认不缓存。
- **L77 / L81**：评测维度与 harness，本课的金标准断正是它们在查数场景的具体化。

**一句话收束**：数据 Agent 不是「让模型会写 SQL」，是「让模型没有机会写 SQL」。
`,
    null,
    [
      {
        text: '报表比财务口径多 12%，SQL 无报错、只读账号也没拦，最可能的原因是什么？',
        options: ['模型幻觉', '口径错误（退款单/测试单/归期字段）', '数据库主从延迟', 'token 超限'],
        answer: 1,
        explain: '安全边界管「能不能」，口径管「对不对」，两条轴互不覆盖。',
        concept: 'data-agent',
      },
      {
        text: '语义层把「生成 SQL」降级成了什么？',
        options: [
          '生成执行计划',
          '填可枚举的参数（口径 id / 维度 / 时间范围）',
          '生成自然语言解释',
          '生成缓存 key',
        ],
        answer: 1,
        explain: '参数可枚举才可测、可审计、可回归。',
        concept: 'data-agent',
      },
      {
        text: '结果同比涨了 400%，正确的处理是？',
        options: ['让模型给出业务归因', '标记异常并请人工复核，只陈述数字', '直接隐藏该行', '调高温度重跑'],
        answer: 1,
        explain: '异常值不允许由模型自动归因，要在执行层变成结构化标记。',
        concept: 'data-agent',
      },
    ],
    [
      ['语义层（semantic layer）', '把业务口径固化成带版本的定义，模型选口径而非拼 SQL'],
      ['只读执行闸', '语句类型/表白名单/超时/行数上限/结果校验的组合防线'],
      ['金标准回归', '固定问题集 + 期望数值，把「口径对不对」变成断言'],
    ],
    [
      '把全库 schema 一股脑塞进 prompt，模型会挑名字最像的表，准确率反降。',
      '给带时间范围的查数结果做语义缓存，错数会污染所有下游报表。',
    ],
  ),
  'scenario',
)
