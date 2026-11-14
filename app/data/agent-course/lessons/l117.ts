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
      '理解「自然语言 → SQL / 查询」的数据 Agent 管线',
      '掌握 Text-to-SQL 的 schema 注入与结果校验',
      '认识「让 Agent 查数」比「让 Agent 写报告」更危险的边界',
    ],
    `
### 数据 Agent 的经典形态：Text-to-SQL

数据 Agent 让用户用自然语言问「上季度各区域销售额」，Agent 翻译成 SQL、执行、再解释结果。它把 Function Calling（L38）用到了「查询工具」上，并把「数据库 schema」作为工具的上下文注入。

\`\`\` title="Text-to-SQL 最小管线" note="关键：schema 注入 + 只读约束 + 结果上限，缺一不可。"
// ① schema 注入：让模型知道有哪些表/列
const schema = \\\`表 orders(id, region, amount, created_at)
表 users(id, name)\\\`

// ② 生成 SQL（限制只读）
const sql = await model.generate(\\\`
  你是数据分析助手。schema:
\\\${schema}
  用户问题: \\\${q}
  只生成一条只读 SELECT，不要 DML。\\\`)

// ③ 执行（只读账号 + 超时 + 行数上限）
const rows = await db.query(sql, { readOnly: true, timeout: 5s, maxRows: 1000 })

// ④ 结果解释
const answer = await model.generate(\\\`数据: \\\${JSON.stringify(rows)}
用一句话回答: \\\${q}\\\`)
\`\`\`

:::deep

### 查数比写报告更危险

数据 Agent 直接触碰真实数据库，风险远高于「写一段文字」：一条错误的 DELETE / UPDATE 或一条没加 LIMIT 的笛卡尔积查询就能造成生产事故。所以它的安全边界（L40/L85）要拉满：只读账号、白名单表、超时、行数上限、结果脱敏。

:::

### 数据 Agent 的安全清单

- 数据库用只读账号，物理上禁写。
- SQL 语法校验 + 表名白名单 + 禁用危险关键字。
- 执行加超时与最大行数限制。
- 结果脱敏（隐藏手机号 / 身份证等 PII）后再进上下文（L87）。
- 让模型解释结果，而不是直接丢表格。

:::tip

### schema 是「查数」的 prompt 核心

Text-to-SQL 的准确率很大程度上取决于 schema 注入得清不清楚：表名、列名、类型、外键关系、几条示例值。与其反复调 prompt，不如把 schema 描述做扎实。

:::

`,
    null,
    [
      {
        text: '数据 Agent 的经典形态是？',
        options: ['Text-to-SQL', 'RAG', '语音合成', '图像识别'],
        answer: 1,
        explain: '自然语言 → SQL → 执行 → 解释。',
        concept: 'data-agent',
      },
      {
        text: '为什么数据 Agent 比写报告更危险？',
        options: ['SQL 更难', '直接触碰真实数据库，错误查询可造成生产事故', 'token 更贵', '没人用'],
        answer: 1,
        explain: '数据 Agent 直接操作真实数据，风险高。',
        concept: 'data-agent',
      },
      {
        text: 'Text-to-SQL 的 prompt 核心是？',
        options: ['更长的提问', '清晰的 schema 注入', '更大的温度', '更贵的模型'],
        answer: 1,
        explain: 'schema 描述质量决定准确率。',
        concept: 'data-agent',
      },
    ],
    [
      ['Text-to-SQL', '自然语言翻译成 SQL 查询'],
      ['schema 注入', '把表 / 列结构作为上下文喂给模型'],
      ['只读账号', '物理上禁止写操作的数据库连接'],
    ],
    ['给数据 Agent 一个可写的数据库账号，事故风险极大。', '不做行数上限 / 超时，一条慢查询拖垮库。'],
  ),
  'scenario',
)
