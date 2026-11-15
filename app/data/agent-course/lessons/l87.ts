import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 14 ========== */

export const L87 = withKind(
  L(
    'L87',
    14,
    '多租户下的记忆与数据隔离',
    2,
    ['L53'],
    ['tenant-isolation'],
    [
      '用存储分区、检索时过滤、上下文隔离三层，避免跨租户串数据',
      '说清「检索后过滤」与「检索时过滤」的决定性差别',
      '用跨租户探测自动化验证隔离，并列出四个最常被漏掉的路径',
    ],
    `
### 「我上次说的那个项目」

一个面向多家企业的助手支持记忆：用户可以说「跟上次那个项目一样处理」，Agent 会检索历史对话。

某天一个用户问「我上次说的那个项目现在怎么样」，Agent 回答里出现了**另一家公司**的项目代号与预算数字。

排查结果是三行代码：

\`\`\`ts
const hits = await vectorStore.search(queryEmbedding, { topK: 10 }) // 没有租户过滤
const mine = hits.filter((h) => h.tenantId === ctx.tenantId) // 检索后才过滤
\`\`\`

看起来「过滤了」，但问题有三层：检索阶段把别家数据拉进了内存（日志、异常堆栈、APM 采样都可能带出去）；如果过滤后为空，某些实现会回退到「未过滤结果」；以及最要命的——\`topK: 10\` 里如果有 8 条是别家的，属于本条租户的那 2 条就被挤出了窗口，于是「检索不到自己的记忆」与「看到别人的记忆」成了同一个 bug 的两面。

### 三层隔离

| 层 | 隔离什么 | 实现方式 | 漏了的后果 |
| --- | --- | --- | --- |
| 存储层 | 物理或逻辑分区 | 独立库 / 独立 schema / 行级 tenantId + 强制策略 | 一处漏查就全量泄漏 |
| 检索层 | 相似度搜索的候选集 | 检索**时**带 tenantId 过滤（不是检索后） | 别家数据进入内存与日志 |
| 上下文层 | 送进模型的内容 | 按会话隔离的消息历史、工具结果、记忆片段 | 模型看到不该看的，输出泄漏 |

三层里，第一层是基础（没有它，第二层无从过滤），第二层是最容易做错的一层（下面详述），第三层是最后一道（也是唯一能保证「模型没看见」的一层）。

### 检索时过滤 vs 检索后过滤

这个区别值得单独用一节讲，因为它是向量检索场景里最常见的设计错误。

| 做法 | 过程 | 正确性 | 性能 |
| --- | --- | --- | --- |
| 检索时过滤（pre-filter） | 先按 tenantId 缩小候选集，再算相似度 | 正确 | 候选集小，更快 |
| 检索后过滤（post-filter） | 全库检索 topK，再按 tenantId 丢掉 | 不安全 | topK 需要放大，更慢 |

「检索后过滤」有三个具体问题：

1. **数据已经越界**。向量被读进了进程内存，任何一层日志、APM 采样、异常堆栈都可能记录它。安全边界不是「返回给用户」那一刻，而是「数据被读取」那一刻。
2. **topK 语义被破坏**。全库 topK 再过滤，返回条数不确定——可能 10 条里 0 条是自己的。为了保证召回，实现者往往把 topK 放大到 100，于是越界的数据更多。
3. **回退诱惑**。过滤后为空时，「友好」的实现会回退到未过滤结果。这一行回退代码就是完整的数据泄漏。

支持 pre-filter 的向量库通常提供 \`filter\` 或 \`namespace\` 参数；不支持的（纯内存索引、部分嵌入式库）需要按租户分索引——这也是选型时该核的一条硬指标。

:::deep

### 为什么应用层过滤不可靠

即使每一处都写了 \`where tenantId = ?\`，仍然会漏。原因是**过滤条件是一个需要人工重复的约定**，而人会忘。

三类典型遗漏：

**第一类，新增的查询路径。** 有人加了一个「导出全部记忆」的功能，写查询时忘了加租户条件。它在测试环境（单租户）永远正确。

**第二类，间接访问。** 通过 id 查详情（\`getById(memoryId)\`）时，id 本身来自别处。如果 id 是全局唯一的，那么「猜到/拿到别人的 id」就能读到别人的数据——这类攻击叫 IDOR（不安全直接对象引用），在多租户系统里是最常见的越权方式。

**第三类，聚合与统计。** 「本月最常问的问题」这类统计查询，往往忘了按租户分组，结果把全平台的统计返回给了单个租户。

三类的共同解法是**把租户条件下沉到数据访问层，强制注入**：

\`\`\`ts title="强制租户的存储层"
export interface Ctx {
  tenantId: string
  userId: string
}

/** 只能通过 withTenant 拿到仓储，构造函数不暴露 */
class TenantRepo {
  private constructor(
    private db: Db,
    private tenantId: string,
  ) {}

  static for(ctx: Ctx, db: Db): TenantRepo {
    if (!ctx.tenantId) throw new Error('缺少租户上下文，拒绝构造仓储')
    return new TenantRepo(db, ctx.tenantId)
  }

  async getMemory(id: string) {
    // 租户条件由仓储注入，调用方无法「忘记」
    return this.db.query('select * from memories where id = ? and tenant_id = ?', [id, this.tenantId])
  }

  async listMemories(limit: number) {
    return this.db.query('select * from memories where tenant_id = ? order by at desc limit ?', [this.tenantId, limit])
  }
}
\`\`\`

关键在 \`private constructor\` 与 \`static for(ctx)\`：**没有 ctx 就拿不到仓储**。这把「记得加条件」从约定变成了类型系统的强制——新增查询方法时不带 \`tenant_id\` 会被 code review 直接看出（因为方法里没有可用它拼条件的东西）。

更强的做法是数据库层行级安全（RLS）：连接时设置 \`app.tenant_id\`，由数据库策略自动过滤。这样即使应用层写错 SQL 也读不到别家数据。代价是需要数据库支持，且连接池要小心（不能把不同租户的连接复用）。

:::

### 四个最常被漏掉的路径

即使存储与检索都做对了，这四个地方仍会串数据：

| 路径 | 为什么会漏 | 修法 |
| --- | --- | --- |
| 缓存 | key 只用了 query 或 userId，没带 tenantId | 所有缓存 key 前缀租户；或按租户分区 |
| 向量索引 | 全租户共用一个索引且不支持 pre-filter | 按租户分索引 / 用支持 filter 的库 |
| 日志与追踪 | span 里记了 prompt 全文（L73） | 记摘要而非全文，或按租户加密 |
| 会话 id | 用自增或可预测 id，跨租户碰撞 | 全局随机 id + 每次访问校验归属 |

第三项最能说明「隔离不只是数据库的事」：一个租户的数据可能通过运维人员的日志查询界面被另一个租户的客服看到（如果权限没做）。L53 讲过的「已删账号但向量索引还在」属于同一族问题——数据在多个地方有副本，隔离要覆盖每一个副本。

:::warn

### 缓存是最高危的一层

缓存的问题在于它**绕过了所有下游检查**。存储层有 RLS、检索有 pre-filter、输出有护栏——但缓存命中时，这些都不执行。

两类典型事故：

**第一类，key 设计漏维度。** \`cache[query] = answer\` 在多租户下必然串数据，因为同一个 query 在不同租户下答案不同（数据不同、政策不同）。正确做法是 \`cache[tenantId + ':' + query]\`，且把租户作为不可省略的第一个维度。

**第二类，跨租户预热。** 有些系统为了「提升首次体验」会预先计算热门问题的答案。如果预计算时用了全平台数据，缓存内容本身就已经混合了多个租户的信息。

防御原则只有一条：**缓存的 key 必须包含「决定答案的所有输入」**，租户是其中最重要的一个。这条原则在单租户系统里看起来多余，在多租户系统里是唯一有效的防线。

:::

### 用探测验证隔离

隔离不能靠「代码看起来对」来确认，必须用自动化测试探测。三种探测覆盖大部分漏点：

\`\`\`ts title="跨租户探测"
export interface Probe {
  name: string
  /** 以 A 租户身份执行一个动作，返回它拿到的原始数据 */
  actAsA: () => Promise<unknown>
  /** 判断返回里是否含 B 租户的标记 */
  leaks: (out: unknown, markerOfB: string) => boolean
}

export async function probeIsolation(
  probes: Probe[],
  markerOfB: string,
): Promise<{ name: string; leaked: boolean }[]> {
  const results = []
  for (const p of probes) {
    const out = await p.actAsA()
    results.push({ name: p.name, leaked: p.leaks(out, markerOfB) })
  }
  return results
}

// 三个必备探测（markerOfB 是 B 租户数据里独一无二的串）
export const PROBES: Probe[] = [
  {
    name: '按 id 直取',
    actAsA: () => repo.getMemory(bTenantMemoryId), // 用 B 的 id
    leaks: (out) => out !== null && out !== undefined, // 拿到任何东西就算泄漏
  },
  {
    name: '语义检索',
    actAsA: () => search('预算 项目 计划', { topK: 5 }), // 用 B 的话题做查询
    leaks: (out, marker) => JSON.stringify(out).includes(marker),
  },
  {
    name: '缓存命中',
    actAsA: async () => {
      await actAsB('预算 项目 计划') // 先让 B 填充缓存
      return actAsA('预算 项目 计划') // 再用同一 query 以 A 身份取
    },
    leaks: (out, marker) => JSON.stringify(out).includes(marker),
  },
]

declare function actAsA(q: string): Promise<unknown>
declare function actAsB(q: string): Promise<unknown>
declare function search(q: string, o: { topK: number }): Promise<unknown>
declare const repo: { getMemory(id: string): Promise<unknown> }
declare const bTenantMemoryId: string
\`\`\`

三段探测对应三种最常见的越权路径：**直接对象引用**（用别人 id）、**检索串数据**（用别人的话题查）、**缓存串数据**（别人先查过）。

第三段最容易被忽略，也最容易被漏掉——它需要「先以 B 身份执行一次」才能构造出来，而大多数隔离测试只做单向检查。

这套探测应当进 CI：每次改动存储层、检索层、缓存层都跑一遍。它的成本很低（三条用例），但能挡住影响最大的那类 bug——跨租户数据泄漏一旦发生，通常意味着需要对外通报。

### 与 L53 的分工

L53 讲的是单个用户的数据生命周期：存哪里、怎么删、删了之后索引与备份怎么办。这一课讲的是**边界**：数据在租户之间不能流动。

两者会在同一个地方交汇：删除。删除时要同时处理「该租户的所有副本」与「其他租户不受影响」——前者是 L53 的题目，后者是本课的题目。一个既跨租户又删不干净的实现，是这两类 bug 的叠加。

### Stage 14 收束

五课构成四道纵深：L83 讲清「输入不可信」这一前提，L84 给三层防御，L85 从能力侧收窄（即使被说服也做不成），L86 守住出口（说出来的每一句），L87 守住边界（数据不能跨租户）。

一条贯穿的判断：**安全靠结构，不靠检测**。检测（注入模型、护栏规则、审计日志）是必要的补充，但真正让攻击「做不成」的是权限、隔离与出站控制。凡是「靠模型自己不去做」的防线，都要假设它某天会失效。
`,
    null,
    [
      {
        text: '「检索后过滤」的核心问题是？',
        options: [
          '速度慢',
          '数据已被读进内存（日志 / APM 都可能带出），且 topK 语义被破坏、易回退到未过滤结果',
          '代码复杂',
          '不支持向量库',
        ],
        answer: 1,
        explain: '安全边界是「数据被读取」那一刻，不是「返回给用户」那一刻。',
        concept: 'tenant-isolation',
      },
      {
        text: '把租户条件下沉到存储层的具体做法是？',
        options: [
          '写文档要求每人加条件',
          '私有构造 + `static for(ctx)`，没有租户上下文就构造不出仓储',
          '加日志审计',
          '定期扫描 SQL',
        ],
        answer: 1,
        explain: '把「记得加条件」从人工约定变成类型系统强制。',
        concept: 'tenant-isolation',
      },
      {
        text: '缓存为什么是最高危的一层？',
        options: [
          '缓存易失效',
          '命中时绕过所有下游检查（RLS / pre-filter / 护栏都不执行）',
          '缓存占内存',
          '缓存不可删除',
        ],
        answer: 1,
        explain: 'key 必须包含「决定答案的所有输入」，租户是最重要的一个维度。',
        concept: 'tenant-isolation',
      },
      {
        text: '隔离探测里「缓存命中」这条用例为什么需要先以 B 身份执行一次？',
        options: [
          '为了测性能',
          '不先让 B 填充缓存，就无法构造出「A 命中 B 的缓存」这个场景',
          '为了初始化数据',
          '为了让测试更慢',
        ],
        answer: 1,
        explain: '单向检查发现不了缓存串数据，这是最常被漏掉的探测。',
        concept: 'tenant-isolation',
      },
    ],
    [
      ['跨租户串数据', '一个租户的数据出现在另一个租户的上下文或回答里'],
      ['pre-filter', '检索前先按租户缩小候选集，与检索后过滤相对'],
      ['IDOR', '用全局唯一的对象 id 直接取数据而绕过归属校验'],
      ['跨租户探测', '以 A 身份执行动作、检查是否拿到 B 的数据，用于自动化验证隔离'],
    ],
    [
      '向量检索全库 topK 后再过滤，别家数据已进入内存与日志。',
      '缓存 key 只含 query 不含 tenantId，同一问题跨租户串答案。',
      '新增导出 / 统计查询时漏掉租户条件，测试环境因单租户而永远正确。',
    ],
  ),
  'theory',
)
