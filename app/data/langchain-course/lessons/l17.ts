import { L, withKind } from '../../course-builders.ts'

export const L17 = withKind(
  L(
    'L17',
    5,
    '流式三件套：_streamResponseChunks 缺省抛错、_streamIterator 降级 invoke、disableStreaming',
    2,
    ['L16'],
    ['lc-model-streaming'],
    [
      '说清模型流式的能力协商机制：_streamResponseChunks 缺省抛 Not implemented，子类覆写即获得流式',
      '解释 _streamIterator 的降级判断（原型函数相等性检查 + disableStreaming）及其与 Runnable.stream 首块缓冲的配合',
      '走读流式循环里框架代劳的四件事：id 补全、response_metadata 注入、chunk 聚合、abort 与错误上报',
    ],
    `### 覆写即获得：流式的优雅降级

L16 结尾留了 disableStreaming 这个名字，本课兑现它。模型流式是 provider 能力——有的 SDK 支持 token 级推送，有的根本不吐增量。框架怎么表达「这个子类会流式、那个不会」？答案是本课的三件套：**一个缺省抛错的抽象面（_streamResponseChunks）、一个自动降级的迭代器（_streamIterator）、一个能力关闭开关（disableStreaming）**。核心结论：流式能力是「覆写即获得」的——不覆写，stream() 自动退化为单次 invoke，用户代码零改动；覆写了，框架还会替你补 id、注元数据、做聚合。这是优雅降级的教科书实现。

### 三件套全景：缺省抛错与桥接

\`\`\`ts
  async *_streamResponseChunks(
    _messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    throw new Error("Not implemented.");
  }

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

*— langchain-core/src/language_models/chat_models.ts:302-345（commit 7704471）*

两个方法两代协议。_streamResponseChunks 是 legacy chunk 流的抽象面：不是 abstract 而是**抛错缺省体**——这个选择有讲究：abstract 会在编译期强制所有 provider 实现（老 provider 适配器被迫实现假流式），抛错体把「未实现」推迟到运行时，与 _streamIterator 的能力协商配合后，正常路径根本到不了抛错体。_streamChatModelEvents 是新一代块级事件协议（L18 的主角）的缺省实现：没有 provider 原生事件时，从 legacy chunk 流**桥接**——convertChunksToEvents 把 token 流合成出 MessageStart → ContentBlockStart → Delta → Finish 的生命周期（:318-330 的注释给出完整事件图）。两代协议并存的兼容策略可见一斑：新协议缺省可用，provider 覆写即可升级原生。

### 降级判断：函数引用比较

\`\`\`ts
  async *_streamIterator(
    input: BaseLanguageModelInput,
    options?: Partial<CallOptions>
  ): AsyncGenerator<OutputMessageType> {
    // Subclass check required to avoid double callbacks with default implementation
    if (
      this._streamResponseChunks ===
        BaseChatModel.prototype._streamResponseChunks ||
      this.disableStreaming
    ) {
      yield this.invoke(input, options);
    } else {
      const prompt = BaseChatModel._convertInputToPromptValue(input);
      const messages = prompt.toChatMessages();
      const [runnableConfig, callOptions] =
        this._separateRunnableConfigFromCallOptionsCompat(options);
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:504-519（commit 7704471）*

降级条件两个，满足其一即走单发。**函数引用比较**是这里最值得学的一手：\`this._streamResponseChunks === BaseChatModel.prototype._streamResponseChunks\`——子类没覆写时 this 上的方法解析到基类原型函数，引用全等；覆写后指向子类原型，不等。注释补了第二个动机：避免默认实现下回调重复（降级为 invoke 时走 invoke 自己的回调装配，不会装配两次）。**disableStreaming 是逃生开关**：即便子类实现了流式，实例也可强制关闭——provider SDK 偶发流式 bug 时的用户侧开关，比改代码快。降级分支的 yield this.invoke 有个微妙细节：invoke 内部走 generate → _generate 回调链，流式分支走 handleChatModelStart + 逐 chunk 回调链，两条链的回调事件形状不同（这就是避免重复装配的原因）。

### 流式循环：框架代劳的四件事

\`\`\`ts
      let generationChunk: ChatGenerationChunk | undefined;
      try {
        for await (const chunk of this._streamResponseChunks(
          messages,
          callOptions,
          runManagers?.[0]
        )) {
          callOptions.signal?.throwIfAborted();
          if (chunk.message.id == null) {
            const runId = runManagers?.at(0)?.runId;
            if (runId != null) chunk.message._updateId(\`run-\${runId}\`);
          }
          chunk.message.response_metadata = {
            ...chunk.generationInfo,
            ...chunk.message.response_metadata,
          };
          if (outputVersion === "v1") {
            yield castStandardMessageContent(
              chunk.message
            ) as OutputMessageType;
          } else {
            yield chunk.message as OutputMessageType;
          }
          if (!generationChunk) {
            generationChunk = chunk;
          } else {
            generationChunk = generationChunk.concat(chunk);
          }
        }
        callOptions.signal?.throwIfAborted();
      } catch (err) {
        await Promise.all(
          (runManagers ?? []).map((runManager) =>
            runManager?.handleLLMError(err)
          )
        );
        throw err;
      }
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:555-593（commit 7704471）*

循环体五步，浓缩成框架代劳的四件事。**其一：abort 检查**——每个 chunk 到手先 throwIfAborted（:562），循环结束后再查一次（:585）：后者针对「provider 提前正常结束但用户已取消」的情形，abort 不会因为流结束而丢信号。**其二：id 补全**——provider 通常只在首块给消息 id，框架对 id 为 null 的 chunk 用 runId 补（_updateId 同时写实例与 lc_kwargs 保证序列化一致，base.ts:380-386）。**其三：元数据注入**——generationInfo 合进 response_metadata。**其四：聚合**——generationChunk = generationChunk.concat(chunk)，L15 的合并 DSL 在这里逐 delta 滚动；聚合结果用于循环结束后的 handleLLMEnd 事件与 llmOutput 的 tokenUsage 提取（:594-608）。错误路径：handleLLMError 上报后 rethrow——回调不吞错。outputVersion === "v1" 的分支（:571-577）是 L16 的 outputVersion 在流式侧的落点：v1 时对每个 yield 做 castStandardMessageContent 归一。

### 公开入口：stream() 的首块缓冲

\`\`\`ts
  async stream(
    input: RunInput,
    options?: Partial<CallOptions>
  ): Promise<IterableReadableStream<RunOutput>> {
    // Buffer the first streamed chunk to allow for initial errors
    // to surface immediately.
    const config = ensureConfig(options);
    const wrappedGenerator = new AsyncGeneratorWithSetup({
      generator: this._streamIterator(input, config),
      config,
    });
    await wrappedGenerator.setup;
    return IterableReadableStream.fromAsyncGenerator(wrappedGenerator);
  }
\`\`\`

*— langchain-core/src/runnables/base.ts:311-324（commit 7704471）*

用户调用的 stream() 是 Runnable 基类方法：包一层 AsyncGeneratorWithSetup、await setup（拉取首个生成结果）、再转 IterableReadableStream。**首块缓冲让错误提前**：连接失败、鉴权失败在 await model.stream() 这一行就抛出，而不是 for await 的第一个 next 时——对无人值守的服务这是可用性差异。_streamIterator 的降级判断在这层之前就已生效，所以「没实现流式的模型」调用 stream() 也不会在缓冲阶段报错。本课把机制讲到这一层为止：IterableReadableStream 的构造细节与首块缓冲的完整代价在 L29 专讲，模块三还会把 stream 与 invoke/batch/transform 的降级链一起收网（L27）。

### 本课小结

- 三件套分工：_streamResponseChunks 抛错缺省体（运行时协商能力）+ _streamIterator 降级判断（函数引用比较 + disableStreaming）+ 公开 stream() 的首块缓冲。
- 覆写即获得：provider 实现 _streamResponseChunks 后，id 补全（run-\${runId}）、generationInfo 注入、chunk 聚合、abort/error 上报全部由框架代劳。
- 降级是透明的：未覆写或 disableStreaming 时 stream() 产出单元素流（整条消息一个 invoke），消费方要自行兼容。
- 两代流协议并存：legacy chunk 流可经 convertChunksToEvents 桥接为块级事件，provider 覆写 _streamChatModelEvents 即原生升级。
- 下一课正式走进新协议：ChatModelStream 的四子流（text/toolCalls/reasoning/usage）与块级事件生命周期。
`,
    null,
    [
      {
        text: '一个 provider 子类没有覆写 _streamResponseChunks 时，调用 model.stream() 会发生什么？',
        options: [
          '编译期报错，因为 _streamResponseChunks 是 abstract',
          '运行时降级：_streamIterator 检测到子类未覆写（或 disableStreaming 为 true），yield this.invoke(input, options)，整条流只有一个元素',
          '抛出 Not implemented 错误',
          '返回空流',
        ],
        answer: 1,
        explain:
          'chat_models.ts:504-514：判断 this._streamResponseChunks === BaseChatModel.prototype._streamResponseChunks 或 disableStreaming 时走 yield this.invoke。基类的 _streamResponseChunks 不是 abstract 而是 throw new Error("Not implemented.")（:302-309）——抛错体是给「绕过降级检查直接调用」的场景准备的，正常 stream() 永远到不了它。A 错，它不是 abstract；C 错，Not implemented 只在未覆写却被直接调用时触发；D 错，流有一个元素。',
        concept: 'lc-model-streaming',
      },
      {
        text: '_streamIterator 判断「子类是否覆写了 _streamResponseChunks」用的手法是？',
        options: [
          '检查 constructor.name',
          '把 this._streamResponseChunks 与 BaseChatModel.prototype._streamResponseChunks 做严格相等比较',
          '用 Reflect.has 检查子类原型',
          '读 package.json 的能力声明',
        ],
        answer: 1,
        explain:
          'chat_models.ts:509-512 直接比较函数引用：子类覆写后 this._streamResponseChunks 指向子类原型上的函数，与基类原型函数不再全等。这是无注册表的能力探测——JS 里函数引用比较是判断「是否覆写」的最廉价手段。A 错，类名在压缩构建下不可靠；C 错，Reflect.has 无法区分覆写与继承；D 是无出处的想象。',
        concept: 'lc-model-streaming',
      },
      {
        text: '流式循环里，chunk.message.id 为 null 时框架做什么？',
        options: [
          '保留 null',
          '以 runId 补 id：chunk.message._updateId(`run-${runId}`)',
          '生成随机 UUID',
          '从上一 chunk 复制 id',
        ],
        answer: 1,
        explain:
          'chat_models.ts:563-566：id 为 null 时取 runManager 的 runId，调 _updateId 写入实例与 lc_kwargs（base.ts:380-386）。补 id 让聚合出的最终消息有确定身份，且与回调系统共享同一 runId。A 错，框架会主动补；C 错，用的是 runId 而非随机数；D 错，没有跨 chunk 复制逻辑。',
        concept: 'lc-model-streaming',
      },
      {
        text: '公开的 model.stream() 与 _streamIterator 之间隔着什么机制？',
        options: [
          '没有间隔，stream 就是 _streamIterator 的别名',
          'Runnable.stream 用 AsyncGeneratorWithSetup 包住 _streamIterator 并 await 首个 setup，缓冲首块以便错误在调用点立即抛出，再经 IterableReadableStream 输出',
          '中间隔一层 WebSocket',
          'stream 先跑一次 invoke 探测能力',
        ],
        answer: 1,
        explain:
          'runnables/base.ts:311-324：new AsyncGeneratorWithSetup({generator: this._streamIterator(input, config)}) 后 await wrappedGenerator.setup——首块被提前消费，连接错误、鉴权错误在 stream() 调用点就抛出，而不是等到 for await 消费时。A 错，中间有包装层；C/D 无依据。首块缓冲的机制细节在 L29 展开。',
        concept: 'lc-model-streaming',
      },
      {
        text: 'disableStreaming = true 的语义边界是？',
        options: [
          '禁止所有流式相关 API 被调用',
          '只影响降级判断：stream() 走 invoke 单发；但 generate 路径的「检测到流式回调 handler 时自动切流式」同样受它约束，而 streamEvents 新协议入口不受此字段直接拦截',
          '让 _streamResponseChunks 直接抛错',
          '是缓存开关的别名',
        ],
        answer: 1,
        explain:
          'disableStreaming 在两处生效：_streamIterator 的降级判断（:512）与 _generateUncached 里 hasChatModelStreamEventHandler 分支的守卫（:717）。它是「能力关闭」开关而非禁用 API——stream() 调用本身不报错，只是退化为单发。B 的其余选项错在把开关语义放大或张冠李戴：C 错，_streamResponseChunks 的抛错体与该开关无关；D 错，缓存是 cache 字段。',
        concept: 'lc-model-streaming',
      },
    ],
    [
      [
        '_streamResponseChunks',
        'provider 实现的流式生成器抽象方法，产出 ChatGenerationChunk；基类缺省体抛 Not implemented',
      ],
      [
        '_streamIterator',
        'BaseChatModel 覆写的内部迭代器：能力协商 + 回调装配 + 聚合，公开 stream() 的真正引擎',
      ],
      ['disableStreaming', '实例级开关（chat_models.ts:234），关闭流式能力让 stream() 降级为 invoke'],
      [
        'AsyncGeneratorWithSetup',
        'runnables/base.ts:318 使用的包装器，提前拉取首个生成结果以在调用点暴露错误',
      ],
    ],
    [
      '以为没覆写 _streamResponseChunks 会崩——优雅降级让 stream() 变成一次 invoke，但消费方若按「多 chunk 流」写逻辑（如进度条）会静默失效，降级是透明的',
      '在流式循环里读 chunk.message.tool_calls——AIMessageChunk 的懒折叠（L15）会在每个 chunk 上反复触发，聚合请等流结束',
      '把 Not implemented 错误当降级失败的信号——它只在绕过 _streamIterator 直接调 _streamResponseChunks 时出现，正常路径永远走降级分支',
    ],
  ),
  'theory',
)
