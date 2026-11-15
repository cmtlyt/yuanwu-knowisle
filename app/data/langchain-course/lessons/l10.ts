import { L, withKind } from '../../course-builders.ts'

export const L10 = withKind(
  L(
    'L10',
    4,
    'BaseMessage 骨架：type 泛型化 role、content 双轨、MESSAGE_SYMBOL',
    3,
    ['L05'],
    ['lc-base-message'],
    [
      '说清 BaseMessage 两个泛型参数（TStructure/TRole）各自承担什么，以及子类如何用 readonly type 固定 role',
      '画出 content 与 contentBlocks 双轨的转换链：string → 块数组 → 三步翻译器',
      '解释构造函数「裸 string / 数组 / fields 对象」三态输入如何归一，以及 contentBlocks 输入为何会自动打上 output_version v1 标记',
    ],
    `### 从一个 symbol 开始的基座课

L05 已经回答了「为什么判型不能靠原型链」：ESM 多实例让同一份 core 出现两套类构造器，instanceof 随时失效。本课把镜头拉近到 BaseMessage 本身——它是所有消息类的基座，也是 MESSAGE_SYMBOL 的宿主。这一课走读四个部位：类声明的双泛型、构造函数的三态归一、content 的双轨视图、isInstance 的跨包判型。核心结论先放这里：**BaseMessage 用两个泛型把「内容结构」与「角色」拆开建模，用一个 symbol 把「身份判定」从原型链上解耦**。读完本课，HumanMessage/AIMessage/ToolMessage 这三个后续课的子类在你眼里都会变成「往骨架里填三五行代码」的薄壳。

### 类声明：两个泛型各管一摊

先看类声明原文：

\`\`\`ts
export abstract class BaseMessage<
  TStructure extends MessageStructure = MessageStructure,
  TRole extends MessageType = MessageType,
>
  extends Serializable
  implements Message<TStructure, TRole>
{
  lc_namespace = ["langchain_core", "messages"];

  lc_serializable = true;

  readonly [MESSAGE_SYMBOL] = true as const;

  abstract readonly type: TRole;
\`\`\`

*— langchain-core/src/messages/base.ts:215-236（commit 7704471）*

两个泛型的分工值得逐个说。**TRole 承担 role 语义**：MessageType 是 "human" | "ai" | "system" | "tool" 等角色名的联合，子类声明时把 TRole 钉死为字面量（如 \`BaseMessage<TStructure, "human">\`），再用 \`abstract readonly type: TRole\` 强制每个子类给出只读的 type 值。这样 \`msg.type\` 在类型层面就收窄成具体角色，不需要运行时字符串比较。**TStructure 承担内容结构**：它决定 content 字段的输入形态推断（$InferMessageContent<TStructure, TRole>），默认值 MessageStructure 覆盖通用形态。泛型化 role 是这节课第一个要记住的设计：role 不是枚举字段而是类型参数，「消息类即角色」因此成立——下两课的 HumanMessage 与 SystemMessage 会直接受益于这个约束。

另一个容易被略过的细节是 \`lc_serializable = true\`：消息是可以跨进程序列化的（StoredMessage 结构），这解释了为什么构造函数要主动补齐 additional_kwargs 与 response_metadata 的空对象——序列化器不欢迎 undefined。

### 构造函数：三态输入的归一化

\`\`\`ts
  constructor(
    arg:
      | $InferMessageContent<TStructure, TRole>
      | BaseMessageFields<TStructure, TRole>
  ) {
    const fields: BaseMessageFields<TStructure, TRole> =
      typeof arg === "string" || Array.isArray(arg)
        ? ({ content: arg } as BaseMessageFields<TStructure, TRole>)
        : arg;
    if (!fields.additional_kwargs) {
      fields.additional_kwargs = {};
    }
    if (!fields.response_metadata) {
      fields.response_metadata = {};
    }
    super(fields);
    this.name = fields.name;
    if (fields.content === undefined && fields.contentBlocks !== undefined) {
      this.content = fields.contentBlocks as $InferMessageContent<
        TStructure,
        TRole
      >;
      this.response_metadata = {
        output_version: "v1",
        ...fields.response_metadata,
      };
    } else if (fields.content !== undefined) {
      this.content = fields.content ?? [];
      this.response_metadata = fields.response_metadata;
    } else {
      this.content = [] as $InferMessageContent<TStructure, TRole>;
      this.response_metadata = fields.response_metadata;
    }
\`\`\`

*— langchain-core/src/messages/base.ts:276-308（commit 7704471）*

这段代码浓缩了三个决策。第一，**输入宽容**：\`new HumanMessage("hi")\`、\`new HumanMessage([{type:"text",...}])\`、\`new HumanMessage({content:"hi", id:"..."})\` 三种写法都被归一成 fields 对象再进 super。第二，**content 与 contentBlocks 是二选一的入口**：只给 contentBlocks 时，content 直接被赋为块数组，且 response_metadata 自动盖上 output_version: "v1"——这是 v1 内容模型（L14 主题）在构造层的入口标记。第三，全空输入兜底为空数组而不是 undefined，保证下游 .text/.contentBlocks 视图永远有合法输入。注意 BaseMessageFields 里 additional_kwargs 的 tool_calls 与 function_call 都挂着 @deprecated（base.ts:75-86）：**工具调用的规范家已经搬去 AIMessage 顶层字段**，这是 L12 的伏笔。

### content 双轨：text 与 contentBlocks 两个视图

\`\`\`ts
  get text(): string {
    const textBlocks: ContentBlock.Text[] = this.contentBlocks.filter(
      (block: ContentBlock.Standard) => block.type === "text"
    );
    return textBlocks.reduce(
      (acc: string, block: ContentBlock.Text) => acc + (block.text ?? ""),
      ""
    );
  }

  get contentBlocks(): Array<ContentBlock.Standard> {
    const blocks: Array<ContentBlock> =
      typeof this.content === "string"
        ? [{ type: "text", text: this.content }]
        : this.content;
    const parsingSteps = [
      convertToV1FromDataContent,
      convertToV1FromChatCompletionsInput,
      convertToV1FromAnthropicInput,
    ];
    const parsedBlocks = parsingSteps.reduce(
      (blocks, step) => step(blocks),
      blocks
    );
    return parsedBlocks as Array<ContentBlock.Standard>;
  }
\`\`\`

*— langchain-core/src/messages/base.ts:313-339（commit 7704471）*

content 字段本身是 \`string | ContentBlock[]\` 双轨存法——v0 世界里 provider 返回什么就存什么，v1 世界里统一存块数组。两个视图在这之上构建：\`.text\` 是「只要纯文本」的窄视图（过滤 type === "text" 后拼接），\`.contentBlocks\` 是「一定给我标准块」的宽视图——字符串先包成 text 块，再依次过三个翻译器把 provider 各自的内容方言（数据内容块、OpenAI chat completions 形态、Anthropic 形态）归一到 v1 标准。翻译管线用 reduce 把三个纯函数串起来，这是适配层模式的教科书写法：**每个 provider 的方言差异被隔离在独立翻译函数里，基类只认标准块**。AIMessage 在 L12 会覆写 contentBlocks 加第四条路径（按 model_provider 查注册表惰性翻译），本课先把基类行为记牢。

### isInstance：把 L05 的结论钉进基类

\`\`\`ts
  static isInstance(obj: unknown): obj is BaseMessage {
    return (
      typeof obj === "object" &&
      obj !== null &&
      MESSAGE_SYMBOL in obj &&
      (obj as Record<symbol, unknown>)[MESSAGE_SYMBOL] === true &&
      isMessage(obj)
    );
  }

  static [Symbol.hasInstance](obj: unknown) {
    return this.isInstance(obj);
  }
\`\`\`

*— langchain-core/src/messages/base.ts:364-376（commit 7704471）*

L05 讲过 \`Symbol.for("langchain.message")\` 的全局注册语义（base.ts:21 定义 symbol，:234 实例打标）。这里补两点课堂增量。其一，**isInstance 不是 instanceof 的替代品而是同义词**：静态 Symbol.hasInstance 覆写让 \`msg instanceof HumanMessage\` 这类表达式也走 symbol 检查——原型链判型被整体架空，多实例 core 下的跨包判型从此稳定。其二，每个子类都复写一层 \`static isInstance(obj) { return super.isInstance(obj) && obj.type === "human" }\`（human.ts:35-37 的写法），symbol 管「是不是消息」，type 管「是哪种消息」，两层检查各司其职。记住这个模式，后面所有消息类读起来都是复制粘贴。

### BaseMessageFields：消息的字段契约逐个看

类声明之外，消息的字段契约集中在 BaseMessageFields 接口里（base.ts:69-88），逐个过一遍能避免后面五课的重复解释。\`id?: string\` 是消息的唯一标识——流式场景里 chunk 靠它聚合回一条消息，agent 循环里 ToolMessage 靠 tool_call_id 间接引用它。\`name?: string\` 是消息的署名（多 agent 场景区分发言者）。\`content\` 是双轨主角，下一节展开。\`contentBlocks?\` 是 v1 入口（构造期只在缺 content 时生效）。\`additional_kwargs\` 是 provider 方言的寄存处：OpenAI 的 function_call、Anthropic 的 usage 之外数据都先落这里，注释里 \`tool_calls\` 与 \`function_call\` 两个键挂着 @deprecated——**它们是「曾经的位置」的路标，不是「可用的位置」**。\`response_metadata\` 是 provider 回传的响应级元数据：model_provider、output_version、model_name 都写在这里，contentBlocks 翻译管线的分派依据就是它。这个接口的字段划分原则值得记住：**协议性字段（id/name）直接进 interface，方言性数据进 additional_kwargs，响应性元数据进 response_metadata**——三者的边界在 L12/L13 的子类里会反复出现。

### 双轨混用的三个翻车现场

content 双轨给了自由，也埋了三个高频坑，全部可以从源码行为推演出来。**现场一：手动把 content 改成块数组但不盖 output_version 标记。** 构造后的消息是普通对象属性赋值，不会有任何拦截——此时 \`.contentBlocks\` 视图仍会走基类三步翻译管线把你的块数组再「翻译」一遍，如果块形状恰好匹配某种 provider 方言（比如带了 OpenAI 风格字段），会被错误归一；序列化与消费侧也可能因缺 v1 标记走不同分支。正确姿势：块数组应在构造期经 contentBlocks 入口传入（自动盖 v1 标记），或构造后同时更新 response_metadata。**现场二：给 additional_kwargs.tool_calls 赋值。** 这条路径只在 AIMessage 构造函数里有一段「检测到旧格式就警告并解析」的迁移逻辑（L12 展开），直接往里写新数据不会有人再解析它——规范位是顶层 tool_calls 字段。**现场三：跨包判型退回 instanceof。** BaseMessage 的静态 Symbol.hasInstance 覆写已经让 instanceof 走 symbol 检查（base.ts:364-376），但覆写只在「类对象本身来自同一份 core」时生效；如果你的构建器把 core 打包了两份（monorepo 里一个常见事故），两个物理类各自有各自的 MESSAGE_SYMBOL？不——\`Symbol.for\` 是全局注册表，同名 symbol 跨 realm 相同，这正是选 \`Symbol.for\` 而不是 \`Symbol()\` 的原因。所以真正的安全判型姿势是 \`BaseMessage.isInstance(obj)\` 静态方法或 instanceof 都可，但要确认 symbol 用的是 Symbol.for 版本。三个现场共用一个教训：**双轨是有方向的（v0 存原始、v1 存标准），跨轨操作必须经过框架提供的入口，绕过入口的手工赋值一律危险**。

### 本课小结

- BaseMessage 用双泛型拆开「内容结构 TStructure」与「角色 TRole」，role 由 \`abstract readonly type\` 固化进类型系统，「消息类即角色」由此成立。
- 构造函数把裸 string / 块数组 / fields 对象三态输入归一成 fields，并在只给 contentBlocks 时自动盖上 output_version: "v1" 标记。
- content 是 v0/v1 双轨存法，\`.text\` 与 \`.contentBlocks\` 是两个窄/宽视图，后者经三步翻译管线归一到 v1 标准块。
- MESSAGE_SYMBOL + 静态 Symbol.hasInstance 覆写让判型脱离原型链，子类只需追加一层 type 检查。
- 下一课看继承设计的收益端：HumanMessage 与 SystemMessage 有多薄、concat 又为什么分道扬镳。
`,
    null,
    [
      {
        text: 'BaseMessage 类声明中的 abstract readonly type: TRole 起什么作用？',
        options: [
          'type 是运行时才确定的字符串字段，泛型只影响文档注释',
          'role 语义被建模成泛型参数 TRole，每个子类用 readonly type = "human" as const 把 role 固化为类型的一部分',
          'type 用于序列化时选择 JSON schema',
          'type 决定消息在网络传输时的压缩格式',
        ],
        answer: 1,
        explain:
          '类声明是 BaseMessage<TStructure, TRole> 且 abstract readonly type: TRole（base.ts:215-236），HumanMessage 里写 readonly type = "human" as const（human.ts:25）。role 不只是运行时字符串，它参与类型系统——A 错在把泛型当装饰，C 错在 type 与序列化格式无关（序列化走 StoredMessage 的 type/data 结构），D 是无中生有。',
        concept: 'lc-base-message',
      },
      {
        text: '向 BaseMessage 子类构造函数只传一个裸字符串时，构造函数如何处理？',
        options: [
          '直接把字符串赋给 this.content，不做任何包装',
          '把字符串包装成 { content: arg } 的 fields 对象，再走统一构造路径',
          '抛出异常，要求必须传 fields 对象',
          '自动转换为 SystemMessage',
        ],
        answer: 1,
        explain:
          '构造函数对 typeof arg === "string" || Array.isArray(arg) 的情况包装成 { content: arg }（base.ts:281-284），后续补齐 additional_kwargs/response_metadata 空对象。A 错在忽略了包装步骤——直接赋值不会补齐默认字段；C 错，裸字符串恰恰是支持的形态；D 与类型系统无关。',
        concept: 'lc-base-message',
      },
      {
        text: '构造时只传 contentBlocks 不传 content，会发生什么？',
        options: [
          '抛错，content 与 contentBlocks 必须同时提供',
          'content 被赋为 contentBlocks，且 response_metadata 自动带上 output_version: "v1"',
          'contentBlocks 被丢弃，content 置为空数组',
          'content 保持 undefined，读取时才动态翻译',
        ],
        answer: 1,
        explain:
          'base.ts:293-301 明确：content 为 undefined 且 contentBlocks 存在时，this.content = fields.contentBlocks，并且 response_metadata 先放 output_version: "v1" 再展开用户传入的 metadata。A 错，二者互斥支持；C 错，contentBlocks 优先级更高；D 错，构造时就已落定 content，不是惰性读取。',
        concept: 'lc-base-message',
      },
      {
        text: 'message.contentBlocks 访问器内部的翻译管线依次经过哪三步？',
        options: [
          '先 JSON.parse，再 zod 校验，最后 mustache 渲染',
          'convertToV1FromDataContent → convertToV1FromChatCompletionsInput → convertToV1FromAnthropicInput',
          '先按 model_provider 查注册表，再序列化，再反序列化',
          '不做翻译，原样返回 content 数组',
        ],
        answer: 1,
        explain:
          'base.ts:329-333 定义 parsingSteps 数组，reduce 依次过数据内容、OpenAI chat completions 形态、Anthropic 形态三个翻译器。A 的三个步骤是其他子系统的职责；C 描述的是 AIMessage 覆写版的 model_provider 查表路径（ai.ts:204-213），不是基类管线；D 错，基类确实会做归一化翻译。',
        concept: 'lc-base-message',
      },
    ],
    [
      [
        'MESSAGE_SYMBOL',
        'Symbol.for("langchain.message") 注册的全局 symbol（base.ts:21），实例上 readonly [MESSAGE_SYMBOL] = true，是跨包判型的锚点',
      ],
      [
        'contentBlocks',
        'BaseMessage 的访问器属性：把 content（string 或块数组）翻译成统一的 v1 ContentBlock.Standard 数组的视图',
      ],
      ['output_version', 'response_metadata 里的标记，声明消息内容采用 v1 块模型还是 v0 原始模型，默认 v0'],
    ],
    [
      '把 additional_kwargs.tool_calls 当作工具调用的规范位置——它已标 @deprecated，规范位置是 AIMessage 顶层 tool_calls 字段（base.ts:75-86）',
      '以为 instanceof HumanMessage 在多实例 core（ESM 重复安装）下永远可靠——它靠静态 Symbol.hasInstance 覆写兜底，这是 L05 的结论在基类层的落点',
      '直接改 message.content 为块数组但忘记 output_version 标记——下游 contentBlocks 视图与序列化行为会因缺标记而走不同分支',
    ],
  ),
  'framework',
)
