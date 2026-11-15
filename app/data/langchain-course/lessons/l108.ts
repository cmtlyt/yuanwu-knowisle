import { L, withKind } from '../../course-builders.ts'

export const L108 = withKind(
  L(
    'L108',
    31,
    'Chain 族迁移（下）：RetrievalQA/Stuff/MapReduce/Refine 与路由链、无替代项',
    2,
    ['L107'],
    ['lc-retrievalqa-migration'],
    [
      '实现 RetrievalQAChain 到「createRetrievalChain（LCEL 版）或自组 Runnable 管线」的两种改写路径，并核对输入键从 query 到 input+context 的变化',
      '构建 StuffDocumentsChain 的 LCEL 等价物（createStuffDocumentsChain），跑通与 MapReduce/Refine 两种策略的 RunnableEach/RunnableLambda 自组版本',
      '写出一个 RunnableBranch 路由节点替代 MultiRouteChain，产出「迁移 vs 留 classic」的决策标注表',
    ],
    `### Chain 族的重灾区：RAG 与路由

上一课拿下三条基础链，本课处理 Chain 族里最复杂的一批：RAG 合成链（RetrievalQA/Stuff/MapReduce/Refine）与路由链家族。核心结论：**这批链的迁移不是「找同名新类」，而是两种路径——官方已把部分概念 LCEL 化（createRetrievalChain/createStuffDocumentsChain 留在 classic 作桥），其余（MapReduce/Refine/路由族）用 core 原语自组；没有的替代就是没有，别等。**本课全部改写基于 classic 源码取证，commit 7704471。

### RetrievalQAChain 解剖与两种改写

先看清旧形态的内部结构（retrieval_qa.ts:57-117）：

\`\`\`ts
export class RetrievalQAChain extends BaseChain implements RetrievalQAChainInput {
  inputKey = "query";
  retriever: BaseRetrieverInterface;
  combineDocumentsChain: BaseChain;
  returnSourceDocuments = false;

  async _call(values, runManager) {
    const question: string = values[this.inputKey];
    const docs = await this.retriever.invoke(question, runManager?.getChild("retriever"));
    const inputs = { question, input_documents: docs, ...values };
    const result = await this.combineDocumentsChain.call(inputs, runManager?.getChild("combine_documents"));
    ...
  }
}
\`\`\`

*— langchain-classic/src/chains/retrieval_qa.ts:57-117（commit 7704471，有裁剪）*

结构一目了然：检索器取文档 → 拼进 \`{ question, input_documents }\` 字典 → 交给另一条 BaseChain 合成答案。**输入键是 query 不是 input**，这是迁移后最容易踩的第一个坑。两个次级字段也要交代去向：\`returnSourceDocuments\`（默认 false）开着时旧链把原始文档塞进返回字典的 sourceDocuments 键——迁移后这个需求被 context 字段自然覆盖（新协议把文档放输出里是默认行为，开关消失）；\`_call\` 里的 \`runManager?.getChild("retriever")\` 与 \`getChild("combine_documents")\` 是旧架构手工构造回调子树的现场——检索与合成在 trace 里是两个具名子 run，迁移到自组管线后这层手工接线消失，Runnable 管线自动生长同名子树（L36 的 getChild 机制），观测粒度不降反升。改写路径一：官方 LCEL 桥。

\`\`\`ts
// 路径一：classic 内的 LCEL 版（chains/retrieval.ts:70，返回 Runnable）
import { createRetrievalChain } from "@langchain/classic/chains/retrieval";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";

const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });
const ragChain = await createRetrievalChain({ retriever, combineDocsChain });
const res = await ragChain.invoke({ input: "问题", chat_history: [] });
// res = { answer, context: Document[] } —— 键名协议已换代
\`\`\`

路径二：完全自组（迁去新包时的最终形态）：

\`\`\`ts
import { RunnableLambda } from "@langchain/core/runnables";

const selfRag = RunnableSequence.from([
  (input: string) => ({ question: input }),
  // 检索环：可拆出独立复用
  RunnableLambda.from(async (q: string) => ({
    question: q,
    context: await retriever.invoke(q),
  })),
  // 合成环：formatDocuments 即 Stuff 策略
  ({ question, context }) => ({
    messages: [
      systemPrompt,
      new HumanMessage(\`\${formatDocs(context)}\\n\\n问题：\${question}\`),
    ],
  }),
  model,
]);
\`\`\`

自组版的收益：检索与合成两个环节是显式节点，各自的流式、缓存、重试都能单独配置——旧 RetrievalQAChain 的 \`_call\` 里这些全都搅在一起。

### Stuff/MapReduce/Refine：一个有桥，两个自组

三种文档合并策略在旧架构里各是一个类（combine_docs_chain.ts:29,131,306），1.x 的命运不同。**Stuff 有官方桥**：\`createStuffDocumentsChain\`（combine_documents/stuff.ts:37）就是 LCEL 版工厂，上一节已用。**MapReduce 与 Refine 无一等价官方类**，用 core 原语自组：

\`\`\`ts
// MapReduce：RunnableEach 逐项分发 + 聚合节点（base.ts:1618 是 RunnableEach）
const mapStep = RunnableEach.from({
  key: "doc",
  runnable: RunnableLambda.from((doc: Document) =>
    doc.pageContent.slice(0, 4000)),
}).pipe(mapPrompt).pipe(model).pipe(new StringOutputParser());

const mapReduce = RunnableSequence.from([
  RunnableLambda.from((docs: Document[]) => docs.map((d) => [d])),
  mapStep,
  // 聚合：摘要节点合并各分片结果
  RunnableLambda.from((answers: string[]) => answers.join("\\n\\n")),
  reducePrompt,
  model,
]);

// Refine：带累积状态的循环（自组示意）
const refine = async (docs: Document[], question: string) => {
  let acc = "";
  for (const doc of docs) {
    const r = await model.invoke(refinePrompt.format({
      existing: acc, doc: doc.pageContent.slice(0, 4000), question,
    }));
    acc = r.content as string;
  }
  return acc;
};
\`\`\`

Refine 本质是「带状态的串行循环」，RunnableLambda 的 async 函数里写 for 循环即可；注意它无法并行、长文档时代价线性增长——迁移时也是重新评估策略的好时机。还有一个迁移评审常见问题值得提前回答：**为什么官方不给 MapReduce/Refine 出新版类？**答案藏在旧类的实现里——它们各自携带大量 prompt 拼装与分块逻辑（combine_docs_chain.ts 的 131-306 行区间内），这些逻辑在新架构里全部应该由使用者按自己的文档形态定制：分块多大、每片 prompt 怎么写、聚合方式是什么，都是业务决策而非框架决策。框架把这个决策权交还，代价就是迁移时要自己写这些编排——用 core 原语组装大约五十行，换来的是每一块都可控可测。若团队里这类链只有一两处使用，自组成本完全可控；如果使用面很广，把它们封装成项目内部的工具函数集，比等待官方新类更现实。

### 路由链家族：结构换 RunnableBranch，决策自己写

路由族的家谱：MultiRouteChain（router/multi_route.ts:63）→ 依赖 LLMRouterChain（router/llm_router.ts:32）让模型输出路由决策，MultiPromptChain/MultiRetrievalQAChain（multi_prompt.ts:40、multi_retrieval_qa.ts:66）是两种预设。1.x 无同名替代。改写时把「结构」与「决策」拆开：

\`\`\`ts
import { RunnableBranch } from "@langchain/core/runnables";

// 决策节点：用结构化输出让模型选路由（替代 LLMRouterChain）
const router = RunnableLambda.from(async (input: string) => {
  const choice = await model.invoke(
    routerPrompt.format({ input, destinations: destinationNames }),
  );
  return JSON.parse(choice.content as string).destination as string;
});

// 结构：RunnableBranch 按谓词匹配分支（branch.ts:67）
const routed = RunnableBranch.from([
  [router.and((d: string) => d === "tech"), techChain],
  [router.and((d: string) => d === "life"), lifeChain],
  defaultChain, // 兜底分支
]);
\`\`\`

轻量路由不必上 agent；如果路由逻辑本来就要带工具调用与多轮，才考虑 createAgent（那是另一条路，L112 起展开）。自组决策节点时还有两个实现细节要定：其一，模型输出的路由选择要用结构化输出约束（responseFormat 或少量候选枚举），裸问「选哪条路」的文本输出解析是脆弱点——旧 LLMRouterChain 内部也带输出解析器，这个复杂度在新写法里以结构化输出的形式保留；其二，destination 名单要随业务增长维护，建议把「路由目的地清单」做成配置而不是硬编码在 prompt 里，否则每加一条业务线都要改提示词文本。

### 官方桥的内部走读：两个 LCEL 工厂长什么样

用桥过渡之前，最好知道桥本身是什么——两个工厂的实现体都不长，全部由 core 原语拼成。先看 \`createStuffDocumentsChain\`（combine_documents/stuff.ts:37-67，commit 7704471）。参数面五项：llm、prompt、outputParser（默认 StringOutputParser）、documentPrompt（默认 DEFAULT_DOCUMENT_PROMPT）、documentSeparator。入口有一个运行时校验：\`if (!prompt.inputVariables.includes(DOCUMENTS_KEY))\` 直接 throw——DOCUMENTS_KEY 就是 "context"，**迁移后 prompt 缺 context 变量时报的就是这个错**，报错源头在这里而不是框架深处。实现体一行不落地抄出来就是：

\`\`\`ts
return RunnableSequence.from(
  [
    RunnablePassthrough.assign({
      [DOCUMENTS_KEY]: new RunnablePick(DOCUMENTS_KEY).pipe(
        (documents, config) =>
          formatDocuments({ documents, documentPrompt, documentSeparator, config })
      ),
    }),
    prompt, llm, outputParser,
  ],
  "stuff_documents_chain",
);
\`\`\`

*— langchain-classic/src/chains/combine_documents/stuff.ts:51-67（commit 7704471，有裁剪）*

所谓「Stuff 策略」的全部秘密就是 formatDocuments 一个函数：从输入字典挑出 context、按 documentPrompt 逐条格式化、用 documentSeparator 拼接。旧 StuffDocumentsChain 类里的包装、裁剪、传递逻辑，在这里被压缩成一个纯函数节点——**类的消失不是功能消失，是功能的显式化**。自组版想定制（比如给每条文档加来源前缀），换掉 formatDocuments 即可，不用继承任何类。

再看 \`createRetrievalChain\`（chains/retrieval.ts:70-105，commit 7704471）的三个细节。其一，内部对 retriever 做了分支：是 BaseRetriever 实例就包成 \`RunnableSequence.from([(input) => input.input, retriever])\`——把「从输入字典取 input 再检索」显式写成两环；非 retriever 则原样当 Runnable 用。其二，检索环挂了 \`withConfig({ runName: "retrieve_documents" })\`——在 trace 树里这是一个独立命名的子节点，排查检索质量时能直接定位；整条链也有 runName "retrieval_chain"。其三，\`chat_history: (input) => input.chat_history ?? []\`——桥不强制对话历史，缺省给空数组，输入协议 \`{ input, chat_history? }\` 的宽松性来自这个默认值。走读完这两个工厂应该能建立一个判断：**官方桥没有用任何 classic 私有件，全是 core 原语——「自组」不是退路，而是这些工厂的公开版本**；学会自组就掌握了工厂的全部能力，还多出定制自由。

### 决策标注表与小结

走查到这里的读者应该已经看出 Chain 族迁移的整体判断框架，表格之前先把它说出来：**判断一条旧链的命运只看两个问题——它的结构是不是通用编排（是→core 原语精确替代），它的领域逻辑是不是业务专属（是→自组或留 classic）。**RAG 是通用结构所以有 LCEL 桥；MapReduce 的分片策略是业务决策所以自组；路由链的决策逻辑是业务专属所以自写决策节点。这个框架同样适用于下一课 Memory 族与 L114 的垂类链。

| 旧链 | 官方桥 | 自组原语 | 建议 |
|---|---|---|---|
| RetrievalQAChain | createRetrievalChain（classic） | RunnableSequence 自组 RAG | 新包项目直接自组 |
| StuffDocumentsChain | createStuffDocumentsChain（classic） | formatDocs + pipe | 用桥过渡，终态自组 |
| MapReduceDocumentsChain | 无 | RunnableEach + 聚合 | 超长文档必用，自组 |
| RefineDocumentsChain | 无 | async 循环 + 累积状态 | 数据量大时重估策略 |
| MultiRouteChain 族 | 无 | RunnableBranch + 决策节点 | 轻量路由自组 |

本课小结：

- RetrievalQAChain 的输入键是 query，LCEL 化后变 input+context——键名协议换代是迁移第一个坑。
- 官方的渐进策略有化石证据：createRetrievalChain 返回 Runnable 而非 BaseChain（retrieval.ts:70-80），两代 API 在 classic 同包共存。
- Stuff 有桥、MapReduce/Refine/路由族无替代——无替代名单要按「自组原语」处理，别等官方补课。
- 拆「结构」与「决策」是路由迁移的心法：RunnableBranch 管结构，结构化输出节点管决策。
- 下一课转向 Memory 族：BufferMemory/WindowMemory/TokenBuffer 如何换成 messages + trimMessages 的显式协议。
`,
    null,
    [
      {
        text: 'RetrievalQAChain 的输入键是什么？它内部的组合结构是？',
        options: [
          'input；一条 LLMChain 包着 retriever',
          'query；一个 retriever + 一个 combineDocumentsChain（BaseChain）——_call 里 retriever.invoke 取文档再 combineDocumentsChain.call 合成',
          'question；两个平行的 LLMChain',
          'chat_history + input；自带 memory',
        ],
        answer: 1,
        explain:
          'retrieval_qa.ts:57-117：`inputKey = "query"`，字段有 retriever 与 combineDocumentsChain，_call 里先 `await this.retriever.invoke(question, runManager?.getChild("retriever"))` 再组装 `{ question, input_documents: docs }` 传给 combineDocumentsChain.call。A 错在键名，query→input 的变化正是迁移要点的根源；C 错在结构不是平行链；D 错，RetrievalQAChain 不挂 memory。concept=lc-retrievalqa-migration。',
        concept: 'lc-retrievalqa-migration',
      },
      {
        text: 'MapReduceDocumentsChain 与 RefineDocumentsChain 在 1.x 的官方态度是？',
        options: [
          '有同名新类在 langchain 包',
          '无一等价官方类——需用 RunnableEach（逐项分发）/ RunnableLambda 等原语自组等价逻辑',
          '被 summarizationMiddleware 取代',
          '被移出 classic，需要手写',
        ],
        answer: 1,
        explain:
          '台账条目 10：combine_docs_chain.ts:131,306 定义的 MapReduce/Refine 两类在 1.x 无同名官方替代，官方思路是用 core 原语自组（MapReduce：RunnableEach 逐文档 + 聚合节点；Refine：带累积状态的 RunnableLambda 循环）。A 错，无同名类；B 正确；C 错，summarizationMiddleware 是对话摘要不是文档合并；D 错，两类仍完整保留在 classic。concept=lc-retrievalqa-migration。',
        concept: 'lc-retrievalqa-migration',
      },
      {
        text: 'classic 里的 createRetrievalChain 与 0.1 时代的 RetrievalQAChain 有什么本质区别？',
        options: [
          '只是改了名字',
          '它是返回 Runnable 的 async 工厂函数——0.1 末期官方已在 classic 内用 LCEL 重写旧链，是两代 API 同包共存的过渡层',
          '它多了内置 memory',
          '它必须配 LangGraph 使用',
        ],
        answer: 1,
        explain:
          'chains/retrieval.ts:70-80：`export async function createRetrievalChain<RunOutput>({ retriever, combineDocsChain }): Promise<Runnable<...>>`——返回类型是 Runnable 而非 BaseChain。这个细节证明官方迁移策略是渐进的：先在 classic 包内把旧概念 LCEL 化，再整体迁走。A 错，类型本质变了；C 错，它接 chat_history 参数但不挂 memory 对象；D 错，它是纯 LCEL 函数不需要图。concept=lc-retrievalqa-migration。',
        concept: 'lc-retrievalqa-migration',
      },
      {
        text: 'MultiRouteChain（LLM 路由）在 1.x 的最贴近替代是？注意它的路由决策从哪来？',
        options: [
          'RunnableBranch——但 LLM 决策部分要自写分类节点（旧版路由靠 LLMRouterChain 让模型选路由）',
          'RunnableMap——天然支持路由',
          'createAgent——路由必须建 agent',
          'RunnableEach——批量路由',
        ],
        answer: 0,
        explain:
          '台账条目 11：MultiRouteChain（router/multi_route.ts:63）家族依赖 LLMRouterChain（router/llm_router.ts:32）让模型自己输出「走哪条路」，1.x 无同名替代；RunnableBranch（runnables/branch.ts:67）承接「按条件分支」的结构，但 LLM 决策节点需要自己写（一个用结构化输出让模型选 index 的 RunnableLambda）。B 错，Map 是并行扇出不是路由；C 错，轻量路由不必上 agent；D 错，Each 是逐项映射。concept=lc-retrievalqa-migration。',
        concept: 'lc-retrievalqa-migration',
      },
    ],
    [
      [
        'RetrievalQAChain',
        '旧 RAG 形态（retrieval_qa.ts:57）：retriever + combineDocumentsChain，输入键 query——1.x 概念替代为 createRetrievalChain 或自组管线',
      ],
      [
        'createRetrievalChain',
        'classic 内已 LCEL 化的桥（retrieval.ts:70），返回 Runnable：迁移期的第一落点',
      ],
      [
        'createStuffDocumentsChain',
        'Stuff 策略的 LCEL 工厂（combine_documents/stuff.ts:37）：文档串接进 prompt 的合成链',
      ],
      ['RunnableBranch', 'core runnables/branch.ts:67：按谓词顺序匹配分支——MultiRouteChain 的结构替代物'],
    ],
    [
      '迁移后继续用 query 作输入键——createRetrievalChain 的输入是 { input, chat_history? }，文档放在输出 context 字段，键名协议整体变了',
      '把 MapReduce 直接塞进单条 prompt——超长文档必须自组逐项分发，否则撞上下文窗口',
      '以为路由链会被官方补上新版——MultiRouteChain 家族无替代是长期状态，选型时按「自组 RunnableBranch 或留 classic」决策而不是等',
    ],
  ),
  'practice',
)
