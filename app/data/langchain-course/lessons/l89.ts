import { L, withKind } from '../../course-builders.ts'

export const L89 = withKind(
  L(
    'L89',
    25,
    'LLM 缓存：BaseCache 与 sha256 键编码、Generation 级挂载层',
    2,
    ['L20'],
    ['lc-llm-cache'],
    [
      '手写实现一个基于 Map 的自定义 BaseCache 子类，接入模型并验证缓存命中',
      '还原 sha256(prompt_llmKey) 键编码的构成，调通 makeDefaultKeyEncoder 自定义键函数',
      '辨析 Generation 级缓存与消息级 checkpoint 持久化的层级分工',
    ],
    `### 缓存层：LLM 调用面前的省钱闸门

上一课讲了被淘汰的记忆层；本课讲一件没被淘汰、但位置很微妙的遗留品——LLM 缓存。它挂在语言模型调用层，解决的是「同一个请求打两次 API、花两次钱」的问题。核心结论：**缓存键是 sha256(prompt + 参数指纹)，缓存值是 Generation 数组——这是一个纯粹挂在 LLM 调用层的请求级加速层，与对话状态、会话记忆是两个世界**。framework 课型：先读契约与编码，再手写一个自定义缓存实现接入模型验证命中。

### 走读：BaseCache 契约与键编码

\`\`\`ts
export const defaultHashKeyEncoder: HashKeyEncoder = (...strings) =>
  sha256(strings.join("_"));

export abstract class BaseCache<T = Generation[]> {
  protected keyEncoder: HashKeyEncoder = defaultHashKeyEncoder;
  makeDefaultKeyEncoder(keyEncoderFn: HashKeyEncoder): void {
    this.keyEncoder = keyEncoderFn;
  }
  abstract lookup(prompt: string, llmKey: string): Promise<T | null>;
  abstract update(prompt: string, llmKey: string, value: T): Promise<void>;
}
\`\`\`

*— langchain-core/src/caches/index.ts:6-51（commit 7704471）*

契约极简：\`lookup\` 与 \`update\`，键由 \`(prompt, llmKey)\` 二元组构成。llmKey 不是模型名字符串那么简单——在 BaseLLM/BaseChatModel 的实现里，它是**由模型参数（模型名、temperature、stop 序列等）序列化指纹**派生的标识。键编码默认 \`sha256(prompt + "_" + llmKey)\`：join 用下划线，输出定长十六进制串。为什么 hash 而不直接拼字符串做 Map 键？一是 prompt 可能极长（几十 KB 的上下文做键，内存开销与比较成本都高）；二是隔离——不同实例可以配不同 keyEncoder，实现键空间分片。

\`makeDefaultKeyEncoder\` 是官方留给「同一 prompt 在不同业务线下要不同缓存」的口子——比如给 A/B 实验的某个实例编码器里掺入实验组标签。注意这是**实例级**替换：两个缓存实例编码器不同，同一 prompt 的键不相通。

### 走读：InMemoryCache 与 global 单例

\`\`\`ts
const GLOBAL_MAP = new Map();

export class InMemoryCache<T = Generation[]> extends BaseCache<T> {
  private cache: Map<string, T>;
  constructor(map?: Map<string, T>) { super(); this.cache = map ?? new Map(); }

  lookup(prompt: string, llmKey: string): Promise<T | null> {
    return Promise.resolve(this.cache.get(this.keyEncoder(prompt, llmKey)) ?? null);
  }
  async update(prompt: string, llmKey: string, value: T): Promise<void> {
    this.cache.set(this.keyEncoder(prompt, llmKey), value);
  }
  static global(): InMemoryCache {
    return new InMemoryCache(GLOBAL_MAP);
  }
}
\`\`\`

*— langchain-core/src/caches/index.ts:53-97（commit 7704471）*

两个设计点。其一，构造函数接受可选的 Map——依赖注入式存储后端，\`global()\` 传入模块级 \`GLOBAL_MAP\` 实现跨实例共享。注意共享的是**集合**不是实例：每次 \`InMemoryCache.global()\` 都返回新对象，但底层 Map 相同，所以数据互通。这个模式比自己写单例类更轻——单例的复杂性被外包给了 Map。其二，泛型 \`T = Generation[]\` 全程贯穿：缓存值就是生成结果数组。想缓存别的形态（比如 embedding 结果），泛型一换即可，但那就要自己处理序列化——下面马上讲为什么。

### Generation 的存储往返：类实例 ↔ 可存储字典

\`\`\`ts
export function serializeGeneration(generation: Generation) {
  const serializedValue: StoredGeneration = { text: generation.text };
  if ((generation as ChatGeneration).message !== undefined) {
    serializedValue.message = (generation as ChatGeneration).message.toDict();
  }
  return serializedValue;
}

export function deserializeStoredGeneration(storedGeneration: StoredGeneration) {
  if (storedGeneration.message !== undefined) {
    return { text: storedGeneration.text, message: mapStoredMessageToChatMessage(storedGeneration.message) };
  } else {
    return { text: storedGeneration.text };
  }
}
\`\`\`

*— langchain-core/src/caches/index.ts:9-30（commit 7704471）*

缓存值要能放进真实存储（内存 Map 之外还有各 provider 的 Redis/磁盘实现），消息**类实例**必须转成**可存储字典**：serializeGeneration 用 \`message.toDict()\`（消息的 lc 序列化契约，L10/L95 有铺垫），deserializeStoredGeneration 用 \`mapStoredMessageToChatMessage\` 按类型字段还原成 HumanMessage/AIMessage 等具体类。这两段小函数演示了消息体系「类 ↔ StoredMessage」双向转换的最小闭环——自己写分布式缓存实现时，必须沿用这套往返，否则还原出来的对象 \`instanceof AIMessage\` 会失败（对照 L05 的跨包判型问题）。

### 层级分工：Generation 级缓存 vs 消息级 checkpoint

把三个持久化面摆在一起，边界立刻清楚：

| 层 | 缓存/存储对象 | 键 | 职责 |
|---|---|---|---|
| BaseCache（本课） | Generation[]（LLM 调用产出） | sha256(prompt + llmKey) | 同请求重复发起的省钱闸门 |
| langgraph checkpoint（L90/L91） | 图状态（含消息通道） | thread_id + checkpoint_ns + id | 会话状态、interrupt/resume |
| BaseStore（L91） | 命名空间键值 + 可选向量检索 | namespace + key | 跨线程长期记忆 |

三句话总结分工：**缓存对「请求」去重，checkpoint 对「会话」持久化，Store 对「跨会话知识」沉淀**。缓存层不需要理解对话结构（Generation 无对话语义）；checkpoint 层必须理解通道与 reducer；Store 层必须理解命名空间与检索。混用任何两个都会出设计事故——比如用 LLM 缓存存对话历史：键不含 thread 概念、值不带消息 reducer，完全错位。

### 挂载点走读：模型层如何构造 llmKey 与消费命中

契约只是半边；另一半在模型基类的调用路径里。llmKey 的真实来源是 \`_getSerializedCacheKeyParametersForCall(callOptions)\`（language_models/base.ts:582-603）：把 \`_identifyingParams()\` 与 callOptions 合并，再掺入 \`_type\` 与 \`_model\` 两个身份字段，过滤 undefined 后逐项序列化成 \`key:JSON字符串\`、**sort 后逗号 join**——排序保证了参数顺序不影响键。注意这串文本本身没有 hash，它就是 lookup 的 llmKey 实参；hash 只发生在 defaultHashKeyEncoder 的 \`sha256(prompt + "_" + llmKey)\` 这一步。

generate() 的编排（language_models/llms.ts:481-535）：\`this.cache\` 为空直接走 \`_generateUncached\`；有缓存先 \`_generateCached\` 拿回 \`missingPromptIndices\`，只对缺失的 prompt 补算并逐条 \`cache.update\`——**批量请求里缓存是按 prompt 粒度逐条命中、逐条回填的**，不是全有或全无。命中路径的细节（llms.ts:394-455）也有三笔账：lookup 用 \`Promise.allSettled\` 并发查（单个 lookup 抛错按 handleLLMError 处理，不拖垮其它 prompt）；命中结果的 \`tokenUsage\` 被置成空对象——缓存值不携带本次调用的计量，usage 统计要做去重；最后对首个文本补发一次 \`handleLLMNewToken\` 并在 \`handleLLMEnd\` 的 extra 里带上 **cached: true**——观测端由此区分「真调用」与「缓存回放」。

Chat 模型侧（chat_models.ts:1112-1146）有一个额外动作：缓存键的 prompt 侧取自 \`BaseChatModel._convertInputToPromptValue(baseMessages).toString()\`——**消息列表先被降维成 prompt 字符串再进键**。两条语义相同但结构不同的消息序列（比如 content 数组与纯字符串）会得到同一个键，这是「缓存键不看消息结构、只看文本」的有损点，多模态场景设计缓存时必须绕开它。

*— langchain-core/src/language_models/base.ts:582-603、llms.ts:481-535、chat_models.ts:1112-1146（commit 7704471）*

### 手写对照：接入模型验证命中

\`\`\`ts
import { ChatOpenAI } from "@langchain/openai";
import { BaseCache, Generation } from "@langchain/core/caches";
import { createHash } from "node:crypto";

class LoggingCache extends BaseCache<Generation[]> {
  private store = new Map<string, Generation[]>();
  private hits = 0; private misses = 0;

  private key(prompt: string, llmKey: string): string {
    // 与 defaultHashKeyEncoder 同构：node:crypto 版 sha256
    return createHash("sha256").update(\`\${prompt}_\${llmKey}\`).digest("hex");
  }

  async lookup(prompt: string, llmKey: string): Promise<Generation[] | null> {
    const hit = this.store.get(this.key(prompt, llmKey)) ?? null;
    hit ? this.hits++ : this.misses++;
    console.log(\`[cache] \${hit ? "HIT" : "MISS"} (hits=\${this.hits}, misses=\${this.misses})\`);
    return hit;
  }

  async update(prompt: string, llmKey: string, value: Generation[]): Promise<void> {
    this.store.set(this.key(prompt, llmKey), value);
  }
}

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  cache: new LoggingCache(),      // 挂载点：模型构造参数 cache
});

await model.invoke("用一句话介绍 langgraph");   // [cache] MISS
await model.invoke("用一句话介绍 langgraph");   // [cache] HIT —— 同 prompt 同参数
await model.invoke("用一句话介绍 langchain");   // [cache] MISS
\`\`\`

验收断言三条：第一次调用 MISS、第二次同 prompt 调用 HIT（且不再产生真实 API 请求）；换 prompt 后 MISS（键不同）；\`temperature: 0\` 改成 0.7 后即使同 prompt 也 MISS——llmKey 指纹变了。这个实验把「缓存键 = prompt + 参数指纹」变成可观察事实。生产化方向：把 Map 换成 Redis、加上 TTL 与容量上限、沿用 serializeGeneration 往返——契约没变，只是存储后端升级。

### 本课小结

- BaseCache 契约：lookup/update + \`(prompt, llmKey)\` 键；默认编码 sha256 下划线 join；makeDefaultKeyEncoder 实例级换编码器。
- InMemoryCache.global() = 模块级 GLOBAL_MAP 的跨实例共享集合，共享的是 Map 不是实例。
- 缓存值类型 Generation[] 决定它挂在 LLM 调用层；类实例 ↔ StoredGeneration 的往返复用消息序列化契约。
- 层级分工口诀：缓存对请求去重、checkpoint 对会话持久化、Store 对跨会话知识沉淀。
- 下一课进入 langgraph 的持久化心脏：Checkpoint 三字典与版本时钟——真正的会话状态基础设施。
`,
    null,
    [
      {
        text: 'BaseCache 缓存键由哪两部分编码而成？',
        options: [
          'prompt + 用户 id',
          'prompt 与 llmKey（模型参数指纹），经 keyEncoder 编码为 sha256(strings.join("_"))',
          '模型名 + 时间戳',
          '只有 prompt 本身',
        ],
        answer: 1,
        explain:
          'caches/index.ts:6-7：defaultHashKeyEncoder = (...strings) => sha256(strings.join("_"))；BaseCache.lookup/update 的签名都是 (prompt, llmKey)。llmKey 是模型参数指纹（同一 prompt 不同参数必须命中不同缓存），两者用下划线 join 后 sha256。只按 prompt 缓存会在换 temperature 时返回错误结果。',
        concept: 'lc-llm-cache',
      },
      {
        text: 'InMemoryCache.global() 的共享机制是什么？',
        options: [
          '全局进程间共享的 Redis',
          '模块级 GLOBAL_MAP 单例：用同一个 Map 构造，跨实例共享数据',
          'localStorage',
          '每次调用返回同一个实例的引用计数',
        ],
        answer: 1,
        explain:
          'caches/index.ts:53 定义 const GLOBAL_MAP = new Map()，94-96 行 static global() { return new InMemoryCache(GLOBAL_MAP); }——global() 返回的是**新实例但共享同一个底层 Map**，所以多个 InMemoryCache.global() 实例之间数据互通。这是「单例的集合而非单例的对象」的共享模式。',
        concept: 'lc-llm-cache',
      },
      {
        text: 'BaseCache 缓存的值类型默认是什么？这说明了什么？',
        options: [
          'string——纯文本缓存',
          'Generation[]——生成结果数组，说明缓存挂在 LLM 生成层而非对话层',
          'BaseMessage[]——完整对话历史',
          'any，随意',
        ],
        answer: 1,
        explain:
          'caches/index.ts:35：abstract class BaseCache<T = Generation[]>。缓存的对象是 LLM 调用的产出（Generation/ChatGeneration 数组），不是对话消息。所以它是「同一请求重复发起」的加速层，不承担会话状态职责——后者属于 langgraph checkpoint（消息级持久化）。',
        concept: 'lc-llm-cache',
      },
      {
        text: '缓存命中后 Generation 如何从存储形态还原？',
        options: [
          '直接内存引用返回',
          'serializeGeneration 把 message 转 toDict() 存储，deserializeStoredGeneration 用 mapStoredMessageToChatMessage 还原',
          '缓存只存 text，不存 message',
          '用 JSON.stringify 整个 Generation 对象',
        ],
        answer: 1,
        explain:
          'caches/index.ts:9-30：serializeGeneration 若 generation 带 message 则 message.toDict() 序列化；deserializeStoredGeneration 反向用 mapStoredMessageToChatMessage 把 StoredMessage 还原为具体消息类。缓存值要过「类实例 ↔ 可存储字典」的转换——这就是为什么消息类的序列化契约（L95 的 lc 体系）在这里被复用。',
        concept: 'lc-llm-cache',
      },
      {
        text: '想用自己的键编码函数（比如加业务前缀），应该怎么办？',
        options: [
          '继承 BaseCache 覆写 lookup/update 即可，键编码自动跟随',
          '调用实例方法 makeDefaultKeyEncoder(keyEncoderFn) 替换 keyEncoder',
          'BaseCache 不支持自定义键编码',
          '改 core 源码',
        ],
        answer: 1,
        explain:
          'caches/index.ts:36-46：keyEncoder 是 protected 字段，默认 defaultHashKeyEncoder；makeDefaultKeyEncoder(keyEncoderFn: HashKeyEncoder) 是官方提供的替换入口。注意它替换的是**这个缓存实例**的编码器——若两个缓存实例用不同编码器，同一 prompt 的键不相通。',
        concept: 'lc-llm-cache',
      },
    ],
    [
      [
        'BaseCache<T = Generation[]>',
        'LLM 生成缓存抽象：lookup(prompt, llmKey) + update(prompt, llmKey, value)',
      ],
      ['defaultHashKeyEncoder', '默认键编码：sha256(prompt + "_" + llmKey)'],
      ['llmKey', '模型参数指纹，同一 prompt 不同参数生成不同缓存键'],
      ['InMemoryCache.global()', '模块级 GLOBAL_MAP 共享的跨实例缓存单例集合'],
    ],
    [
      '以为缓存键只由 prompt 决定——llmKey（参数指纹）参与编码，换 temperature/模型名就会 miss，调参实验时别指望命中',
      'InMemoryCache.global() 跨进程不共享——它只是同进程模块级 Map，分布式场景要自建 Redis 类实现',
      '把 LLM 缓存当对话记忆用——它缓存的是 Generation 产出而非消息流，会话状态请用 langgraph checkpoint',
    ],
  ),
  'framework',
)
