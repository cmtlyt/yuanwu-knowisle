import { L, withKind } from '../../course-builders.ts'

export const L132 = withKind(
  L(
    'L132',
    34,
    '验收与复盘：可执行验收断言、失效面清单、全课程源码地图收束',
    3,
    ['L129'],
    ['lc-capstone-final'],
    [
      '总装 Capstone B 的可执行验收断言套件：I/S/R/C/K/P/O 七组断言合并为单命令验收脚本，跑出全绿报告并归档为课程终版交付物',
      '定稿失效面清单：对 L129 初版四条逐条升级为「触发条件 + 观测手段 + 预案」三段式条目，补充流式与结构化两条新失效面',
      '产出全课程源码地图：三包 → 四机制层（messages/runnables、agent+middleware、graph 内核、checkpoint）的锚点收束图，每层标注对应课时',
    ],
    `### 定锚：终局课——把两条 Capstone 收进一张地图

本课是 132 课的收官。三件事：Capstone B 验收总装（七组断言单命令执行）、失效面清单定稿（三段式条目化）、全课程源码地图收束。三件事的共同点是都可执行——验收跑得出报告、清单对得上断言、地图查得到行号。与 L128 的关系再划一次界：L128 收口的是**迁移**（Capstone A，证明旧应用在新栈复现），本课收口的是**从零构建**（Capstone B，证明新应用按架构承诺运行）——两份验收报告、两张复盘表、共同服务一张课程地图。一句话核心结论：**源码课的终局不是记住 132 个 API，而是拿到一张「机制层 × 源码锚点」的地图——以后任何行为疑问，都能在地图上定位到该读哪个文件哪几行。**

### 验收总装：七组断言的单命令脚本

L130/L131 交付了七组断言，本课总装成 \`acceptance.ts\` 的单命令入口：

\`\`\`ts
// acceptance.ts —— Capstone B 终版验收入口
// 运行：npx tsx acceptance.ts && echo "ALL GREEN"

const groups = [
  ["I", "主体组装",   assertInvocation],      // 消息序列 + 双 schema 默认值
  ["S", "摘要中间件", assertSummarization],   // 前缀消息 + RemoveMessage 清理
  ["R", "重试中间件", assertToolRetry],       // 首错次成 + continue 语义
  ["C", "自建拦截",   assertCitationGuard],   // REJECTED ToolMessage + context
  ["K", "检索链",     assertRetrievalChain],  // 命中包含 + 条数上限
  ["P", "持久化",     assertPersistence],     // P1 thread 隔离 + P2 恢复
  ["O", "流与结构",   assertStreamAndOutput], // O1-O4 子流齐全/有序/等价/对照
];

for (const [id, name, fn] of groups) {
  await fn();                                    // 内部含 golden 剧本回放
  console.log(\`[\${id}] \${name}: PASS\`);
}
\`\`\`

*— 总装骨架，断言实体来自 L130（I/S/R/C/K/P）与 L131（O）各段（commit 7704471 语境）*

总装时补两类胶水断言。**隔离胶水**：A3/A4 型的破坏性剧本（超限、抛错）各用独立 thread_id，跑完后 \`deleteThread\` 清场（BaseCheckpointSaver 契约第五方法，libs/checkpoint/src/base.ts:180-239）——deleteThread 在测试清场的应用也是课程对该方法最自然的注脚：

\`\`\`ts
// 破坏性剧本的隔离与清场（P 组胶水）
const chaosThreads = ["t-limit-chaos", "t-error-chaos"];
for (const tid of chaosThreads) {
  // 各自跑完破坏性剧本后……
  await checkpointer.deleteThread(tid);   // base.ts:225-239 的契约方法
  const after = await agent.getState({ configurable: { thread_id: tid } });
  // 清场后状态应为空：不残留污染后续测试轮次
  console.assert(!after?.values?.messages?.length, \`cleanup FAIL: \${tid}\`);
}

// 对照断言胶水（O4 型的通用形态）
async function assertAbsentWithoutConfig(
  makeAgent: (withFormat: boolean) => Promise<any>,
  probe: (result: any) => unknown
) {
  const withFeat = await makeAgent(true);
  const without = await makeAgent(false);
  // 有配置 → 探针有值；无配置 → 探针无值。两半都成立才算归因成立。
  console.assert(probe(withFeat) !== undefined, "对照 FAIL: 配置未生效");
  console.assert(probe(without) === undefined, "对照 FAIL: 字段天然存在");
}
\`\`\`

**对照胶水**：每个能力组配一条 O4 型负向断言（去配置断言无行为），七组里 S/C/O 三组落实——**对照断言把「测试通过」从相关性升级为因果性**（quiz 辨析），终版报告须附对照记录。

跑完套件后的报告产物也固化为结构化输出，方便 CI 与评审消费：

\`\`\`json
{
  "suite": "capstone-b-acceptance",
  "commit": "<git-sha>",
  "versions": {
    "langchain": "1.6.6",
    "@langchain/core": "1.4.1",
    "@langchain/langgraph": "1.7.4"
  },
  "results": [
    { "group": "I", "asserts": 3, "status": "PASS" },
    { "group": "P", "asserts": 3, "status": "PASS",
      "notes": "P2 边界：MemorySaver 同进程语义" },
    { "group": "O", "asserts": 4, "status": "PASS",
      "notes": "O4 对照断言随附" }
  ],
  "verdict": "ALL GREEN",
  "repro": "npx tsx acceptance.ts"
}
\`\`\`

### 失效面清单定稿：三段式条目化

L129 初版四条 + 流式结构两条新增，全部升级为三段式：

| 失效面 | 触发条件 | 观测手段 | 预案 |
|---|---|---|---|
| middleware 顺序 | citationGuard 排在 toolRetry 外/内层变化时拦截语义翻转 | O 组 middleware 子流的 before/after 事件对时序 | 自建拦截中间件排在内层（先拦）或外层（先重试），架构文档定死顺序 |
| thread 串话 | 多租户共用 agent 实例、thread_id 混用 | P1 双 thread 互查断言 + getState 日志 | tenantId 进 contextSchema 并入键校验；thread_id 生成与租户绑定 |
| 流中断恢复 | 长剧本执行中客户端断开 | 图状态可 resume（durability 语义，L79/L80） | durability 显式档位 + 客户端重连后按 thread 续读 getState |
| provider tool_calls 质量 | 模型吐 invalid tool_calls | AIMessage invalid 桶检查（L12）+ 负例剧本 | toolError 中间件兜底回喂；模型选型评审含负例剧本实测 |
| 终态竞态（新增） | run.output 未 resolve 时读终态 | O1 的 output 断言 + UI 组件层 lint 约定 | 消费契约：临时渲染走子流、终态走 await run.output |
| 策略能力缺失（新增） | 目标模型不支持原生 json_schema | O3 双策略对照跑 + providerStrategy 调用报错 | 降级 toolStrategy（架构预案已定稿），或纯文本 + 外部解析 |

三段式条目的评审用法：新业务接入前逐条问「我的场景会触发哪几条」——触发了就走预案，没观测手段的条目当场补断言。这份清单连同 L128 的复盘表，构成课程沉淀的两份组织级资产。条目化还有一个隐含收益值得点破：**三段式强迫每个失效面在架构期就回答「怎么看见」**——很多团队的风险清单失效，不是因为漏列风险，而是因为列了风险却没人知道它在什么日志、哪个断言、哪条指标里显形；把观测手段写成清单的必填列，风险就从「评审时的谈资」变成「运行时可检查的契约」。失效面清单因此是活的文档：每次事故复盘新增条目、每次断言扩充更新观测列，它的版本号应该比业务代码更替得更勤。评审失效面清单还有一条顺序纪律：先过触发条件的业务相关性，再过观测手段的完备性，最后才讨论预案的轻重——顺序反了，评审会陷进预案技术细节而漏掉「根本不触发」的无关条目。

### 全课程源码地图：四机制层收束

132 课的走读收进一张地图。物理分布是三包（langchain 1.6.6 / core 1.4.1 / langgraph 1.7.4，另有 classic 1.0.61 作博物馆），逻辑归属是四机制层：

\`\`\`
core（数据与组合原语）
  messages：BaseMessage 骨架→chunk 合并→trimMessages   [L10-L15, L30]
    锚点：langchain-core/src/messages/base.ts:215、modifier.ts:22
  runnables：四大支柱→Sequence/Map/Lambda→bind 家族     [L27-L36]
    锚点：langchain-core/src/runnables/base.ts:1944/2297/2572
  检索/文档底座：BaseRetriever/VectorStore/Document     [L83-L87]
    锚点：langchain-core/src/retrievers/index.ts:31-61

langchain 主包（agent 行为层）
  createAgent→ReactAgent→#graph 编译                    [L37-L48]
    锚点：langchain/src/agents/index.ts:672-702、ReactAgent.ts:164-188
  middleware 六 hook + 20+ 预置 + createMiddleware      [L51-L64]
    锚点：langchain/src/agents/middleware/index.ts:1-126
  结构化输出双策略与类型系统                             [L96-L101]
    锚点：langchain/src/agents/responses.ts:478/615

langgraph（执行内核）
  StateGraph 泛型→schema 归一→编译接线                   [L65-L68]
  Channel 11 种→tick() BSP→_applyWrites 排序            [L69-L77]
    锚点：langgraph-core/src/pregel/loop.ts:404/1194
  流模式/durability/容错矩阵                             [L78-L80]

checkpoint（持久化契约）
  BaseCheckpointSaver 五方法 / putWrites 排序 / MemorySaver
    锚点：libs/checkpoint/src/base.ts:180-239、memory.ts:106
                                                        [L90-L91]
\`\`\`

地图上最难也最值钱的是**交叉点**：middleware 的 hook 节点化横跨行为层与内核层（L47）；checkpointer 的 putWrites 排序横跨持久层与内核确定性（L76/L91）；streamEvents 的 version 分派横跨行为层与内核流通道（L131）。第四个交叉点值得单列：**responseFormat 双策略横跨行为层与模型能力层**（L96/L98）——策略工厂住在主包 responses.ts，约束执行却发生在 provider 端的受限解码或工具调用通路里，排障时「结构化输出拿不到」可能是策略实现问题、也可能是 provider 能力问题，地图定位的第一步就是先问「能力协商做过了吗」把两层分开。这四种交叉正是面试与排障的高频区——单层知识覆盖不了，只有地图能定位。迁移视角的收束则是一条主线：**两代世界观的分水岭是「Agent 即编译图」+「隐式 memory → 显式 messages + checkpointer」**（L102-L106），Capstone A 的六件交付物是这条主线的实操证明。

地图的读法也有讲究，给学员三问自检。**一问定位**：任何行为疑问先问「这属于哪一层」——类型问题查主包重载面，行为问题查 ReactAgent 与 middleware，执行时序问题查内核 tick，状态丢失问题查 checkpoint 契约；**二问锚点**：定位到层之后，能立刻说出该层的代表文件与行号区间吗（表里已给）；**三问交叉**：问题若横跨两层（如「中间件能改 checkpointer 写入的顺序吗」），能否沿着地图找到两个锚点连线处对应的课时。三问全通，地图才算内化；只背包结构的学员在第一问就会卡住——因为「模型不吐工具调用」这种症状，可能出现在模型层、协议层、工具 schema 层任何一个位置，分层定位是唯一不瞎猜的路径。

### 两份复盘表的合并：迁移资产与构建资产

L128 与本课各产出一张复盘表，收官动作是合并。两张表的栏位结构相同（漂移点/偏差/失败案例/零失败），但条目性质不同：Capstone A 的条目全是**迁移型**（新旧语义对照类——计数口径、错误路径、渲染格式），Capstone B 的条目全是**构建型**（装配契约类——middleware 顺序语义、serde 成本、消费时点）。合并的价值在交叉检验：构建型条目往往是迁移型条目的**根因**——迁移风险清单里的「摘要切割破坏消息序列」（A 类），根因正是构建世界的「摘要把 tool_call 与 ToolMessage 配对搜索纳入摘要范围」（B 类，summarization.ts 的 SEARCH_RANGE_FOR_TOOL_PAIRS 设计）；反过来，迁移型条目为构建型条目提供**反例库**——「错误吞掉方式漂移」提醒构建者显式配置 toolError 策略而不是依赖默认。

合并后的组织级资产分两册：**迁移检查单册**（L128 四栏 + 并存双取证纪律）在 0.x 项目启动时翻开，**构建检查单册**（本课四栏 + 保留名纪律 + 时点纪律）在新建 1.x 项目时翻开；两册共享同一条抽象纪律——每个条目必须能回答「在哪个断言组或哪个日志通道里可见」。这套资产的验收方式与验收套件同源：拿一个没参与过本课程的工程师，给他两册检查单与源码地图，问三个「为什么」级别的问题（为什么 middleware 顺序要声明、为什么渲染断言可全等而摘要不可、为什么 O4 型对照必须有），三个都答得上，资产化才算完成。

### 地图维护协议：版本漂移时的锚点复核清单

源码地图有一个隐含前提：锚点行号绑定在取证 commit 上（langchainjs 7704471 / langgraphjs fa426b2）。版本升级后锚点会漂移——维护协议就是回答「升级后先复核什么」。**热锚点清单**按漂移概率排序：第一梯队是导出面（middleware/index.ts:1-126 的预置清单、langchain/src/index.ts:1-79 的顶层导出）——新版本最常加 middleware 或顶层导出，grep 清单对比新旧版本即可发现增量；第二梯队是行为锚点（ReactAgent 的 invoke/streamEvents 分派、summarization 常量、toolRetry 的 onFailure 默认值）——行为默认值的变化不报错只漂移，复核手段是跑验收套件（七组断言对默认值敏感，O4/S/R 组会先红）；第三梯队是契约锚点（BaseCheckpointSaver 五方法、ToolCallRequest 字段面）——契约层最稳定，但一旦变化就是破坏性升级，直接看 changelog。复核的产出物是**锚点差异记录**：哪些行号漂了、哪些结论要改口径、哪些课时正文要更新——这门课的证据台账因此是活文档，每个新 commit 都触发一次增量复核而不是重写。

地图维护还有一条与验收资产联动的纪律：**验收套件就是锚点复核的自动化执行器**。断言套件里对源码行为的依赖（默认值、子流语义、透传行为）在版本升级后第一次跑套件就会暴露——「先跑套件再看 changelog」是升级复核的最短路径，红项自动指出需要人工核对的锚点，绿项默认无需重读源码。这套协议写完，地图就从「一张静态图」升级为「一套有维护闭环的知识资产」——这也是全课程方法论的最终形态：**结论可以过时，取证与复核的流程不会**。

### 终局自查与课程收束

收官自查四问，每问都可执行。**一问断言**：七组断言 + 三条对照断言单命令全绿了吗？报告归档了吗？**二问失效面**：六条三段式条目里，你的业务场景踩中几条、预案演练过吗？**三问地图**：给你一个新行为疑问（例如「中间件里能读到 thread 的历史状态吗」），能否按地图定位到 invoke 的 #initializeMiddlewareStates（L42）与 getState 透传（L44）？**四问划界**：还分得清哪些知识属于迁移视角（classic 锚点）、哪些属于从零视角（1.x 锚点）吗——两套锚点混用是全课程最危险的习惯，经典案例就是 classic 的 createReactAgent 与新包 createAgent 的同名陷阱（L119）：前者是旧预置 ReAct 入口、后者是新体系工厂，名字相近、体系无关，混用的第一现场往往就是 import 语句。四问皆过，这门课的交付完成。最后一句话留给地图之外的：源码会漂移、版本会更替，但「每个结论找 文件:行号、每个断言找对照、每个决策找反方案」这套方法不会——**这才是 132 课真正的交付物。**

### 本课小结

- **验收总装**：七组断言单命令化 + 两类胶水（破坏性剧本独立 thread + deleteThread 清场；O4 型对照断言补因果性）。
- **失效面六条三段式**：middleware 顺序/thread 串话/流恢复/provider 质量/终态竞态/策略缺失——触发条件、观测手段、预案齐备才算条目。
- **源码地图四机制层**：core 原语、主包行为层、langgraph 内核、checkpoint 契约；价值在四个交叉点（hook 节点化/putWrites 排序/version 分派/双策略能力协商）。
- **复盘表合并双册**：迁移检查单册与构建检查单册分场景翻开，交叉检验（构建条目是迁移条目的根因、迁移条目是构建条目的反例库）。
- **地图维护协议**：热锚点三梯队复核（导出面/行为默认值/契约层），验收套件是复核的自动化执行器——结论可以过时，取证流程不会。
- **终局自查四问**：断言、失效面、地图定位、划界——皆可执行，皆过即毕业。
- 全课程收束：方法论（行号取证、对照断言、反方案论证）比结论长寿，地图常读常新。
`,
    null,
    [
      {
        text: '失效面清单条目的「三段式」格式是什么？',
        options: [
          '问题描述 / 负责人 / 截止日期',
          '触发条件（什么输入或时序会引爆）/ 观测手段（哪组断言或哪个日志通道能看到）/ 预案（降级或规避的既定动作）',
          '严重级别 / 影响范围 / 修复成本',
          '复现步骤 / 期望结果 / 实际结果',
        ],
        answer: 1,
        explain:
          '失效面管理的目的是「可观测、可预案」：触发条件让评审者能判断自身业务是否踩中，观测手段把失效绑定到断言组（如 P1 对应 thread 串话），预案避免事发时临场决策。选项 A 是项目管理格式；选项 C 是风险矩阵格式，缺观测与预案的执行面；选项 D 是 bug 单格式，粒度在单次故障而非系统面。',
        concept: 'lc-capstone-final',
      },
      {
        text: '全课程源码地图的「四机制层」划分依据是什么？',
        options: [
          '按 npm 包边界划分',
          '按机制归属划分：messages/runnables（core 数据与组合原语）、agent+middleware（主包行为层）、graph 内核（StateGraph/Channel/Pregel tick）、checkpoint（状态持久化契约）——三包是物理分布，四层是机制视角',
          '按 Python 线的模块划分',
          '按文件数量划分',
        ],
        answer: 1,
        explain:
          '132 课的走读最终收敛为四层机制：core 的 messages 与 runnables 是数据与组合原语（L10-L36），langchain 主包的 createAgent/ReactAgent/middleware 是行为层（L37-L64），langgraph 的 StateGraph→编译接线→Channel→Pregel tick 是执行内核（L65-L82），checkpoint 五方法契约是持久层（L90-L91）。包边界（三包）与机制层不正交——classic 还承载旧抽象（L07/L102）。选项 A 把物理与逻辑混为一谈；选项 C 与 TS 线口径冲突；选项 D 无意义。',
        concept: 'lc-capstone-final',
      },
      {
        text: '流式场景新增的失效面「run.output 未 resolve 前消费终态」的正确预案是什么？',
        options: [
          '禁止使用流式',
          '消费端统一 await run.output 取终态；UI 的临时渲染只允许来自 messages/toolCalls 子流，终态判断一律以 output 为准——把「流中途消息 ≠ 终态」写成组件层约定',
          '在最后一条 AIMessage 上加标记',
          '轮询 checkpointer',
        ],
        answer: 1,
        explain:
          'L131 pitfall 已钉过：output 未 resolve 前终态消息（含 structuredResponse 注入）尚未写入，流中途的最后一条消息冒充终态会产生竞态错误。预案的正确层次是消费端契约化：临时渲染走子流、终态走 output，两通道职责分离。选项 A 因噎废食；选项 C 无此机制；选项 D 轮询 checkpointer 绕开了 run 抽象且引入延迟与竞态。',
        concept: 'lc-capstone-final',
      },
      {
        text: '验收套件里「无配置对照断言」（如 O4：无 responseFormat 则无 structuredResponse）的设计价值是什么？',
        options: [
          '增加代码量',
          '排除假阳性：证明断言通过可归因于被测配置本身，而不是字段天然存在或框架默认行为——对照断言把「相关性」升级为「因果性」',
          '提高测试覆盖率数字',
          '兼容旧版本',
        ],
        answer: 1,
        explain:
          'O3 断言双策略产出结构等价，但若 structuredResponse 字段无论配不配置都存在，O3 就毫无判别力。O4 的存在使「O3 通过」能归因到 responseFormat 接入——这是验收套件的因果性设计，与单测的对照实验同构。选项 A/B/D 都没触及归因问题。',
        concept: 'lc-capstone-final',
      },
      {
        text: '课程终局回看，createAgent 的复杂度分布结论是什么？',
        options: [
          '运行时逻辑极重，类型简单',
          '类型重载极重（14 个重载围 responseFormat 转）、运行时极薄（实现体 return new ReactAgent(params)）——复杂度在类型系统与 ReactAgent 构造器的图编译里',
          '所有复杂度在 middleware',
          'createAgent 本身就是复杂度中心',
        ],
        answer: 1,
        explain:
          '这是 02 号证据台账与 L37 共同钉死的结论：agents/index.ts:672-702 的实现体一行，重载面（index.ts:175-670）全在类型推导；执行复杂度在 ReactAgent 构造器的 allNodeWorkflows.compile（L41）。理解这个分布，读源码就知道该在哪一层找答案——类型问题查重载，行为问题查 ReactAgent 与 middleware，执行问题查图内核。选项 A 把分布说反；选项 C/D 以偏概全。',
        concept: 'lc-capstone-final',
      },
    ],
    [
      [
        '验收总套件终版',
        'I/S/R/C/K/P/O 七组断言的单命令脚本：主体组装/摘要/重试/自建拦截/检索链/持久化/流与结构，全绿报告即 Capstone B 的正确性证明',
      ],
      [
        '三段式失效面条目',
        '触发条件 + 观测手段 + 预案的格式化条目：触发条件判业务相关性，观测手段绑定断言组或日志通道，预案固化降级动作',
      ],
      [
        '全课程源码地图',
        '三包物理分布 × 四机制层逻辑归属的收束图：messages/runnables、agent+middleware、graph 内核、checkpoint，每层锚点标注对应课时',
      ],
      ['对照断言', '证明「无该配置则无该行为」的负向断言（O4 型），把验收通过从相关性归因升级为因果性归因'],
    ],
    [
      '失效面清单只列现象不给观测手段——「thread 可能串话」不可执行，「P1 断言 + getState 日志通道」才可执行；缺观测手段的条目在事故时等于没有',
      '验收报告只报全绿不附对照断言记录——没有 O4 型对照，全绿的因果链不完整，评审者无法确认断言判别力真实存在',
      '源码地图按包背一遍就当掌握——地图的价值在机制层交叉点（如 middleware 的 hook 节点化横跨 agent 层与 graph 层、checkpointer 的 putWrites 排序横跨 checkpoint 层与内核确定性），只背包结构会漏掉全部交叉面',
    ],
  ),
  'capstone',
)
