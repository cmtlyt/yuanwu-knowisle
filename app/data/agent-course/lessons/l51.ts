import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 7 ========== */

export const L51 = withKind(
  L(
    'L51',
    7,
    '结构化记忆：让 Agent「记得你说过的话」',
    2,
    ['L48'],
    ['structured-memory'],
    [
      '理解「结构化记忆」与「向量记忆」的区别',
      '掌握把用户偏好/事实抽取成结构化字段的方法',
      '认识结构化记忆在个性化上的价值',
    ],
    `
### 把「零散的话」变成「可查询的字段」

用户说过「我讨厌番茄」「我住在杭州」「我是后端工程师」——这些是零散的。结构化记忆把它们**抽取成字段**（偏好 / 位置 / 职业），需要时精确取出，而不是全文模糊搜索。

\`\`\` title="结构化记忆的存取" note="关键：结构化 = 精确字段，能按 key 取、能更新、能校验，而非模糊全文。"
// ① 抽取：从对话里提取结构化事实
const facts = await extractFacts(conversation)
//   → { dislikes: ["番茄"], location: "杭州", role: "后端工程师" }

// ② 存储：按 key 精确存取
memory.set("user:location", "杭州")
memory.set("user:dislikes", ["番茄"])

// ③ 使用：需要时精确取出，注入 prompt
const profile = memory.getProfile()
const answer = await client.chat([
  { role: "system", content: "用户画像：" + JSON.stringify(profile) },
  { role: "user", content: "推荐一家餐厅" },  // 会自动避开番茄、优先杭州
])
\`\`\`

:::deep

### 结构化 vs 向量记忆

向量记忆擅长「语义相似」（找出相关片段）；结构化记忆擅长「精确事实」（用户到底叫什么、住哪）。两者互补：事实用结构化，知识用向量，关系用图。

:::

### 结构化记忆的注意点

- 字段要稳定：预定义 schema，避免字段随意增长。
- 事实要可更新：用户改了偏好，要覆盖旧值而非叠加。
- 要可校验：抽取结果应能人工或规则校验，避免抽错。

:::warn

### 别抽得太细

不是每句话都值得结构化。只有「会反复用到、需要精确」的事实才入字段；一次性闲聊不值得占字段。

:::

`,
    null,
    [
      {
        text: '结构化记忆与向量记忆的区别是？',
        options: ['没有区别', '结构化存精确字段，向量存语义相似片段', '结构化更快', '向量更精确'],
        answer: 1,
        explain: '精确事实用结构化，语义相似用向量。',
        concept: 'structured-memory',
      },
      {
        text: '结构化记忆「可更新」指？',
        options: ['只增不删', '用户改偏好时覆盖旧值而非叠加', '不能改', '自动增长'],
        answer: 1,
        explain: '事实要能覆盖更新。',
        concept: 'structured-memory',
      },
      {
        text: '哪类信息值得结构化？',
        options: ['所有闲聊', '会反复用到、需要精确的事实（位置/偏好/职业）', '一次性的', '错误信息'],
        answer: 1,
        explain: '只抽反复用、需精确的事实。',
        concept: 'structured-memory',
      },
    ],
    [
      ['结构化记忆', '抽取成精确字段、可按 key 存取的事实'],
      ['事实抽取', '从对话中提取结构化字段的过程'],
      ['用户画像', '由结构化字段组成的用户信息集合'],
    ],
    ['把所有闲聊都结构化，字段爆炸、维护失控。', '偏好只增不覆盖，用户改口后旧偏好仍生效。'],
  ),
  'practice',
)
