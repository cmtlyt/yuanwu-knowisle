import { L, withKind } from '../../course-builders.ts'

export const L107 = withKind(
  L(
    'L107',
    31,
    'Chain 族迁移（上）：LLMChain/SequentialChain/TransformChain → LCEL 三原语',
    2,
    ['L103'],
    ['lc-chain-migration'],
    [
      '实现一条 LLMChain（prompt + llm + outputParser 三件套）到 prompt.pipe(llm) RunnableSequence 的逐行改写，并验证输入键从模板反推变为类型约束',
      '构建 SequentialChain/TransformChain 的等价 LCEL：RunnableSequence 串接 + RunnableLambda 承接自定义转换，跑通改造前后的输出对齐',
      '写出一个带 RunnableLambda 的多步管线并在失败时用 RunnableWithFallbacks 兜底，产出可复用的改写模板',
    ],
    `### 迁移实操第一站：三条最常用的链

从本课起进入逐项 API 映射。Chain 族是几乎所有 0.x 应用都要动的部分，我们先拿下使用频率最高的三条：LLMChain、SequentialChain、TransformChain。核心改写思想一句话：**旧链「类 + 字典键」的表达，全部换成「Runnable 组合 + 类型接线」——LLMChain→pipe、SequentialChain→RunnableSequence、TransformChain→RunnableLambda，三原语覆盖八成迁移场景。**这三条链的迁移不需要任何新概念：Runnable 模块（L27-L35）拆过的原语在此全部复用，本课的新增量只有「旧类字段 → 新组合位」的逐项对照与陷阱清单。所有改写都基于 classic 源码逐行对照，commit 7704471。

### 第一组：LLMChain → prompt.pipe(llm)

先看旧类的三件套结构（llm_chain.ts:98-110）：\`prompt: BasePromptTemplate\`、\`llm: Model\`、\`outputParser\`（默认 NoOpOutputParser），外加 \`outputKey = "text"\` 和 \`get inputKeys() { return this.prompt.inputVariables }\`。旧的 0.x 用法与新的 LCEL 用法对照：

\`\`\`ts
// 旧写法（@langchain/classic，llm_chain.ts 的典型用法）
import { LLMChain } from "@langchain/classic/chains";
const chain = new LLMChain({ llm: model, prompt: promptTemplate });
const res = await chain.call({ adjective: "funny" });
// res 是 { text: "..." } —— outputKey 字典包装

// 新写法（LCEL，prompt 与 llm 都来自 @langchain/core/prompts 与模型包）
const chain = promptTemplate.pipe(model);
const response = await chain.invoke({ adjective: "funny" });
// response 是 AIMessage —— 没有字典包装，就是模型输出本体
\`\`\`

三处结构性变化要写进迁移清单。**其一，返回值形态变了**：call 返回 \`{ text: ... }\` 字典（outputKey 默认 "text"），invoke 返回 AIMessage 对象——所有 \`res.text\` 的下游代码要改成 \`res.content\` 或解析器产出。**其二，输入键从运行时反推变成编译期可见**：旧的 inputKeys 由模板变量反推（字符串键，拼错运行时炸），LCEL 的 RunnableSequence 泛型把上一环输出类型接到下一环输入类型，IDE 直接标红。**其三，outputParser 变成显式管线一环**：

\`\`\`ts
// 旧：解析器藏在链对象里（llm_chain.ts:102-105，默认 NoOpOutputParser）
// 新：解析是管线的一环，OutputParser 本身就是 Runnable
import { StringOutputParser } from "@langchain/core/output_parsers";

const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());
const text = await chain.invoke({ adjective: "funny" }); // 直接得到 string
\`\`\`

若旧代码用了 prompt.outputParser，迁移时把它接在 llm 之后即可，语义完全等价——别忘了旧构造器里那个 "Cannot set both outputParser and prompt.outputParser" 的防冲突 throw，在显式管线里这个问题天然不存在。

### 第二组：SequentialChain → RunnableSequence

旧 SequentialChain（sequential_chain.ts:77，\`export class SequentialChain extends BaseChain\`）的职责是：按顺序执行多条链，上一条的 outputKeys 喂给下一条的 inputKeys，中间靠字符串键对齐，SimpleSequentialChain（:284）是单变量的简化版。等价改写：

\`\`\`ts
// 旧：SequentialChain{ chains: [chainA, chainB, chainC], outputKeys: [...] }
//    chainA 输出 {topic}，chainB 需要 {topic} 输出 {joke}，chainC 需要 {joke}

// 新：RunnableSequence，变量接线由类型系统校验
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";

const jokeChain = RunnableSequence.from([
  // 每一环：从上一环输出中取所需字段，返回下一环输入
  (prev: { input: string }) => ({ topic: prev.input }),
  topicPrompt,
  model,
  new StringOutputParser(),
  (joke: string) => ({ joke }),                    // 显式的「键搬运」节点
  jokeReviewerPrompt,
  model,
  new StringOutputParser(),
]);
const final = await jokeChain.invoke({ input: "dogs" });
\`\`\`

注意那个 \`(prev) => ({ joke })\` 小函数——它就是旧 SequentialChain 里 outputKeys→inputKeys 对齐逻辑的显式化。旧架构把这个「字段搬运」藏进框架内部靠字符串匹配，新架构要求你写出来（RunnableLambda 承接），看似啰嗦实则每一步可见可测。这也是迁移 review 的一个手感：**凡是旧代码里「outputKeys 对齐 inputKeys」的地方，LCEL 版都该有一个显式的搬运节点。**

### 第三组：TransformChain → RunnableLambda

TransformChain（transform.ts:28）承载自定义数据变换，带 transformFunc + inputVariables + outputVariables 三件套。它是最容易迁移的一条：

\`\`\`ts
// 旧：new TransformChain<{ docs: Document[] }, { text: string }>({
//   transform: (values) => ({ text: values.docs.map(d => d.pageContent).join("\\n\\n") }),
//   inputVariables: ["docs"], outputVariables: ["text"],
// })

// 新：RunnableLambda + 显式输入输出类型
const joinDocs = RunnableLambda.from((values: { docs: Document[] }) => ({
  text: values.docs.map((d) => d.pageContent).join("\\n\\n"),
}));
// 与其他环组合：retrieveChain.pipe(joinDocs).pipe(summaryPrompt).pipe(model)
\`\`\`

差别在组合能力：TransformChain 必须经 SequentialChain 才能和其他链串起来（还是字典传递），RunnableLambda 则可以直接 pipe 进任意管线，还能拿到第二个参数 config（回调传播，L35）——旧 TransformChain 的 transform 签名只有 values 一个参数，runManager 靠框架隐式接线；新签名的第二个参数就是 RunnableConfig，回调、tags、metadata 全部显式可达。**迁移时把 TransformChain 的 transform 函数原样搬进 RunnableLambda.from，三件套声明全部删除——类型由函数签名自证。**顺带交代输入键协议的换代出处：旧链的 inputKeys 是 \`get inputKeys() { return this.prompt.inputVariables }\` 的运行时反推（llm_chain.ts:112-118，commit 7704471），outputKeys 靠 outputKey 字段声明——所谓「键」全部是框架在运行时从对象上读出来的字符串；LCEL 里这些键变成类型签名的一部分，编译期就定案，这正是 goals 里说的「从模板反推变为类型约束」的源码依据。

### 兜底：fallbacks 从链属性变成组合子

旧 LLMChain 有 fallbacks 处理逻辑（llm_chain.ts:61-68 的探测代码），新世界它是独立组合子 RunnableWithFallbacks（base.ts:2958）：

\`\`\`ts
import { RunnableWithFallbacks } from "@langchain/core/runnables";

const robustChain = mainChain.withFallbacks({
  fallbacks: [backupChain],   // 主链抛错时依次尝试
});
await robustChain.invoke({ input: "hi" });
\`\`\`

\`.withFallbacks()\` 是 Runnable 的方法（bind 家族，L34），任何环都能挂兜底——比旧协议「只在链对象上配置」的粒度细得多。旧实现里这个逻辑藏得多深，值得看一眼现场：llm_chain.ts:55-70（commit 7704471）有一个 \`_getLanguageModel\` 探测函数，为了拿到「真正的模型」去逐层拆包装——模型可能被 bind 过（查 \`"bound" in llmLike\`）、可能挂着 fallbacks（查 \`"runnable" in ... && "fallbacks" in ...\`）、可能是 default 包装，四种形态挨个 instanceof 探测，拆不出来就 throw。这段运行时反射正是旧协议复杂度的缩影：模型、兜底、绑定三种能力糅在同一个字段里，框架只能靠猜。LCEL 把它们拆成显式组合子——bind 用 \`llm.bindTools()\`、兜底用 \`.withFallbacks()\`、默认值用参数——每个能力一个明确入口，探测逻辑整个退役。迁移时如果旧代码传给 LLMChain 的 llm 字段形态可疑（比如经过了 withRetry 包装），新版直接把组合后的 Runnable 原样放进管线即可，不再需要框架帮忙拆。

### 三个改写陷阱与逐个修复

实战走查里高频出现的三个坑，每个都给修复动作。

**陷阱一：字典心态残留。**旧 LLMChain 的返回值是 \`{ [outputKey]: ... }\`（outputKey 默认 "text"，llm_chain.ts:98-110 的字段区），于是迁移后很多代码顺手写 \`res.text\`——但 invoke 返回的是 AIMessage 或解析器产出，\`res.text\` 是 undefined，错得悄无声息。修复：列出旧代码里所有读 outputKey 的位置，逐个改成 \`res.content\`（AIMessage 场景）或解析器产出类型（pipe 了 StringOutputParser 就是 string）；同理，\`chain.call({...})\` 的 inputValues 键值对心态也要换成「invoke 传给第一环的真实输入」。

**陷阱二：同步重逻辑塞进 RunnableLambda。**RunnableLambda（base.ts:2572）对同步/异步函数都收，但行为不同：异步函数能真正吃到 batch 的并发调度（L28 的 AsyncCaller/maxConcurrency 通道），同步函数在 batch 时退化为串行阻塞。旧 TransformChain 的 transform 函数几乎都是同步的，原样搬进 RunnableLambda.from 后一跑 batch 就慢得反常。修复：把 CPU 密集转换改成 async 函数并让内部 await 让出事件循环；IO 型转换（读库、调接口）本来就该 async；确需限并发时用 \`.withConfig\` 外的 batch 配置（maxConcurrency）控闸。

**陷阱三：\`as any\` 硬接类型断点。**RunnableSequence 的类型保护来自 pipe 时逐环对齐上一环输出与下一环输入（L30 拆过 first/middle/last 的泛型链），一旦在某环写 \`as any\`，断点之后的所有环都失去检查——拼错的字段名要到运行时才炸，且报错位置离案发现场很远。修复：先看断点前后的真实类型差，多数情况是上一环多了或少了字段——插入一个显式映射节点（RunnableLambda 里解构重组）比 as any 干净得多；确属框架类型边界的（如第三方模型的输出声明不全），用窄化断言并附注释说明原因。

### 验证清单与小结

改写完跑一遍对齐验证：同一输入分别调旧链 \`.call({...})\` 与新管线 \`.invoke({...})\`，比对核心输出（注意剥离字典包装差异）；再用错误输入验证类型检查是否如预期报错。等价性之外还要验证「多出来的能力」：对同一条新管线分别 invoke 与 stream——旧链只有 call/predict 两个入口，LCEL 管线天生具备 stream/transform 通道（L27），流式跑通才算迁移完整，这也是后续接入 streamEvents 观测（L92）的前提。本课小结：

- LLMChain→\`prompt.pipe(llm)\`，证据是旧类 JSDoc 原文；返回值从 {text} 字典变 AIMessage，解析器变成显式管线环。
- SequentialChain→RunnableSequence，outputKeys→inputKeys 的对齐变成显式 RunnableLambda 搬运节点。
- TransformChain→RunnableLambda.from，三件套声明删除，类型由签名自证。
- fallbacks 从链属性升级为 RunnableWithFallbacks 组合子，可挂任意环。
- 下一课处理 Chain 族的重灾区：RetrievalQA/Stuff/MapReduce/Refine 与路由链——那里有「无替代项」名单。
`,
    null,
    [
      {
        text: 'LLMChain 最直接的 LCEL 替代写法是什么？这个替代的「最硬证据」在哪？',
        options: [
          'new RunnableSequence({ first: llm, last: prompt })——顺序无所谓',
          'prompt.pipe(llm) 或 RunnableSequence.from([prompt, llm])——证据是 LLMChain 自己的 JSDoc（llm_chain.ts:78-87）就写着这两行',
          'createLLMChain({ prompt, llm })——新包有同名工厂',
          'graph.addNode({ prompt, llm })——必须先建图',
        ],
        answer: 1,
        explain:
          'llm_chain.ts:78-87 的 JSDoc 示例原文就是 `const chain = prompt.pipe(llm)` + `await chain.invoke({...})`——官方在旧类自己的文档注释里示范新写法，这是概念替代的最硬证据。A 错在顺序反了且 pipe 会生成正确顺序的 sequence；C 错，新包没有这个工厂；D 错，纯提示词-模型管线不需要图。concept=lc-chain-migration。',
        concept: 'lc-chain-migration',
      },
      {
        text: 'SequentialChain 与 TransformChain 的 LCEL 对应物分别是？',
        options: [
          'RunnableMap 与 RunnablePick',
          'RunnableSequence 与 RunnableLambda——base.ts:1944 与 :2572',
          'RunnableBranch 与 RunnableEach',
          'RunnableAssign 与 RunnableWithFallbacks',
        ],
        answer: 1,
        explain:
          'SequentialChain（sequential_chain.ts:77）是固定顺序执行多条链——RunnableSequence（runnables/base.ts:1944）一对一承接；TransformChain（transform.ts:28）是自定义函数节点——RunnableLambda（base.ts:2572）承接。A 错，RunnableMap 是并行扇出；C 错，RunnableBranch 是路由、RunnableEach 是逐项批处理；D 错，Assign 是字典扩展、Fallbacks 是兜底。concept=lc-chain-migration。',
        concept: 'lc-chain-migration',
      },
      {
        text: '迁移 LLMChain 时，原 outputParser 字段怎么处理？',
        options: [
          '删除——LCEL 不支持输出解析',
          '接进管线尾部：prompt.pipe(llm).pipe(parser) 或用 parser 直接包住 llm——解析器本身在 core 存活',
          '必须换成 responseFormat',
          '换成 try/catch 手写解析',
        ],
        answer: 1,
        explain:
          '旧 LLMChain 的 outputParser 字段（llm_chain.ts:102-105，构造时默认 NoOpOutputParser）在 LCEL 里变成管线一环：解析器都是 Runnable（OutputParser 继承 Runnable），直接 pipe 即可。注意 responseFormat 是 createAgent 的结构化输出策略，是另一条路（L116），普通管线不需要建 agent。A 错在解析器体系完整存活；C 错在范围过大；D 是倒退。concept=lc-chain-migration。',
        concept: 'lc-chain-migration',
      },
      {
        text: 'LLMChain 构造里 outputParser 与 prompt.outputParser 同时设置会怎样？这个约束在 LCEL 里还需要吗？',
        options: [
          '静默后者覆盖前者；LCEL 同样需要这个约束',
          '构造时直接 throw Error("Cannot set both...")；LCEL 里解析器是显式管线环节，重复设置自然不存在',
          '抛 OutputParserException；LCEL 一样',
          '没有任何检查',
        ],
        answer: 1,
        explain:
          'llm_chain.ts:115-123 构造器里写明：两者同时存在就 throw "Cannot set both outputParser and prompt.outputParser"——旧协议把解析器藏进链对象和 prompt 两个地方才需要防冲突。LCEL 中解析是管线的显式一环（.pipe(parser)），数据流单向可见，冲突无处藏身。A 错在会抛 Error 不是覆盖；C 错，抛的是普通 Error；D 错，有显式检查。concept=lc-chain-migration。',
        concept: 'lc-chain-migration',
      },
    ],
    [
      [
        'LCEL 三原语',
        '本课指 RunnableSequence（顺序）/ RunnableLambda（函数节点）/ RunnableWithFallbacks（兜底）——Chain 族最常用的一组替代原语',
      ],
      ['RunnableSequence', 'core runnables/base.ts:1944，pipe 的产物；承接 SequentialChain 的顺序编排语义'],
      [
        'RunnableLambda',
        'core runnables/base.ts:2572，任意函数的 Runnable 包装；承接 TransformChain 的转换语义',
      ],
      [
        'NoOpOutputParser',
        'LLMChain 无解析器时的默认值（llm_chain.ts:104-105）——LCEL 里不存在，不 pipe 解析器就是无解析',
      ],
    ],
    [
      '迁移时保留 outputKey="text" 的字典心态——LCEL 管线传的是上一环的真实返回值，不是 {text: ...} 字典，下游取值代码要同步改',
      '把 RunnableLambda 里塞同步重逻辑导致 batch 并发失控——重转换用 async 函数，并用 maxConcurrency 控制并发',
      '以为 pipe 之后模板变量就类型安全了——RunnableSequence 泛型要对齐才有保护，用 as any 硬转会绕过类型检查',
    ],
  ),
  'practice',
)
