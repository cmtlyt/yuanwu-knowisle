import { L, withKind } from '../../course-builders.ts'

export const L12 = withKind(
  L(
    'L12',
    4,
    'AIMessage 构造解剖：tool_calls 解析、invalid 桶、v1 内容块互补',
    3,
    ['L10'],
    ['lc-ai-message'],
    [
      '走通 AIMessage 构造函数的四个阶段：三态归一、旧格式升级解析、v1 内容块改写、tool_calls 双向互补',
      '解释 tool_calls 与 invalid_tool_calls 双轨的容错哲学：JSON.parse 失败进 invalid 桶而不是抛异常',
      '说明 contentBlocks 覆写版的三条翻译路径与 tool_call 块互补逻辑',
    ],
    `### 模型输出落地的第一站

模块二消息族里，AIMessage 是唯一有 190 行构造函数的类——它站在「模型返回什么」与「框架期望什么」的交界处，一切 provider 方言的清淤工作都在这里进行。本课逐段走读构造函数的四个阶段，再看他覆写的 contentBlocks 访问器。**核心结论：AIMessage 构造函数是一台归一化机器——旧格式升级、非法 JSON 进桶、v1 块改写、tool_calls 与块双向互补，四步做完后，下游永远拿到规范形状**。这一课是 L13（ToolMessage 关联）、L14（内容块）、L15（chunk 合并）的共同前置。

### 字段面：三个新增字段

\`\`\`ts
export interface AIMessageFields<
  TStructure extends MessageStructure = MessageStructure,
> extends BaseMessageFields<TStructure, "ai"> {
  tool_calls?: $InferToolCalls<TStructure>[];
  invalid_tool_calls?: InvalidToolCall[];
  usage_metadata?: $InferMessageProperty<TStructure, "ai", "usage_metadata">;
}
\`\`\`

*— langchain-core/src/messages/ai.ts:38-44（commit 7704471）*

相对 BaseMessageFields，AIMessage 新增三字段。tool_calls 是已解析的工具调用数组（ToolCall = { type?: "tool_call", id?, name, args }，args 已是对象，tool.ts:228-246）；invalid_tool_calls 是解析失败的保底桶；usage_metadata 装 token 计数。注意基类 additional_kwargs 里弃用的 tool_calls 字段与本字段的关系：前者是 OpenAI 原始 payload 的历史寄存处，后者是规范家。**id 字段的角色也在此预告：它是把 AIMessage 与后续 ToolMessage 串起来的链路键**，L13 会正面讲。

### 构造第一段：旧格式升级与 invalid 桶

\`\`\`ts
      const rawToolCalls = initParams.additional_kwargs?.tool_calls;
      const toolCalls = initParams.tool_calls;
      if (
        !(rawToolCalls == null) &&
        rawToolCalls.length > 0 &&
        (toolCalls === undefined || toolCalls.length === 0)
      ) {
        console.warn(
          [
            "New LangChain packages are available that more efficiently handle",
            "tool calling.\\n\\nPlease upgrade your packages to versions that set",
            "message tool calls. e.g., \`pnpm install @langchain/anthropic\`,",
            "pnpm install @langchain/openai\`, etc.",
          ].join(" ")
        );
      }
      try {
        if (!(rawToolCalls == null) && toolCalls === undefined) {
          const [parsedToolCalls, invalidToolCalls] =
            defaultToolCallParser(rawToolCalls);
          initParams.tool_calls =
            (parsedToolCalls as $InferToolCalls<TStructure>[]) ?? [];
          initParams.invalid_tool_calls = invalidToolCalls ?? [];
        } else {
          initParams.tool_calls = initParams.tool_calls ?? [];
          initParams.invalid_tool_calls = initParams.invalid_tool_calls ?? [];
        }
      } catch {
        // Do nothing if parsing fails
        initParams.tool_calls = [] as $InferToolCalls<TStructure>[];
        initParams.invalid_tool_calls = [];
      }
\`\`\`

*— langchain-core/src/messages/ai.ts:81-112（commit 7704471）*

触发条件读三遍：只有「additional_kwargs 里有旧形态、顶层没有新形态」才走解析——如果调用方已经给了顶层 tool_calls，旧数据只是遗留痕迹，不做覆盖。警告文案直接点名升级 provider 包，说明这条路径服务的对象是「还没适配新字段的老 provider 适配器」。解析器本体：

\`\`\`ts
export function defaultToolCallParser(
  rawToolCalls: Record<string, any>[]
): [ToolCall[], InvalidToolCall[]] {
  const toolCalls: ToolCall[] = [];
  const invalidToolCalls: InvalidToolCall[] = [];
  for (const toolCall of rawToolCalls) {
    if (!toolCall.function) {
      continue;
    } else {
      const functionName = toolCall.function.name;
      try {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        toolCalls.push({
          name: functionName || "",
          args: functionArgs || {},
          id: toolCall.id,
        });
      } catch {
        invalidToolCalls.push({
          name: functionName,
          args: toolCall.function.arguments,
          id: toolCall.id,
          error: "Malformed args.",
        });
      }
    }
  }
  return [toolCalls, invalidToolCalls];
}
\`\`\`

*— langchain-core/src/messages/tool.ts:338-367（commit 7704471）*

**invalid 桶是健壮性设计的教科书**：模型幻觉出 \`{"a": 1,,}\` 这样的非法 JSON 是常态而非异常，逐项 try/catch 把失败降级为带 error 标记的数据，消息构造永不因模型输出崩掉。外层再包一层 try/catch 兜底（解析器本身抛错时清空两个桶），防御纵深两层。代价也要看清：invalid 桶里的 args 仍是原始字符串，error 恒为 "Malformed args."——没有更细的错误分类，消费者只能知道「坏了」，不知道「怎么坏的」。

### 构造第二段：v1 改写与双向互补

\`\`\`ts
      if (
        initParams.response_metadata !== undefined &&
        "output_version" in initParams.response_metadata &&
        initParams.response_metadata.output_version === "v1" &&
        initParams.content !== undefined
      ) {
        initParams.contentBlocks = coerceToContentBlocks(initParams.content);
        initParams.content = undefined;
      }

      if (initParams.contentBlocks !== undefined) {
        if (!Array.isArray(initParams.contentBlocks)) {
          initParams.contentBlocks = coerceToContentBlocks(
            initParams.contentBlocks
          );
        }
        if (initParams.tool_calls) {
          const missingContentBlockToolCalls = initParams.tool_calls.filter(
            (toolCall) =>
              !initParams.contentBlocks?.some(
                (block) =>
                  block.type === "tool_call" &&
                  block.id === toolCall.id &&
                  block.name === toolCall.name
              )
          );
          initParams.contentBlocks.push(
            ...missingContentBlockToolCalls.map((toolCall) => ({
              type: "tool_call" as const,
              id: toolCall.id,
              name: toolCall.name,
              args: toolCall.args,
            }))
          );
        }
        const missingToolCalls = initParams.contentBlocks
          .filter<ContentBlock.Tools.ToolCall>(
            (block): block is ContentBlock.Tools.ToolCall =>
              block.type === "tool_call"
          )
          .filter(
            (block) =>
              !initParams.tool_calls?.some(
                (toolCall) =>
                  toolCall.id === block.id && toolCall.name === block.name
              )
          );
        if (missingToolCalls.length > 0) {
          initParams.tool_calls = [
            ...(initParams.tool_calls ?? []),
            ...missingToolCalls.map((block) => ({
              type: "tool_call" as const,
              id: block.id!,
              name: block.name,
              args: block.args as Record<string, unknown>,
            })),
          ] as $InferToolCalls<TStructure>[];
        }
      }
\`\`\`

*— langchain-core/src/messages/ai.ts:117-178（commit 7704471）*

这段有两个层次。**v1 改写**：output_version 为 "v1" 而 content 还是旧形态（常是 LangGraph 序列化负载回放）时，content 被 coerce 成块数组挪进 contentBlocks，原 content 清空——v1 世界的规范存法自此成立，与 L10 构造函数里 contentBlocks 入口自动盖 v1 标记互为镜像。**双向互补**：tool_calls 与 tool_call 块以 (id, name) 为键互相补齐。匹配键是 id+name 双条件——只比 id 会把「同 id 不同名」的边缘数据错误合并。互补让两种消费姿势都成立：走块的 v1 消费者与走字段的 v0 消费者看到同一份工具调用清单。代价是构造函数多了一次 O(n×m) 扫描，但 n、m 都是工具调用数（个位数量级），可忽略。

### 三种工具调用形态的结构对照

构造函数处理的三种形态——ToolCall、ToolCallChunk、InvalidToolCall——值得并排放一张结构表，字段级别的差异正是流式管线的设计线索：

| 字段 | ToolCall（tool.ts:228-246） | ToolCallChunk（tool.ts:293-311） | InvalidToolCall |
|---|---|---|---|
| type | \`"tool_call"\` 可选 | \`"tool_call_chunk"\` | \`"invalid_tool_call"\` |
| id | 可选完整标识 | **子串**（substring of an identifier） | 保留原始 id |
| name | 必填 | **可选子串** | 保留原始 name |
| args | 对象（已 JSON.parse） | **JSON 子串** | 原始字符串 |
| index | 无 | 有（序列中的位置） | 无 |
| error | 无 | 无 | \`"Malformed args."\` 等标记 |

注释里的措辞是关键证据：ToolCallChunk 的 id/name 都注明「If provided, a **substring** of...」——**chunk 层的一切都是片段**，包括标识符本身；并行工具调用流的 delta 可能连 id 都是分几段到达的，这也是 L15 匹配器要 index 优先的原因（id 可能残缺）。args 从「JSON 子串」到「对象」的跨越由 collapseToolCallChunks 完成，从「原始字符串」到「error 标记」的跨越由 defaultToolCallParser 完成——**两种跨越共享同一个方向：把不确定的流式/原始数据推向确定的语义数据，推不过去的进 invalid 桶而不是抛异常**。这张表还解释了一个 L22 的伏笔：tool() 工厂执行时读的是 ToolCall（args 已是对象），所以 agent 循环拿到 AIMessage 后可以直接 \`toolCall.args.highAccuracy\` 取值——所有 JSON 解析成本都在消息构造层一次性付清，工具层零解析。消费侧的纪律也就此明确：拿到 AIMessage 先分流 tool_calls 与 invalid_tool_calls，只对前者执行工具——这也是 L12 quiz 第三题「不检查 invalid 桶直接执行工具」这个误用的机制根源。三种形态的名字前缀同样有讲究：\`server_tool_call\` 与 \`server_tool_call_chunk\` 是 L14 多模态/工具族里 provider 服务端执行工具的对应物，判型时用 type 字面量而不是类构造器，因为整个工具调用家族从头到尾都是纯接口数据、没有类层次。

### contentBlocks 覆写：三条翻译路径

\`\`\`ts
  get contentBlocks(): Array<ContentBlock.Standard> {
    if (
      this.response_metadata &&
      "output_version" in this.response_metadata &&
      this.response_metadata.output_version === "v1"
    ) {
      return this.content as Array<ContentBlock.Standard>;
    }

    if (
      this.response_metadata &&
      "model_provider" in this.response_metadata &&
      typeof this.response_metadata.model_provider === "string"
    ) {
      const translator = getTranslator(this.response_metadata.model_provider);
      if (translator) {
        return translator.translateContent(this as AIMessage);
      }
    }

    const blocks = super.contentBlocks;

    if (this.tool_calls) {
      const missingToolCalls = this.tool_calls.filter(
        (block) =>
          !blocks.some((b) => b.id === block.id && b.name === block.name)
      );
      blocks.push(
        ...(missingToolCalls.map((block) => ({
          type: "tool_call" as const,
          id: block.id,
          name: block.name,
          args: block.args,
        })) as ContentBlock.Tools.ToolCall[])
      );
    }

    return blocks;
  }
\`\`\`

*— langchain-core/src/messages/ai.ts:195-233（commit 7704471）*

三条路径按优先级排列。**路径一：v1 快捷返回**——已按 v1 存的内容无需翻译，直接把 content 投出去（注意返回的是 this.content，此时 content 存的本来就是块数组）。**路径二：按 provider 查表翻译**——response_metadata.model_provider 是 provider 适配器写入的元数据，getTranslator 按名字找注册过的翻译器做惰性翻译；找不到注册表项则落到路径三。**路径三：基类管线补刀**——走 L10 的三步通用翻译，再把顶层 tool_calls 里缺失的项补成 tool_call 块。设计要点：**翻译决策数据在消息自身（response_metadata），而非调用方**——消息知道自己是哪家 provider 的输出，访问器据此自适应，消费方零配置。

### 本课小结

- 构造函数四阶段：三态归一 → 旧格式警告+解析 → v1 块改写 → tool_calls 与 tool_call 块以 (id, name) 双向互补。
- invalid 桶是容错哲学的落点：逐项 try/catch 把非法 JSON 降级为数据，外层再兜一层，消息构造永不崩。
- contentBlocks 覆写版三路分派：v1 直返 → model_provider 查表惰性翻译 → 基类管线 + 块补齐。
- tool_calls 顶层字段是规范位，additional_kwargs.tool_calls 已废弃且触发升级警告。
- 下一课：与 AIMessage 成对出现的 ToolMessage——tool_call_id 如何把一次工具调用闭环，artifact 双通道与 status 错误即数据的协议。
`,
    null,
    [
      {
        text: '构造 AIMessage 时只传了 additional_kwargs.tool_calls（OpenAI 原始形态）而没传顶层 tool_calls，会发生什么？',
        options: [
          'additional_kwargs.tool_calls 被原样保留，不做处理',
          '先打印升级警告，再用 defaultToolCallParser 解析：JSON.parse 成功的进 tool_calls，失败的进 invalid_tool_calls',
          '抛出异常，要求调用方先自行解析',
          '整条消息被标记为 invalid',
        ],
        answer: 1,
        explain:
          'ai.ts:88-107：rawToolCalls 非空且顶层 tool_calls 为空时先 console.warn 提示升级 provider 包，再调 defaultToolCallParser 返回 [tool_calls, invalid_tool_calls] 二元组。A 错，解析一定会发生；C 错，容错正是设计目标；D 错，invalid 只作用于单个解析失败的调用项，不影响消息本体。',
        concept: 'lc-ai-message',
      },
      {
        text: 'defaultToolCallParser 对某个 raw call 的 arguments 做了什么？',
        options: [
          '直接 JSON.parse 并把失败视为致命错误向上抛',
          '逐项 JSON.parse(function.arguments)，失败项以 { name, args: 原始字符串, id, error: "Malformed args." } 进 invalidToolCalls 数组',
          '用 zod schema 校验参数结构',
          '把参数字符串原样透传，留到工具执行时再解析',
        ],
        answer: 1,
        explain:
          'tool.ts:344-364：try JSON.parse 成功则 push 进 toolCalls（args 是对象），catch 则 push 进 invalidToolCalls 并标 error: "Malformed args."。A 错，try/catch 吞掉了异常；C 错，解析器只管 JSON 合法性，参数 schema 校验是工具层（L21）的事；D 错，args 进桶时仍是字符串但已归入 invalid 桶，不会等执行时才暴露。',
        concept: 'lc-ai-message',
      },
      {
        text: 'response_metadata.output_version === "v1" 且 content 有值时，构造函数做什么？',
        options: [
          'content 保持原样，contentBlocks 被忽略',
          '把 content coerce 成块数组赋给 contentBlocks，content 置为 undefined',
          '把 content 与 contentBlocks 拼接在一起',
          '删除 response_metadata 中的 output_version 标记',
        ],
        answer: 1,
        explain:
          'ai.ts:117-125：v1 标记存在时，coerceToContentBlocks(content) 赋给 contentBlocks，content 清为 undefined——v1 世界的规范存法是 contentBlocks。注释还点明动机：LangGraph 序列化负载常在 output_version 为 v1 时仍带字符串 content，需要归一。A/C 与改写方向相反；D 错，标记正是触发条件，不会被删。',
        concept: 'lc-ai-message',
      },
      {
        text: '构造时同时传入顶层 tool_calls 与 contentBlocks，但某个 tool_call 没有对应的 tool_call 块，会怎样？',
        options: [
          '以块为准，该 tool_call 被丢弃',
          '缺失的 tool_calls 被补成 { type: "tool_call", id, name, args } 块追加进 contentBlocks；反过来块里有而 tool_calls 没有的也会被补回 tool_calls',
          '抛错，二者必须严格一致',
          '追加一条独立的 additional_kwargs 记录',
        ],
        answer: 1,
        explain:
          'ai.ts:133-177 是双向互补：先把 tool_calls 里 contentBlocks 没有的项补成 tool_call 块（:135-153），再把 contentBlocks 里 tool_calls 没有的项补回 tool_calls（:155-177）。A 错，tool_calls 是规范位，块是投影；C 错，自动互补取代了强一致校验；D 错，互补发生在 contentBlocks 数组内。',
        concept: 'lc-ai-message',
      },
    ],
    [
      [
        'invalid_tool_calls',
        'JSON.parse 失败的原始 tool call 的保底桶，元素带 error: "Malformed args."，args 保留原始字符串',
      ],
      [
        'defaultToolCallParser',
        'tool.ts:338-367 的旧格式解析器：把 OpenAI 形态 { id, function: { name, arguments } } 转成 ToolCall[] + InvalidToolCall[]',
      ],
      [
        'tool_call 块',
        'v1 内容模型中的 { type: "tool_call", id, name, args } 块，与顶层 tool_calls 字段互为投影',
      ],
    ],
    [
      '以为模型幻觉出非法 JSON 参数会让 agent 崩溃——构造层已把失败解析收进 invalid_tool_calls，崩溃点只会出现在你自己不检查 invalid 桶直接执行工具时',
      '给 AIMessage 传 contentBlocks 后又手动改 content，期望两者自动同步——互补只在构造时做一次，构造后的手动修改不触发',
      '用 additional_kwargs.tool_calls 写新代码——该位置已废弃且会触发升级警告，规范位置是顶层 tool_calls',
    ],
  ),
  'framework',
)
