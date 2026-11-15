import { L, withKind } from '../../course-builders.ts'

export const L26 = withKind(
  L(
    'L26',
    7,
    'FewShot 与 OutputParser 双层体系：exampleSelector、parse/parseResult 分层',
    2,
    ['L25'],
    ['lc-fewshot-parser'],
    [
      '说出 FewShotPromptTemplate 的二选一约束（examples 或 exampleSelector）与 lc_serializable=false 的原因',
      '解释解析器双层体系：BaseLLMOutputParser.parseResult（面向 generations）与 BaseOutputParser.parse（面向文本）的默认委托关系',
      '走读 StructuredOutputParser.parse 的容错链：markdown 围栏提取、字符串内换行转义修复、interopParseAsync 校验、OutputParserException 兜底',
    ],
    `模块二收官课。前两课解决了「提示怎么生成」，这一课补上另一半闭环：**往提示里塞示例（few-shot），从输出里取结构（parsing）**。这两个子系统在同一课出现不是拼凑——它们是「让模型学会格式」的一体两面：FewShot 把格式示范进上下文，OutputParser 在出口处验收格式，两者共享同一份格式约定。本课证据来自 \`prompts/few_shot.ts\`、\`output_parsers/base.ts\` 与 \`output_parsers/structured.ts\`（commit 7704471）。

### FewShot：静态样本与动态选择器

\`\`\`ts
export class FewShotPromptTemplate
  extends BaseStringPromptTemplate
  implements FewShotPromptTemplateInput
{
  lc_serializable = false;

  examples?: InputValues[];
  exampleSelector?: BaseExampleSelector | undefined;
  examplePrompt: PromptTemplate;
  suffix = "";
  exampleSeparator = "\\n\\n";
  prefix = "";

  constructor(input: FewShotPromptTemplateInput) {
    super(input);
    Object.assign(this, input);

    if (this.examples !== undefined && this.exampleSelector !== undefined) {
      throw new Error(
        "Only one of 'examples' and 'example_selector' should be provided"
      );
    }
    if (this.examples === undefined && this.exampleSelector === undefined) {
      throw new Error(
        "One of 'examples' and 'example_selector' should be provided"
      );
    }
    // ...
  }

  private async getExamples(inputVariables: InputValues): Promise<InputValues[]> {
    if (this.examples !== undefined) {
      return this.examples;
    }
    if (this.exampleSelector !== undefined) {
      return this.exampleSelector.selectExamples(inputVariables);
    }
    throw new Error("One of 'examples' and 'example_selector' should be provided");
  }

  async format(values: InputValues): Promise<string> {
    const allValues = await this.mergePartialAndUserVariables(values);
    const examples = await this.getExamples(allValues);
    const exampleStrings = await Promise.all(
      examples.map((example) => this.examplePrompt.format(example))
    );
    const template = [this.prefix, ...exampleStrings, this.suffix].join(
      this.exampleSeparator
    );
    return renderTemplate(template, this.templateFormat, allValues);
  }
}
\`\`\`

*— langchain-core/src/prompts/few_shot.ts:106-216 裁剪（commit 7704471）*

结构是经典的「前缀 + 示例 + 后缀」三明治：每个示例用 \`examplePrompt\`（一张 L24 的 PromptTemplate）独立格式化，\`Promise.all\` 并行，join 后整体再渲染一遍 suffix 里的变量。**二选一约束**是本类的第一课：静态 \`examples\` 适合小而固定的示范集；\`exampleSelector.selectExamples(inputValues)\` 则把选择权交给运行时——典型实现是按输入相似度从样本库里挑最相关的 k 条（检索式 few-shot），selector 因此天然携带运行时状态。这也直接解释了 \`lc_serializable = false\` 与 \`serialize()\` 里的两个 throw：**示例选择器含运行时状态不可序列化，而类选择整体关闭序列化而不是给「静态样本可序列化、动态 selector 不可」的半吊子边界**——宁紧勿松的序列化策略与 L25 的 \`lc_serializable = true\` 形成对照。

### 解析器双层体系：parseResult 与 parse

解析器的类层次是本课第二个重点：

\`\`\`ts
export abstract class BaseLLMOutputParser<T = unknown> extends Runnable<
  string | BaseMessage,
  T
> {
  abstract parseResult(
    generations: Generation[] | ChatGeneration[],
    callbacks?: Callbacks
  ): Promise<T>;

  async invoke(input: string | BaseMessage, options?: RunnableConfig): Promise<T> {
    if (typeof input === "string") {
      return this._callWithConfig(
        async (input, options) =>
          this.parseResult([{ text: input }], options?.callbacks),
        input,
        { ...options, runType: "parser" }
      );
    } else {
      return this._callWithConfig(
        async (input, options) =>
          this.parseResult(
            [{ message: input, text: this._baseMessageToString(input) }],
            options?.callbacks
          ),
        input,
        { ...options, runType: "parser" }
      );
    }
  }
}

export abstract class BaseOutputParser<T = unknown> extends BaseLLMOutputParser<T> {
  parseResult(generations: Generation[] | ChatGeneration[], callbacks?: Callbacks): Promise<T> {
    return this.parse(generations[0].text, callbacks);
  }

  abstract parse(text: string, callbacks?: Callbacks): Promise<T>;

  abstract getFormatInstructions(options?: FormatInstructionsOptions): string;
}
\`\`\`

*— langchain-core/src/output_parsers/base.ts:19-142 裁剪（commit 7704471）*

三层结构各有一个职责。**最外层**：BaseLLMOutputParser 也是 Runnable——输入类型 \`string | BaseMessage\` 与模型输出端严丝合缝，所以 parser 能直接 pipe 在模型后；invoke 把两种输入**统一包装成 generations 数组**再交给 parseResult，\`runType: "parser"\` 让它成为回调树的第四类一等节点（接上 L25 的 prompt/model/tool）。**中间层**：BaseOutputParser 面向纯文本，\`parseResult\` 默认取 \`generations[0].text\` 委托给 abstract parse——继承它只需实现「文本进、对象出」。**顶层组合**：想按 message 结构解析的子类（如 StructuredOutputParser）覆写 parseResult 而不动 parse。这套分层与 LangChain 的输出结构对齐：模型跑完给的是 generations，文本解析只关心其中的 text。

### OutputParserException 与错误喂回的遗存

\`\`\`ts
export class OutputParserException extends Error {
  llmOutput?: string;
  observation?: string;
  sendToLLM: boolean;

  constructor(
    message: string,
    llmOutput?: string,
    observation?: string,
    sendToLLM = false
  ) {
    super(message);
    this.llmOutput = llmOutput;
    this.observation = observation;
    this.sendToLLM = sendToLLM;

    if (sendToLLM) {
      if (observation === undefined || llmOutput === undefined) {
        throw new Error(
          "Arguments 'observation' & 'llmOutput' are required if 'sendToLlm' is true"
        );
      }
    }

    addLangChainErrorFields(this, "OUTPUT_PARSING_FAILURE");
  }
}
\`\`\`

*— langchain-core/src/output_parsers/base.ts:170-198（commit 7704471）*

三个字段记录了一种**老的容错哲学**：解析失败时不必终止流程，\`observation\`（给模型看的错误说明）与 \`llmOutput\`（出错的原文）可以被打包回喂，让模型看到「你上次的输出格式不对」并重试——这就是 \`sendToLLM\` 的语义，构造函数还守护了它的前提（两份材料缺一不可）。这套机制在 0.x 的 AgentExecutor 时代是标配，1.x 里它作为遗存保留：createAgent 世界的格式容错走的是工具调用协议（L19 的提取器拿不到 args 就抛错回循环），但 OutputParserException 与它的错误码 \`OUTPUT_PARSING_FAILURE\` 仍是文本解析路线的标准失败形态，L117 的迁移课会再遇到它。

### StructuredOutputParser 的容错解析链

最后看最常用的实现 \`StructuredOutputParser<T>\`（\`fromZodSchema\` 静态工厂构造，泛型 \`T extends InteropZodType\` 决定 parse 的返回类型）。它的 \`getFormatInstructions\` 把 \`toJsonSchema(this.schema)\` 序列化后嵌进一段 markdown 指令（明确要求 "no trailing commas"、附上 JSON Schema 全文）——提示端与解析端共用同一张 schema，格式约定单一来源。\`parseResult\` 先过一道 \`throwIfRefused(generations[0])\`（模型安全拒答时抛 ModelRefusalError 而不是当解析失败处理），再委托父类走文本链。真正的解析在 parse：

\`\`\`ts
async parse(text: string): Promise<InferInteropZodOutput<T>> {
  try {
    const trimmedText = text.trim();

    const json =
      trimmedText.match(/^\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/)?.[1] ||
      trimmedText.match(/\`\`\`json\\s*([\\s\\S]*?)\`\`\`/)?.[1] ||
      trimmedText;

    const escapedJson = json
      .replace(/"([^"\\\\]*(\\\\.[^"\\\\]*)*)"/g, (_match, capturedGroup) => {
        const escapedInsideQuotes = capturedGroup.replace(/\\n/g, "\\\\n");
        return \`"\${escapedInsideQuotes}"\`;
      })
      .replace(/\\n/g, "");

    return await interopParseAsync(this.schema, JSON.parse(escapedJson));
  } catch (e) {
    throw new OutputParserException(
      \`Failed to parse. Text: "\${text}". Error: \${e}\`,
      text
    );
  }
}
\`\`\`

*— langchain-core/src/output_parsers/structured.ts:121-147（commit 7704471）*

四步容错链值得背下来：**提取**——串首围栏正则优先（\`^\`\`\`(?:json)?\`），任意位置的 \`\`\`json 围栏兜底，都没有就用原文（模型可能忘了围栏）；**转义修复**——那个正则逐个捕获 JSON 字符串字面量，把内部的裸换行换成 \`\\n\`，随后再删掉字符串外的裸换行——这是对「模型在字符串值里输出真实换行」这一高频病理的定点手术；**校验**——\`interopParseAsync(schema, JSON.parse(...))\`，Zod v3/v4 互操作层同一套代码走通（与 L21 工具校验同款基础设施）；**兜底**——任何一步失败都包成 OutputParserException 且第二个参数带上原始 text（供上层回喂或记录）。注意它**不修尾逗号**、不做重试——解析器只做确定性的文本手术，概率性的修复（OutputFixingParser 之类）留在 classic 博物馆。

### 拒答不是解析失败：throwIfRefused 的边界

StructuredOutputParser.parseResult 开头的 \`throwIfRefused\` 是一道独立的闸门，实现只有二十来行：

\`\`\`ts
export function throwIfRefused(
  generation: Generation | ChatGeneration | undefined
): void {
  if (!generation || !("message" in generation)) return;
  const { message } = generation;
  if (!isBaseMessage(message)) return;
  let blocks;
  try {
    blocks = message.contentBlocks;
  } catch {
    return;
  }
  for (const block of blocks) {
    if (block.type === "refusal") {
      throw ModelRefusalError.fromRefusal(
        block as ContentBlock.Refusal,
        message
      );
    }
  }
}
\`\`\`

*— langchain-core/src/output_parsers/refusal.ts:9-30 裁剪（commit 7704471）*

三个守卫值得注意：非消息型 generation 直接放行；\`contentBlocks\` 取块失败（provider 原始 content 不符合翻译管线预期时）**静默放行而不是把翻译错误误判为拒答**；只有扫到 \`type === "refusal"\` 的块才抛 \`ModelRefusalError.fromRefusal\`（errors/index.ts:263,289）。这道闸门把「模型安全拒答」从「输出格式坏了」的失败语义里分离出来——前者是 refusal 块「拒答是数据」约定（L14 的 NonStandard 逃生舱同族）在解析端的消费点，后者才是 OutputParserException 的领地。上游据此可以对两种失败采取不同策略：拒答走改写提示或换模型，解析失败走回喂重试。最后一句辨析：**refusal 检查只认内容块，不做文本启发式**——模型用自然语言说「我不能回答」但没有产出 refusal 块时，这里不会拦截，它信任的是 provider 侧的结构化标注而不是字符串匹配。

### 本课小结

- FewShotPromptTemplate 的三明治结构与二选一约束：静态 examples 与动态 exampleSelector 必须恰好一个；selector 携带运行时状态导致 lc_serializable=false 且 serialize 显式抛错。
- 解析器三层：BaseLLMOutputParser（Runnable、统一包装 generations、runType \\"parser\\"）→ BaseOutputParser（parseResult 默认委托 parse(generations[0].text)）→ 具体实现（可覆写 parseResult 走结构化路径）。
- OutputParserException 的 observation/sendToLLM 是老 agent「错误喂回重试」模式的遗存，OUTPUT_PARSING_FAILURE 错误码是它的身份标记。
- StructuredOutputParser 的四步容错链：围栏提取 → 字符串内换行转义 → interopParseAsync 校验 → 异常携带原文兜底；提示与解析共用同一张 Zod schema。
- 模块二（core 数据原语）到此完结；下一课进入模块三，从 Runnable 四大支柱开始拆解 LCEL 组合内核。
`,
    null,
    [
      {
        text: 'new FewShotPromptTemplate({ examples: [...], exampleSelector: sel, ... }) 会发生什么？',
        options: [
          'examples 优先，selector 被忽略',
          "构造函数抛错：Only one of 'examples' and 'example_selector' should be provided",
          '两者拼接使用',
          '运行到 format 时才报错',
        ],
        answer: 1,
        explain:
          '构造函数连续两个校验：两者都传抛 Only one of...，两者都不传抛 One of... should be provided——必须恰好选一个。静态 examples 走直读，exampleSelector 走 selectExamples(inputVariables) 动态检索（如按相似度挑样本）。错误在构造期暴露，不是 format 期。',
        concept: 'lc-fewshot-parser',
      },
      {
        text: 'FewShotPromptTemplate 为什么声明 lc_serializable = false？',
        options: [
          '体积太大不宜序列化',
          'exampleSelector 携带运行时状态（如向量库连接），serialize() 里明确对 selector 抛错「not currently supported」',
          '历史遗留 bug',
          '所有 PromptTemplate 都不可序列化',
        ],
        answer: 1,
        explain:
          'few_shot.ts 里 lc_serializable = false 是类级声明；serialize() 方法里两个 throw：有 exampleSelector 或缺 examples 时抛 Serializing an example selector is not currently supported，绑定了 outputParser 也抛错。对比 BasePromptTemplate 的 lc_serializable = true（L25），静态 examples 的 few-shot 理论上可序列化，但类选择了整体关掉——序列化边界宁紧勿松。',
        concept: 'lc-fewshot-parser',
      },
      {
        text: 'BaseOutputParser.parseResult(generations) 的默认实现是？',
        options: [
          '返回 generations 原样',
          'parse(generations[0].text)——取第一代结果的 text 走文本解析',
          '解析 generations[0].message 的完整内容',
          '抛错，必须由子类实现',
        ],
        answer: 1,
        explain:
          'BaseOutputParser 的 parseResult 实现 return this.parse(generations[0].text, callbacks)。分层很清晰：上层 BaseLLMOutputParser 只定义 abstract parseResult（面向 LLMResult 的 generations 结构）；BaseOutputParser 面向纯文本，默认从 generations 里取第一项的 text 委托给 abstract parse。所以继承 BaseOutputParser 只需实现 parse；想要按 message 结构解析（如 StructuredOutputParser 的 refusal 检查）就覆写 parseResult。',
        concept: 'lc-fewshot-parser',
      },
      {
        text: 'StructuredOutputParser.parse 对 "```json\\n{\\"a\\": 1}\\n```" 这类输入的处理链是？',
        options: [
          '直接 JSON.parse 整串',
          '先正则提取围栏内 JSON（两个正则：串首围栏优先、任意位置 ```json 围栏兜底），再修复字符串内裸换行，最后 interopParseAsync 校验',
          '要求调用方先剥离围栏',
          '只支持纯 JSON 文本，遇围栏抛错',
        ],
        answer: 1,
        explain:
          'parse 的实现链：trim → 两个正则依次匹配围栏（/^```(?:json)?.../ 串首优先，/```json.../ 任意位置兜底）→ 没有围栏就用原文 → 用正则把字符串字面量内部的裸换行替换成 \\n（JSON 规范不允许字符串内裸换行）→ interopParseAsync(schema, JSON.parse(escapedJson))。任一步失败都包装成 OutputParserException 并携带原始文本。',
        concept: 'lc-fewshot-parser',
      },
      {
        text: 'OutputParserException 构造时传 sendToLLM: true 的前提是？',
        options: [
          '无前提，随意传',
          'observation 与 llmOutput 必须同时提供，否则构造函数自己抛错',
          '必须配合 OutputFixingParser 使用',
          'sendToLLM 已被移除，传入会被忽略',
        ],
        answer: 1,
        explain:
          '构造函数里 if (sendToLLM) { if (observation === undefined || llmOutput === undefined) throw }——「把错误喂回模型」需要两份材料：llmOutput（出错的原始输出）与 observation（给模型看的错误说明），缺一不可。这个设计是老 agent 模式的遗存：解析失败不终止，而是把 observation 作为工具消息回喂让模型重试。异常还会经 addLangChainErrorFields 打上 OUTPUT_PARSING_FAILURE 错误码。',
        concept: 'lc-fewshot-parser',
      },
    ],
    [
      [
        'FewShotPromptTemplate',
        'few-shot 提示模板：prefix + 示例串 + suffix 结构，示例可静态给定或经 exampleSelector 动态检索',
      ],
      [
        'BaseExampleSelector',
        '示例选择器抽象：selectExamples(inputVariables) 返回本次要用的样本，实现如 SemanticSimilarityExampleSelector',
      ],
      [
        'BaseLLMOutputParser',
        '解析器上层抽象：abstract parseResult(generations)，invoke 接受 string 或 BaseMessage 并以 runType "parser" 进入回调树',
      ],
      [
        'OutputParserException',
        '解析失败专用异常：携带 llmOutput/observation/sendToLLM 三字段，错误码 OUTPUT_PARSING_FAILURE',
      ],
    ],
    [
      'parser 的 invoke 接受 BaseMessage 时，非 string content 会经 _baseMessageContentToString 变成 JSON.stringify 的字符串——多模态消息直接进文本解析器多半不是你想要的形状',
      'StructuredOutputParser 的围栏修复只处理字符串内的换行，不修复尾逗号或其他语法错误——提示词里特别强调 no trailing commas 不是客套话',
      'parseResult 与 parse 的覆写层级容易搞混：继承 BaseOutputParser 实现 parse 即可；覆写 parseResult（如加 refusal 检查）时记得仍然调用 super.parseResult 走文本链',
    ],
  ),
  'framework',
)
