import { L, withKind } from '../../course-builders.ts'

export const L18 = withKind(
  L(
    'L18',
    5,
    'ChatModelStream 块级事件：text/toolCalls/reasoning/usage 四子流、v1/v0 协议并存',
    3,
    ['L17'],
    ['lc-chat-stream-events'],
    [
      '说出 ChatModelStream 的双身份：AsyncIterable<ChatModelStreamEvent> 与 PromiseLike<AIMessage>，以及四个类型化子流访问器',
      '画出块级事件生命周期 MessageStart → ContentBlockStart → Delta* → ContentBlockFinish → MessageFinish，并说出块间交错的唯一不变式',
      '解释 ReplayBuffer 的多消费者回放机制，以及 convertChunksToEvents 桥接层如何从旧 chunk 流合成事件生命周期',
    ],
    `上一课（L17）我们看到了流式的降级链：不覆写 \`_streamResponseChunks\` 的模型自动退化为单发 invoke。但那只是「能不能流」的问题；这一课回答「流出来之后长什么样」。旧协议把一切压平成 token 级的 \`ChatGenerationChunk\`，消费者要自己拼文本、自己聚合 tool call 参数；新一代协议则把响应建模为**带生命周期的内容块事件**，并给出一个既可整体 await、又可按维度订阅的门面对象 \`ChatModelStream\`。两代协议在当前源码里**并存**，切换点就在 \`streamEvents()\` 的重载分派上。本课全部证据来自 \`language_models/chat_models.ts\`、\`event.ts\`、\`stream.ts\` 与 \`compat.ts\`（commit 7704471）。

### 两代协议的分水岭：_streamChatModelEvents

\`BaseChatModel\` 上有一个与 \`_streamResponseChunks\` 平行的新抽象方法，默认实现是「从旧 chunk 流桥接」：

\`\`\`ts
async *_streamChatModelEvents(
  messages: BaseMessage[],
  options: this["ParsedCallOptions"],
  runManager?: CallbackManagerForLLMRun
): AsyncGenerator<ChatModelStreamEvent> {
  // Default: bridge from legacy _streamResponseChunks
  const chunks = this._streamResponseChunks(messages, options, runManager);
  yield* convertChunksToEvents(chunks, { signal: options.signal });
}
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:337-345（commit 7704471）*

方法上方的注释给出了完整的事件生命周期图：\`MessageStart → ContentBlockStart(index, contentBlock) → ContentBlockDelta(index, delta)... → ContentBlockFinish(index, contentBlock) → MessageFinish(reason, usage?)\`。这里藏着一个关键设计决策：**provider 子类覆写 \`_streamResponseChunks\` 就自动获得新协议**——桥接层把 token 流合成出块级生命周期；只有想原生产出事件的 provider 才需要覆写 \`_streamChatModelEvents\` 本身。这延续了 L17 的「覆写即获得」哲学，把迁移成本压到最低。

### 事件词汇表：五种 delta 与累积语义

\`event.ts\` 是整个协议的词汇表。五个 delta 类型各自携带明确的合并语义：

\`\`\`ts
export interface TextDelta {
  type: "text-delta";
  text: string;
}

export interface ToolCallDelta {
  type: "tool-call-delta";
  args: string;
}

export interface BlockDelta {
  type: "block-delta";
  fields: { type: string } & Record<string, unknown>;
}

export type ContentBlockDelta =
  | TextDelta
  | ReasoningDelta
  | DataDelta
  | ToolCallDelta
  | BlockDelta;
\`\`\`

*— langchain-core/src/language_models/event.ts:106-166（commit 7704471）*

| delta 类型 | 累积语义 |
|---|---|
| text-delta | 追加到活动块的 \`text\` 字段 |
| reasoning-delta | 追加到 \`reasoning\` 字段 |
| data-delta | 追加到多模态块的 \`data\` 字段（base64） |
| tool-call-delta | 追加 JSON **子串**到 \`args\`——单片段不必是合法 JSON |
| block-delta | 对活动块做**浅合并**（快照式替换，如 Anthropic 的 signature 字段） |

注释里特别强调了一个容易踩的坑：tool call 的 args 流有两种形态且**同一块内不会混用**——要么是追加式的 \`tool-call-delta\` 片段，要么是替换式的 \`block-delta\` args 快照。另有 \`UsageUpdateEvent\` 携带的是**运行快照**而非增量，\`ProviderEvent\` 则是不映射到标准类型的 provider 原生事件透传通道，避免静默丢数据。

### ChatModelStream：一个对象，五种读法

\`streamEvents()\` 不带 \`version\` 时返回 \`ChatModelStream\`，它同时实现两个接口：

\`\`\`ts
export class ChatModelStream
  implements AsyncIterable<ChatModelStreamEvent>, PromiseLike<AIMessage>
{
  private _buffer: ReplayBuffer;

  constructor(source: AsyncIterable<ChatModelStreamEvent>) {
    this._buffer = new ReplayBuffer();
    this._consume(source);
  }

  [Symbol.asyncIterator](): AsyncIterator<ChatModelStreamEvent> {
    return this._buffer.iterate();
  }

  get text(): TextContentStream {
    return new TextContentStream(this._buffer);
  }

  get toolCalls(): ToolCallsStream {
    return new ToolCallsStream(this._buffer);
  }

  get reasoning(): ReasoningContentStream {
    return new ReasoningContentStream(this._buffer);
  }

  get usage(): UsageMetadataStream {
    return new UsageMetadataStream(this._buffer);
  }
}
\`\`\`

*— langchain-core/src/language_models/stream.ts:571-617（commit 7704471）*

这是典型的**门面 + 多视图**模式：构造函数立刻启动 \`_consume\` 把源事件灌进 \`ReplayBuffer\`，之后无论是整体 \`await stream\` 出完整 \`AIMessage\`（\`then\` 委托 \`_assembleMessage\`），还是 \`for await\` 原始事件，抑或订阅某个子流，读的都是同一份缓存。\`ReplayBuffer.iterate()\` 的实现值得逐行看：每个消费者持有自己的 \`cursor\`，追上进度就 \`await\` 一个由 \`push/finish/setError\` 唤醒的 Promise——错误也会被缓存进 buffer，迟到加入的消费者同样能收到。\`TextContentStream\` 还提供 \`.full\` 视图（每个 delta 后的累计全文），\`ReasoningContentStream\` 的实现里能看到对 \`thinking\` 与 \`reasoning\` 两种块类型的双兼容。

### streamEvents 的重载分派：v1/v0 如何并存

同一个方法名承载了两代协议，分派逻辑只有十行：

\`\`\`ts
streamEvents(
  input: BaseLanguageModelInput,
  options?: Partial<CallOptions> & {
    version?: "v1" | "v2";
    encoding?: "text/event-stream" | undefined;
  },
  streamOptions?: Omit<EventStreamCallbackHandlerInput, "autoClose">
): ChatModelStream | IterableReadableStream<StreamEvent | Uint8Array> {
  if (options?.version === "v1" || options?.version === "v2") {
    return super.streamEvents(input, options as ..., streamOptions);
  }
  const prompt = BaseChatModel._convertInputToPromptValue(input);
  const messages = prompt.toChatMessages();
  const [, callOptions] =
    this._separateRunnableConfigFromCallOptionsCompat(options);
  const generator = this._streamChatModelEvents(messages, callOptions);
  return new ChatModelStream(generator);
}
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:465-492（commit 7704471）*

带 \`version\` 的五个重载全部标着 \`@deprecated\`，返回的是 Runnable 层的回调式 \`StreamEvent\`（L92/L43 会再遇到的追踪事件体系）；无 \`version\` 才走新协议。另有 \`streamV2()\` 也已弃用，直接转发到无参 \`streamEvents\`。命名在这段源码里颇为反直觉——「v2」不是指块级事件协议，而是旧回调体系的版本号，读源码时不要被带偏。

### 兼容层深读：convertChunksToEvents 的合成术

桥接函数是理解两代协议衔接的最佳教材。它维护一个 \`activeBlocks: Map<number, {type, accumulated}>\`，逐 chunk 扫描：

\`\`\`ts
for await (const chunk of chunks) {
  options?.signal?.throwIfAborted();
  const msg = chunk.message;
  if (!messageStarted) {
    messageStarted = true;
    const startEvent: ChatModelStreamEvent = {
      event: "message-start" as const,
      id: msg.id ?? undefined,
    };
    if (AIMessageChunk.isInstance(msg) && msg.usage_metadata) {
      (startEvent as { usage?: unknown }).usage = msg.usage_metadata;
      lastUsage = { ...msg.usage_metadata };
    }
    yield startEvent;
  }
  // string content → block 0 的 text-delta
  // Array content → 按 part.index 分块，无 index 则 activeBlocks.size 兜底
  // tool_call_chunks → tool_call_chunk 块 + tool-call-delta
}
\`\`\`

*— langchain-core/src/language_models/compat.ts:158-282 裁剪（commit 7704471）*

三个细节值得记住：**其一**，OpenAI 风格的纯字符串 content 被合成为 index 0 的单个 text 块；**其二**，tool call 片段按 \`toolChunk.index\` 建块，首个片段的 \`content-block-start\` 先行，后续 args 以 \`tool-call-delta\` 追加，**迟到的 id/name 会累积在 finish 事件上补齐**——注释原话是 "A late id or name reaches consumers on finish"；**其三**，聚合副本特意做了拷贝以免 start 事件被后续累积污染。对比 L15 的 chunk 合并规则表可以看到：合并逻辑从「chunk 层的字典 DSL」上移到了「事件层的显式生命周期」，边界从隐式约定变成了协议承诺。

### 子流的实现细节：只认 finish 事件的 toolCalls 与取末值的 usage

四个子流的过滤规则并不对称，各自的取舍值得一读。\`ToolCallsStream\` 的迭代器只放行 \`content-block-finish\` 且块类型为 \`tool_call\` 的事件：

\`\`\`ts
[Symbol.asyncIterator](): AsyncIterator<ContentBlock.Tools.ToolCall> {
  const buffer = this._buffer;
  async function* gen() {
    for await (const event of buffer.iterate()) {
      if (
        event.event === "content-block-finish" &&
        event.content.type === "tool_call"
      ) {
        yield event.content as ContentBlock.Tools.ToolCall;
      }
    }
  }
  return gen();
}
\`\`\`

*— langchain-core/src/language_models/stream.ts:373-385（commit 7704471）*

也就是说流式阶段的 \`tool_call_chunk\` 块永远到不了这个子流——**工具调用只在块完结时才以完整形态出现**，\`.full\` 视图则维护一个数组，每次 finish 后 yield 历史快照的浅拷贝（stream.ts:355-370）。块本身的折叠由 \`standardizeToolBlock\` 完成：只处理 \`tool_call_chunk/tool_use/input_json_delta\` 三种类型且 name 非空的块，\`args\` 取 \`record.args ?? record.input\` 后交给 \`parseToolArgs\` 解析——迟到的 id/name 让它原样返回，这正是 finish 事件兜底的实现落点（stream.ts:244-264）。\`UsageMetadataStream\` 的采集面更宽：独立的 \`usage\` 事件、\`message-start\` 与 \`message-finish\` 上携带的 usage 都会被 \`normalizeUsage\`（stream.ts:215）归一后 yield（stream.ts:527-540）——token 计数是「跑量更新」语义，消费端取最后一次值即总量。\`ReasoningContentStream\` 还有一个状态机细节：\`seenReasoning\` 标记一旦置位，后续遇到非 reasoning 的块就直接终止迭代（stream.ts:424-436）——推理内容被建模为单一连续区段，而非可交错的任意多块。

### 本课小结

- 新协议以块为中心：\`MessageStart → ContentBlockStart → ContentBlockDelta* → ContentBlockFinish → MessageFinish\`，块间允许交错，唯一不变式是单块内 start < delta < finish。
- \`ChatModelStream\` 一次消费、多视图复用：原始事件可迭代、整体可 await 出 \`AIMessage\`、text/toolCalls/reasoning/usage 四子流共享 \`ReplayBuffer\` 且互不干扰。
- 未知的 delta 类型被安全跳过，完整块由 finish 事件兜底——协议为演进预留了向后兼容。
- 两代协议通过 \`streamEvents\` 的重载分派并存：带 \`version\` 走已弃用的回调式追踪，无 \`version\` 走块级事件；provider 覆写 \`_streamResponseChunks\` 即自动获得新协议。
- 下一课转向模型能力面的另一半：\`bindTools\` 如何用「可选方法」表达能力契约，\`withStructuredOutput\` 又如何建立在它之上。
`,
    null,
    [
      {
        text: 'ChatModelStream 暴露的四个类型化子流访问器是？',
        options: [
          'tokens / chunks / events / usage',
          'text / toolCalls / reasoning / usage',
          'text / messages / toolCalls / tokens',
          'content / delta / blocks / usage',
        ],
        answer: 1,
        explain:
          'stream.ts 中 ChatModelStream 定义了 get text / get toolCalls / get reasoning / get usage 四个访问器，分别返回 TextContentStream、ToolCallsStream、ReasoningContentStream、UsageMetadataStream。tokens/chunks/events 等名字并不存在于该类——events 维度走的是对象本身的 AsyncIterable 接口而非子流。',
        concept: 'lc-chat-stream-events',
      },
      {
        text: '块级事件协议对多个内容块之间的顺序给出的唯一不变式是？',
        options: [
          '事件必须严格按 index 递增排序，块与块不能交错',
          '同一块的 start 先于它的 delta、delta 先于 finish；不同块之间没有顺序约束',
          '所有 delta 事件必须出现在 MessageStart 之前',
          'ContentBlockFinish 事件可以省略，消费者自行推断边界',
        ],
        answer: 1,
        explain:
          'chat_models.ts 的 _streamChatModelEvents 注释与 event.ts 的设计原则第 3 条都写明：块可以交错（如并行 tool call），唯一不变式是同一块的 start < delta < finish。选 A 错在协议明确允许交错；选 C 颠倒了生命周期；选 D 违反第 2 条设计原则——每个实体都有显式的 start/finish，消费者不需要从『事件缺失』推断边界。',
        concept: 'lc-chat-stream-events',
      },
      {
        text: '对同一个 ChatModelStream 同时消费 stream.text 和 stream.toolCalls，底层发生的是？',
        options: [
          '每个子流各自重新调用一次模型，产生两份独立流',
          '子流之间互斥，消费一个后其他子流变空',
          '两个子流共享同一个 ReplayBuffer，各自用独立游标回放同一批已缓存事件，事件不会因消费而移除',
          '只有第一个被创建的子流能拿到数据',
        ],
        answer: 2,
        explain:
          'ChatModelStream 构造时启动 _consume 把源事件全部推入 ReplayBuffer；ReplayBuffer.iterate() 为每个消费者维护自己的 cursor，事件数组永不删除——注释原文是 Multiple consumers can independently iterate the same buffer。A 错在子流只是事件重放，不触发任何模型调用；B 错在四个子流可同时消费；D 与实现相反。',
        concept: 'lc-chat-stream-events',
      },
      {
        text: 'provider 发来一个当前版本不认识的新 delta 类型时，applyDelta 的处理是？',
        options: [
          '抛出异常终止整个流',
          '丢弃该内容块的所有后续事件',
          '走 default 分支直接跳过该 delta；完整块由 content-block-finish 事件携带',
          '自动包装成 ProviderEvent 转发',
        ],
        answer: 2,
        explain:
          'stream.ts 的 applyDelta 有显式 default 分支，注释说明 agent protocol 会随时间新增 delta 变体，本版本不认识的直接跳过，而 content-block-finish 携带完整块兜底。ProviderEvent 是给『provider 原生事件』准备的透传通道，两者语义不同；抛错与丢块都违背协议的向后兼容原则。',
        concept: 'lc-chat-stream-events',
      },
      {
        text: '调用 model.streamEvents(input, { version: "v2" }) 得到的是什么？',
        options: [
          '一个新的 ChatModelStream 对象',
          '委托给 super.streamEvents 的回调式 StreamEvent 流——这是已标记 deprecated 的旧追踪协议',
          '一个纯文本 token 的 ReadableStream',
          '直接抛错，v2 已被移除',
        ],
        answer: 1,
        explain:
          'chat_models.ts 的实现签名里第一件事就是判断 options?.version === "v1" || "v2"，命中则 return super.streamEvents(...) 走 Runnable 层的回调式追踪事件，且这组重载全部带 @deprecated 标记。不带 version 参数的调用才走 _streamChatModelEvents 构造 ChatModelStream。A 恰好是无 version 时的行为；C 是 encoding: text/event-stream 变体的产物；D 错，v1/v2 只是弃用而非移除。',
        concept: 'lc-chat-stream-events',
      },
    ],
    [
      [
        'ChatModelStream',
        'streamEvents() 无 version 参数时的返回对象：既是事件流又是最终 AIMessage 的 Promise，附带四个类型化子流',
      ],
      [
        'ChatModelStreamEvent',
        '块级事件联合类型：message-start / content-block-start / content-block-delta / content-block-finish / usage / message-finish / provider',
      ],
      [
        'ReplayBuffer',
        '事件缓存区：push 缓存事件并唤醒等待者，iterate() 为每个消费者维护独立游标，事件永不移除',
      ],
      [
        'convertChunksToEvents',
        'compat.ts 中的桥接函数：把旧 ChatGenerationChunk 流合成出完整的块级事件生命周期',
      ],
    ],
    [
      '把带 version 参数的 streamEvents 与无参版本混为一谈——前者是回调式 StreamEvent 追踪协议（已弃用），后者才是块级事件门面',
      '以为 toolCalls 子流产出的是解析好的工具调用对象——流式阶段块类型是 tool_call_chunk，args 是 JSON 子串；解析完成的 tool_call 块由 content-block-finish 携带（standardizeToolBlock 完成折叠）',
      '以为消费子流会重复触发模型调用——子流只是对同一事件缓存的不同视图，模型只调用一次',
    ],
  ),
  'framework',
)
