import { L, withKind } from '../../course-builders.ts'

export const L111 = withKind(
  L(
    'L111',
    31,
    'EntityMemory/CombinedMemory/VectorStoreRetrieverMemory 的 1.x 化身',
    2,
    ['L109'],
    ['lc-entity-memory-migration'],
    [
      '实现 EntityMemory（实体抽取链 + 实体摘要链 + EntityStore）到「自写 middleware + stateSchema 自定义状态」的改写并跑通',
      '构建 CombinedMemory 的 stateSchema 多字段等价物（记忆组合→状态字段合并），产出字段对照',
      '打通 VectorStoreRetrieverMemory 到「InMemoryStore/向量库 + 检索 middleware」的迁移路径，产出三类记忆的选型决策表',
    ],
    `### 没有现成答案的三类记忆

Memory 族迁移的前两课都有较直接的映射，本课处理三个「官方没给现成替代」的实现：EntityMemory、CombinedMemory、VectorStoreRetrieverMemory。核心结论：**这三类记忆的积木（KV 存储、向量检索、模型调用）在 1.x 全部存活，死掉的只是「挂在 chain 上的隐式协议」——迁移方式是自组：stateSchema 定义状态字段，自写 middleware 定义读写时机。**这是 Memory 族里动手量最大的一课，commit 7704471 取证。

### EntityMemory：两条链 + 一个 KV 店

先解剖旧实现（entity_memory.ts:71-90）：

\`\`\`ts
export class EntityMemory extends BaseChatMemory implements EntityMemoryInput {
  private entityExtractionChain: LLMChain;
  private entitySummarizationChain: LLMChain;

  entityStore: BaseEntityStore;
  entityCache: string[] = [];
  k = 3;
  chatHistoryKey = "history";
  entitiesKey = "entities";
\`\`\`

*— langchain-classic/src/memory/entity_memory.ts:71-87（commit 7704471）*

工作流：saveContext 时 entityExtractionChain 用模型从「新输入」里抽取实体名 → entityCache 缓存当前实体的摘要 → entitySummarizationChain 把该实体相关历史压成摘要存进 entityStore → loadMemoryVariables 返回 \`{ history, entities }\` 两个变量。1.x 迁移是完整自组：

\`\`\`ts
import { createAgent, createMiddleware } from "langchain";
import { InMemoryStore } from "langchain";
import { Annotation } from "@langchain/langgraph";

// 1. stateSchema：在 messages 之外加实体字段
const AgentState = Annotation.Root({
  entities: Annotation<string[]>({
    reducer: (a, b) => [...new Set([...a, ...b])],
    default: () => [],
  }),
});

// 2. 自写 middleware：afterModel 抽实体、存 KV
const entityMemory = createMiddleware({
  name: "entityMemory",
  afterModel: async (state, runtime) => {
    const store: InMemoryStore = runtime.store;
    const text = state.messages.at(-1)?.content as string;
    const names = await extractEntities(model, text);   // 模型调用：旧 entityExtractionChain 的角色
    for (const name of names) {
      await store.put(["entities", threadId], name, { summary: await summarizeEntity(name) });
    }
    return { entities: names };
  },
});

const agent = createAgent({
  model: "openai:gpt-4o",
  stateSchema: AgentState,
  middleware: [entityMemory],
});
\`\`\`

两个要点：**entityExtractionChain/SummarizationChain 的模型调用没有消失，只是从记忆类内部搬进 middleware 的 hook**；entityStore 的 KV 需求由 InMemoryStore（core stores.ts:56）承接——通用 KV 抽象比专用 EntityStore 更普适。stateSchema 的 \`entities\` 字段有 reducer（合并去重），这是 1.x 状态系统的标准姿势（L65/L70 的通道模型）。字段面上还有两个旧实现细节值得搬进自组版：\`k = 3\` 是每个实体召回的最近轮数预算——entitySummarizationChain 每次只拿该实体相关的前 k 条历史重新压缩，自组时对应「检索条数」参数；\`entityCache: string[]\` 缓存当前已抽取的实体名，避免每轮都跑一遍抽取链——自组时对应「本轮已抽实体列表」的去重检查，漏掉它抽取调用的量会翻倍。

### entityStore 契约与 InMemoryStore 的 API 对照

entityStore 的接口窄得出奇（langchain-classic/src/memory/stores/entity/base.ts:7-19，commit 7704471）：

\`\`\`ts
export abstract class BaseEntityStore extends Serializable {
  abstract get(key: string, defaultValue?: string): Promise<string | undefined>;
  abstract set(key: string, value?: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
}
\`\`\`

*— langchain-classic/src/memory/stores/entity/base.ts:7-19（commit 7704471）*

五个方法、string 进 string 出，是「实体名 → 摘要文本」的专用窄 KV。对照新世界的 InMemoryStore：BaseStore 把所有操作收敛到一个抽象方法 \`batch\`，get/put/search 都是 batch 的语法糖（store/base.ts:407-440），键是 \`namespace 数组 + key\` 的分层结构，值是结构化 Item（value 之外自带 createdAt/updatedAt 时间戳）。逐项映射：\`get(key)\` → \`store.get([namespace], key)\`；\`set(key, value)\` → \`store.put([namespace], key, value)\`；\`exists\` → get 后判 null；\`delete/clear\` → store 的 delete 语义按 namespace 范围组合。**值从 string 升级为对象**——旧实现里往 entityStore 塞 JSON 字符串再 parse 的习惯可以整个丢掉，直接存 \`{ summary, updatedAt }\` 这样的结构。namespace 的用法也有讲究：把「实体存储」独立成 \`["entities"]\` 或按会话细分 \`["entities", threadId]\`，deleteThread 清理时就能按前缀批量删除——旧 BaseEntityStore 的 clear() 是全清，粒度反而粗。

### CombinedMemory：组合需求由状态合并取代

旧 CombinedMemory（combined_memory.ts:26）把多个记忆体装进 \`memories: BaseMemory[]\`，构造时 \`checkRepeatedMemoryVariable()\` 防止变量名冲突——组合的本质是「多个记忆体往一个输入字典塞变量，还得防撞名」。1.x 里字典变量变成状态字段，撞名问题自然消失：

\`\`\`ts
// 旧：new CombinedMemory({ memories: [bufferMemory, summaryMemory, entityMemory] })
//    三个 memoryKeys（history/summary/entities）拼进同一个 prompt 字典

// 新：stateSchema 多字段 + middleware 各管一字段
const MyState = Annotation.Root({
  entities: Annotation<string[]>({ reducer: (a, b) => [...new Set([...a, ...b])], default: () => [] }),
  // messages 是内置字段；摘要交给 summarizationMiddleware 管
});

const agent = createAgent({
  model: "openai:gpt-4o",
  stateSchema: MyState,
  middleware: [
    summarizationMiddleware({ trigger: { tokens: 4000 } }),  // 管摘要维度
    entityMemory,                                             // 管实体维度
  ],
});
\`\`\`

对照读法：旧版的「组合」是一个容器类在协调 N 个记忆体；新版是「每个字段一个所有者」——middleware 之间天然正交，不需要协调器。checkRepeatedMemoryVariable 的防撞名在状态模型里是类型错误而非运行时检查。这里还有一层迁移语义值得点破：旧 CombinedMemory 的 returnMessages 开关、inputKey/outputKey 字段在新世界里统统没有对应物——多形态输出的问题被「状态字段类型即输出类型」解决，inputKey 的选择问题被「状态字段名就是访问路径」解决。组合记忆迁移的验收标准可以定得很客观：旧代码里通过 loadMemoryVariables 得到的每个变量（history/summary/entities…），在新 agent 里都能从 getState 或自定义字段的输出里取到同语义的值；找不到对应字段的变量，说明组合里混进了无效记忆，顺手清理。另一个容易漏的语义是**触发顺序**：旧 CombinedMemory 按 memories 数组顺序逐个 load/save，顺序决定了变量注入模板的先后；新世界里字段之间没有隐式顺序，依赖关系（比如「摘要要读实体字段」）必须写成 middleware 的显式先后或在一个 hook 里串行完成——组合逻辑从容器里搬回了你的代码，这是自组的代价，也是可见性的收益。

### VectorStoreRetrieverMemory：语义检索搬进 middleware

旧实现（vector_store.ts:65-95）持有 \`vectorStoreRetriever\`，loadMemoryVariables 时按输入做语义检索取相关记忆（returnDocs 决定返回 Document 还是字符串）。旧类的字段面还有一个 \`inputKey\` 与注入键的约定：检索结果默认塞进 memoryKey 指定的变量（"history"），与 BufferMemory 共用模板占位符——迁移后这个「检索结果放进哪个变量」的问题变成「检索结果放进哪条消息」，答案通常是 beforeModel 里返回的 system 扩展或拼接进下一条 HumanMessage 前缀。迁移关键是认清**检索积木原样存活**：BaseRetriever 在 core retrievers/index.ts:31-61，VectorStore 在 core vectorstores.ts:553：

\`\`\`ts
import { createMiddleware } from "langchain";

const semanticMemory = createMiddleware({
  name: "semanticMemory",
  beforeModel: async (state, runtime) => {
    const last = state.messages.at(-1)?.content as string;
    // 旧 loadMemoryVariables 的语义检索，等价搬进 hook
    const docs = await vectorStoreRetriever.invoke(last, { k: 4 });
    return { systemExtra: docs.map((d) => d.pageContent).join("\\n") };
  },
});
// 注意：写入侧（旧 saveContext 里 addDocuments）也要对应在 afterAgent 或工具里补上
\`\`\`

一个容易漏的点：旧 memory 的读写是配对的（load + save），自组 middleware 时**读（beforeModel 检索）容易写，写（把新内容入向量库）别忘**——旧协议自动帮你做 saveContext，新协议里写什么、何时写全部由你声明。写入时机的选择也是设计决策：挂在 afterModel 意味着「模型回答一出炉就入库」，挂在工具里意味着「只有确认的事实才入库」，两者的库内容质量与增长速度差别很大，迁移前先对照旧 saveContext 的实际写入内容再定。与 checkpointer 的关系最后再强调一次：checkpointer 管的是「会话状态快照」（重启可恢复），语义检索 memory 管的是「跨会话的相关知识召回」（thread 之间也能命中）——两者维度正交、可以并存，长期记忆选型时按「会话内恢复用 checkpointer、跨会话召回用 Store/向量库」二分即可。

### 选型决策表与小结

| 旧记忆类型 | 状态需求 | 1.x 化身 | 动手量 |
|---|---|---|---|
| EntityMemory | 抽取+摘要+KV | 自写 middleware + stateSchema.entities + InMemoryStore | 大 |
| CombinedMemory | 多记忆组合 | stateSchema 多字段 + 多 middleware 正交 | 中 |
| VectorStoreRetrieverMemory | 语义检索 | 检索 middleware（BaseRetriever 积木原样用） | 中 |

动手量的差异本质上是「框架替你做了多少」的差异：EntityMemory 旧实现里两条 LLMChain 的 prompt 拼装、entityStore 的读写时序、entityCache 的去重，全是框架内部黑盒——自组时这三件事都要自己写，所以动手量最大；CombinedMemory 只是协调器，字段化之后协调器消失，剩的多是配置活；VectorStoreRetrieverMemory 的检索一行 invoke 就等价，难的只是写入时机的设计决策。评估迁移工作量时按这个口径估：**旧类里有多少「框架黑盒行为」，自组版就要写多少显式代码**。

本课小结：

- 三类记忆无一有现成官方 middleware——积木（模型调用、KV、向量检索）存活，隐式协议死亡，迁移=自组。
- EntityMemory 的两条 LLMChain 搬进 hook，k=3 与 entityCache 对应「检索条数」与「去重缓存」两处细节；entityStore 换 InMemoryStore（namespace 分层 KV、结构化 Item），stateSchema 加 reducer 合并实体字段。
- CombinedMemory 的组合需求由「状态多字段 + middleware 正交」取代，撞名检查变成类型系统问题，变量注入顺序变成显式依赖。
- VectorStoreRetrieverMemory 的检索积木原样可用，写侧入库时机（afterModel vs 工具内）是新世界新增的设计决策；checkpointer 管会话恢复、语义记忆管跨会话召回，两维并存。
- 自组时读写要配对声明：旧协议的 saveContext 自动化消失，写入侧必须显式。
- 下一课是本模块的压轴对照：AgentExecutor → createAgent 的主循环与构造参数逐项映射。
`,
    null,
    [
      {
        text: 'EntityMemory 内部依赖哪两条链？这揭示了它的迁移本质是？',
        options: [
          'LLMChain 一条；本质是改个类名',
          'entityExtractionChain 与 entitySummarizationChain 两条 LLMChain + entityStore；迁移本质是把「两条链的编排」重写为 middleware 里的模型调用',
          'RetrievalQAChain 一条；本质是升级 RAG',
          '没有链，纯字典操作；迁移毫无难度',
        ],
        answer: 1,
        explain:
          'entity_memory.ts:71-90：`private entityExtractionChain: LLMChain` 与 `private entitySummarizationChain: LLMChain`，外加 `entityStore: BaseEntityStore` 与 `k = 3`。1.x 没有 EntityMemory 同名类，也没有预置「实体记忆」middleware——迁移必须自写 middleware（用 beforeModel/afterModel hook 调模型抽实体、写 stateSchema 扩展的状态字段）。A 错在是两条；C 错在跟 RAG 无关；D 错在它内部两条 LLMChain 做真模型调用。concept=lc-entity-memory-migration。',
        concept: 'lc-entity-memory-migration',
      },
      {
        text: 'CombinedMemory 的「多记忆组合」需求在 1.x 由什么机制承接？',
        options: [
          '一个 CombinedMiddleware 官方类',
          'stateSchema 定义多个状态字段（history/summary/entities 各是一个 channel）+ 多个 middleware 各管一字段——组合需求由状态合并取代',
          'trimMessages 的多轮裁剪',
          '必须迁移成多个独立 agent',
        ],
        answer: 1,
        explain:
          'combined_memory.ts:26 的 CombinedMemory 持有 `memories: BaseMemory[]` 并在构造时 checkRepeatedMemoryVariable() 检查变量名冲突——组合的本质是「多个记忆体往一个输入字典里塞变量」。1.x 的等价机制是 stateSchema 多字段：每类记忆一个状态 channel（messages 之外可加 entities、summary 等），middleware 分管各字段。A 错，无官方组合中间件；C 错，trim 是裁剪不是组合；D 错，单 agent 多字段状态即可。concept=lc-entity-memory-migration。',
        concept: 'lc-entity-memory-migration',
      },
      {
        text: 'VectorStoreRetrieverMemory 的存储与检索在 1.x 怎么搭？',
        options: [
          '换成 ChatMessageHistory 就行',
          '向量库 + 检索 middleware：memory 的「语义检索历史」本质是 vectorStoreRetriever.invoke(input)，1.x 里这个积木原样可用（BaseRetriever 在 core），包在自写 middleware 里调用',
          '被 checkpointer 完全取代',
          '没有等价物，只能放弃',
        ],
        answer: 1,
        explain:
          'vector_store.ts:65 的 VectorStoreRetrieverMemory 持有 vectorStoreRetriever，loadMemoryVariables 时按输入做语义检索取相关记忆。1.x 里 BaseRetriever 抽象在 core（retrievers/index.ts:31-61）、VectorStore 在 core（vectorstores.ts:553），检索积木全活着；要做的是把「读记忆时检索」从 memory 协议搬进 middleware。A 错，消息历史不做语义检索；C 错，checkpointer 管图状态快照，语义检索是另一维度；D 错，积木齐全可自组。concept=lc-entity-memory-migration。',
        concept: 'lc-entity-memory-migration',
      },
      {
        text: 'EntityMemory 的 entityStore（如 InMemoryEntityStore）在 1.x 的就近替代是？',
        options: [
          'InMemoryStore（core stores.ts:56，langchain/src/index.ts:64 re-export）——通用 KV 存储',
          'MemorySaver',
          'InMemoryVectorStore',
          '没有 KV 存储，只能用数据库',
        ],
        answer: 0,
        explain:
          'BaseStore<K,V>/InMemoryStore 定义在 core stores.ts:6,56，主包 index.ts:64 直接 re-export InMemoryStore——实体摘要这类「按实体名取备注」的 KV 需求正好落在这里。B 错，MemorySaver 是图状态快照不是 KV；C 错，向量库是语义检索维度；D 错，core 有标准 KV 抽象。注意 entityStore 本体（stores/entity/in_memory.ts:7 的 InMemoryEntityStore extends BaseEntityStore）留在 classic，自组迁移时用 InMemoryStore 重写。concept=lc-entity-memory-migration。',
        concept: 'lc-entity-memory-migration',
      },
    ],
    [
      [
        'EntityMemory',
        '旧实体记忆（entity_memory.ts:71）：两条 LLMChain（抽取+摘要）+ EntityStore KV + k=3 取条数',
      ],
      [
        'stateSchema 多字段',
        '1.x 组合记忆的承接机制：createAgent 的 stateSchema 定义 messages 之外的额外状态 channel，各 middleware 分管',
      ],
      ['InMemoryStore', 'core 的通用 KV 存储（stores.ts:56）：entityStore 的就近替代'],
      [
        '语义检索记忆',
        'VectorStoreRetrieverMemory 的本质：按当前输入从向量库召回相关历史——1.x 里作为检索 middleware 存在',
      ],
    ],
    [
      '以为三类记忆有现成 middleware 等价物——官方预置的是 summarization/trim 族，实体/组合/语义检索记忆都要自写 middleware + stateSchema',
      '自写实体抽取 middleware 时忘了类型推导——stateSchema 用 Annotation/Zod 定义字段，别绕过 schema 直接塞自定义对象',
      '把 VectorStoreRetrieverMemory 的语义检索记忆与 checkpointer 混为一谈——前者是「相关知识召回」，后者是「会话状态快照」，两个维度可并存',
    ],
  ),
  'practice',
)
