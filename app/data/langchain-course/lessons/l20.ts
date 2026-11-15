import { L, withKind } from '../../course-builders.ts'

export const L20 = withKind(
  L(
    'L20',
    5,
    'BaseLLM 与缓存：被边缘化的补全家族与 InMemoryCache.global()',
    2,
    ['L16'],
    ['lc-base-llm-cache'],
    [
      '说出 BaseLLM 与 BaseChatModel 的平行分野，以及 1.x 生态重心为何倒向后者',
      '解释 BaseLanguageModel 构造函数中 cache 的三态语义（对象/true/undefined）与 InMemoryCache.global() 的模块级单例机制',
      '走读 BaseLLM.generate() 的缓存流程：无缓存直发、命中复用、missing 批量补发并回写',
    ],
    `模型调用面的前三课（L16–L18）都在 BaseChatModel 的世界里。这一课换个视角：先看它的平行家族 \`BaseLLM\`——一个在 1.x 里几乎退出主舞台却仍然完整的类；再沿着共同父类 \`BaseLanguageModel\` 挖一个常被忽略的机制——**构造函数里的缓存三态**，以及 \`InMemoryCache.global()\` 这个模块级单例的来龙去脉。本课证据来自 \`language_models/llms.ts\`、\`language_models/base.ts\` 与 \`caches/index.ts\`（commit 7704471）。

### 平行的补全家族：BaseLLM 的瘦身后半生

\`\`\`ts
/**
 * LLM Wrapper. Takes in a prompt (or prompts) and returns a string.
 */
export abstract class BaseLLM<
  CallOptions extends BaseLLMCallOptions = BaseLLMCallOptions,
> extends BaseLanguageModel<string, CallOptions> {
  async invoke(
    input: BaseLanguageModelInput,
    options?: Partial<CallOptions>
  ): Promise<string> {
    const promptValue = BaseLLM._convertInputToPromptValue(input);
    const result = await this.generatePrompt(
      [promptValue],
      options,
      options?.callbacks
    );
    return result.generations[0][0].text;
  }

  async *_streamResponseChunks(...): AsyncGenerator<GenerationChunk> {
    throw new Error("Not implemented.");
  }
}
\`\`\`

*— langchain-core/src/language_models/llms.ts:38-78（commit 7704471）*

类结构几乎是 \`BaseChatModel\` 的镜像：同样的 invoke → generatePrompt → 拆包三步，区别只在最后一行——\`BaseChatModel\` 取 \`chatGeneration.message\`，\`BaseLLM\` 取 \`generation.text\`。第二个泛型参数固定为 \`string\`，从类型上锁死「补全式」身份。它的边缘化可以从三处源码痕迹读出：\`chat_models.ts:222\` 那条 \`// TODO: Fix the parameter order on the next minor version.\` 的注释（两个类的泛型顺序历史包袱，一直没敢动）；\`llms.ts\` 里的 \`_streamResponseChunks\` 产出 \`GenerationChunk\` 而非消息 chunk；以及最直接的——L03 取证过的主包导出面里，补全模型已经没有席位。**但「边缘化」不等于「残废」**：\`BaseLLM.generate()\` 依然挂着完整的缓存逻辑，这正好引出本课的另一半。

### 缓存三态与全局单例

缓存字段挂在共同父类上，构造逻辑是教科书式的三态分支：

\`\`\`ts
cache?: BaseCache;

constructor({ callbacks, callbackManager, ...params }: BaseLanguageModelParams) {
  const { cache, ...rest } = params;
  super({ callbacks: callbacks ?? callbackManager, ...rest });
  if (typeof cache === "object") {
    this.cache = cache;
  } else if (cache) {
    this.cache = InMemoryCache.global();
  } else {
    this.cache = undefined;
  }
  this.caller = new AsyncCaller(params ?? {});
}
\`\`\`

*— langchain-core/src/language_models/base.ts:464-484（commit 7704471）*

三种写法三种语义：传**对象**用自己的实例（隔离、可持久化）；传 **true** 用全局单例；什么都不传则**显式为 undefined**——注意不是「未定义」，构造函数一定会走完三个分支之一，缓存开关是构造期决定的。再看 \`global()\` 的实现：

\`\`\`ts
const GLOBAL_MAP = new Map();

export class InMemoryCache<T = Generation[]> extends BaseCache<T> {
  private cache: Map<string, T>;

  constructor(map?: Map<string, T>) {
    super();
    this.cache = map ?? new Map();
  }

  static global(): InMemoryCache {
    return new InMemoryCache(GLOBAL_MAP);
  }
}
\`\`\`

*— langchain-core/src/caches/index.ts:53-95 裁剪（commit 7704471）*

这里有个容易被误读的点：\`global()\` **每次都 new 一个新的 InMemoryCache 对象**，但所有对象共享同一个模块级 \`GLOBAL_MAP\`——单例性在底层数据结构而不在外壳。所以「每次调用 global() 拿到的是不同实例」与「数据全局共享」两句话同时成立。而 \`BaseCache\` 的抽象契约只有 \`lookup\`/\`update\` 两个方法加一个可替换的 \`keyEncoder\`（默认 \`sha256(strings.join("_"))\`，键编码的完整细节 L89 会展开，这里只需要知道键由 prompt 与 llmStringKey 双维度合成）。

### generate() 的缓存流程：部分命中如何处理

缓存消费发生在 \`generate()\`，流程分三段：

\`\`\`ts
async generate(
  prompts: string[],
  options?: string[] | Partial<CallOptions>,
  callbacks?: Callbacks
): Promise<LLMResult> {
  const [runnableConfig, callOptions] =
    this._separateRunnableConfigFromCallOptionsCompat(parsedOptions);

  if (!this.cache) {
    return this._generateUncached(prompts, callOptions, runnableConfig);
  }
  const { cache } = this;
  const llmStringKey = this._getSerializedCacheKeyParametersForCall(
    callOptions as CallOptions
  );
  const { generations, missingPromptIndices, startedRunManagers } =
    await this._generateCached({ prompts, cache, llmStringKey, ... });

  if (missingPromptIndices.length > 0) {
    const results = await this._generateUncached(
      missingPromptIndices.map((i) => prompts[i]),
      callOptions,
      runnableConfig,
      ...
    );
    await Promise.all(
      results.generations.map(async (generation, index) => {
        const promptIndex = missingPromptIndices[index];
        generations[promptIndex] = generation;
        return cache.update(prompts[promptIndex], llmStringKey, generation);
      })
    );
  }
  return { generations, llmOutput } as LLMResult;
}
\`\`\`

*— langchain-core/src/language_models/llms.ts:477-536 裁剪（commit 7704471）*

逐段看：**无缓存快路径**——\`!this.cache\` 直接 \`_generateUncached\`，一次分支就分出性能差异；**键的双维度**——\`llmStringKey\` 由 \`_getSerializedCacheKeyParametersForCall(callOptions)\` 生成，这就是为什么 temperature 等选项参与缓存命中判定；**部分命中**——\`_generateCached\` 返回命中的 generations 与 \`missingPromptIndices\`，未命中的子集单独批量补发，结果**原地填回** generations 数组对应槽位并逐个 \`cache.update\` 回写。注意回写发生在 Promise.all 里且只针对缺失项——批量调用里的缓存语义是按 prompt 粒度的复用，而非全有全无。还有一个隐蔽的行为：\`startedRunManagers\` 会被传给补发调用，保证回调执行树里命中与未命中项的一致性。

### 为什么 BaseChatModel 没有对应流程？

一个自然的疑问：chat 家族的 \`generatePrompt\` 缓存吗？答案是缓存机制挂在 \`BaseLanguageModel\` 层（字段与构造三态），但**本课读到的这套「prompt 粒度批量缓存」流程实现在 BaseLLM.generate 内部**；chat 侧的调用路径（L16 的 invoke → generatePrompt → _generate）没有同款的 prompt 级缓存装配——对话场景的输入是消息数组且几乎必含随机上下文，prompt 级键值复用的价值骤降，而真正的会话复用交给 provider 侧 prompt cache 与 checkpoint 体系（L89–L91）。这解释了为什么 \`BaseLanguageModel.cache\` 字段在 chat 模型上存在感稀薄：**架构上共享，实践中单边**。这也是「1.x 的缓存故事分两层」的第一个证据，第二层（sha256 键编码与 BaseCache 全家族）在 L89 展开。

### 本课小结

- BaseLLM 与 BaseChatModel 平行分野：前者输出 string、后者输出消息对象；TODO 注释与主包导出面共同佐证补全家族的边缘化，但类本身功能完整。
- 缓存三态在构造期定死：对象用之、true 用 InMemoryCache.global()、否则显式 undefined；global() 的单例性来自模块级 GLOBAL_MAP，外壳每次都是新对象。
- generate() 的缓存流程支持部分命中：missing 子集批量补发、原地填回、逐项回写；缓存键由 prompt 与 llmStringKey 双维度合成。
- 缓存字段挂共同父类但批量缓存流程只在 BaseLLM 落地——架构共享、实践单边，对话复用让位给 provider cache 与 checkpoint。
- 下一课进入工具体系第一课：StructuredTool 如何用 Zod 与 JSON Schema 双引擎把住工具输入的防线。
`,
    null,
    [
      {
        text: 'new SomeLLM({ cache: true }) 时，cache 字段被赋成什么？',
        options: [
          '一个全新的独立 InMemoryCache 实例',
          'InMemoryCache.global()——持有模块级共享 GLOBAL_MAP 的单例',
          'undefined，布尔值只是开关标记',
          '抛出类型错误，cache 只接受 BaseCache 对象',
        ],
        answer: 1,
        explain:
          'BaseLanguageModel 构造函数的逻辑是三态分支：typeof cache === "object" 直接用之；否则 cache 真值就走 InMemoryCache.global()。global() 返回 new InMemoryCache(GLOBAL_MAP)，而 GLOBAL_MAP 是模块顶层的一个 Map——所以 cache: true 得到的是跨实例共享的进程级缓存，不是私有实例。想要隔离就显式传 new InMemoryCache()。',
        concept: 'lc-base-llm-cache',
      },
      {
        text: 'BaseLLM.invoke 的返回类型是？',
        options: [
          'AIMessageChunk',
          'string——取 result.generations[0][0].text',
          'Generation 对象',
          'LLMResult',
        ],
        answer: 1,
        explain:
          'BaseLLM extends BaseLanguageModel<string, CallOptions>，invoke 实现里 generatePrompt 之后直接 return result.generations[0][0].text。对比 BaseChatModel 返回 chatGeneration.message——一个家族返回字符串、一个家族返回消息对象，这正是两个家族的核心分野。LLMResult 是 generatePrompt 的原始返回，invoke 替你拆包了。',
        concept: 'lc-base-llm-cache',
      },
      {
        text: 'generate() 传入 3 个 prompt，其中 2 个命中缓存时会发生什么？',
        options: [
          '全部重新生成，缓存只读不写',
          '只对未命中的 prompt 调 _generateUncached，结果经 cache.update 回写，命中项直接复用',
          '抛出部分命中错误',
          '命中项与未命中项都走一次完整模型调用以保持一致性',
        ],
        answer: 1,
        explain:
          'generate() 先经 _generateCached 拿到 generations 与 missingPromptIndices，随后只对缺失索引的 prompt 子集调 _generateUncached，并用 Promise.all 把每个 generation 逐个 cache.update(prompts[i], llmStringKey, generation) 回写。这就是「按 prompt 粒度的部分缓存」语义：批量调用中命中与未命中的混搭被自然处理。',
        concept: 'lc-base-llm-cache',
      },
      {
        text: 'BaseCache 抽象类要求子类实现的核心方法是？',
        options: [
          'get / set / delete',
          'lookup / update（外加可定制的 keyEncoder）',
          'read / write / clear',
          'fetch / flush',
        ],
        answer: 1,
        explain:
          'caches/index.ts 中 BaseCache 声明 abstract lookup(prompt, llmKey) 与 abstract update(prompt, llmKey, value)，键由 prompt 与 llmKey 两个维度合成，默认键编码器是 sha256(strings.join("_")). 选 A 是 Map 的心智模型，LangChain 缓存没有删除接口——它的定位是幂等的结果复用层。',
        concept: 'lc-base-llm-cache',
      },
      {
        text: '以下哪个现象是 BaseLLM 被边缘化的源码证据？',
        options: [
          'llms.ts 文件不存在了',
          'chat_models.ts:222 的 TODO 注释标记着泛型参数顺序的历史包袱，而主包导出面（L03）里补全模型已无席位',
          'BaseLLM.invoke 会抛出 Not implemented',
          'BaseLLM 不支持缓存',
        ],
        answer: 1,
        explain:
          'llms.ts 仍存在且被维护，BaseLLM 是功能完整的抽象类；chat_models.ts:222 还有 // TODO: Fix the parameter order on the next minor version. 这样的考古注释。边缘化的证据在生态层：1.x 主包导出面几乎全是 chat model，BaseLLM 只活在 classic 与少数补全场景。C 错在抛 Not implemented 的是未覆写的 _streamResponseChunks，BaseChatModel 同样如此；D 错，缓存挂在共同父类 BaseLanguageModel 上，两个家族都继承。',
        concept: 'lc-base-llm-cache',
      },
    ],
    [
      ['BaseLLM', '补全式语言模型基类：输入 PromptValue、输出 string，与 BaseChatModel 平行存在'],
      [
        'InMemoryCache.global()',
        '返回持有模块级 GLOBAL_MAP 的缓存单例——cache: true 时的默认落点，进程内跨实例共享',
      ],
      [
        'llmStringKey',
        '缓存键的第二维度：由 _getSerializedCacheKeyParametersForCall 从模型标识参数序列化而来',
      ],
      ['Generation 级缓存', '框架侧按 prompt+llmKey 做的结果复用层，与 provider 侧的 prompt cache 是两回事'],
    ],
    [
      '以为 cache: true 能跨进程或跨机器共享——GLOBAL_MAP 只是模块级单例，生命周期与进程相同；持久化缓存要自己实现 BaseCache',
      '把 Generation 级缓存与 provider 的 prompt caching 混为一谈——前者在框架层按键值复用完整 Generation，后者在 API 侧降低重复前缀的计费与延迟，两者可以叠加但机制无关',
      '缓存键不只由 prompt 决定——llmStringKey 编码了模型标识参数，temperature 等调用选项参与键生成；改选项会改变命中行为',
    ],
  ),
  'theory',
)
