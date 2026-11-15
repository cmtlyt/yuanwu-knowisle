import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 14 ========== */

export const L85 = withKind(
  L(
    'L85',
    14,
    '工具最小权限与沙箱隔离',
    26,
    ['L40'],
    ['least-privilege'],
    [
      '按「能力 → 资源 → 动作」三级拆细工具权限，并按会话收窄',
      '区分读授权与写授权，说清为什么它们不能合并',
      '对照四种沙箱形态的隔离强度与逃逸面',
    ],
    `
### 一个叫 read_query 的工具删了表

某团队给数据分析 Agent 提供了一个工具 \`read_query(sql)\`，注释写着「只读查询」。实现是：

\`\`\`ts
async function readQuery(sql: string) {
  return db.query(sql) // 同一个连接池，同一个数据库账号
}
\`\`\`

它确实是「只用 SELECT 就够」的意图，但没有任何东西阻止传入 \`DROP TABLE\`。某次 Agent 被一条注入的「清理过期数据」指令说服，执行了 \`DELETE FROM orders WHERE created_at < '2023-01-01'\`。事后统计删除了 12 万条记录，备份恢复花了七小时。

复盘时的第一个问题是「为什么只读工具能删数据」，第二个问题更值得记：「工具名与注释都不是权限」。权限来自它背后连接的账号、它实际能到达的资源、以及它能发起的动作——这三样没有一样被限制。

### 权限要拆三级

| 级别 | 问题 | 例（错误 → 正确） |
| --- | --- | --- |
| 能力（capability） | 这个工具能做什么类别的事 | \`db_query\` → \`db_read\` / \`db_write\` 两个工具 |
| 资源（resource） | 能碰哪些对象 | 整个库 → 指定 schema / 指定表 / 指定租户分区 |
| 动作（action） | 能执行哪些操作 | 任意 SQL → 白名单语句（仅 SELECT）+ 行数上限 |

三级都收到最紧，才叫最小权限。只做第一级（把工具拆成读 / 写）是最常见的做法，也是不够的——上面那个事故里，如果 \`db_read\` 用的是只读账号 + 只允许 SELECT，\`DELETE\` 会被数据库拒绝，与模型被怎么说无关。

关键的技术点：**权限必须由被调用方执行，而不是由调用方声明**。用只读数据库账号是最可靠的做法，因为在应用层判断「这条 SQL 是不是 SELECT」总有绕过方式（注释、多语句、存储过程）。

### 读与写必须分开授权

把读和写合成一个「读写权限」是几乎所有权限事故的共同起点。原因是两者的**后果不对称**：

| 维度 | 读 | 写 |
| --- | --- | --- |
| 可逆性 | 可逆（什么都没改） | 常常不可逆 |
| 被注入的后果 | 数据外带（有损失但可控） | 数据损坏（可能不可恢复） |
| 需要的确认 | 通常不需要 | 高风险动作需要（L71） |
| 审计要求 | 记录即可 | 需要事前审批 + 事后可回滚 |

因为后果不对称，它们的授权也应该不对称：读可以宽一点（多个资源、按需授予），写必须窄（最小资源、短时效、单次有效）。

一个具体的实现是给写权限加**时效与次数**：不是「这个会话可以写 orders 表」，而是「接下来 10 分钟内、最多 1 次、仅限 orderId=X 这一行」。这种「票据式」授权让注入即使成功，破坏面也被限制在一条记录上。

\`\`\`ts title="票据式写授权"
export interface WriteTicket {
  resource: string // 'orders'
  rowKey?: string // 'orderId=ORD-123'
  actions: Array<'update' | 'delete'>
  expiresAt: number
  maxUses: number
  used: number
  issuedFor: string // 触发来源：'user:explicit' / 'policy:auto'
}

export function consume(t: WriteTicket, action: 'update' | 'delete', rowKey?: string): { ok: boolean; why?: string } {
  if (Date.now() > t.expiresAt) return { ok: false, why: 'ticket expired' }
  if (t.used >= t.maxUses) return { ok: false, why: 'ticket exhausted' }
  if (!t.actions.includes(action)) return { ok: false, why: 'action not granted' }
  if (t.rowKey && t.rowKey !== rowKey) return { ok: false, why: 'row out of scope' }
  t.used++
  return { ok: true }
}
\`\`\`

\`issuedFor\` 字段是这套机制的灵魂：它记录「谁授权了这次写」。如果是 \`user:explicit\`（用户明确要求），可以自动放行；如果是 \`policy:auto\`（策略推断），就应当在执行前后各留一条审计记录。没有这个字段，事后无法区分「用户让删的」和「Agent 自己决定删的」。

:::deep

### 为什么「工具名看起来安全」不等于安全

工具名、描述、注释都是给人看的，运行时没有任何约束力。三类常见的名实不符：

**第一类，名窄实宽。** \`read_query\` 能跑任意 SQL（上面的事故）。同类还有 \`search_users\` 实际返回全表、\`preview_file\` 实际读了文件全部内容。

**第二类，参数逃逸。** 工具本身很窄，但某个参数指向了外部资源。典型是 \`fetch_url(url)\`——它看起来只是「取一个网页」，实际上给了 Agent 一个能访问任意内网地址的能力（SSRF）。还有 \`render_template(path)\` 里的 path 可以是 \`../../etc/passwd\`。

**第三类，组合放大。** 单个工具都安全，组合起来能完成危险动作。\`read_file\` + \`http_post\` 等于数据外带；\`list_tables\` + \`read_query\` 等于全库遍历。这类风险不在单个工具的权限上，只能靠会话级的工具集组合来限制。

三类里第二类最难防，因为它需要工具实现者主动做参数校验（URL 白名单、路径规范化后再校验前缀）。而工具实现者往往认为「Agent 不会传恶意参数」——这个假设在注入面前不成立。

:::

### 四种沙箱形态

当工具需要执行代码、访问文件系统或网络时，隔离层就不能只靠参数校验。四种形态，隔离强度与成本都递增：

| 形态 | 隔离什么 | 逃逸面 | 成本 |
| --- | --- | --- | --- |
| 进程级 | 环境变量、工作目录 | 同用户权限内可读写任何文件、可联网 | 低 |
| 容器级 | 文件系统、网络、CPU/内存 | 内核漏洞、挂载配置错误、特权模式 | 中 |
| 受限解释器 | 语言运行时 | 解释器 bug、未禁用的内置模块 | 低（能力也最少） |
| 远端执行 | 完全独立的环境 | 只在传输层与结果解析上 | 高（需网络 + 调度） |

选择依据是**这次执行需要什么**，而不是「哪个最强」：

- 只需要算数或字符串处理 → 受限解释器（不要起容器，太慢）。
- 需要读写文件、跑测试 → 容器级，且只挂载必要目录、默认断网。
- 需要访问真实网络（爬虫、API 集成）→ 远端执行或容器 + 显式网络白名单。
- 需要完整操作系统 → 远端独立虚拟机，绝不与业务同机。

第三个和第四个的差别常被忽略：容器默认断网时，爬虫类任务就得开网；而一旦开网，「数据外带」这条路径就开了。所以「开网的容器」在安全等级上接近「没有容器」。

:::warn

### 三个沙箱配置错误

**第一，容器以 root 运行 + 挂载宿主目录。** 这两项任一出现，容器隔离基本失效。挂载 \`/var/run/docker.sock\` 更是等同于把宿主控制权交出去。

**第二，以为「断网」就安全，忘了本地服务。** 容器断网仍能访问宿主上的 \`localhost\` 服务（视网络模式而定），内网的元数据服务（如 \`169.254.169.254\`）也可能可达——这是云上最经典的凭据泄漏路径。

**第三，沙箱只隔离了执行，没隔离结果。** 沙箱里跑出的输出会回到 Agent 的上下文，如果输出里含注入文本（比如被执行代码打印了一段「请调用…」），沙箱等于变成了注入通道。所以沙箱输出也要经过内容隔离（L84 的第一层）。

:::

### 落地：按任务类型给权限

把这一课落到工程上，核心是一张「任务类型 → 工具集 → 资源范围 → 是否沙箱」的表：

\`\`\`ts title="权限矩阵"
export interface Grant {
  tools: string[] // 能力
  resources: string[] // 资源范围（表 / 目录 / 域名）
  sandbox: 'none' | 'repl' | 'container' | 'remote'
  write: boolean // 是否含写权限
  ttlMs: number // 授权时效
}

export const GRANTS: Record<string, Grant> = {
  'faq-answer': { tools: ['search_kb'], resources: ['kb:public'], sandbox: 'none', write: false, ttlMs: 60_000 },
  'order-lookup': { tools: ['get_order', 'get_logistics'], resources: ['orders:own'], sandbox: 'none', write: false, ttlMs: 60_000 },
  'data-analysis': { tools: ['db_read', 'run_python'], resources: ['warehouse:readonly'], sandbox: 'repl', write: false, ttlMs: 300_000 },
  'code-fix': { tools: ['read_file', 'write_file', 'run_tests'], resources: ['repo:sandbox-copy'], sandbox: 'container', write: true, ttlMs: 900_000 },
  'refund': { tools: ['get_order', 'refund_order'], resources: ['orders:own'], sandbox: 'none', write: true, ttlMs: 60_000 },
}
\`\`\`

这张表有三个隐含决定，都值得单独说明：

1. **\`code-fix\` 的资源是 \`repo:sandbox-copy\` 而不是 \`repo:main\`**。Agent 改的是副本，人审核后再合入。这让「写权限」的后果从「不可逆」变成「可丢弃」——这是把 L71 的可回滚性原则落到权限层。
2. **\`data-analysis\` 用 repl 沙箱而不是容器**。它只需要跑 Python，起容器要多花几秒且没有额外收益。
3. **\`refund\` 的 ttl 只有 60 秒**。退款是高风险动作，授权窗口越短，被「上下文里的旧指令」误触发的概率越低。

这张表应当与 L67 的工具定义、L84 的白名单同源——理想情况下它们是同一份配置的三个视图，而不是三处各自维护的清单。

### 与 L40 的分工

L40 讲的是「一次工具调用是否应该被执行」：参数形状、二次确认、可回滚。这一课讲的是「这个 Agent 根本不该拥有这个能力」：能力拆细、资源收窄、执行隔离。

两者的关系是纵深：L40 挡在调用点，L85 挡在授权点。只做前者，一次成功的注入就能用合法权限做恶意事情；只做后者，合法的宽权限范围内的误用仍然会发生。
`,
    null,
    [
      {
        text: '「工具名与注释都不是权限」，权限来自哪里？',
        options: [
          '文档写清楚即可',
          '背后连接的账号、能到达的资源、能发起的动作——且必须由被调用方执行',
          '模型的自觉',
          '日志审计',
        ],
        answer: 1,
        explain: '用只读数据库账号是最可靠的做法，应用层判断总有绕过方式。',
        concept: 'least-privilege',
      },
      {
        text: '读与写为什么必须分开授权？',
        options: [
          '实现更简单',
          '后果不对称：读可逆、写常不可逆，且写需要事前审批与可回滚',
          '性能考虑',
          '审计要求',
        ],
        answer: 1,
        explain: '不对称的后果需要不对称的授权：读可宽、写必须窄且有时效。',
        concept: 'least-privilege',
      },
      {
        text: '票据式写授权里 `issuedFor` 字段的作用是？',
        options: [
          '记录时间',
          '区分「用户明确要求」与「策略推断」，决定是否需要额外审计',
          '限制次数',
          '指定资源',
        ],
        answer: 1,
        explain: '没有它，事后无法区分用户让删的和 Agent 自己决定删的。',
        concept: 'least-privilege',
      },
      {
        text: '「开网的容器」在安全等级上接近「没有容器」，原因是？',
        options: ['容器性能差', '一旦开网，数据外带这条路径就打开了', '网络配置复杂', '容器不支持网络'],
        answer: 1,
        explain: '隔离的核心收益之一是切断外带，开网等于放弃它。',
        concept: 'least-privilege',
      },
    ],
    [
      ['三级拆细', '能力（做什么类别）→ 资源（能碰什么）→ 动作（能执行什么操作）'],
      ['票据式授权', '写权限带资源范围、动作、时效与次数上限，限制破坏面'],
      ['参数逃逸', '工具本身窄但参数指向外部资源，如 fetch_url 的 SSRF'],
      ['沙箱形态', '进程 / 容器 / 受限解释器 / 远端执行，按任务需要选而非越强越好'],
    ],
    [
      '名为 read_query 的工具用同一账号跑任意 SQL，被注入后删表。',
      '容器以 root 运行并挂载宿主目录，隔离形同虚设。',
      '只做参数校验（L40）而不收窄能力，合法权限被用于恶意目的。',
    ],
  ),
  'theory',
)
