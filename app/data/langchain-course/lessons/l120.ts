import { L, withKind } from '../../course-builders.ts'

export const L120 = withKind(
  L(
    'L120',
    32,
    '双包并存与混合运行策略：共享 core 的类型互通',
    2,
    ['L07'],
    ['lc-dual-package'],
    [
      '能从两个 package.json 的依赖表取证双包并存的设计意图：classic 与新 langchain 共享同一 @langchain/core，classic 不依赖新包运行时',
      '能解释类型互通机制：同一个 Document/BaseMessage 类实例在两包间传递无需转换，并指出互通的边界（classic 内部旧协议对象不可跨界）',
      '能为一个混合运行项目制定依赖版本策略与迁移节奏（按目录渐进替换，而非一次性重写）',
    ],
    `### 一、并存不是妥协，是设计

前面十课都在做「替换」，本课换一个问题：**替换为什么可以慢慢来？** 答案藏在两个 package.json 里。1.x 的官方世界观不是「新包替掉旧包」，而是「两包并存、共享地基、渐进替换」——classic 的 npm 名就叫 @langchain/classic，description 写着 *Old abstractions from LangChain.js*（langchain-classic/package.json:2-4），它是明牌的迁移缓冲区。本课从依赖表取证并存的物理基础，再讨论混合运行的正确姿势与它的边界。

### 二、依赖表取证：三条关键依赖线

先读 classic 的 package.json（行号逐一核实）：

\`\`\`jsonc
// langchain-classic/package.json 关键行
// :2-4  "name": "@langchain/classic", "version": "1.0.61", "description": "Old abstractions from LangChain.js"
// devDependencies（测试用，非运行时）：
  "@langchain/core": "workspace:^",      // :123
  "@langchain/langgraph": "1.4.18",      // :131 —— 只有测试用到图
  "langchain": "workspace:*",            // :173 —— 测试里同时引新包做对照
// peerDependencies：
  "@langchain/core": "workspace:^",      // :200 —— 唯一的硬 peer
  "cheerio"/"peggy"/"typeorm": optional  // :201-215
// dependencies：
  "@langchain/openai", "@langchain/textsplitters", "handlebars", "js-yaml", "zod"  // :216-225
\`\`\`

*— langchain-classic/package.json（commit 7704471，行号注释版节选）*

再读新包的关键行：\`"name": "langchain", "version": "1.6.6"\`（package.json:2-3），dependencies 里 \`"@langchain/core": "workspace:^"\`（:48）与 \`"@langchain/langgraph": "^1.6.1"\`、\`"@langchain/langgraph-checkpoint": "^1.1.5"\`（:77-78）。三组事实拼出并存设计的全貌：

1. **classic 运行时只需要 core**：peerDependencies 唯一硬依赖是 @langchain/core（:200）；langgraph 1.4.18 与新包 langchain 都只在 devDependencies（:131/:173）——classic 的测试代码同时引用三个包做对照测试，但产品运行时不依赖它们。
2. **新包运行时需要 core + langgraph**：Agent 即编译图（L105），langgraph 是 dependencies 不是 devDependencies。
3. **两包的 core 是同一份**：workspace:^ 让 monorepo 内两包解析到同一个 core 包——这是类型互通的物理基础。

### 三、类型互通：同一进程，一份类定义

共享 core 意味着运行时里 \`Document\`、\`BaseMessage\`、\`VectorStore\` 这些类只有一份构造函数。跨包传递对象时：

\`\`\`ts
// 混合运行的真实形状：core 类型自由流动
import { Document } from "@langchain/core/documents";           // core
import { HumanMessage } from "@langchain/core/messages";        // core
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory"; // classic 实现
import { createAgent } from "langchain";                        // 新包
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";

// classic 的 loader 产出 core Document
const loader = new DirectoryLoader("./docs");
const docs = await loader.load();        // DocumentInterface[]（core 类型）

// classic 的向量库存 core Document
const store = await MemoryVectorStore.fromDocuments(docs, embeddings);

// core 消息直接进新 agent
const agent = createAgent({ model: "openai:gpt-4o" });
const answer = await agent.invoke({
  messages: [new HumanMessage(\`总结 \${docs.length} 份文档的要点\`)],
});
\`\`\`

三段代码里没有任何转换层：loader 与向量库之间、向量库与 agent 之间流动的都是同一份 core 类型。class 级判型（\`instanceof Document\`）成立；消息级判型的机制值得展开看一眼源码（core messages/base.ts）：

\`\`\`ts
// :21   const MESSAGE_SYMBOL: symbol = Symbol.for("langchain.message");
// :234  readonly [MESSAGE_SYMBOL] = true as const;
// :374  static [Symbol.hasInstance](obj: unknown) { ... }
\`\`\`

*— langchain-core/src/messages/base.ts:21-374（commit 7704471，行号索引）*

三行合起来是 L05 讲过的跨包判型方案：每个消息实例挂一个 \`Symbol.for("langchain.message")\` 常量标记（:234），BaseMessage 的静态 \`Symbol.hasInstance\`（:374）不用原型链比对、改查这个标记（:368-369 的判定条件）。\`Symbol.for\` 注册的是全局符号表——即使依赖树里出现两份 core 实例，\`Symbol.for("langchain.message")\` 解析到的仍是同一个 symbol，消息判型照样成立。这就是第五节 quiz 场景（旧集成包锁死旧版 core）不会拖垮 agent 消息处理的原因。非消息类型（Document/VectorStore）没有这层保护，它们靠「单一 core 实例」维持判型——L120 版本纪律的第一条（npm ls 验证单实例）正是为这些类服务的，两类判型的保护级别不同，纪律要求也不同。

互通的边界同样要划清：**core 类型可跨界，classic 内部协议对象不可**。BufferMemory 的输出 \`{ history: string }\`（getBufferString 渲染的字符串）、BaseChain 的 call/values 字典、AgentAction/AgentFinish 二元组——这些是 classic 内部协议的类型，拿到新代码里无处安放。混合运行的安全写法是：**跨界点只传 core 类型（messages/Document/工具对象），classic 的编排层（Chain/Memory/Executor）留在跨界点以内，逐步内化替换**（L121-L123 走查就是按这个纪律做的）。

### 四、混合运行策略：节奏与版本纪律

并存策略的执行面是两个清单。**节奏清单**——按依赖方向定替换顺序：先替换「消费 core 类型的叶节点」（loaders/splitters/vectorstore 调用），再替换编排层（Chain 族 → LCEL，Memory 族 → messages + middleware），最后替换 agent 层（AgentExecutor → createAgent）；每替换一层跑一轮行为断言（L116-L119 已给过模板），而不是停服重写。**版本纪律清单**——依赖树里只允许一份 @langchain/core：用包管理器的 overrides/resolutions 锁定 core 版本，安装后跑 \`npm ls @langchain/core\`（或 pnpm why）确认单实例；检查每个 classic 集成包（typeorm/cheerio 等可选 peer，classic package.json:201-215）声明的 core 区间是否与你的版本兼容。classic 的 peer 面还有一个容易被忽略的细节：peerDependenciesMeta 里 cheerio/peggy/typeorm 三个全部标了 \`optional: true\`（package.json:205-214），另外 optionalDependencies 里还挂着 langsmith（package.json:226-227）——这意味着 classic 的实际依赖面随你的用量伸缩：不用 SQL 链就不装 typeorm、不用 OpenAPI loader 就不装 peggy。混合运行的依赖审计要按「实际启用的 classic 子入口」算面积，而不是按包级 peer 声明算，否则会把共存成本估高一个数量级。双包并存还有一个隐性收益要记下：迁移期的新功能（middleware、responseFormat）只在新包有，混合运行让你**立即享用新能力，同时存量功能零风险**——这是官方把这个状态做成一等公民的原因。

### 本课小结

- 依赖表三条线：classic 运行时只 peer core（package.json:200）、langgraph 与新包仅在其 devDeps（:131/:173）、新包硬依赖 langgraph（langchain/package.json:77）——两代架构对图内核的依赖性质完全不同。
- 类型互通的物理基础是共享同一份 core 类定义；消息家族还有 Symbol.for 判型兜底（L05）。
- 跨界纪律：只传 core 类型（messages/Document/工具），classic 内部协议对象（memory 变量串、call/values 字典、AgentAction）不出界。
- 迁移节奏按依赖方向逐层替换，core 版本单一化是版本纪律的第一条。
- 从下一课开始是三堂完整应用走查：RAG 问答、对话助手、工具调用 Agent——把 L102-L119 的所有映射公式放进真实应用里各演练一遍。
`,
    null,
    [
      {
        text: 'classic 包（@langchain/classic）对新包 langchain 的运行时依赖是什么？',
        options: [
          'dependencies 里声明了 langchain',
          '没有运行时依赖：langchain 只出现在 devDependencies（classic package.json:173，仅测试用），peerDependencies 只有 @langchain/core（:200）',
          'classic 完全独立，连 core 都不依赖',
          'classic 被 langchain 依赖',
        ],
        answer: 1,
        explain:
          'classic package.json 的依赖证据：devDependencies 里有 "langchain": "workspace:*"（:173）与 "@langchain/langgraph": "1.4.18"（:131）——只是自己测试用的；peerDependencies 块（:199-204）只有 @langchain/core 与可选的 cheerio/peggy/typeorm。运行时 classic 只需要 core。C 错：core 是 hard peer；D 错：依赖方向是 classic 的开发测试引用新包，不是运行时依赖。',
        concept: 'lc-dual-package',
      },
      {
        text: '双包能类型互通的机制基础是什么？',
        options: [
          'classic 与新包都把对方列入 dependencies',
          '两包共享同一个 @langchain/core：Document/BaseMessage 等类在运行时是同一个构造函数产物，instanceof 判型天然成立（配合 L05 讲的 Symbol.for 跨包判型）',
          'TypeScript 的 structural typing 自动兼容一切',
          '通过 JSON 序列化转换',
        ],
        answer: 1,
        explain:
          '依赖证据：classic package.json:123 与新包 langchain/package.json:48 都声明 "@langchain/core": "workspace:^"——monorepo 内解析到同一个 core 实例，同一进程里只有一份类定义，跨包传递 Document/BaseMessage 不需要转换。这是官方设计的「混合运行」路径（台账证据 36）。C 错：结构类型只在类型层兼容，跨包 instanceof 与序列化行为还要求运行时同一份实现——这正是共享 core 的意义；D 错：无需序列化。',
        concept: 'lc-dual-package',
      },
      {
        text: '新包 langchain 对 @langchain/langgraph 的依赖说明了什么架构事实？',
        options: [
          '新包只是 langgraph 的语法糖',
          '新包 dependencies 明确声明 "@langchain/langgraph": "^1.6.1"（langchain/package.json:77）——Agent 即编译图，图内核是硬依赖（L105 世界观）',
          'langgraph 是可选依赖',
          'classic 也硬依赖同版本 langgraph',
        ],
        answer: 1,
        explain:
          'langchain/package.json:77 在 dependencies 块里声明 @langchain/langgraph ^1.6.1（还有 :78 的 langgraph-checkpoint），因为 createAgent 编译出的 ReactAgent 内部持有 #graph。classic 的 langgraph 依赖只在 devDependencies（:131）且版本 1.4.18——两边对 langgraph 的依赖性质完全不同，这是两代架构的分水岭证据（L102）。',
        concept: 'lc-dual-package',
      },
      {
        text: '混合运行项目里，下列哪种用法会破坏互通？',
        options: [
          '把 classic BufferMemory 产出的 getBufferString 字符串传给新 agent 的 messages',
          '把 classic DocumentLoader 产出的 Document[] 传给 classic 检索链',
          '把 core 的 HumanMessage 实例直接放进新 createAgent 的 invoke 入参',
          '新 agent 与 classic RetrievalQA 链共享同一个 MemoryVectorStore 实例',
        ],
        answer: 0,
        explain:
          'BufferMemory 的 loadMemoryVariables 输出的是 { history: string }（buffer_memory.ts:80-96 的 getBufferString 渲染结果），而新 agent 的入参契约是 messages: BaseMessage[]——字符串不是消息对象，类型与语义都不同构，需先按 L109 的方式显式构造消息列表。B/C/D 全部基于共享 core 类型（Document/HumanMessage/VectorStore），互通成立。',
        concept: 'lc-dual-package',
      },
    ],
    [
      [
        '混合运行',
        'classic 与新 langchain 同进程并存的官方迁移路径：共享 core 地基，按模块渐进替换，而非一次性重写',
      ],
      [
        'workspace:^',
        'monorepo 依赖声明：classic 与新包的 @langchain/core 都解析到仓库内同一份实现，是类型互通的物理基础',
      ],
      [
        '迁移缓冲区',
        'classic 包的官方定位（package.json description：Old abstractions from LangChain.js）——不是永久产品线，是给存量代码的缓冲带',
      ],
    ],
    [
      '以为 classic 会跟着 1.x 演进新特性——它的定位是旧抽象收藏馆（description 原文），只修不进；混合运行要按「逐步清零 classic 依赖」规划，不要新增 classic 用法',
      '在一个项目里装两份不同来源的 @langchain/core（如某个旧集成包锁死旧版 core）——两份 core 实例会让 instanceof 判型失败（L05 的 Symbol.for 解法只救消息类），锁版本前先检查依赖树',
      '把「classic 能跑」当成「classic 无害」——它的 experimental/autogpt 等模块绑定旧协议与旧模型 API，长期看是与 1.x 世界观脱节的死代码',
    ],
  ),
  'theory',
)
