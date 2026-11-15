import { L, withKind } from '../../course-builders.ts'

export const L124 = withKind(
  L(
    'L124',
    32,
    '留守清单与迁移终局：无替代 API 的长期共存决策树',
    2,
    ['L118'],
    ['lc-legacy-keeplist'],
    [
      '能构建留守清单：按「抽象在 core / 实现留 classic / 仅报错占位 / 仅转发空壳」四类归档 classic 的全部入口，并给每类标注共存策略',
      '能执行无替代 API 的共存决策树：依赖封闭度、classic 维护预期、业务价值三个判据决定留用/重写/替换',
      '能产出迁移终局报告：入口警告面清点、空壳转发文件确认、混合运行方案的依赖树验证步骤',
    ],
    `### 一、终局问题：不是所有 API 都有下一站

十二课的映射表走完，会发现一个共同结构：大多数 API 有「新家」（概念替代/精确替代/形态升级），但总有一批 API 没有下一站——12 个花式 retriever（L118）、Toolkit 形态（L114）、五套协议族解析器（L113）、experimental 自主 agent 全族。迁移课的终局问题就是：**无替代的 API 怎么长期共存？** 答案分三步：先建留守清单（把 classic 的每个入口归档定性），再执行共存决策树（给每个留守项定策略），最后产出终局报告（把共存方案落到依赖树验证）。本课按这个顺序收束整个模块九。

### 二、留守清单：classic 入口的四类归档

classic 的 30 个顶级条目（台账证据 2 的目录列表）按迁移性质归成四类。每一类的证据与共存策略：

| 归档类 | 代表证据 | 共存策略 |
|---|---|---|
| ① 抽象在 core、实现留 classic | BaseRetriever（core retrievers/index.ts:65）+ 12 个实现；MemoryVectorStore（classic vectorstores/memory.ts:142）extends core VectorStore | 长期留用：依赖封闭的实现直接共存；拖旧协议的重写（L118 决策树） |
| ② 实现整体留 classic、无 1.x 对应物 | agents/toolkits 全族（L114）、垂类链（SqlDatabaseChain sql_db_chain.ts:68、GraphCypherQAChain cypher.ts:65）、experimental/（autogpt/babyagi/plan_and_execute/generative_agents，ls 核实）、五套协议解析器（L113） | 按业务价值决策：存量维护留用，新需求绕行 |
| ③ 报错占位 | classic src/index.ts:1-3（根入口 WARNING）、prompts/index.ts:1-7（ERROR，0.2.0 移除） | 清零引用：import 处改写，占位文件不留依赖 |
| ④ 转发空壳 | text_splitter.ts:1 → @langchain/textsplitters；storage/in_memory.ts:1 → core stores；load/serializable.ts:1 → core load | 改 import 到真身：classic 依赖随之可整体移除 |

四类归档的操作化写法：把第二节 L117 的审计脚本扩展一张归档表，扫描结果直接输出「文件 → 归档类 → 策略」三列。归档脚本可直接落盘：

\`\`\`ts
// scripts/keeplist-audit.mjs —— 留守清单归档器
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 四类归档：classic 每个子入口的定性
const ARCHIVE = [
  { spec: /^langchain\\/agents\\/toolkits/, kind: "② 无对应物", policy: "按业务价值：拆工具 or 隔离" },
  { spec: /^langchain\\/agents\\/(mrkl|structured_chat|xml|openai_functions|openai_tools|chat)/, kind: "② 无对应物", policy: "协议族退役（L113）：禁新代码引用" },
  { spec: /^langchain\\/experimental/, kind: "② 无对应物", policy: "存档：LangGraph 手工搭图承接" },
  { spec: /^langchain\\/chains/, kind: "② 无对应物", policy: "L107/L108 的 LCEL 重写公式" },
  { spec: /^langchain\\/retrievers/, kind: "① 实现留 classic", policy: "依赖封闭者长期共存（L118）" },
  { spec: /^langchain\\/vectorstores/, kind: "① 实现留 classic", policy: "抽象在 core（vectorstores.ts:553）" },
  { spec: /^langchain\\/prompts$/, kind: "③ 报错占位", policy: "引用清零 → @langchain/core/prompts" },
  { spec: /^langchain\\/(text_splitter|storage\\/in_memory|load)/, kind: "④ 转发空壳", policy: "改 import 到真身" },
  { spec: /^langchain$/, kind: "③ 报错占位", policy: "根入口空警告（src/index.ts:1-3）" },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\\.(ts|tsx|js|mjs)$/.test(name)) yield p;
  }
}

const rows = [];
for (const file of walk(process.argv[2] ?? "src")) {
  for (const line of readFileSync(file, "utf8").split("\\n")) {
    const m = line.match(/from\\s+["']([^"']+)["']/);
    if (!m) continue;
    for (const a of ARCHIVE) {
      if (a.spec.test(m[1])) rows.push({ file, spec: m[1], ...a });
    }
  }
}
console.table(rows);
console.log(\`classic 引用总数: \${rows.length}\`);
\`\`\`

跑 \`node scripts/keeplist-audit.mjs src\` 即得可跟踪的留守仪表盘——\`classic 引用总数\` 每周对比，归档类别分布直接指向本周该做的迁移动作（③④类清零、①类留用核验、②类按排期处理）。

### 三、共存决策树：三个判据定去留

对归到「留 classic」的实现，执行这棵决策树（判据层层收窄）：

**判据一：依赖封闭度。** 实现的 import 面是否只在 core 类型内？封闭（如 EnsembleRetriever、ScoreThresholdRetriever、EmbeddingsFilter）→ 走「长期共存」分支，条件是 core 版本单一化（L120 的 npm ls 验证）。不封闭（内部持 LLMChain/classic 专属类，如 LLMChainExtractor、SelfQueryRetriever、GraphCypherQAChain）→ 走下一判据。

**判据二：classic 维护预期。** classic 的官方定位是迁移缓冲区（package.json:2-4 的 description），跟随主线发版但内容冻结——这决定了「拖旧协议的实现」的时间价值只降不升。若该能力预期在 6-12 个月内还要演进 → 走「重写」分支（按 L107/L118 的 LCEL 公式）；若是一次性历史能力（如 generative_agents 这类实验）→ 走「隔离存档」分支：限定在单独目录、禁止新代码 import、写明退役日期。experimental 目录值得现场点一次名（源码 ls 核实）：autogpt、babyagi、chains、generative_agents、masking、openai_assistant、openai_files、plan_and_execute、prompts 九个子目录——它们是「隔离存档」分支的标准样本：绑定旧协议与旧模型 API、无 1.x 对应物、能力由 LangGraph 手工搭图承接。存档时建议按目录粒度（而不是按类粒度）整目录隔离，边界清晰且与审计脚本的 spec 正则天然对齐。

判据二还有一个成本维度要算清：classic 的 peer 面虽小但非零。peerDependencies 里 cheerio/peggy/typeorm 三项（package.json:199-203）虽都 optional（peerDependenciesMeta，:205-214），optionalDependencies 还挂了 langsmith（:226-227）——每留用一个 classic 子入口，就要为其对应 peer 的版本兼容负审计责任（自建 SQL 链留用 → typeorm 要进依赖审计范围；openapi 工具留用 → peggy 同理）。隔离存档不仅是代码卫生，也是把这部分审计责任一并冻结的手段。

**判据三：业务价值与替换成本。** 能力是否被高频业务路径使用？替换是否有现成新形态（如「检索条件解析」可换 responseFormat、审核可换 openAIModerationMiddleware）？有现成形态且路径高频 → 优先排进迁移排期（替换成本随共享 core 的类型互通而可控）；无现成形态 → 按判据二的结论挂留守或存档，并把「无替代」写进项目风险清单——这句话本身就是迁移终局报告的必备条目。

决策树的一个实际走法示例：SelfQueryRetriever。判据一：不封闭（拖 query_constructor 解析器族）→ 判据二：检索策略还会演进 → 判据三：有现成替代思路（L118 第三节：responseFormat/withStructuredOutput 表达过滤条件解析）→ 结论：排进下个季度的重写排期，过渡期隔离使用。三个判据走完，去留与时间表同时产出。

### 四、终局报告：三类证据的最终确认

迁移终局报告要附三类「收官证据」，全部可脚本化验证：

\`\`\`bash
# ① 入口警告面清点：确认没有代码命中报错占位/空壳转发
grep -rn "langchain/prompts\\|langchain/text_splitter\\|langchain/storage" src/ || echo "OK: 报错占位与空壳引用清零"

# ② classic 依赖面盘点：留守项是否封闭在声明的目录内
grep -rl "@langchain/classic" src/ | sort
# 期望：只有 legacy/ 目录下的存档文件（隔离分支的产物）

# ③ 依赖树验证：core 单实例、classic 无意外 peer
npm ls @langchain/core          # 期望：单实例（或 pnpm why @langchain/core）
npm ls @langchain/langgraph     # 期望：新包 ^1.6.1（langchain/package.json:77），classic 的 1.4.18 仅 devDep 不出现在运行时树
\`\`\`

三类证据分别对应三条收官线：**入口面干净**（③①类占位与空壳不再被引用）、**存量隔离**（②类留守实现物理隔离在 legacy/ 目录、数量可追踪）、**依赖树成立**（core 单实例 + langgraph 版本线符合 L120 的并存设计）。报告的最后一段应回到本模块开头的世界观：1.x 迁移从来不是「删旧代码」，而是「新旧并存、共享 core、按判据逐项定去留」——当留守清单上只剩「依赖封闭的长期共存项」与「有明确退役日期的存档项」时，迁移就到达终局。

### 本课小结

- 留守清单四类归档：抽象在 core（长期共存候选）、实现留 classic 无对应物（按业务价值决策）、报错占位（引用清零）、转发空壳（改 import 到真身）。
- 共存决策树三判据：依赖封闭度（根判据，与 L118 同源）→ classic 维护预期（缓冲区定位，时间价值只降不升）→ 业务价值与替换成本。
- experimental 整族（autogpt/babyagi/plan_and_execute/generative_agents）的终局是无替代存档：自主 agent 场景由 LangGraph 手工搭图承接。
- 终局报告三类证据：入口警告面清零、存量物理隔离且可计数、依赖树 core 单实例验证。
- 模块九至此收官。下一模块（L125 起）进入 Capstone：拿一个 Chain+Memory+AgentExecutor+OutputParser 全家桶的真实应用，把本模块全部映射公式走一遍完整交付。
`,
    null,
    [
      {
        text: 'import "langchain"（classic 根入口）会发生什么？',
        options: [
          '正常导出全部 API',
          '命中 src/index.ts:1-3 的警告：The root "langchain" entrypoint is empty，强制要求改用具体子入口',
          '自动转发到新包 langchain',
          '编译失败',
        ],
        answer: 1,
        explain:
          'classic src/index.ts:1-3 只有一个 console.warn 文案：[WARNING]: The root "langchain" entrypoint is empty. Please use a specific entrypoint instead——根入口是空的，一切 API 都在子入口（langchain/chains、langchain/memory 等）。这是 0.1→0.2 大拆分策略的残留证据。C 错：没有任何转发机制；D 错：运行时照常执行，只是打印警告。',
        concept: 'lc-legacy-keeplist',
      },
      {
        text: '留守清单四类归档里，「报错占位」与「转发空壳」的区别是？',
        options: [
          '没有区别，都是报错',
          '报错占位 import 即触发 ERROR 文案（如 prompts/index.ts:1-7，提示入口已在 0.2.0 移除）；转发空壳是单行 re-export 真实来源（如 storage/in_memory.ts:1 → @langchain/core/stores）——前者要改写引用，后者要改 import 地址',
          '报错占位在 core，转发空壳在 classic',
          '转发空壳会被打包器报错',
        ],
        answer: 1,
        explain:
          '两类文件的行为不同：报错占位（prompts/index.ts:1-7）只打印错误提示、不导出任何东西；转发空壳（text_splitter.ts:1、storage/in_memory.ts:1、load/serializable.ts:1）导出的就是真身（独立包或 core 的符号）。迁移含义也不同：前者引用必须改写，后者理论上不改也能跑——但留守清单的纪律是全部改掉，让依赖树干净。',
        concept: 'lc-legacy-keeplist',
      },
      {
        text: '无替代 API 共存决策树的第一判据是什么？',
        options: [
          'API 的名字长度',
          '依赖封闭度：该实现是否只依赖 core 类型（可长期留用）还是拖 LLMChain/classic 专属类（要重写或隔离）',
          '代码行数',
          '是否有人写测试',
        ],
        answer: 1,
        explain:
          '决策树的根判据与 L118 检索层的判别标准同源：只依赖 core 类型的实现（如 EnsembleRetriever、InMemoryStore 的实现）与 1.x 代码类型互通（L120），共存成本低；拖旧协议的实现（LLMChainExtractor、GraphCypherQAChain 的两个 LLMChain）会把旧世界观拖进依赖图，共存成本随时间上涨。其余判据（维护预期、业务价值）只决定二、三层走向。',
        concept: 'lc-legacy-keeplist',
      },
      {
        text: 'experimental/ 目录（autogpt/babyagi/plan_and_execute/generative_agents 等）的迁移终局判断是？',
        options: [
          '会随 1.x 迁移到新包',
          '无对应物、整体留 classic 且不再有官方替代——1.x 的对应路线是用 LangGraph 手工搭图 + middleware 组合表达自主 agent',
          '已迁移到 langgraph 的 prebuilt',
          '只移除了 autogpt',
        ],
        answer: 1,
        explain:
          'experimental 整族（源码 ls：autogpt/babyagi/chains/generative_agents/masking/openai_assistant/openai_files/plan_and_execute/prompts）只活在 classic，台账证据的口径是「自主 agent 实验由 LangGraph 手工搭图取代」——它们绑定旧协议与旧模型 API，没有也不应有 1.x 等价物。迁移终局判断：除非维护存量系统，不进新代码；确需自主 agent 时按模块六的 StateGraph 直搭。',
        concept: 'lc-legacy-keeplist',
      },
    ],
    [
      [
        '留守清单',
        '迁移终局文档：classic 每个入口按四类归档（抽象在 core/实现留 classic/报错占位/转发空壳），附共存策略与责任期',
      ],
      [
        '报错占位',
        'classic 里仅含 console.warn 的入口文件（src/index.ts:1-3、prompts/index.ts:1-7），是「此路不通」的官方路标',
      ],
      [
        '依赖封闭度',
        '本课核心判据：一个 classic 实现的 import 面是否封闭在 core 类型之内——封闭则可长期共存，否则是重写信号',
      ],
    ],
    [
      '以为「转发空壳不改也能跑」就永久不改——空壳存在本身是迁移信号，依赖树上留着 classic 就意味着 classic 的整个依赖面（typeorm/cheerio 等 optional peer，classic package.json:201-215）都得维护',
      '把 experimental 族当可用能力写进新架构规划——autogpt/babyagi 等绑定旧协议与旧模型 API，与 1.x 世界观脱节；自主 agent 场景用 LangGraph 直搭',
      '迁移报告漏掉 classic 依赖树的验证步骤——共存方案是否成立要以 npm ls/pnpm why 的输出为准，不能只看自己的 import 语句',
    ],
  ),
  'framework',
)
