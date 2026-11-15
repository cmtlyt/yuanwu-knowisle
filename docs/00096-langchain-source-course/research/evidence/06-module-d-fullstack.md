# 模块七~八 证据台账（RAG / 记忆缓存 / 可观测 / 外部连接 / 结构化输出 / 类型系统）

> 取证仓库：`langchainjs-src`（commit 7704471）、`langgraphjs-src`（commit fa426b2）。
> 所有行号均来自实际读取的源码文件。路径相对各自仓库根目录。

---

## 第一部分 · 证据条目

### 1. DocumentLoader 接口（RAG 第一环：加载）
**来源**：`libs/langchain-core/src/document_loaders/base.ts:6-21`
**证据**：
```ts
export interface DocumentLoader {
  load(): Promise<Document[]>;
}
export abstract class BaseDocumentLoader implements DocumentLoader {
  abstract load(): Promise<Document[]>;
}
```
**可讲的知识点**：
- 加载环的契约极简：一个 `load()` 返回 `Document[]`，没有流式、没有迭代器（Python 版的 `lazy_load` 在 TS 中没有对应物，可对比讲）。
- `BaseDocumentLoader` 只是把接口升级为抽象类，子类只需实现 `load`，没有提供任何模板方法（与 `loadAndSplit` 在 Python 中位于 base 不同——TS 里该方法不存在于 core）。
- 加载器不是 Runnable，不参与回调体系——这是与后面 Retriever/Transformer 的关键差异。

### 2. Document 数据结构（贯穿五环的核心载体）
**来源**：`libs/langchain-core/src/documents/document.ts:1-65`
**证据**：
```ts
export class Document<Metadata extends Record<string, any> = ...>
  implements DocumentInput, DocumentInterface {
  pageContent: string;
  metadata: Metadata;
  id?: string;
  constructor(fields: DocumentInput<Metadata>) {
    this.pageContent = fields.pageContent !== undefined ? fields.pageContent.toString() : "";
    this.metadata = fields.metadata ?? ({} as Metadata);
  }
}
```
**可讲的知识点**：
- 三元组 `pageContent / metadata / id` 是全链路唯一的数据语言，id 注释明确说「未来大版本可能变为必填」（document.ts:48-50）。
- `Input`（metadata 可选）与 `Interface`（metadata 必填）双接口区分「构造时」与「流转时」的不变量。
- 构造函数里 `pageContent.toString()` 做了隐式类型收敛，metadata 默认空对象——防御式构造。

### 3. BaseDocumentTransformer：切分环是 Runnable
**来源**：`libs/langchain-core/src/documents/transformers.ts:15-59`
**证据**：
```ts
export abstract class BaseDocumentTransformer<
  RunInput extends DocumentInterface[] = DocumentInterface[],
  RunOutput extends DocumentInterface[] = DocumentInterface[],
> extends Runnable<RunInput, RunOutput> {
  lc_namespace = ["langchain_core", "documents", "transformers"];
  abstract transformDocuments(documents: RunInput): Promise<RunOutput>;
  invoke(input: RunInput, _options?: BaseCallbackConfig): Promise<RunOutput> {
    return this.transformDocuments(input);
  }
}
export abstract class MappingDocumentTransformer extends BaseDocumentTransformer {
  abstract _transformDocument(document): Promise<DocumentInterface>;
}
```
**可讲的知识点**：
- 切分器不是独立体系，而是「文档数组 → 文档数组」的 Runnable，可直接 pipe 进 LCEL 链——这是 TS 版相比 Python 版的架构亮点。
- 输入输出数组长度可以不同（切分会变多），`MappingDocumentTransformer` 则约束一一映射（如去重、摘要）。
- `invoke` 直接委托 `transformDocuments`，没有创建 run span——transformer 不进入 trace 树。

### 4. RecursiveCharacterTextSplitter：分隔符递归切分
**来源**：`libs/langchain-textsplitters/src/text_splitter.ts:281-348`
**证据**：
```ts
export class RecursiveCharacterTextSplitter extends TextSplitter {
  separators: string[] = ["\n\n", "\n", " ", ""];
  constructor(fields?) {
    ...
    this.keepSeparator = fields?.keepSeparator ?? true;
  }
  private async _splitText(text: string, separators: string[]) {
    for (let i = 0; i < separators.length; i += 1) {
      const s = separators[i];
      if (s === "") { separator = s; break; }
      if (text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }
    const splits = this.splitOnSeparator(text, separator);
    for (const s of splits) {
      if ((await this.lengthFunction(s)) < this.chunkSize) { goodSplits.push(s); }
      else { ... await this._splitText(s, newSeparators); }
    }
  }
}
```
**可讲的知识点**：
- 递归的核心：找到第一个在文本中出现的分隔符后，用 `separators.slice(i + 1)` 作为「剩余分隔符表」传给下一层递归（text_splitter.ts:303-334）。
- 默认分隔符梯度 `\n\n → \n → 空格 → 空` 对应「段落 → 行 → 词 → 字符」的语义粒度递降（text_splitter.ts:289）。
- `keepSeparator` 在 Recursive 版默认为 `true`，与 CharacterTextSplitter 的 `false` 不同（text_splitter.ts:294）——切完把分隔符拼回去，保住语义完整。
- `lengthFunction` 是异步的（`await this.lengthFunction(s)`），为 token 计数器（async tiktoken）留了口子。

### 5. mergeSplits：滑窗重叠合并算法
**来源**：`libs/langchain-textsplitters/src/text_splitter.ts:183-226`
**证据**：
```ts
async mergeSplits(splits: string[], separator: string): Promise<string[]> {
  let total = 0;
  for (const d of splits) {
    const _len = await this.lengthFunction(d);
    if (total + _len + currentDoc.length * separator.length > this.chunkSize) {
      if (total > this.chunkSize) { console.warn(`Created a chunk of size ${total}...`); }
      docs.push(joinDocs(currentDoc, separator));
      while (total > this.chunkOverlap ||
             (total + _len + ... > this.chunkSize && total > 0)) {
        total -= await this.lengthFunction(currentDoc[0]);
        currentDoc.shift();
      }
    }
    currentDoc.push(d);
    total += _len;
  }
}
```
**可讲的知识点**：
- chunkOverlap 的实现是「从队首 shift 直到剩余长度 ≤ overlap」的滑动窗口，不是硬截断（text_splitter.ts:207-215）。
- 计入 `currentDoc.length * separator.length`：拼接分隔符本身也占长度，边界精确（text_splitter.ts:190）。
- 超 chunkSize 的单块会 console.warn 而不是抛错——「尽力而为」策略的取舍可讨论。

### 6. splitDocuments 与行号 metadata
**来源**：`libs/langchain-textsplitters/src/text_splitter.ts:98-176`
**证据**：
```ts
async splitDocuments(documents: Document[], chunkHeaderOptions = {}): Promise<Document[]> {
  const texts = selectedDocuments.map((doc) => doc.pageContent);
  const metadatas = selectedDocuments.map((doc) => doc.metadata);
  return this.createDocuments(texts, metadatas, chunkHeaderOptions);
}
// createDocuments 内部：
loc.lines = { from: lineCounterIndex, to: lineCounterIndex + newLinesCount };
documents.push(new Document({ pageContent, metadata: metadataWithLinesNumber }));
```
**可讲的知识点**：
- `createDocuments` 在切分时回写 `metadata.loc.lines`（from/to 行号），用 `\n` 计数追踪原文位置（text_splitter.ts:131-144）——为引用溯源（citation）场景服务。
- `chunkHeaderOptions.chunkOverlapHeader`（默认 `"(cont'd) "`）会把上一个块的结尾拼进下一块开头（text_splitter.ts:89,128）。
- 语言专属分隔符表：`RecursiveCharacterTextSplitter.fromLanguage` 按 cpp/go/java/python 等语言给出「class/func 定义优先」的切分顺序（text_splitter.ts:259-276, 350-409）。

### 7. Embeddings 双方法契约与 AsyncCaller
**来源**：`libs/langchain-core/src/embeddings.ts:9-61`
**证据**：
```ts
export interface EmbeddingsInterface<TOutput = number[]> {
  embedDocuments(documents: string[]): Promise<TOutput[]>;
  embedQuery(document: string): Promise<TOutput>;
}
export abstract class Embeddings<TOutput = number[]> implements EmbeddingsInterface<TOutput> {
  caller: AsyncCaller;
  constructor(params: EmbeddingsParams) { this.caller = new AsyncCaller(params ?? {}); }
  abstract embedDocuments(documents: string[]): Promise<TOutput[]>;
  abstract embedQuery(document: string): Promise<TOutput>;
}
```
**可讲的知识点**：
- 向量化环的契约只有两个方法：批量 `embedDocuments` 与单条 `embedQuery`——语义上分开是因为「索引时」与「查询时」可能用不同的 embedding 端点/前缀。
- 泛型 `TOutput` 默认 `number[]`，但接口可以不是向量（如 rerank 类实现返回其它结构）。
- 基类内置 `AsyncCaller`：并发与重试逻辑统一收口，子类必须用 `this.caller` 发请求（embeddings.ts:36-38 注释明确要求）。
- `EmbeddingsParams = AsyncCallerParams`——限流配置直接复用调用器类型（embeddings.ts:7）。

### 8. VectorStore 抽象类：存储环的四个抽象方法
**来源**：`libs/langchain-core/src/vectorstores.ts:553-649`
**证据**：
```ts
export abstract class VectorStore extends Serializable implements VectorStoreInterface {
  lc_namespace = ["langchain", "vectorstores", this._vectorstoreType()];
  embeddings: EmbeddingsInterface;
  abstract _vectorstoreType(): string;
  abstract addVectors(vectors: number[][], documents, options?): Promise<string[] | void>;
  abstract addDocuments(documents, options?): Promise<string[] | void>;
  abstract similaritySearchVectorWithScore(query: number[], k: number, filter?): Promise<[DocumentInterface, number][]>;
  async delete(_params?) { throw new Error("Not implemented."); }
}
```
**可讲的知识点**：
- 子类必须实现「写两条路 + 查一条路」：`addVectors`（已有向量）、`addDocuments`（先 embed 再写）、`similaritySearchVectorWithScore`（向量→带分检索）。
- `addDocuments` 的 embed 动作由子类自己完成——基类不代劳，因此各 provider 可以选择批量策略。
- 抽象类持有的 `embeddings` 实例就是「查询时 embed」的入口（见下一条）。
- `delete` 默认抛 Not implemented——删除能力是可选实现。

### 9. similaritySearch 的默认编排：embed 后查库
**来源**：`libs/langchain-core/src/vectorstores.ts:661-698`
**证据**：
```ts
async similaritySearch(query: string, k = 4, filter?, _callbacks?) {
  const results = await this.similaritySearchVectorWithScore(
    await this.embeddings.embedQuery(query), k, filter);
  return results.map((result) => result[0]);
}
```
**可讲的知识点**：
- 模板方法模式：基类编排「embedQuery → 向量检索 → 丢掉分数」，子类只需管纯向量操作。
- `similaritySearchWithScore` 与 `similaritySearch` 唯一差别是是否 map 掉 score（vectorstores.ts:661 vs 687-698）。
- 默认 k=4 在这里出现一次，`VectorStoreRetriever.k = 4` 里又出现一次——两处默认值独立存在。

### 10. MMR 检索：相似度与多样性的平衡
**来源**：`libs/langchain-core/src/vectorstores.ts:50-55, 715-719`
**证据**：
```ts
export type MaxMarginalRelevanceSearchOptions<FilterType> = {
  k: number;
  fetchK?: number;   // MMR 前先粗取 fetchK 条作候选池
  lambda?: number;   // 0=最大多样性, 1=最大相关性
  filter?: FilterType;
};
// VectorStore 中为可选方法：
async maxMarginalRelevanceSearch?(query, options, _callbacks): Promise<DocumentInterface[]>;
```
**可讲的知识点**：
- `fetchK > k` 两段式：先粗召回 fetchK 条候选，再由 MMR 算法从中选出 k 条兼顾多样的结果（vectorstores.ts:29-33 注释）。
- `lambda` 的语义在 JSDoc 中写死：0 重多样性、1 重相关性（vectorstores.ts:41-45）。
- `maxMarginalRelevanceSearch` 是接口可选方法（带 `?`），不支持的库调用时会得到明确报错（见第 11 条）。

### 11. VectorStoreRetriever：存储环到检索环的适配器
**来源**：`libs/langchain-core/src/vectorstores.ts:192-372`
**证据**：
```ts
export class VectorStoreRetriever<V extends VectorStoreInterface> extends BaseRetriever {
  k = 4;
  searchType = "similarity";
  async _getRelevantDocuments(query, runManager?) {
    if (this.searchType === "mmr") {
      if (typeof this.vectorStore.maxMarginalRelevanceSearch !== "function") {
        throw new Error(`The vector store backing this retriever, ${this._vectorstoreType()} does not support max marginal relevance search.`);
      }
      return this.vectorStore.maxMarginalRelevanceSearch(query,
        { k: this.k, filter: this.filter, ...this.searchKwargs },
        runManager?.getChild("vectorstore"));
    }
    return this.vectorStore.similaritySearch(query, this.k, this.filter, runManager?.getChild("vectorstore"));
  }
}
```
**可讲的知识点**：
- Retriever 是 Runnable、VectorStore 不是——`asRetriever()` 是把库接入 LCEL 的桥（vectorstores.ts:810-847，支持 `kOrFields` 数字或对象双签名）。
- `_getRelevantDocuments` 内对 MMR 的能力做了运行时鸭子检查再报错（vectorstores.ts:330-335）。
- 检索时通过 `runManager?.getChild("vectorstore")` 把回调传播到子 run——检索环也进 trace 树。

### 12. BaseRetriever：检索环的 invoke 骨架
**来源**：`libs/langchain-core/src/retrievers/index.ts:65-174`
**证据**：
```ts
export abstract class BaseRetriever<...> extends Runnable<string, DocumentInterface<Metadata>[]> {
  _getRelevantDocuments(_query, _callbacks?) { throw new Error("Not implemented!"); }
  async invoke(input: string, options?: RunnableConfig) {
    const callbackManager_ = await CallbackManager.configure(...);
    const runManager = await callbackManager_?.handleRetrieverStart(this.toJSON(), input, ...);
    try {
      const results = await this._getRelevantDocuments(input, runManager);
      await runManager?.handleRetrieverEnd(results);
      return results;
    } catch (error) {
      await runManager?.handleRetrieverError(error);
      throw error;
    }
  }
}
```
**可讲的知识点**：
- `_getRelevantDocuments` 是唯一需要子类实现的钩子，注释说明它「本该是 abstract 但为兼容自定义子类暂不强制」（retrievers/index.ts:107-110）。
- `invoke` 手动编排 start/end/error 三个回调事件——对比 Runnable 基类的 `_callWithConfig`，这里是手写版，可讲回调传播的手工路径。
- `BaseRetrieverInput` 四件套 `callbacks/tags/metadata/verbose`（retrievers/index.ts:31-36）是所有检索器的观测性配置面。

### 13. BaseMemory：Chain 时代的记忆抽象
**来源**：`libs/langchain-core/src/memory.ts:28-54`
**证据**：
```ts
export abstract class BaseMemory {
  abstract get memoryKeys(): string[];
  abstract loadMemoryVariables(values: InputValues): Promise<MemoryVariables>;
  abstract saveContext(inputValues: InputValues, outputValues: OutputValues): Promise<void>;
}
```
**可讲的知识点**：
- 记忆的两段式生命周期：`loadMemoryVariables`（注入历史）与 `saveContext`（写回）——这是 Chain（旧体系）的记忆模型。
- `memoryKeys` 用于从多键输入里排除记忆变量、识别 prompt 主输入（memory.ts:107-120 `getPromptInputKey` 明确过滤 `memoryVariables` 与 `"stop"`）。
- `getInputValue/getOutputValue` 在多键时强制要求显式 key（memory.ts:71-100），反映旧体系「单键约定 + 显式指定」的设计。
- 现状定位：`BaseMemory` 在新代码中已无官方子类使用，是被 langgraph state 取代的遗留层——课堂上要讲清「为什么被淘汰」。

### 14. BaseChatMessageHistory / BaseListChatMessageHistory 双基类
**来源**：`libs/langchain-core/src/chat_history.ts:10-91`
**证据**：
```ts
export abstract class BaseChatMessageHistory extends Serializable {
  public abstract getMessages(): Promise<BaseMessage[]>;
  public abstract addMessage(message: BaseMessage): Promise<void>;
  public abstract addUserMessage(message: string): Promise<void>;
  public abstract addAIMessage(message: string): Promise<void>;
  public abstract clear(): Promise<void>;
}
// TODO: Combine into one class for 0.2   （chat_history.ts:4）
export abstract class BaseListChatMessageHistory extends Serializable {
  public abstract getMessages(): Promise<BaseMessage[]>;
  public abstract addMessage(message: BaseMessage): Promise<void>;
  public async addMessages(messages: BaseMessage[]): Promise<void> {
    for (const message of messages) { await this.addMessage(message); }
  }
  public clear(): Promise<void> { throw new Error("Not implemented."); }
}
```
**可讲的知识点**：
- 两个基类并存且源码顶部标注 `TODO: Combine into one class for 0.2`——历史包袱的活证据。
- `addMessages` 默认实现是逐条循环（chat_history.ts:27-31, 79-83），注释明确要求子类覆写做批量写以省 round-trip——「接口默认实现即文档」的范例。
- `addUserMessage/addAIMessage` 在 List 版里是便捷方法并标注可能废弃（chat_history.ts:50-69）。

### 15. InMemoryChatMessageHistory：最小参考实现
**来源**：`libs/langchain-core/src/chat_history.ts:98-133`
**证据**：
```ts
export class InMemoryChatMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ["langchain", "stores", "message", "in_memory"];
  private messages: BaseMessage[] = [];
  async getMessages(): Promise<BaseMessage[]> { return this.messages; }
  async addMessage(message: BaseMessage) { this.messages.push(message); }
  async clear() { this.messages = []; }
}
```
**可讲的知识点**：
- 教科书级最小实现：一个私有数组 + 三个方法，适合课堂作为「实现一个自定义 history 要写多少代码」的基线。
- `lc_namespace` 用于序列化识别——实现 Serializable 的代价面。

### 16. BaseCache：LLM 生成缓存
**来源**：`libs/langchain-core/src/caches/index.ts:35-97`
**证据**：
```ts
export abstract class BaseCache<T = Generation[]> {
  protected keyEncoder: HashKeyEncoder = defaultHashKeyEncoder;
  makeDefaultKeyEncoder(keyEncoderFn: HashKeyEncoder): void { this.keyEncoder = keyEncoderFn; }
  abstract lookup(prompt: string, llmKey: string): Promise<T | null>;
  abstract update(prompt: string, llmKey: string, value: T): Promise<void>;
}
const GLOBAL_MAP = new Map();
export class InMemoryCache<T = Generation[]> extends BaseCache<T> {
  static global(): InMemoryCache { return new InMemoryCache(GLOBAL_MAP); }
}
export const defaultHashKeyEncoder: HashKeyEncoder = (...strings) => sha256(strings.join("_"));
```
**可讲的知识点**：
- 缓存 key 是 `sha256(prompt + "_" + llmKey)`——llmKey 是模型参数指纹，同一 prompt 不同参数不同缓存（caches/index.ts:6-7）。
- `InMemoryCache.global()` 用模块级 `GLOBAL_MAP` 单例跨实例共享（caches/index.ts:53,94-96）。
- 缓存的值类型是 `Generation[]`（生成结果数组）而非消息——缓存环挂在 LLM 调用层而不是对话层，这与 langgraph checkpoint 的「消息级持久化」形成对比。
- `serializeGeneration/deserializeStoredGeneration`（caches/index.ts:9-30）演示了 Generation ↔ StoredMessage 的互转。

### 17. Checkpoint 数据结构（langgraph 持久化核心）
**来源**：`langgraphjs/libs/checkpoint/src/base.ts:18-46, 98-104`
**证据**：
```ts
export interface Checkpoint<N extends string = string, C extends string = string> {
  v: number;              // checkpoint 格式版本，当前为 4
  id: string;             // uuid6
  ts: string;             // ISO 时间戳
  channel_values: Record<C, unknown>;      // 每条 channel 的当前值
  channel_versions: Record<C, ChannelVersion>;
  versions_seen: Record<N, Record<C, ChannelVersion>>;  // 每个节点已消费的版本
}
export interface CheckpointTuple {
  config: RunnableConfig;
  checkpoint: Checkpoint;
  metadata?: CheckpointMetadata;
  parentConfig?: RunnableConfig;
  pendingWrites?: CheckpointPendingWrite[];
}
```
**可讲的知识点**：
- checkpoint 三字典结构：`channel_values`（状态）、`channel_versions`（版本时钟）、`versions_seen`（节点消费记录）——这是 langgraph 增量执行/superstep 恢复的基石。
- `versions_seen` 让节点只响应「新版本」的 channel 更新，是图循环不无限重跑的机制。
- `CheckpointTuple` 携带 `parentConfig` 形成检查点链表，`pendingWrites` 支持中断恢复。

### 18. BaseCheckpointSaver：检查点读写契约
**来源**：`langgraphjs/libs/checkpoint/src/base.ts:180-239`
**证据**：
```ts
export abstract class BaseCheckpointSaver<V extends string | number = number> {
  serde: SerializerProtocol = new JsonPlusSerializer();
  abstract getTuple(config): Promise<CheckpointTuple | undefined>;
  abstract list(config, options?): AsyncGenerator<CheckpointTuple>;
  abstract put(config, checkpoint, metadata, newVersions): Promise<RunnableConfig>;
  abstract putWrites(config, writes: PendingWrite[], taskId: string, taskPath?: string): Promise<void>;
  abstract deleteThread(threadId: string): Promise<void>;
}
```
**可讲的知识点**：
- 五个抽象方法构成完整契约：单读（getTuple）、流式列举（list 是 AsyncGenerator）、整图写入（put）、中间写入（putWrites）、线程删除（deleteThread）。
- `putWrites` 的 `taskPath` 注释解释了顺序敏感性：「顺序敏感的 reducer 重放时若顺序不同会重建出不同的值」（base.ts:216-226）——课堂可讲分布式检查点的写入排序问题。
- `toJSON()` 返回 `[ClassName]` 防止 JSON.stringify 遍历 pg Pool 等客户端（base.ts:187-193）——实战向细节。

### 19. MemorySaver：内存检查点实现
**来源**：`langgraphjs/libs/checkpoint/src/memory.ts:106-132`
**证据**：
```ts
export class MemorySaver extends BaseCheckpointSaver {
  storage: Record<string, Record<string, Record<string, [Uint8Array, Uint8Array, string | undefined]>>>
    = Object.create(null);
  // thread ID -> checkpoint namespace -> checkpoint ID -> checkpoint
  writes: Record<string, Record<string, [string, string, Uint8Array, string?]>>
    = Object.create(null);
  // Defense in depth against prototype pollution: ... use a null prototype
}
```
**可讲的知识点**：
- 三层嵌套 key：threadId → checkpointNamespace → checkpointId，值是序列化后的二进制对（checkpoint + metadata）。
- 用 `Object.create(null)` 构造无原型对象防御 prototype pollution（memory.ts:109-117 注释）——安全工程入课堂。
- writes 表按 `${taskId},${idx}` 索引，第 4 元素 taskPath 是为旧数据兼容的 append-only 字段（memory.ts:119-128）。

### 20. JsonPlusSerializer：serde 双态序列化
**来源**：`langgraphjs/libs/checkpoint/src/serde/jsonplus.ts:227-263`；接口在 `serde/base.ts:3-5`
**证据**：
```ts
export interface SerializerProtocol {
  dumpsTyped(data: any): Promise<[string, Uint8Array]>;
  loadsTyped(type: string, data: Uint8Array | string): Promise<any>;
}
export class JsonPlusSerializer implements SerializerProtocol {
  async dumpsTyped(obj: any): Promise<[string, Uint8Array]> {
    if (obj instanceof Uint8Array) { return ["bytes", obj]; }
    else { return ["json", this._dumps(obj)]; }
  }
  async loadsTyped(type: string, data) {
    if (type === "bytes") { return ...; }
    else if (type === "json") { return this._loads(...); }
    else { throw new Error(`Unknown serialization type: ${type}`); }
  }
}
```
**可讲的知识点**：
- "Typed" 协议：返回 `[类型标签, 二进制]` 二元组，bytes 直通、json 走自定义 reviver——设计上只有两态，扩展点留给子类。
- `_dumps` 内部用 `stringify(obj, (_, value) => _default(value))` 处理 Date/Map/Set 等 JSON 不友好类型（jsonplus.ts:228-234）。
- serde 在 `BaseCheckpointSaver` 上默认实例化并可注入替换（base.ts:181-185）——自定义存储器可换加密序列化。

### 21. BaseStore：与 checkpoint 平行的键值存储抽象
**来源**：`langgraphjs/libs/checkpoint/src/store/base.ts:407-440`
**证据**：
```ts
export abstract class BaseStore {
  abstract batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>>;
  async get(namespace: string[], key: string): Promise<Item | null> {
    validateNamespace(namespace, { allowEmpty: true, allowReservedRoot: true });
    return (await this.batch<[GetOperation]>([{ namespace, key }]))[0];
  }
  // search(namespacePrefix, options) 支持 metadata 过滤 + 向量相似检索
}
```
**可讲的知识点**：
- 设计模式：所有操作收敛到唯一抽象方法 `batch`，`get/search/put` 都是 batch 的语法糖——后端只需实现一个方法。
- Store 是「命名空间分层键值 + 可选向量检索」，与 checkpoint（线程级状态）是两套独立的持久化面：Store 存长期记忆，checkpoint 存会话状态。
- `IndexConfig`（store/base.ts:316）与 `SearchItem`（store/base.ts:102）表明语义检索直接内建于 store 接口。

### 22. 回调处理器方法面（可观测第一环）
**来源**：`libs/langchain-core/src/callbacks/base.ts:58-179, 352-400`
**证据**：
```ts
abstract class BaseCallbackHandlerMethodsClass {
  handleLLMStart?(llm: Serialized, prompts: string[], runId, parentRunId?, ...): Promise<any> | any;
  handleLLMNewToken?(token: string, idx: NewTokenIndices, runId, ...): ...;
  handleChatModelStart?(llm: Serialized, messages: BaseMessage[][], runId, ...): ...;
  handleChainStart?(chain, inputs, runId, runType?, ...): ...;
  handleChainError?(err, runId, parentRunId?, ...): ...;
  handleChainEnd?(...): ...;
}
export abstract class BaseCallbackHandler extends BaseCallbackHandlerMethodsClass {
  abstract name: string;   // 行 400
}
```
**可讲的知识点**：
- 所有 handle 方法都是可选的（`?`）——处理器按需订阅事件，基类不是 abstract 方法集合而是「钩子目录」。
- 生命周期事件按 run 类型分组：LLM/ChatModel/Chain/Tool/Retriever 各有 Start/End/Error 三相。
- `handleLLMNewToken` 携带 `NewTokenIndices`（prompt/completion 双索引，base.ts:43-56）——多候选补全时代的遗痕。
- 新增的 `handleChatModelStreamEvent`（base.ts:97-103）是 content-block 级事件，比 token 级更细。

### 23. CallbackManager：回调的分发与配置合成
**来源**：`libs/langchain-core/src/callbacks/manager.ts:41, 298, 779, 1337-1358`
**证据**：
```ts
export type Callbacks = (BaseCallbackHandler | ...)[] | BaseCallbackHandlerCallbacks | undefined;  // 行41
export class CallbackManagerForRetrieverRun extends BaseRunManager { ... }   // 行298
export class CallbackManager {
  async handleLLMStart(...) { ... await handler.handleLLMStart?.(...) }       // 行831-883
  static configure(inheritableHandlers, localHandlers, inheritableTags, localTags, ...) // 行1337
  static _configureSync(...)                                                   // 行1358
}
```
**可讲的知识点**：
- `Callbacks` 类型三态：处理器数组 / 单个处理器对象（按事件名分派）/ undefined——灵活但类型面复杂。
- `configure` 做「继承处理器 + 本地处理器」的双层合并（tags/metadata 同理），这是回调在嵌套 Runnable 间传播的机制核心。
- 每个 `CallbackManagerForXxxRun`（LLM/Chain/Tool/Retriever 四个）都提供 `getChild()` 派生子 run manager——run 树的构造现场。
- handler 错误被 catch 并警告而不中断主流程（manager.ts:883 `Error in handler ... handleLLMStart`）——观测不能拖垮业务。

### 24. BaseTracer 与 LangChainTracer：trace 树与 langsmith 集成
**来源**：`libs/langchain-core/src/tracers/base.ts:21-128`；`tracers/tracer_langchain.ts:1-157`
**证据**：
```ts
// base.ts
import { KVMap, BaseRun } from "langsmith/schemas";        // 行1
export interface Run extends BaseRun { ... }               // 行21（注释：TODO Remove... just use base LangSmith Run type）
export abstract class BaseTracer extends BaseCallbackHandler {   // 行90
  protected abstract persistRun(run: Run): Promise<void>;  // 行128
}
// tracer_langchain.ts
import { RunTree, type RunTreeConfig } from "langsmith/run_trees";            // 行6
import { getCurrentRunTree } from "langsmith/singletons/traceable";           // 行7
const traceableTree = LangChainTracer.getTraceableRunTree();                  // 行135
if (traceableTree) { this.updateFromRunTree(traceableTree); }
```
**可讲的知识点**：
- `Run` 类型直接继承自 `langsmith/schemas.BaseRun`——trace 数据模型是 langsmith 定义的，core 只做传输。
- `BaseTracer.persistRun` 是唯一抽象方法：tracer 收集 run 树后交给子类决定「往哪发」。
- LangChainTracer 用 `RunTree` 构造嵌套 span 并上报；`getTraceableRunTree` 与 `@traceable` 装饰器的 run tree 互通（tracer_langchain.ts:135-157）。

### 25. langsmith 是硬依赖（包关系取证）
**来源**：`libs/langchain-core/package.json:30`；`libs/langchain/package.json:79`
**证据**：
```json
// langchain-core/package.json
"dependencies": { ... "langsmith": ">=0.11.0 <1.0.0" ... }
// langchain/package.json
"langsmith": ">=0.11.0 <1.0.0"
```
**可讲的知识点**：
- langsmith 不是可选 peer 而是常规 dependencies——「core 无观测依赖」的印象是错的，回调/tracer 体系直接依赖 langsmith 类型与客户端。
- 版本上界 `<1.0.0` 说明 langsmith 未到 1.0，core 用范围锁规避破坏性变更。
- `Callbacks/manager.ts:1391-1442` 显示运行时还会读取 `traceableRunTree.tracingEnabled` 并做 langchain↔langsmith/traceable 的 parent run id 交接——两套观测入口可互认。

### 26. streamEvents 的事件流 tracer
**来源**：`libs/langchain-core/src/tracers/event_stream.ts:55-153`
**证据**：
```ts
export type StreamEvent = { ... };                              // 行57
export interface EventStreamCallbackHandlerInput extends BaseCallbackHandlerInput {}  // 行113
export const isStreamEventsHandler = (...);                     // 行142
export class EventStreamCallbackHandler extends BaseTracer {    // 行153
```
**可讲的知识点**：
- `streamEvents` 是「一个伪装成 callback handler 的 tracer」：`EventStreamCallbackHandler extends BaseTracer`，把 run 树展开成扁平事件流。
- `isStreamEventsHandler` 的存在说明回调系统需要识别/剔除该 handler 避免重复触发——观测体系内部的协作细节。
- 与 `log_stream.ts`（token 级流）和 `run_collector.ts`（收集 run 树）构成 tracer 家族的三个实用件，课堂可各给一句定位。

### 27. LangSmithLoader：用数据集当文档源
**来源**：`libs/langchain-core/src/document_loaders/langsmith.ts:17-39`
**证据**：
```ts
export interface LangSmithLoaderFields {
  datasetId?: string;
  datasetName?: string;
  exampleIds?: Array<string>;
  asOf?: Date | string;
  splits?: string[];
  ...
  formatContent?: (content: any) => string;
  client?: Client;
}
```
**可讲的知识点**：
- 加载器把 langsmith 数据集（dataset/example）当作 Document 源——「RAG 的加载环可以接评估数据集」，加载体系是开放扩展点。
- `asOf/splits/offset/limit/filter` 表明支持数据集快照与分页。
- 依赖 `langsmith` 的 `Client` 直接 import（langsmith.ts:1-2）——再次佐证第 25 条。

### 28. MCP 工具接入：loadMcpTools / convertMcpTools
**来源**：`libs/langchain-mcp-adapters/src/tools.ts:470-500`
**证据**：
```ts
const defaultLoadMcpToolsOptions: LoadMcpToolsOptions = {
  throwOnLoadError: true,
  prefixToolNameWithServerName: false,
  additionalToolNamePrefix: "",
};
export async function loadMcpTools(
  serverName: string, client: MCPInstance, options?: LoadMcpToolsOptions
): Promise<DynamicStructuredTool[]> {
  const parsedOptions = loadMcpToolsOptionsSchema.parse(options ?? {});
  const { tools } = await client.listTools();
  return convertMcpTools(serverName, client, tools, parsedOptions);
}
```
**可讲的知识点**：
- MCP 工具被转成 `DynamicStructuredTool[]`——外部协议工具进入 langchain 后统一为内部工具类型。
- 默认不加前缀、不抛加载错误需显式开启——多服务器工具名冲突是用户自己的责任，默认值透露了设计态度。
- 工具调用路径上有 output schema 校验：`invocation.output.safeParseAsync(result)` 不合规抛 `ToolException`（tools.ts:403-409）；还有 `before/after` 钩子拦截结果（tools.ts:434-455）。

### 29. MCP 连接管理：三种传输与连接复用
**来源**：`libs/langchain-mcp-adapters/src/connection.ts:44-135`
**证据**：
```ts
export interface Connection {
  transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;
  client: Client;
  transportOptions: ResolvedStdioConnection | ResolvedStreamableHTTPConnection | ResolvedSSEConnection;
}
export class ConnectionManager {
  #connections: Map<ClientKeyObject, Connection> = new Map();
  #pending = new Map<ClientKeyObject, Promise<Client>>();
  async createClient(type: "stdio", serverName, options): Promise<Client>;
  async createClient(type: "http",  serverName, options): Promise<Client>;
  async createClient(type: "sse",   serverName, options): Promise<Client>;
}
```
**可讲的知识点**：
- 三种传输（stdio/http/sse）用重载签名分别声明——类型层面就禁止非法组合。
- `#pending` Map 缓存「连接中的 Promise」实现并发去重：同配置并发请求只建一次连接（connection.ts:130-134）。
- 支持 elicitation（tools.ts:386-394 `callToolWithElicitation`）——工具可向用户反问输入，MCP 协议的人机交互面。

### 30. providers 目录：provider 包的组织结构
**来源**：`libs/providers/`（目录列举）+ `libs/providers/langchain-openai/package.json:29-36`
**证据**：
```
libs/providers/ 下 32 个包：langchain-openai / anthropic / google-vertexai / pinecone / qdrant ...
// langchain-openai/package.json
"dependencies": { "js-tiktoken", "openai": "^7.47.0", "zod": "^4.6.6" },
"peerDependencies": { "@langchain/core": "workspace:^" }
// src 目录：azure/ chat_models/ converters/ decisions/ embeddings.ts llms.ts tools/
```
**可讲的知识点**：
- provider 包统一依赖形态：自家 SDK 是 dependencies，`@langchain/core` 是 `workspace:^` peer——依赖方向单向指向 core，core 不认识任何 provider。
- 包内 src 按「chat_models / embeddings / llms / tools / converters」分目录，接口实现与 core 的抽象一一对应。
- 同一厂商多包拆分（如 google-genai / google-vertexai / google-common / google-webauth）体现「传输认证方式」维度的拆包策略。

### 31. Hub：prompt 的 push/pull 与导入映射
**来源**：`libs/langchain/src/hub/base.ts:15-96, 98-139`
**证据**：
```ts
export async function basePush(repoFullName: string, runnable: Runnable, options?): Promise<string> {
  const client = options?.client ?? new Client(options);
  return client.pushPrompt(repoFullName, payloadOptions);   // 底层是 langsmith Client
}
export async function basePull(ownerRepoCommit: string, options?): Promise<PromptCommit> {
  const promptObject = await client.pullPromptCommit(ownerRepoCommit, {...});
  promptObject.manifest.kwargs.metadata = {
    ...metadata, lc_hub_owner, lc_hub_repo, lc_hub_commit_hash,   // 行65-70
  };
}
export function generateModelImportMap(modelClass?) { ... }     // 行98
```
**可讲的知识点**：
- Hub 的存储后端就是 langsmith：push/pull 直接调 `langsmith.Client.pushPrompt/pullPromptCommit`——「prompt Hub = langsmith 仓库」。
- pull 回来的 manifest 被注入 `lc_hub_owner/lc_hub_repo/lc_hub_commit_hash` 元数据用于溯源（base.ts:65-70）。
- `generateModelImportMap/generateOptionalImportMap` 解决「反序列化时模型类从哪来」——序列化载荷不含代码，类必须由调用方注册。

### 32. load 序列化体系：import_map / serializable
**来源**：`libs/langchain/src/load/serializable.ts:1`；`libs/langchain/src/load/import_map.ts`；`libs/langchain-core/src/load/serializable.ts`
**证据**：
```ts
// langchain/load/serializable.ts:1
export * from "@langchain/core/load/serializable";
// langchain/load/ 目录：import_constants.ts import_map.ts import_type.ts map_keys.ts serializable.ts
```
**可讲的知识点**：
- 序列化机制本体在 core（`Serializable` 基类），langchain 包只做「包名映射」与 re-export——分层序列化架构。
- import_map 把载荷里的 `lc` 命名空间映射回具体类，这是 hub pull 后 `load()` 能还原对象的前提。
- 与 `SaveableVectorStore.save/load`（vectorstores.ts:866-901）对比：lc 序列化是通用机制，vectorstore 的 save 是专用持久化。

### 33. ToolStrategy：结构化输出的「工具调用」策略类
**来源**：`libs/langchain/src/agents/responses.ts:54-162`
**证据**：
```ts
export class ToolStrategy<_T = unknown> {
  private constructor(
    public readonly schema: Record<string, unknown>,
    public readonly tool: { type: "function"; function: FunctionDefinition },
    public readonly options?: ToolStrategyOptions
  ) {}
  static fromSchema<S extends InteropZodObject>(schema: S, outputOptions?)
    : ToolStrategy<S extends InteropZodType<infer U> ? U : unknown>;
  static fromSchema(schema: InteropZodObject | SerializableSchema | Record<string, unknown>, ...) {
    const asJsonSchema = toJsonSchema(schema);
    const tool = { type: "function", function: {
      name: getFunctionName(asJsonSchema.title),      // `extract-${++bindingIdentifier}` 兜底
      strict: false,
      parameters: asJsonSchema } };
    return new ToolStrategy(asJsonSchema, tool, outputOptions);
  }
  parse(toolArgs: Record<string, unknown>) {
    const validator = new Validator(this.schema);
    const result = validator.validate(toolArgs);
    if (!result.valid) { throw new StructuredOutputParsingError(this.name, ...); }
  }
}
```
**可讲的知识点**：
- 实现：把 schema 变成一个隐藏的 function tool，让模型「调用 extract 工具」来产出结构化数据——`strict: false`（responses.ts:112），工具名自动生成带全局计数器 `bindingIdentifier`（responses.ts:46,102-104）。
- 校验用 JSON Schema `Validator`，失败抛 `StructuredOutputParsingError`；`ToolStrategyOptions.handleError` 支持 true/false/string/回调四态重试语义（responses.ts:449-476）。
- 私有构造器 + 静态工厂三重载（Zod / Standard Schema / 裸 JSON Schema）——类型推断经由 `S extends InteropZodType<infer U>` 完成。
- 支持 schema 数组：多个 ToolStrategy 并存时模型可从中挑一个工具调用（见第 35 条数组分支）。

### 34. ProviderStrategy：结构化输出的「提供商原生」策略类
**来源**：`libs/langchain/src/agents/responses.ts:164-289`
**证据**：
```ts
export class ProviderStrategy<T = unknown> {
  private _schemaType?: T;                       // 仅用于类型推断
  public readonly schema: Record<string, unknown>;
  public readonly strict: boolean;
  static fromSchema<T>(schema: InteropZodType<T>, strict?): ProviderStrategy<T>;
  static fromSchema(schema, strict?) {
    const asJsonSchema = toJsonSchema(schema);
    return new ProviderStrategy(asJsonSchema, strict);
  }
  parse(response: AIMessage) {
    // 从 content 抽文本：字符串直接用；数组内容跳过 thought 块（Gemini 思维链）
    for (const block of response.content) {
      if (block.type === "text" && !("thought" in block && block.thought === true) && "text" in block) {
        textContent = block.text; break;
      }
    }
    const content = JSON.parse(textContent);
    const result = new Validator(this.schema).validate(content);
    if (!result.valid) { return; }        // 注意：返回 undefined 而不是抛错
  }
}
```
**可讲的知识点**：
- 实现：不建工具，直接把 JSON Schema 交给模型提供商的原生 structured output（如 OpenAI json_schema）；`strict` 默认 `true`（responses.ts:41 `PROVIDER_STRATEGY_DEFAULT_STRICT = true`，注释引 OpenAI parse() 要求所有工具 strict）。
- `parse` 失败返回 `undefined` 而 ToolStrategy 抛错——两种策略的错误哲学不同：provider 侧信任模型输出只需静默降级，tool 侧需要把错误喂回对话重试。
- content 数组里跳过 `thought: true` 块（responses.ts:252-268）——对思维链模型的兼容取证。
- `_schemaType?: T` 是 phantom type：运行时无值、只撑类型推断（responses.ts:165-166）。

### 35. transformResponseFormat：三策略归一化
**来源**：`libs/langchain/src/agents/responses.ts:293-439`
**证据**：
```ts
export type ResponseFormatInput<...> =
  | InteropZodType<StructuredResponseType>      // Zod 对象
  | InteropZodType<unknown>[]                   // Zod 数组
  | SerializableSchema<...> | SerializableSchema[]
  | JsonSchemaFormat | JsonSchemaFormat[]       // JSON Schema
  | ResponseFormat | ResponseFormat[]
  | ResponseFormatUndefined;

export function transformResponseFormat(responseFormat?, options?, model?): ResponseFormat[] {
  ...
  const useProviderStrategy = hasSupportForJsonSchemaOutput(model);   // 行405
  if (isSerializableSchema(responseFormat)) {
    return useProviderStrategy ? [ProviderStrategy.fromSchema(responseFormat)]
                               : [ToolStrategy.fromSchema(responseFormat, options)];
  }
  if (isInteropZodObject(responseFormat)) { /* 同上双分支 */ }
  if (typeof responseFormat === "object" && "properties" in responseFormat) { /* 同上双分支 */ }
  throw new Error(`Invalid response format: ...`);
}
export function hasSupportForJsonSchemaOutput(model?) {
  return "structuredOutput" in model.profile && model.profile.structuredOutput === true;  // 行697-714
}
```
**可讲的知识点**：
- 归一化规则：输入三类 schema（Zod 对象 / Standard-Serializable Schema / 裸 JSON Schema）× 两种策略 = `useProviderStrategy` 由模型能力决定；数组输入则默认全部转 ToolStrategy（responses.ts:344-390），且数组内类型必须一致否则抛错。
- 能力检测读的是模型 `profile.structuredOutput` 元数据（responses.ts:697-714）——「运行时能力协商」而非硬编码厂商清单。
- `ResponseFormatUndefined` 哨兵对象（responses.ts:28-30）用品牌字段表达「用户显式传 undefined」的状态。
- `JsonSchemaFormat` 用 `__brand?: never` 品牌防误判为策略实例（responses.ts:671-682）。

### 36. createAgent 的 const 泛型重载
**来源**：`libs/langchain/src/agents/index.ts:176-211`（共 6 个重载，另见 214/256/293/330/367/404）
**证据**：
```ts
export function createAgent<
  StructuredResponseFormat extends Record<string, any> = Record<string, any>,
  TStateSchema extends StateDefinitionInit | undefined = undefined,
  ContextSchema extends AnyAnnotationRoot | InteropZodObject = AnyAnnotationRoot,
  const TMiddleware extends readonly AnyAgentMiddleware[] = readonly AnyAgentMiddleware[],
  const TTools extends readonly (ClientTool | ServerTool)[] = readonly (...)[] ,
  const TStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>> = readonly [],
>(
  params: CreateAgentParams<...> & {
    responseFormat: InteropZodType<StructuredResponseFormat>;
    middleware?: TMiddleware; tools?: TTools; streamTransformers?: TStreamTransformers;
  }
): ReactAgent<AgentTypeConfig<..., CombineTools<TTools, TMiddleware>,
      CombineStreamTransformers<TStreamTransformers, TMiddleware>>>;
// Overload 2: responseFormat 为 InteropZodType 数组时推断 union 类型（index.ts:213-236）
```
**可讲的知识点**：
- `const` 类型参数（TS 5.0 特性）：让传入的字面量数组保持元组字面量类型而不是放宽为 string[]——工具名/中间件元组的精确推断全靠它。
- 6 个重载覆盖 responseFormat 的形态：Zod 对象 / Zod 数组 / JSON Schema / 策略实例 / undefined / 无 responseFormat——每个重载的 `StructuredResponseFormat` 泛型约束不同。
- 返回类型用 `CombineTools<TTools, TMiddleware>` 把中间件贡献的工具合入 ReactAgent 类型（index.ts:208-209）——类型层面的工具合并先于运行时。

### 37. CombineTools / CombineStreamTransformers：递归元组拼接
**来源**：`libs/langchain/src/agents/types.ts:148-220`
**证据**：
```ts
export type InferMiddlewareTools<T extends AgentMiddleware> =
  T extends AgentMiddleware<any, any, any, infer TTools, any>
    ? TTools extends readonly (ClientTool | ServerTool)[] ? TTools : readonly []
    : readonly [];
export type InferMiddlewareToolsArray<T extends readonly AnyAgentMiddleware[]> =
  T extends readonly [] ? readonly []
  : T extends readonly [infer First, ...infer Rest]
    ? First extends AgentMiddleware
      ? Rest extends readonly AnyAgentMiddleware[]
        ? readonly [...InferMiddlewareTools<First>, ...InferMiddlewareToolsArray<Rest>]
        : InferMiddlewareTools<First>
      : readonly []
    : readonly [];
export type CombineTools<TAgentTools, TMiddleware> =
  readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>];
export type CombineStreamTransformers<TAgentStreamTransformers, TMiddleware> =
  readonly [...TAgentStreamTransformers, ...InferMiddlewareStreamTransformersArray<TMiddleware>];
```
**可讲的知识点**：
- 经典「递归条件类型 + 可变元组 rest 展开」模式：从 middleware 元组头尾递归剥出各层的工具类型再拼平——variance 走的是类型级 reduce。
- 双重守卫：`Rest extends readonly AnyAgentMiddleware[]` 保证剩余元组可继续递归，否则提前返回——防御非法输入的类型体操。
- `InferMiddlewareStreamTransformers` 用 `[TStreamTransformers] extends [readonly []]` 包一层元组避免裸空数组被分发误判（types.ts:158-165）。

### 38. InteropZodType：Zod v3/v4 互操作类型
**来源**：`libs/langchain-core/src/utils/types/zod.ts:167-189`
**证据**：
```ts
export type InteropZodType<Output = any, Input = Output> =
  | ZodV3Like<Output, Input>
  | ZodV4Like<Output, Input>;
export type InteropZodObject = ZodV3ObjectLike | ZodV4ObjectLike;
export type InteropZodDefault<T = InteropZodObject> =
  T extends ZodV3Like ? ZodDefaultV3<T> : T extends ZodV4Like ? ZodDefaultV4<T> : never;
```
**可讲的知识点**：
- langchain 自定义 structural 类型（`ZodV3Like`/`ZodV4Like` 鸭子接口）而非 import zod——用户装 zod v3 或 v4 都能过类型检查。
- 互操作不是只 union 两个类型：还配套 `InteropZodDefault/Optional/ObjectShape` 等条件映射，把 v3/v4 的 API 差异在类型层抹平。
- agents 侧 `ExtractZodArrayTypes`（types.ts:935-937）从 Zod 数组元组递归 infer 出 union——两处类型工具接力完成 responseFormat 数组的推断。

### 39. ReactAgent 类型配置中枢
**来源**：`libs/langchain/src/agents/types.ts:93-142`
**证据**：
```ts
export interface AgentTypeConfig<
  Response, State, Context, Middleware, Tools, StreamTransformers
> { ... }   // 行93
export interface DefaultAgentTypeConfig extends AgentTypeConfig {
  Response: Record<string, any>;
  State: undefined;
  Context: AnyAnnotationRoot;
  Middleware: readonly AnyAgentMiddleware[];
  Tools: readonly (ClientTool | ServerTool)[];
  StreamTransformers: readonly [];
}
```
**可讲的知识点**：
- 六个类型槽位（Response/State/Context/Middleware/Tools/StreamTransformers）构成 agent 的「类型指纹」，`ReactAgent<T extends AgentTypeConfig>` 用单个类型参数打包六维信息。
- `InferAgentResponse/State/Context/Tools/StreamTransformers`（types.ts:311-452）是一族从 AgentTypeConfig 里「反查」单维信息的取值类型——用户侧 `InferAgentState<typeof agent>` 的实现基础。
- `ClientTool | ServerTool` 二分（types.ts:140）表明工具执行位置（客户端/服务端）进入类型系统。

---

## 第二部分 · 课程清单建议

## 模块七（全栈基础设施 · 4 阶段约 12 课）

### 阶段 A：RAG 源码链（5 课）
- L01 加载环：DocumentLoader 契约与 Document 三元组 — 从最小接口理解「文档是全链路唯一数据语言」 | 源码依据：libs/langchain-core/src/document_loaders/base.ts:6-21；libs/langchain-core/src/documents/document.ts:38-64 | kind: theory
- L02 切分环（一）：Transformer 即 Runnable — BaseDocumentTransformer 如何把切分器接入 LCEL，Mapping 与非 Mapping 两种形态 | 源码依据：libs/langchain-core/src/documents/transformers.ts:15-59 | kind: theory
- L03 切分环（二）：RecursiveCharacterTextSplitter 递归算法逐行拆解 — 分隔符梯度、递归降级、keepSeparator、mergeSplits 滑窗重叠与 loc.lines 行号回写 | 源码依据：libs/langchain-textsplitters/src/text_splitter.ts:183-226, 289-348 | kind: framework ★
- L04 向量化与存储环：EmbeddingsInterface 双方法 + VectorStore 三抽象 — embedDocuments/embedQuery 分离、AsyncCaller 并发重试、addDocuments/addVectors/similaritySearchVectorWithScore 编排 | 源码依据：libs/langchain-core/src/embeddings.ts:9-61；libs/langchain-core/src/vectorstores.ts:553-698 | kind: framework
- L05 检索环：BaseRetriever.invoke 回调骨架 + asRetriever 适配桥 + MMR 选项 — 从 similaritySearch 到 maxMarginalRelevanceSearch 的能力协商 | 源码依据：libs/langchain-core/src/retrievers/index.ts:142-173；libs/langchain-core/src/vectorstores.ts:326-352, 810-847 | kind: practice

### 阶段 B：记忆与缓存（3 课）
- L06 遗留记忆层：BaseMemory 与 ChatHistory 双基类 — load/saveContext 两段式生命周期为何被淘汰，InMemory 最小实现基线 | 源码依据：libs/langchain-core/src/memory.ts:28-54；libs/langchain-core/src/chat_history.ts:10-133 | kind: theory
- L07 LLM 缓存：BaseCache 与 sha256 键编码 — prompt+llmKey 指纹、Generation 级缓存挂在哪一层、InMemoryCache.global 单例 | 源码依据：libs/langchain-core/src/caches/index.ts:6-97 | kind: framework
- L08 langgraph checkpoint（一）：Checkpoint 三字典与版本时钟 — channel_values/versions_seen 如何支撑增量执行与恢复 | 源码依据：langgraphjs/libs/checkpoint/src/base.ts:18-104 | kind: framework ★
- L09 langgraph checkpoint（二）：BaseCheckpointSaver 契约与 MemorySaver 实现 — putWrites 排序语义、Object.create(null) 防污染、JsonPlusSerializer 双态 serde、BaseStore 与 checkpoint 的分工 | 源码依据：langgraphjs/libs/checkpoint/src/base.ts:180-239；langgraphjs/libs/checkpoint/src/memory.ts:106-132；langgraphjs/libs/checkpoint/src/serde/jsonplus.ts:227-263 | kind: framework ★

### 阶段 C：可观测体系（2 课）
- L10 回调系统全貌：BaseCallbackHandler 钩子目录与 CallbackManager.configure 双层合并 — handle 方法为何全可选、run 树如何靠 getChild 生长、handler 报错为何不中断主流程 | 源码依据：libs/langchain-core/src/callbacks/base.ts:58-179；libs/langchain-core/src/callbacks/manager.ts:1337-1442 | kind: framework ★
- L11 Tracer 家族与 langsmith 硬依赖 — BaseTracer.persistRun、LangChainTracer 的 RunTree 上报、streamEvents 的 EventStreamCallbackHandler、package.json 取证 | 源码依据：libs/langchain-core/src/tracers/base.ts:21-128；libs/langchain-core/src/tracers/tracer_langchain.ts:1-157；libs/langchain-core/package.json:30 | kind: theory ★

### 阶段 D：外部连接（2 课）
- L12 MCP 接入：loadMcpTools 与 ConnectionManager — DynamicStructuredTool 归一化、三传输重载、连接 Promise 去重、elicitation 人机交互 | 源码依据：libs/langchain-mcp-adapters/src/tools.ts:470-500；libs/langchain-mcp-adapters/src/connection.ts:44-135 | kind: practice
- L13 provider 包结构与 Hub/load 序列化 — workspace peer 依赖方向、basePush/basePull 的 langsmith 后端、import_map 与 generateModelImportMap | 源码依据：libs/providers/langchain-openai/package.json:29-36；libs/langchain/src/hub/base.ts:15-96 | kind: theory

## 模块八（结构化输出与类型系统 · 2 阶段约 6 课）

### 阶段 A：结构化输出（3 课）
- L14 两种策略：ToolStrategy vs ProviderStrategy — 隐藏 extract 工具（strict:false）与提供商原生 json_schema（strict:true）的实现对照 | 源码依据：libs/langchain/src/agents/responses.ts:54-162, 164-230 | kind: framework ★
- L15 错误哲学分野：parse 抛错 vs parse 返回 undefined — Validator 校验、handleError 四态、思维链 thought 块过滤 | 源码依据：libs/langchain/src/agents/responses.ts:151-161, 238-288, 449-476 | kind: theory ★
- L16 transformResponseFormat 归一化 — 三类 schema 输入 × hasSupportForJsonSchemaOutput 能力协商、数组约束、__brand 哨兵 | 源码依据：libs/langchain/src/agents/responses.ts:293-439, 697-714 | kind: framework

### 阶段 B：类型系统（3 课）
- L17 createAgent 的 const 泛型与六重载 — 字面量保真、responseFormat 各形态对应的重载分派 | 源码依据：libs/langchain/src/agents/index.ts:176-236 | kind: theory ★
- L18 类型级 reduce：CombineTools 与 CombineStreamTransformers — 递归条件类型从 middleware 元组剥层拼接，双重守卫写法 | 源码依据：libs/langchain/src/agents/types.ts:148-220 | kind: theory ★
- L19 InteropZodType 与 AgentTypeConfig — Zod v3/v4 鸭子互操作、六槽位类型指纹、InferAgent* 反查类型族 | 源码依据：libs/langchain-core/src/utils/types/zod.ts:167-189；libs/langchain/src/agents/types.ts:93-142 | kind: theory
