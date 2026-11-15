import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 24 ========== */

export const L121 = withKind(
  L(
    'L121',
    24,
    'MCP 生态与工具市场速览',
    1,
    ['L47'],
    ['mcp-ecosystem'],
    [
      '理解 MCP 生态的构成与「协议统一」带来的复利',
      '掌握挑选第三方 MCP Server 的准入判据与能力漂移检测思路',
      '认识「用现成 MCP」与「自建 MCP」的取舍边界',
    ],
    `
### 一个没改过配置的服务，读到了不该读的目录

团队接了十二个第三方 MCP Server，配置三个月没动过。某天巡检发现 Agent 的上下文里出现了一份不该出现在其中的员工薪资表。追查下来：不是模型越权，也不是提示注入，而是其中一个「文件浏览」Server 悄悄发了新版本，把 \`list_files\` 的默认根目录从「当前工作区」放宽到了「用户主目录」。Agent 没做任何新的决策，只是照常调用了那个熟悉的同名工具，返回内容却比昨天多了几层。

复盘时最尴尬的一问是：「我们记录过这个 Server 当时承诺的权限范围吗？」——没有。接入时看了眼 star 数和 README 就写进了配置，既没有锁版本，也没有保存 \`tools/list\` 的 schema 快照，于是**能力变了而调用方毫无察觉**。生态给的便利是真实的，代价也一样真实：这一课要建立的判断框架是，**每接一个第三方 MCP Server，就是把一段你没有代码审查权的可执行逻辑放进信任边界**。

### 生态的复利，与它带来的三类风险

L43 讲的是协议统一的价值：Agent 学会「接 MCP」之后，官方参考 Server、社区 Server、自己写的 Server 都是同一套 client、同一套发现与调用流程。这是真实的复利，也是风险被放大的原因——**接入成本低到不再触发审查**。

| 风险类型 | 具体表现 | 为什么传统依赖审计抓不到 | 该有的防线 |
|---|---|---|---|
| 能力漂移 | 同名工具参数变了、返回范围变宽、默认值改了 | 版本没变或版本被 \`latest\` 掩盖，调用方只认工具名 | 保存 schema 快照并定期比对 |
| 权限过宽 | Server 启动时被授予整个主目录 / 全量 token | 权限是运行时配置，不在依赖清单里 | 启动时按声明做最小权限校验 |
| 供应链 | 传递依赖、\`npx -y\` 拉取远端代码、维护者易主 | 代码不在本仓库，静态扫描覆盖不到 | 锁版本 + 固定 commit + 来源登记 |

三行里最容易被忽略的是第二行：npm 包的权限是「你的进程本来就有的权限」，而 MCP Server 常常被额外授予目录、凭据、网络出口。**它是一段带着授权运行的代码，不是一个被调用的库**。

:::deep
### 工具市场不是包市场

把 MCP 市场类比成 npm，会漏掉一个关键差异：npm 包是**编译期决定**的，谁引入、引了哪个版本、升级经过谁 review，都有痕迹；而 MCP 工具是**运行时由模型自主选择**的，人不在回路上。一个 Server 今天新增了 \`delete_all\` 工具，模型明天就可能因为「用户说清空」而选中它——没有任何一行本仓库代码发生变化。

所以评估清单不能只问「这个包安全吗」，还要问「**它提供的能力集合，是否始终在我允许模型自主决定的范围内**」。前者是一次性的准入判断，后者需要持续的漂移检测。这也是 L85 最小权限在生态场景里的延伸：权限要按「模型可自主调用的能力」来收口，而不只是按「进程能访问什么」来收口。
:::

### 把准入判断写成可校验的登记表

不写死「哪些 Server 可信」——这份名单两周就会过期。写死的是**准入条件**：每个 Server 必须登记来源、精确版本、权限声明、工具 schema 指纹与负责人，启动时逐项校验。

\`\`\`ts title="MCP Server 准入登记表" note="要点：锁到 commit 而非 latest；权限声明与 schema 指纹一起登记，缺项即拒绝启动。"
type ServerManifest = {
  name: string
  source: 'official' | 'org' | 'community'
  ref: string              // 精确到 commit / 固定 tag，禁止 latest
  owner: string            // 本团队里谁负责盯它
  allowedRoots?: string[]  // 文件类 Server 的目录白名单
  scopes: string[]         // 允许的工具能力范围，如 ['read:file']
  schemaHash: string       // tools/list 返回结构的指纹
  reviewedAt: string
}

const REGISTRY: ServerManifest[] = [
  {
    name: 'filesystem', source: 'official', ref: 'v1.4.2@a91c3de',
    owner: 'platform', allowedRoots: ['/srv/workspace'], scopes: ['read:file'],
    schemaHash: 'sha256:8c1f…', reviewedAt: '2026-11-01',
  },
]

function assertAdmissible(m: ServerManifest): void {
  if (/latest|\\*|^v?\\d+$/.test(m.ref)) throw new Error('ref 不够精确: ' + m.name)
  if (m.source === 'community' && !m.owner) throw new Error('社区 Server 必须有负责人')
  if (!m.schemaHash || !m.reviewedAt) throw new Error('缺 schema 指纹或评审日期')
  if (m.allowedRoots?.some((r) => r === '/' || r.startsWith('/home'))) {
    throw new Error('目录白名单过宽: ' + m.name)
  }
  const ageDays = (Date.now() - Date.parse(m.reviewedAt)) / 86_400_000
  if (ageDays > 90) throw new Error('超过 90 天未复评: ' + m.name)
}
\`\`\`

注意最后一条：登记表有**有效期**。没有复评机制的准入清单会慢慢变成一份「历史上有过理由」的档案，而风险是随版本增长的。90 天不是硬标准，重点是让「没人再看过它」这件事显式地报错。

### 漂移检测：名字没变不代表能力没变

\`\`\`ts title="tools/list 漂移检测" note="要点：新增工具、参数变化、权限范围扩大分三级告警；新增写能力一律阻断。"
type ToolSchema = { name: string; params: string; danger?: boolean }

function hashSchemas(tools: ToolSchema[]): string {
  const canonical = tools.map((t) => t.name + '(' + t.params + ')').sort().join('|')
  return 'sha256:' + stableHash(canonical)
}

function detectDrift(m: ServerManifest, now: ToolSchema[]): 'ok' | 'warn' | 'block' {
  if (hashSchemas(now) !== m.schemaHash) return 'warn'   // 结构变了
  const writeAdded = now.some((t) => /delete|write|send|exec/i.test(t.name) && t.danger)
  if (writeAdded && !m.scopes.some((s) => s.startsWith('write'))) return 'block'
  if (now.some((t) => /home|root|\\.\\.\\//.test(t.params))) return 'block'
  return 'ok'
}
\`\`\`

三档处置要分开：结构变化先告警（可能只是加了个可选参数），**新增写能力或参数里出现越界路径则直接阻断**，不能靠人看到告警后再处理——L85 的最小权限在这里是默认拒绝。开头那起事故如果有一份 \`schemaHash\`，\`list_files\` 的返回范围变化会在当天就被比对出来，而不是等三个月后巡检。

### 用现成还是自建：一条取舍判据

| 判断项 | 倾向用现成 | 倾向自建（L47） |
|---|---|---|
| 能力是否通用 | 文件 / Git / 数据库等标准能力 | 贴合本业务的私有操作 |
| 是否触碰敏感数据 | 只读、可限定目录 | 写操作、涉及租户数据 |
| 模型是否可自主调用 | 能力集合小且稳定 | 需要按业务规则逐次授权 |
| 变更频率 | 低、上游维护活跃 | 本团队自己迭代更快 |

表里没有「开发成本」这一行，因为它经常误导：现成 Server 的接入成本确实近乎零，但**持续盯住它的成本不为零**。当能力触碰写操作或租户数据时，自建的总成本往往更低——这正是 L87 多租户隔离与 L85 最小权限在生态选型上的落点。

:::warn
### 两个必踩的坑

- **看到 star 多 / 是官方参考实现就直接接**。参考实现的目标是演示协议，不是替你做权限收口；它的默认目录、默认 scope 往往是「方便」而非「最小」。准入判断看的是你自己的登记表，不是仓库热度。
- **用 \`npx -y <pkg>@latest\` 写进生产配置**。这等于把「每次启动执行什么代码」交给上游决定，且没有版本、没有 commit、没有复评。锁到固定 ref，把升级变成一次走评审的变更。
:::

### 清单会过期，判据不会

这一课刻意没有列「当前值得接的十个 MCP Server」。任何这样的名单在写下它的那一刻就开始失真，而读者真正需要带走的是四个可复核的问题：来源是谁、锁到哪个 commit、允许它做什么能力、能力变了谁会知道。把这四个问题写成登记表与启动时校验，比背下十个名字有用得多——这也呼应 L95 的版本锁思路：**会变的东西要显式声明，不能靠记忆维持**。

### 与相邻课的分工

- **L43 / L45 / L47**：MCP 协议、手写 Server 与集成流程，本课只讲「接别人的」多出来的信任问题。
- **L83**：提示注入，管的是内容层面的攻击；本课的能力漂移是**依赖层面的变化**，两者防线不同。
- **L85 / L87**：最小权限与多租户隔离，本课把它们的边界从「进程」推到「模型可自主调用的能力集合」。
- **L95**：版本锁与 core 零依赖，本课的 \`ref\` 精确锁定是同一原则在外部 Server 上的应用。

**一句话收束**：MCP 生态的复利是「一次协议、处处复用」，代价是「一次接入、长期背书」；准入是一次判断，漂移是持续义务。
`,
    null,
    [
      {
        text: 'Server 没改配置却读到了不该读的目录，最可能的根因是？',
        options: ['模型越权', '上游版本放宽了同名工具的默认范围，没做漂移检测', '提示注入', '网络抖动'],
        answer: 1,
        explain: '名字没变不代表能力没变，缺的是 schema 快照与比对。',
        concept: 'mcp-ecosystem',
      },
      {
        text: '把 MCP 市场类比成 npm 会漏掉什么关键差异？',
        options: ['包更大', '工具是运行时由模型自主选择，人不在回路上', '没有版本号', '不能离线用'],
        answer: 1,
        explain: '编译期决定 vs 运行时自主调用，决定必须有持续漂移检测。',
        concept: 'mcp-ecosystem',
      },
      {
        text: '生产配置里最不该出现的是？',
        options: ['精确到 commit 的 ref', 'schemaHash', 'npx -y <pkg>@latest', '90 天复评日期'],
        answer: 2,
        explain: 'latest 把每次启动执行的代码交给上游，且无版本、无复评。',
        concept: 'mcp-ecosystem',
      },
    ],
    [
      ['信任边界外移', '接入第三方 Server 后，可执行逻辑的归属变成外部代码'],
      ['能力漂移', '同名工具的参数/返回范围/权限变了，而调用方无感'],
      ['准入登记表', '来源、精确 ref、权限声明、schema 指纹、负责人与复评日期'],
    ],
    [
      '看到 star 多或「官方参考实现」就直接接，默认权限往往按方便而非最小设计。',
      '用 @latest 写生产配置，能力变化会在无人察觉时发生。',
    ],
  ),
  'theory',
)
