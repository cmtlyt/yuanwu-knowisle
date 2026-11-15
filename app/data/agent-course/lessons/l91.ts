import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 15 ========== */

export const L91 = withKind(
  L(
    'L91',
    15,
    '提示裁剪与上下文复用',
    3,
    ['L33'],
    ['prompt-pruning'],
    [
      '按可重建性给上下文分层，判断哪条能丢、哪条必须留',
      '掌握静态裁剪四种手段各自的失效模式',
      '写一个带 pinned 保护与预算的分层裁剪器',
      '用前缀稳定性诊断 prefix caching 命中率',
    ],
    `
### 省了 70% 的成本，多了三倍投诉

上线前我们做了一次「上下文瘦身」：把平均 60k token 的会话压到 8k，成本降了 70%，报表很漂亮。两周后客服投诉涨了三倍，翻聊天记录发现同一个模式——用户第三轮明确说过「别打电话，只发邮件」，到第十二轮 Agent 又殷勤地问「方便留个电话吗，我们电话沟通更高效」。

原因很土：裁剪逻辑是「保留最近 8 条消息」。那条约束在第 3 轮，早就滑出窗口了。

这个事故的教训不是「别裁剪」，而是**裁剪前必须知道自己删的是什么**。省钱指标和体验指标之间，隔着一层判断：这条内容丢了以后，Agent 还能不能自己重新拿到？

### 先给上下文分三类

| 层 | 典型内容 | 能否重建 | 裁剪策略 |
|---|---|---|---|
| 契约层 | 系统提示词、工具 schema、输出格式约定 | 否 | 不动，任何情况下不参与预算竞争 |
| 事实层 | 用户原话、明确约束、已确认的决策与数值 | 否 | 只压缩表达，不删事实；关键项打 pin |
| 可重建层 | 工具返回的原始数据、检索片段、日志 | 能 | 优先整条丢弃，留下「可按需重取」的引用 |

分层的判据只有一条：**丢了之后 Agent 能不能自己重新拿到？** 能拿到的是可重建层，随便丢；拿不到的就是事实，动它就是在删记忆。

按这个标准，那 60k 里大概 40k 是可重建层的工具返回——这部分才是真正该砍的，而我们当时砍的是事实层。

### 静态裁剪的四把刀，各有各的失效方式

| 手段 | 做法 | 省的量 | 典型失效 |
|---|---|---|---|
| 结果截断 | 工具返回只留前 N 字符 | 最大 | 报错信息通常在末尾，被砍掉后模型以为调用成功 |
| 历史滑窗 | 只保留最近 K 条 | 大 | 早期否定型约束被挤掉（就是我们那次事故） |
| 示例精简 | few-shot 从 8 条减到 2 条 | 中 | 被删的往往是边界样例，格式开始回退 |
| 指令去重 | 合并语义重复的规则 | 小 | 两条「看起来重复」的规则其实带例外，合并后例外消失 |

前两个是「按位置删」，后两个是「按语义删」。按位置删安全边界清晰但会误伤事实层，按语义删省得少但误伤更隐蔽——去重之后系统提示词更短更清爽，可那条唯一被删掉的例外，可能正是上次线上事故的补丁。

### 写一个分层裁剪器

与其写一堆 if，不如把三类层做成三个预算桶，按桶淘汰：

\`\`\`ts title="分层预算裁剪器" note="要点：整条丢而不是截断；被丢的可重建层留引用；pinned 不参与预算竞争。"
type Msg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  pinned?: boolean                 // 事实层受保护项：用户约束、已确认决策
  rebuild?: () => Promise<string>  // 可重建层：知道怎么重新取回来
}

const BUDGET = { facts: 12000, rebuildable: 8000 }

function pruneContext(msgs: Msg[], budget = BUDGET): Msg[] {
  const contract = msgs.filter((m) => m.role === 'system')
  const pinned = msgs.filter((m) => m.pinned && m.role !== 'system')
  const rest = msgs.filter((m) => !m.pinned && m.role !== 'system')

  // ① 可重建层：整条丢弃，只留一句「需要时可重取」
  const dropped = rest.filter((m) => m.rebuild)
  const facts = rest.filter((m) => !m.rebuild)

  // ② 事实层：从新到旧填预算，放不下就停，绝不截断单条
  let used = 0
  const kept: Msg[] = []
  for (const m of [...facts].reverse()) {
    if (used + m.content.length > budget.facts) break
    used += m.content.length
    kept.unshift(m)
  }

  // ③ 丢掉的工具结果必须留痕，否则模型会认为「这些数据从未存在过」
  const refs = dropped.map(
    (m) => '[dropped:tool:' + m.content.length + 'chars，需要时重新调用]',
  )
  const refMsg: Msg[] = refs.length
    ? [{ role: 'user', content: refs.join('\\n') }]
    : []
  return [...contract, ...pinned, ...refMsg, ...kept]
}

// 模型按引用发起重取时，真正把内容取回来补进上下文
export async function expandByRef(msgs: Msg[], marker: string): Promise<Msg[]> {
  const target = msgs.find((m) => m.rebuild && m.content.includes(marker))
  if (!target?.rebuild) return msgs
  return [...msgs, { role: 'tool', content: await target.rebuild() }]
}
\`\`\`

三个设计决定的理由：

- **整条丢而不是截断单条**。截断会制造「看起来完整、实际残缺」的内容，模型没有任何理由怀疑它（下一节细说）。
- **丢掉的要留 ref**。什么都不留，模型会重新盲目调用一遍工具；留一行引用，它知道数据存在、只是不在手边。
- **pinned 不进预算循环**。受保护项如果也参与「从新到旧填」，预算紧张时它照样会被挤掉，pin 就成了摆设。

### 动态裁剪：按相关性挑历史

静态裁剪按位置删，太粗。更精准的做法是把历史消息当检索库，按当前任务的相关性挑 top-K 回填。

但它有一个系统性偏差：**否定型约束在向量空间里几乎没有重量**。「别用邮件」「不要报价」「不能承诺发货时间」这几句，字面短、语义稀疏，和当前任务「帮用户查订单」的相似度天然很低，于是每轮都在 top-K 之外——而它们恰恰是绝对不能丢的。

三种堵法，从便宜到贵：

1. 正则 pin：命中「不要 / 别 / 禁止 / 不能 / 务必 / 只能」的消息无条件进 pinned 桶。
2. 打标：写入时给消息标 \`kind: 'constraint'\`，检索候选池直接排除这类，改成全量常驻。
3. 结构化：把约束抽成一份独立的 \`constraints\` 字段挂在会话上，每轮都渲染进契约层——约束从此不属于「历史」，自然不会被裁剪。

第三种最贵也最稳：约束一旦结构化，就不再依赖任何裁剪算法的正确性。我们事故后改成了这个方案，代价是每轮多花约 200 token。

### prefix caching：不是删，是不重复算

裁剪是「少发」，前缀复用是「发了但不算第二次」。provider 对请求的前缀做 KV 缓存，命中部分按更低价格计费（常见量级是未命中的 10%~25%，各家不同），首 token 延迟也明显下降。

收益完全取决于一件事：**前缀是否逐字节稳定**。以下任意一项混进前缀，命中率归零：

- 系统提示词里拼了当前时间、\`requestId\`、随机会话 ID
- 工具 schema 按注册顺序序列化，而注册顺序来自 Map 迭代顺序
- 前缀里有 \`JSON.stringify(obj)\`，键序随对象构造过程变化
- 多租户场景把 \`tenantId\` 拼在最前面——每个租户一份缓存，命中率被租户数整除

\`\`\`ts title="稳定前缀的写法" note="要点：静态内容在前、变量在后；序列化必须规范化。"
// ✅ 稳定前缀：内容与顺序都固定，跨请求逐字节一致
const TOOL_CATALOG = [...tools].sort((a, b) => a.name.localeCompare(b.name))

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return (
      '{' +
      Object.keys(o)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k]))
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(v) ?? 'null'
}

const STABLE_PREFIX = [
  SYSTEM_PROMPT,                       // 不含时间戳、不含 requestId
  stableStringify(TOOL_CATALOG),       // 排序后序列化，不随注册顺序变
  POLICY_DOC,
].join('\\n\\n')

function buildRequest(userTurn: string) {
  return [
    { role: 'system', content: STABLE_PREFIX },  // 不变的部分一律在前
    { role: 'user', content: userTurn },         // 变量只在最后
  ]
}

// 自检：同一前缀连发两次，第二次的 cached_tokens 应为 0 才算失效
export async function checkPrefixHit(probe: (body: unknown) => Promise<any>) {
  const body = buildRequest('ping')
  await probe(body)
  const second = await probe(body)
  return second?.usage?.cached_tokens ?? 0
}
\`\`\`

这个自检值得写进上线检查单：连续发两次同前缀请求，第二次的 \`cached_tokens\`（字段名各家不同）必须是正数。是 0 就说明前缀不稳，别再往下调参了，先查是谁往里面塞了时间戳。

### 省 token 不能省判据

判据（criterion）是**决定下一步动作所必需的最小事实集**。裁剪的正确姿势是围着判据做减法，而不是围着长度做减法。开工前问四句：

1. 这一步要判断什么？（选工具 / 决定是否结束 / 生成答案）
2. 做这个判断需要哪些字段、数值、原话？
3. 这些内容能重建吗？
4. 不能重建的，有没有被 pin 住？

四句都过一遍，会发现问题很少出在「历史太长」，而是出在「判据从来没被显式写下来」——它散落在提示词、历史消息、工具返回三处，你当然不知道怎么删才安全。

一句话收口：**裁剪的对象应该是「已经用过且不会再用的内容」，不是「看起来长的内容」。**

:::deep
### 为什么截断比删除更危险

删除是显式的：模型看到「这里少了东西」，会主动去补、去问、去重取。截断是隐式的：模型看到一段看起来完整、实际残缺的内容，它没有任何线索怀疑。

真实的例子。工具返回一个 8KB 的 JSON，我们只保留前 2000 字符，于是 \`{"orders": [...], "total": 47}\` 被砍成了 \`{"orders": [...]\`。模型读到的信息是「这是一份订单列表，没有汇总」——它很自然地自己数了一遍列表长度，数错了，然后把错误的订单数写进了回复。整个链路里没有任何一环报错。

两条硬规则：

- **截断必须带哨兵**：在截断处插入明确的 \`…[truncated 6000 chars]\`，让「不完整」这件事被模型看见。
- **优先保留尾部**：错误信息、汇总字段、分页游标几乎都在末尾；从头截是最差的选择。

对比一下：删除一条消息的成本是「模型少了一条信息，它知道自己少了」；截断的成本是「模型多了一条错误信息，且它以为是对的」。后者难查十倍。
:::

:::warn
### 裁剪必须可观测、可回放

至少记三个数：\`prunedTokens\`、\`droppedMessageIds\`、\`pinnedCount\`。

没有这三个数，线上出现「Agent 突然不记得我说过什么」时，你只能靠猜。我们那次事故花了三天才定位到是滑窗把第 4 轮的用户约束挤掉了——因为日志里只记了最终 token 数，没记丢了哪几条。补上 \`droppedMessageIds\` 之后，同类问题平均半小时定位。

顺带一条：裁剪函数必须是纯函数、幂等、可回放。给定同一份消息列表，跑两次得到同一结果；给一份历史快照，能离线重放出当时的上下文。否则你复现不了任何与裁剪相关的 bug。
:::

### 与相邻课的分工

- **L33** 讲窗口满了怎么办的总体策略与预算模型（多少留给系统、多少留给历史）。本课讲具体怎么删、删完怎么复用，是 L33 的执行层。
- **L90** 讲缓存 key 设计、语义缓存误命中。本课的 prefix caching 只管一件事：前缀稳定性。两者是不同层次的缓存，别混。
- **L89** 讲路由选哪个模型。裁剪与复用不改变「谁回答」，只改变「同一模型下花多少」。
`,
    null,
    [
      {
        text: '判断一条消息能否丢弃，唯一标准是？',
        options: ['它有多长', '丢了之后 Agent 能否自己重新拿到', '它是第几轮的', '它是不是工具返回'],
        answer: 1,
        explain: '可重建性。能重建的是可重建层随便丢，拿不回来的就是事实，动它等于删记忆。',
        concept: 'prompt-pruning',
      },
      {
        text: '以下哪项改动会让 prefix caching 命中率直接归零？',
        options: [
          '把用户这轮的问题改短',
          '在系统提示词里拼上当前时间戳',
          '把输出格式从 JSON 改成 Markdown',
          '减少 few-shot 示例数量',
        ],
        answer: 1,
        explain: '前缀要求逐字节稳定，时间戳每次都变，整段前缀无法命中。requestId、随机键序同理。',
        concept: 'prompt-pruning',
      },
      {
        text: '动态裁剪（按相关性挑历史）最容易漏掉哪类消息？',
        options: [
          '很长的工具返回',
          '否定型约束，如「不要打电话，只发邮件」',
          '最近一轮的用户提问',
          '系统提示词',
        ],
        answer: 1,
        explain:
          '否定句字面短、语义稀疏，与当前任务相似度天然偏低，每轮都排在 top-K 之外，而它们恰恰最不能丢。',
        concept: 'prompt-pruning',
      },
      {
        text: '为什么截断工具返回比整条删除更危险？',
        options: [
          '截断更费 token',
          '模型看到的是看起来完整、实际残缺的内容，没有线索怀疑它',
          '截断会报错',
          '删除无法回滚',
        ],
        answer: 1,
        explain: '删除是显式的缺口，截断是隐式的错误。被砍掉汇总字段的 JSON，模型会自己数一遍然后数错。',
        concept: 'prompt-pruning',
      },
    ],
    [
      ['契约层', '系统提示词、工具 schema、输出格式，永不参与裁剪预算'],
      ['事实层', '用户原话、约束、已确认决策，不可重建，只能压缩表达'],
      ['可重建层', '工具返回、检索片段，可整条丢弃并留引用'],
      ['pinned', '受保护消息，不进预算竞争，永不被淘汰'],
      ['判据 criterion', '决定下一步动作所必需的最小事实集'],
      ['prefix caching', '复用逐字节稳定的请求前缀，降低计费与首 token 延迟'],
    ],
    [
      '用「保留最近 N 条」当唯一裁剪手段，早期用户约束被挤掉，Agent 反复违背已声明的偏好。',
      '截断工具结果不留哨兵、不留尾部，模型把残缺数据当完整数据用，静默算错。',
      '系统提示词里拼时间戳或 requestId，prefix caching 命中率归零却以为在省钱。',
      '裁剪函数不记 droppedMessageIds，线上「Agent 失忆」无法定位、无法复现。',
    ],
  ),
  'theory',
)
