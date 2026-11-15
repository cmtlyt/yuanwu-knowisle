import { L, withKind } from '../../course-builders.ts'

export const L14 = withKind(
  L(
    'L14',
    4,
    'ContentBlock v1 类型集：text/reasoning/refusal/tool_call/多模态与 NonStandard 逃生舱',
    2,
    ['L10'],
    ['lc-content-blocks'],
    [
      '列出 KNOWN_BLOCK_TYPES 的完整清单并按五族归类：文本、推理、拒答、工具、多模态',
      '解释 Text 块的 index 字段为什么存在（流式聚合的还原键）以及 annotations 的构成',
      '说明 NonStandard 逃生舱的设计意图与 Refusal 块「拒答是数据不是异常」的语义',
    ],
    `### v1 内容模型的统一话语

L10 与 L12 两次预告了 v1 内容模型：contentBlocks 视图、output_version 标记、tool_call 块互补。本课进入这个模型的核心——ContentBlock 类型集。要回答的问题是：**当 provider 的输出从「一段文本」变成「文本 + 思维链 + 并行工具调用 + 引用 + 图片」的混合物时，框架用什么类型系统收容这一切？** 答案是一个五族清单加一个逃生舱。核心结论：**v1 内容模型把「模型说了什么」拆成可枚举的块类型，每族块带自己的元数据字段，而 NonStandard 保证未知的 provider 方言也能无损通行**。

### KNOWN_BLOCK_TYPES：一张清单看全局

\`\`\`ts
export const KNOWN_BLOCK_TYPES = [
  "text",
  "reasoning",
  "refusal",
  ...KNOWN_TOOL_BLOCK_TYPES,
  ...KNOWN_MULTIMODAL_BLOCK_TYPES,
];
\`\`\`

*— langchain-core/src/messages/content/index.ts:19-25（commit 7704471）*

三个直接列出的基础块 + 两个展开的工具族与多模态族。工具族在 content/tools.ts:5-12：tool_call、tool_call_chunk、invalid_tool_call、server_tool_call、server_tool_call_chunk、server_tool_call_result——注意 server 前缀的三种：**server_tool_call 表示由 provider 服务端执行的工具**（如 Anthropic 的 web_search 这类服务端工具），与客户端执行的 tool_call 分开建模，chunk 变体与 result 变体各自成块。多模态族在 content/multimodal.ts:5-11：image、video、audio、text-plain、file——五个 MIME 思维的类型，BaseDataRecord 以 MIME type 为第一公民。数一数：3 + 6 + 5 = 14 种已知块。这张清单的编译期性质很重要：它进联合类型（Standard）、进类型守卫，**块类型是封闭集，扩展靠逃生舱而不是开放注册**。

### 三个语义块的细节

\`\`\`ts
  export interface Text extends ContentBlock {
    readonly type: "text";
    text: string;
    /**
     * Index of block in aggregate response. Used during streaming.
     */
    index?: string | number;
    /**
     * Citations and other annotations.
     */
    annotations?: Array<Citation | BaseContentBlock>;
  }

  export interface Reasoning extends ContentBlock {
    readonly type: "reasoning";
    /**
     * Reasoning text.
     *
     * Either the thought summary or the raw reasoning text itself.
     * This is often parsed from \`<think>\` tags in the model's response.
     */
    reasoning: string;
    index?: string | number;
  }
\`\`\`

*— langchain-core/src/messages/content/index.ts:75-113（commit 7704471）*

Text 块两个附加字段各有一个故事。**index 是流式还原键**：聚合响应里每个块占一个位置，流式 delta 靠 index 找到自己的家——L15 的 _findMergeTarget 就是这个字段的消费者。**annotations 是引用的宿主**：元素可以是 Citation（type: "citation"，带 source/url/title/startIndex/endIndex/citedText，:32-67）或其他内容块——注释型数据挂在被注释的文本块上，而不是平行铺开。Reasoning 块的注释点明来源：思维摘要或原始推理文本，「常从 <think> 标签解析」——这句话暴露了 v1 模型的务实：DeepSeek 等模型的思维链是文本流里的标签约定，框架解析后升格为独立块，reasoning 从「文本的一部分」变成「一等内容」。Refusal 块（:123-136）上一题已辨析：refusal 字符串可为空（provider 没给文案），extras 收 Anthropic 的 category 这类附加数据。

### NonStandard 逃生舱与 Standard 联合

\`\`\`ts
  export interface NonStandard<
    TValue extends Record<string, any> = Record<string, any>,
  > extends ContentBlock {
    type: "non_standard";
    value: TValue;
  }

  export { Tools };
  export { Multimodal };
  export { Data };

  export type Standard =
    | Text
    | Reasoning
    | Refusal
    | NonStandard
    | Tools.Standard
    | Multimodal.Standard;
}
\`\`\`

*— langchain-core/src/messages/content/index.ts:145-169（commit 7704471）*

NonStandard 只有两个字段：类型标记 + value 载荷。接口注释写了它的边界与责任划分：**收容不进标准模型的 provider 专属块；如果这些数据里有推理或工具调用，翻译成标准块是适配器（adapter）的职责**。这句话定义了逃生舱的哲学——它不是「永不翻译的垃圾场」，而是「翻译前的暂存区」：宁可标记为 non_standard 保留原始信息，也不猜测形状强行归一。Standard 联合类型是消费侧的总入口：六种成分里 Tools.Standard 与 Multimodal.Standard 又是各自子族的联合（工具族标准块、多模态标准块），Data 单独导出（数据内容块，经 convertToV1FromDataContent 翻译进 v1，见 L10 的管线第一步）。消费代码的标准姿势是 switch (block.type) 全覆盖 + default 分支处理 non_standard。

### index 与流式：把 v1 块和 L15 连起来

本课最后把一个横跨三课的线索收拢。块的 index 字段、chunk 的 tool_call_chunks、L15 的 _mergeLists，是同一条流式数据链的三个环节：provider 发 delta（带 index）→ chunk 层用 _findMergeTarget 按 index（缺则按 id）归并 → 聚合完成的 AIMessage.contentBlocks 里每个块带着最终形态。**v1 内容模型之所以给每个块都预留 index，正是因为流式是常态而非例外**——模型输出早已不是「一问一答一段字」，而是多块并行推进的事件流。这张图记住后，L15 讲合并规则表时你会知道每个规则服务的终点。

### 与 v0 对照：同一份模型输出的两种存法

本课的类型集是 v1 世界的话语，值得用一次对照把 v0 的形态钉清楚。同一个「带思维链的拒答响应」在两轨下的落点完全不同：v0 里 reasoning 藏在 additional_kwargs（如 Anthropic 的 thinking 字段、DeepSeek 的 reasoning_content）、拒答就是一段普通文本 content、工具调用在 additional_kwargs.tool_calls（已废弃位置）、多模态是 provider 各自的 content part 数组——**一切都是方言**，跨 provider 消费代码要为每家写一遍提取逻辑。v1 里这四样分别升格为 Reasoning 块、Refusal 块、tool_call 块与 Multimodal 块，消费代码 switch 一次全覆盖。切换开关是 response_metadata.output_version（v0 默认，v1 需显式），翻译执行者是 L10 的三步管线加 L12 的 model_provider 查表。这个对照也解释了 NonStandard 的必要性：**v1 的野心不是消灭方言（方言永远会存在），而是给方言一个统一的「暂存 + 翻译」通道**——新 provider 接入时先原样收进 non_standard 块保底可通行，再由适配器逐步产出标准块，生态演进不必等类型集扩容。

### 本课小结

- KNOWN_BLOCK_TYPES = 3 基础块 + 6 工具块 + 5 多模态块，编译期封闭集，扩展走 NonStandard。
- Text 块的 index 是流式聚合还原键，annotations 挂 Citation 引用；Reasoning 常从 <think> 标签解析升格。
- Refusal 的语义：「拒答是数据不是异常」，让调用方区分拒答与空答案；文本形式拒答不检测。
- NonStandard 块收容 provider 专属数据，翻译成标准块是适配器的职责——逃生舱是暂存区不是垃圾场。
- 下一课：chunk 合并规则表——index/id 匹配、_mergeDicts 的字段级规则、Anthropic 特判，流式聚合的完整底层 DSL。
`,
    null,
    [
      {
        text: 'KNOWN_BLOCK_TYPES 的构成是？',
        options: [
          '只有 text 与 image 两种',
          'text、reasoning、refusal 三个基础块，加上工具族（tool_call/tool_call_chunk/invalid_tool_call/server_tool_call 等）与多模态族（image/video/audio/text-plain/file）',
          '由各 provider 包运行时动态注册',
          '与 OpenAI 的 content part 类型一一对应',
        ],
        answer: 1,
        explain:
          'content/index.ts:19-25 用展开运算符拼装：三个基础类型 + tools.ts:5-12 的工具族六个 + multimodal.ts:5-11 的多模态族五个。A 显然不完备；C 错，清单是编译期常量，provider 扩展走 NonStandard 逃生舱而不是注册；D 错，这是 LangChain 的统一模型，刻意不等于任何一家的原始形态。',
        concept: 'lc-content-blocks',
      },
      {
        text: 'ContentBlock.Text 上的 index 字段的用途是？',
        options: [
          '数组的下标别名，纯粹为了美观',
          '块在聚合响应中的位置标记，流式场景下用它把增量 delta 归并回正确的块',
          '数据库存储时的主键',
          'provider 返回的 token 位置',
        ],
        answer: 1,
        explain:
          'content/index.ts:85-87 注释「Index of block in aggregate response. Used during streaming.」。流式时 provider 按 index 发 delta，框架的 _findMergeTarget 靠 index 匹配归并（L15 的主角）。A/C/D 都没有源码依据。',
        concept: 'lc-content-blocks',
      },
      {
        text: 'ContentBlock.Refusal 的接口注释强调了一个什么语义区分？',
        options: [
          'refusal 块代表网络错误',
          'provider 把安全拒答作为成功响应返回，refusal 块让调用方能区分「拒答」与「空答案/无法解析」，但模型以普通文本形式写的拒答不会被检测',
          'refusal 只在 Anthropic 上存在',
          'refusal 块出现时必须抛异常终止流程',
        ],
        answer: 1,
        explain:
          'content/index.ts:115-136 注释：Providers report refusals ... as successful responses，该块标记它们以便区分 refusal 与 empty/unparsable answer；且注明 Refusals the model writes as ordinary text are not detected——结构化拒答才进块。B 正是这句注释的复述；A 混淆了网络错误与业务拒答；C 错，块类型是跨 provider 的统一模型；D 错，「拒答是数据不是异常」，处理权在调用方。',
        concept: 'lc-content-blocks',
      },
      {
        text: 'NonStandard 块的设计意图是？',
        options: [
          '存放所有无法 JSON 序列化的数据',
          '兜底 provider 专属的、不在标准内容模型里的块；若其中含推理或工具调用信息，应由适配器解析并产出对应的标准块',
          '替代 Standard 联合类型成为默认块',
          '仅在流式场景使用的临时块',
        ],
        answer: 1,
        explain:
          "content/index.ts:138-157 注释：这是表示「not part of the standard LangChain content model」的块，且 If a provider's non-standard output includes reasoning and tool calls, it should be the adapter's job to parse that payload and emit the corresponding standard blocks——逃生舱收容原始数据，翻译责任在适配器。A 的序列化说法无出处；C 错，Standard 联合仍是正道；D 错，它与流式无关。",
        concept: 'lc-content-blocks',
      },
    ],
    [
      ['KNOWN_BLOCK_TYPES', 'content/index.ts:19-25 的编译期常量数组，v1 内容模型的已知块类型清单'],
      [
        'ContentBlock.Standard',
        'Text | Reasoning | Refusal | NonStandard | Tools.Standard | Multimodal.Standard 的联合类型（:163-169）',
      ],
      ['NonStandard 块', 'type: "non_standard" + value 载荷的兜底块，收容 provider 专属数据'],
      ['annotations', 'Text 块上的可选数组，元素为 Citation 引用块或其他内容块'],
    ],
    [
      '把 provider 原始块形状直接塞进 content 数组而不经翻译——v1 标准块是统一话语，原始形态应留在 v0 轨道或经 NonStandard 收容',
      '以为模型文本里写「我拒绝回答」会产出 refusal 块——只有 provider 以结构化方式上报的拒答才进块，普通文本拒答不检测',
      '流式聚合时丢弃 index 字段——没有 index（且没有 id）的 delta 无法被 _findMergeTarget 归并，会退化成逐条追加',
    ],
  ),
  'theory',
)
