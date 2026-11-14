import { L } from '../../course-builders.ts'

/* ========== Stage 15 ========== */

export const L91 = L(
  'L91',
  15,
  '提示裁剪与上下文复用',
  12,
  3,
  ['L33'],
  ['prompt-pruning'],
  [
    '理解提示裁剪「只留有用的」的核心',
    '掌握静态裁剪与动态裁剪两种方式',
    '认识上下文复用（prefix caching）的省成本价值',
  ],
  `
### 能省的 token，一分钱都别多花

提示裁剪（prompt pruning）是删掉对当前任务无用的内容：无关的示例、过时的历史、多余的指令。上下文复用（prefix caching）则是「不变的前缀不重复计费/重复计算」。

\`\`\` title="静态 vs 动态裁剪" note="关键：静态裁剪简单但粗，动态裁剪精准但要检索成本。"
// ① 静态裁剪：按规则删掉无用部分
function prune(messages: Message[]): Message[] {
  return messages
    .filter((m) => m.role !== "tool" || isRelevant(m))  // 删无关工具结果
    .slice(-MAX_RECENT)                                  // 只留最近 N 条
}

// ② 动态裁剪：按相关性检索保留
const relevant = await retrieveRelevant(messages, currentTask)
const pruned = [systemPrompt, ...relevant, currentTask]  // 只拼相关的
\`\`\`

:::deep

### prefix caching：复用不变前缀

很多请求共享同一个「系统提示词 + 长文档」前缀。prefix caching 让这部分前缀只计算一次、后续请求复用，能显著降低延迟与成本。这是「裁剪」的另一种形态——不是删，而是「不重复算」。

:::

### 裁剪的三个目标

- 省 token：删无用内容，降低单次成本。
- 保精度：删错了会丢关键信息，裁剪要精准。
- 降延迟：上下文更短，响应更快。

:::warn

### 裁剪过度 = 失忆

裁剪太狠（尤其删掉关键的工具结果或历史决策），Agent 会「失忆」，做出前后矛盾的决策。裁剪是「精准删」，不是「随便删」。

:::

`,
  null,
  [
    {
      text: '静态裁剪与动态裁剪的区别是？',
      options: ['没区别', '静态按规则删、动态按相关性检索保留', '静态更准', '动态更慢'],
      answer: 1,
      explain: '静态粗、动态准。',
      concept: 'prompt-pruning',
    },
    {
      text: 'prefix caching 的价值是？',
      options: ['删内容', '复用不变前缀，只算一次，降延迟省成本', '加内容', '加密'],
      answer: 1,
      explain: '复用不变前缀。',
      concept: 'prompt-pruning',
    },
    {
      text: '裁剪过度的后果是？',
      options: ['更省', 'Agent 失忆，做出前后矛盾决策', '更快', '更准'],
      answer: 1,
      explain: '裁剪过度 = 失忆。',
      concept: 'prompt-pruning',
    },
  ],
  [
    ['提示裁剪', '删掉对当前任务无用的内容'],
    ['静态裁剪', '按规则删除（最近 N 条等）'],
    ['prefix caching', '复用不变前缀、只算一次'],
  ],
  ['裁剪太狠删掉关键工具结果，Agent 失忆。', '忽视 prefix caching，重复计算共享前缀。'],
)
