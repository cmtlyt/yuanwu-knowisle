import { L, withKind } from '../../course-builders.ts'

export const L83 = withKind(
  L(
    'L83',
    24,
    '加载环：DocumentLoader 契约与 Document 三元组',
    1,
    ['L27'],
    ['lc-document-loader'],
    [
      '说出 DocumentLoader 接口的全部契约面，并解释为什么 TS 版没有流式加载',
      '理解 Document 三元组 pageContent/metadata/id 在全链路中的唯一数据语言地位',
      '辨析 DocumentInput 与 DocumentInterface 双接口的「构造时/流转时」不变量差异',
    ],
    `### RAG 五环的起点：契约越小，生态越大

从本课开始进入模块七的 RAG 源码链。RAG 在源码中被拆成五个环：加载 → 切分 → 向量化存储 → 检索 → 编排，每个环对应一组 core 抽象。本课讲第一环。先给一句核心结论：**加载环的契约小到极致——一个方法、一个返回类型，而贯穿全链路的数据语言只有 Document 三元组**。契约越小，能接入的第三方加载器越多，这正是「宽进严出」的接口设计。

### 走读：一个方法的接口

\`\`\`ts
export interface DocumentLoader {
  load(): Promise<Document[]>;
}

export abstract class BaseDocumentLoader implements DocumentLoader {
  abstract load(): Promise<Document[]>;
}
\`\`\`

*— langchain-core/src/document_loaders/base.ts:6-21（commit 7704471）*

三个观察。第一，接口体量是一个方法：\`load()\` 接收零参数、返回 \`Document[]\`。没有流式、没有迭代器、没有进度回调——对比 Python 主线的 \`lazy_load()\` 惰性生成器，TS 版选择了「一次加载全量数组」的最简语义。这让任何能拿到文本数组的函数都能包装成加载器，代价是超大语料必须整块进内存。

第二，\`BaseDocumentLoader\` 是个空壳抽象类：它只是把接口升级为 abstract class，子类除了实现 \`load\` 之外没有任何可复用的模板方法。注释里提到的 loadAndSplit 并没有真的出现在类体中——TS core 没有 Python 版位于 base 的 loadAndSplit（切分逻辑归属下一课的 Transformer 体系）。这个基类存在的意义主要是给社区加载器一个统一的 \`instanceof\` 锚点与文档锚点。

第三，**加载器不是 Runnable**。它与 L27 讲的 Runnable 四支柱无任何关系：没有 invoke、没有 callbacks、不会在 L36 的执行树里长出 run 节点。这是一个容易被忽略的架构事实——RAG 链路中真正进入回调/trace 体系的环，从切分环（Transformer）才开始。

### 走读：Document 三元组——全链路唯一数据语言

\`\`\`ts
export interface DocumentInput<Metadata extends Record<string, any> = Record<string, any>> {
  pageContent: string;
  metadata?: Metadata;
  id?: string;
}

export interface DocumentInterface<Metadata ...> {
  pageContent: string;
  metadata: Metadata;
  id?: string;
}

export class Document<Metadata ...> implements DocumentInput, DocumentInterface {
  pageContent: string;
  metadata: Metadata;
  id?: string;
  constructor(fields: DocumentInput<Metadata>) {
    this.pageContent = fields.pageContent !== undefined ? fields.pageContent.toString() : "";
    this.metadata = fields.metadata ?? ({} as Metadata);
    this.id = fields.id;
  }
}
\`\`\`

*— langchain-core/src/documents/document.ts:1-65（commit 7704471）*

这段代码有三个值得逐行咀嚼的细节。

**双接口区分「构造时」与「流转时」的不变量。** \`DocumentInput\` 的 metadata 是可选的（\`metadata?: Metadata\`），而 \`DocumentInterface\` 的 metadata 是必填的。构造函数签名收 \`DocumentInput\`（宽松），类的公开形态 implements \`DocumentInterface\`（严格）。也就是说：你可以用 \`new Document({ pageContent: "hi" })\` 构造，但构造完成后任何拿到 \`DocumentInterface\` 的下游代码（切分器、向量库、检索器）都可以假定 metadata 一定存在——构造时的不确定性被构造函数消化掉了，不会泄漏进链路。

**防御式构造的两处收敛。** \`fields.pageContent !== undefined ? fields.pageContent.toString() : ""\`——如果你误传了 number 类型的 pageContent，不会崩，而是被隐式转成字符串；metadata 用 \`?? ({} as Metadata)\` 兜底空对象，保证下游读 \`doc.metadata.foo\` 永远是「读空对象的属性」而不是「读 undefined 抛 TypeError」。这两行是「在边界处收敛类型、让内部代码信任不变量」的教科书实现。

**id 的演进注释。** id 字段上方写着：*The ID field is optional at the moment. It will likely become required in a future major release after it has been adopted by enough vectorstore implementations*（document.ts:48-50）。同时 JSDoc 说 UUID 格式是 Ideally……but this will not be enforced——「理想格式 + 不强制校验」。这行注释记录的是一个真实的生态决策过程：id 是否必填取决于向量库实现对 upsert 语义的采纳进度，而不是框架单方面拍板。

### 三元组为什么重要：五环只讲一种语言

把五环串起来看：加载环产出 \`Document[]\`；切分环把文档数组变换成更多文档数组（L84）；向量化环读 pageContent 产向量、写库时把 metadata 原样存入（L86）；检索环返回 \`[Document, score]\` 对（L87）；最终进入 prompt 的也是 pageContent + metadata（引用溯源靠 metadata.loc.lines，L85 会讲）。**整条 RAG 链路没有任何中间数据结构**——不是「加载出自己的格式再转成切分器的格式再转……」，而是从头到尾都是 Document。这就是「唯一数据语言」的含义：任何一环都能被第三方替换，只要它讲 Document 这门语言。

代价也很直白：所有领域特定的信息（标题层级、表格结构、图片）都必须塞进 metadata 这个自由字典，框架不做 schema 约束。工程上的推论是——**metadata 的卫生纪律是团队自己的责任**，metadata 里混入非序列化对象会在 checkpoint/缓存层炸（L89、L91 会回头验证这一点）。

### 加载器生态的扩展姿势

因为契约只有 load()，写一个自定义加载器只需要十行以内。core 自带的 \`LangSmithLoader\`（document_loaders/langsmith.ts）就是最好的示范：它把 langsmith 的数据集（dataset/example）当作文档源，字段面支持 datasetId/datasetName/asOf 快照/splits/offset/limit/filter 与 formatContent 转换函数——「RAG 的加载环可以接评估数据集」这个设计本身就说明加载体系是完全开放的扩展点。下课后可以试着把自己的任何数据源包装成 \`load(): Promise<Document[]>\`，你会发现唯一的难点是决定 metadata 放什么。

### 本课小结

- 加载环契约：一个 \`load(): Promise<Document[]>\`，无流式无迭代（Python 版 lazy_load 在 TS 无对应物）。
- \`BaseDocumentLoader\` 是空壳抽象类，无模板方法；TS core 没有 Python 位于 base 的 loadAndSplit。
- **加载器不是 Runnable**：不进回调体系、不能 pipe——可组合性从切分环开始。
- Document 三元组 pageContent/metadata/id 是五环唯一数据语言；\`DocumentInput\`（metadata 可选）与 \`DocumentInterface\`（必填）双接口区分构造时与流转时。
- 下一课进入切分环：同样是处理 Document 数组，Transformer 却是 Runnable——这是 TS 版 RAG 架构的亮点所在。
`,
    null,
    [
      {
        text: 'DocumentLoader 接口定义了哪些方法？',
        options: [
          'load() 与 loadAndSplit() 两个',
          '只有 load(): Promise<Document[]> 一个方法',
          'load() 与 lazyLoad() 两个',
          'load() / loadStream() / loadIterator() 三个',
        ],
        answer: 1,
        explain:
          'core 的 document_loaders/base.ts:6-8 只有一个方法：load(): Promise<Document[]>。loadAndSplit 的 JSDoc 虽出现在 BaseDocumentLoader 注释里，但类体中没有该方法实现；lazy_load 是 Python 版概念，TS 版没有对应物；加载器不支持流式，一次返回全量数组。',
        concept: 'lc-document-loader',
      },
      {
        text: '为什么说「加载器不是 Runnable」是它与 Retriever/Transformer 的关键差异？',
        options: [
          '加载器性能太差，不配进 Runnable 体系',
          '加载器不继承 Runnable、不参与回调体系，因此不会进 trace 树，也不能 pipe 进 LCEL',
          '加载器只能在 Node.js 使用',
          'Runnable 体系在 1.x 已废弃',
        ],
        answer: 1,
        explain:
          'BaseDocumentLoader 只是实现了 DocumentLoader 接口的抽象类，与 Runnable 无继承关系，也没有 callbacks 配置面——它不会在回调执行树里产生 run。而 BaseDocumentTransformer 与 BaseRetriever 都 extends Runnable，可 pipe、可被 tracer 观测。这是三种环各自架构定位不同，与性能无关。',
        concept: 'lc-document-loader',
      },
      {
        text: 'Document 构造函数对 pageContent 和 metadata 做了什么防御？',
        options: [
          '直接赋值，不做任何处理',
          'pageContent 非 undefined 时调 toString() 收敛类型，metadata 缺省为空对象',
          'pageContent 强制转大写，metadata 抛错',
          'pageContent 为空时抛出异常',
        ],
        answer: 1,
        explain:
          'documents/document.ts:59-64：pageContent 走 fields.pageContent.toString()（能承接 number 等类型误传），metadata 用 ?? ({} as Metadata) 兜底为空对象。构造函数是防御式收敛，把构造时的松散输入变成流转时的稳定不变量。',
        concept: 'lc-document-loader',
      },
      {
        text: 'Document 的 id 字段注释透露了什么演进信号？',
        options: [
          'id 已是必填字段',
          'id 当前可选，注释写明未来大版本中在足够多 vectorstore 实现采纳后可能变为必填',
          'id 将被移除',
          'id 强制要求 UUID 格式且会做校验',
        ],
        answer: 1,
        explain:
          'document.ts:48-50 原文：The ID field is optional at the moment. It will likely become required in a future major release after it has been adopted by enough vectorstore implementations。且 id 的格式说明是 Ideally formatted as a UUID, but this will not be enforced——理想约束不校验。',
        concept: 'lc-document-loader',
      },
    ],
    [
      ['DocumentLoader', 'core 定义的加载环契约：一个 load() 返回 Promise<Document[]>，无流式无迭代'],
      ['Document 三元组', 'pageContent / metadata / id——RAG 全链路（加载→切分→存储→检索）唯一通用的数据语言'],
      ['BaseDocumentLoader', '把接口升级为抽象类的空壳基类，不提供模板方法'],
    ],
    [
      '把 Python 版的 lazy_load / load_and_split 套到 TS 线——TS core 的加载环只有同步语义的 load()，无惰性迭代',
      '以为加载器能 pipe 进 LCEL 链——DocumentLoader 不是 Runnable，转换环才是（见 L84）',
    ],
  ),
  'theory',
)
