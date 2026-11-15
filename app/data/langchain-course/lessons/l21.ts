import { L, withKind } from '../../course-builders.ts'

export const L21 = withKind(
  L(
    'L21',
    6,
    'StructuredTool 校验双引擎：Zod interop 与 @cfworker/json-schema、ToolInputParsingException',
    3,
    ['L10'],
    ['lc-structured-tool'],
    [
      '说出 StructuredTool 的抽象字段面（name/description/schema）与 returnDirect/responseFormat/extras 的默认值',
      '解释 invoke → call 两级结构中 ToolCall 输入的分叉点：args 被抽出、整个 call 挂载到 enrichedConfig.toolCall',
      '逐行走读校验双引擎的分派：isInteropZodSchema 走 interopParseAsync，否则走 @cfworker/json-schema 的 validate()，失败统一抛 ToolInputParsingException',
    ],
    `工具体系三课的起点。这一课只讲一个类 \`StructuredTool\`，但它是整个工具生态的**执行地基**：L22 的 \`tool()\` 工厂产出的 \`DynamicStructuredTool\` 继承它，L23 的 \`ToolRuntime\` 注入依赖它埋下的 config 链，模块四 ToolNode（L46）与 wrapToolCall（L55）的调用终点也是它。核心命题一句话：**工具输入的防线不靠自觉，靠 invoke→call 两级结构里的双引擎校验**。证据来自 \`tools/index.ts\`（commit 7704471）。

### 类面：抽象字段与默认配置

先看骨架与默认值：

\`\`\`ts
export abstract class StructuredTool<SchemaT, ...>
  extends BaseLangChain<
    StructuredToolCallInput<SchemaT, SchemaInputT>,
    ToolOutputT | ToolMessage
  >
  implements StructuredToolInterface<SchemaT, SchemaInputT, ToolOutputT>
{
  abstract name: string;
  abstract description: string;
  abstract schema: SchemaT;

  returnDirect = false;
  verboseParsingErrors = false;
  responseFormat?: ResponseFormat = "content";

  protected abstract _call(
    arg: SchemaOutputT,
    runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig
  ): Promise<ToolOutputT> | AsyncGenerator<ToolEventT, ToolOutputT>;
}
\`\`\`

*— langchain-core/src/tools/index.ts:95-167 裁剪（commit 7704471）*

三个抽象字段就是工具对模型世界的全部自我介绍。值得留意的默认值有四个：\`returnDirect = false\`（返回值是否直接终结 agent 循环，L22 展开）；\`responseFormat = "content"\`（输出形态）；\`verboseParsingErrors = false\`（校验错误详情开关）；以及 \`_call\` 的返回类型联合——\`Promise\` 或 \`AsyncGenerator\`，后者意味着工具天生可以边执行边产出事件流。类上还有一个 provider 专属扩展点 \`extras?: Record<string, unknown>\`，用于装载标准字段装不下的 provider 配置。

### invoke → call：ToolCall 输入的分叉点

两级结构的第一级负责**形态归一**：

\`\`\`ts
async invoke(input, config?) {
  let toolInput: Exclude<StructuredToolCallInput<...>, ToolCall>;
  let enrichedConfig: ToolRunnableConfig = ensureConfig(
    mergeConfigs(this.defaultConfig, config)
  );
  if (_isToolCall(input)) {
    toolInput = input.args as Exclude<...>;
    enrichedConfig = {
      ...enrichedConfig,
      toolCall: input,
    };
  } else {
    toolInput = input as Exclude<...>;
  }
  return this.call(toolInput, enrichedConfig);
}
\`\`\`

*— langchain-core/src/tools/index.ts:175-209 裁剪（commit 7704471）*

\`invoke\` 只做一件事：识别输入是完整 \`ToolCall\`（模型发来的 \`{id, name, args}\`，L12 的双轨解析产物）还是裸输入。前者抽出 \`args\` 作工具输入、**把整个 call 挂进 config**；后者原样放行。这十几行是整条工具链的暗桩——\`enrichedConfig.toolCall\` 之后会被 \`call()\` 读出 \`toolCallId\`、被 ToolRuntime 读出 \`toolCall\` 字段、被 \`_formatToolOutput\` 用作 ToolMessage 的 \`tool_call_id\`。注意 \`mergeConfigs(this.defaultConfig, config)\`：工具实例可以自带默认 config（如 tags、metadata），与调用方 config 合并后再经 \`ensureConfig\` 补齐隐式传播（L35 的 AsyncLocalStorage 世界在这里交汇）。

### 双引擎校验逐行读

第二级 \`call()\` 的核心是校验分派，这是本课的主菜：

\`\`\`ts
const inputForValidation = _isToolCall(arg) ? arg.args : arg;
let parsed: SchemaOutputT;
if (isInteropZodSchema(this.schema)) {
  try {
    parsed = await interopParseAsync(
      this.schema as InteropZodType,
      inputForValidation as Exclude<TArg, ToolCall>
    );
  } catch (e) {
    let message = \`Received tool input did not match expected schema\`;
    if (this.verboseParsingErrors) {
      message = \`\${message}\\nDetails: \${(e as Error).message}\`;
    }
    if (isInteropZodError(e)) {
      message = \`\${message}\\n\\n\${z4.prettifyError(e as ZodError)}\`;
    }
    throw new ToolInputParsingException(message, JSON.stringify(arg));
  }
} else {
  const result = validate(
    inputForValidation,
    this.schema as ValidationSchema
  );
  if (!result.valid) {
    let message = \`Received tool input did not match expected schema\`;
    if (this.verboseParsingErrors) {
      message = \`\${message}\\nDetails: \${result.errors
        .map((e) => \`\${e.keywordLocation}: \${e.error}\`)
        .join("\\n")}\`;
    }
    throw new ToolInputParsingException(message, JSON.stringify(arg));
  }
  parsed = inputForValidation as SchemaOutputT;
}
\`\`\`

*— langchain-core/src/tools/index.ts:233-272（commit 7704471）*

三个观察点。**其一，引擎分派**：\`isInteropZodSchema\` 是 Zod v3/v4 互操作层的判型——无论工具作者用哪个大版本的 Zod，同一行代码都能走通，这就是 core 依赖表里 zod ^4.6.6 与 interop 工具层协作的落点。**其二，两条路径的错误信息设计不同**：Zod 路径能拿到 \`z4.prettifyError\` 的人性化格式，JSON Schema 路径只有 \`keywordLocation: error\` 的列表；但两者最终都包装成同一个 \`ToolInputParsingException\`，且第二参数统一是**原始输入**的序列化——注意传给异常的是 \`arg\`（可能是完整 ToolCall），不是 \`inputForValidation\`，上层因此能看到「是哪一次调用失败了」。**其三，校验与解析的合并**：Zod 的 \`interopParseAsync\` 一步完成校验+类型转换（默认值、transform 都会生效），JSON Schema 的 \`validate\` 只做断言，\`parsed\` 直接复用输入——所以带 transform 的复杂输入逻辑只有 Zod 路径支持。

### 从校验到输出：AsyncGenerator 与双通道

校验通过后，\`call()\` 继续走回调启动、执行、输出格式化三段。执行段对 AsyncGenerator 的处理前面 quiz 已覆盖；输出段有两个关键点：

\`\`\`ts
let result;
try {
  const raw = await this._call(parsed, runManager, config);
  result = isAsyncGenerator(raw)
    ? await consumeAsyncGenerator(raw, async (chunk) => {
        try {
          await runManager?.handleToolEvent(chunk);
        } catch (streamError) {
          await runManager?.handleToolError(streamError);
        }
      })
    : raw;
} catch (e) {
  await runManager?.handleToolError(e);
  throw e;
}

if (this.responseFormat === "content_and_artifact") {
  if (Array.isArray(result) && result.length === 2) {
    [content, artifact] = result;
  } else {
    throw new Error(
      \`Tool response format is "content_and_artifact" but the output was not a two-tuple.\\nResult: \${JSON.stringify(result)}\`
    );
  }
} else {
  content = result;
}

const formattedOutput = _formatToolOutput<ToolOutputT>({
  content,
  artifact,
  toolCallId,
  name: this.name,
  metadata: this.metadata,
});
\`\`\`

*— langchain-core/src/tools/index.ts:318-357 裁剪（commit 7704471）*

\`consumeAsyncGenerator\` 的错误处理是双层设计：**事件处理失败**（handleToolEvent 抛错）只走 handleToolError、不中断聚合；**工具本体失败**则 handleToolError 后原样 rethrow。最终 \`_formatToolOutput\` 决定输出形态：有 \`toolCallId\` 且内容是字符串或内容块数组时直接包成 \`ToolMessage\`（status: "success"），非字符串内容先 \`_stringify\`（JSON.stringify 失败再降级模板字符串）——工具返回值到 ToolMessage 的最后一公里在这里完成；若内容带 \`lc_direct_tool_output\` 标记（L13 讲过的直接输出协议）则原样穿透。\`call()\` 方法本身标着 \`@deprecated\`（提示用 invoke），但整个校验与格式化逻辑都活在 call 里——invoke 是形态归一门面，call 是执行引擎，两级各司其职。

### 异常对象与输出格式化的两处细节

第一个细节是异常类本身。\`ToolInputParsingException\` 定义在 \`tools/utils.ts\` 而非主文件：

\`\`\`ts
export class ToolInputParsingException extends Error {
  output?: string;

  constructor(message: string, output?: string) {
    super(message);
    this.output = output;
  }
}
\`\`\`

*— langchain-core/src/tools/utils.ts:30-41（commit 7704471）*

第二参数的名字是 \`output\`——类注释写明它存放 *"the output that caused the exception"*，也就是校验失败前的原始输入（可能是完整 ToolCall 的序列化）。捕获方可以从 \`e.output\` 拿到失败现场做回喂或记录，这与 L26 的 OutputParserException 携带 \`llmOutput\` 是同一个约定在工具体系的对应物：**两个体系的异常都遵循「错误带上现场」**，只是消费者不同。

第二个细节是 \`_formatToolOutput\` 的精确分支（tools/index.ts:1045-1085）。有 \`toolCallId\` 且内容带 \`lc_direct_tool_output\` 标记时直接返回原值不包装；内容是**字符串**或**每个元素都形如消息内容块的数组**时，作为 \`content\` 原样进 ToolMessage；其余对象走 \`_stringify\`——先 \`JSON.stringify\`（结果为 undefined 时补空串），抛错再降级模板字符串（index.ts:1079-1085）。注意「内容块数组」的判断是 \`_isMessageContentBlockShaped\` 的逐项检查而不是笼统的 \`Array.isArray\`——这解释了为什么普通对象数组会被序列化成文本，而多模态输出块数组能直接进消息 content。最后一个反直觉事实值得单独记：**字符串工具也走同一条校验管线**。Tool 基类的 schema 固定为 \`z.object({ input: z.string().optional() }).transform((obj) => obj.input)\`（tools/index.ts:384-386），DynamicTool 继承的正是这张带 transform 的 Zod schema——「输入是字符串」不是绕过校验的特权，而是一张把 \`{input}\` 解包成字符串的 transform 门票，双引擎校验对它照样生效。异常类型的意义也在此收束：\`catch (e instanceof ToolInputParsingException)\` 能把「输入不合法」与其他执行错误干净地区分开——schema 校验发生在 \`_call\` 执行**之前**，工具实现体永远不会看到未通过校验的输入，这条次序本身就是防线的价值。

### 本课小结

- StructuredTool 的三抽象字段 + 四默认值（returnDirect/responseFormat/verboseParsingErrors/extras）构成工具执行面的全部配置。
- invoke 做形态归一：ToolCall 输入被拆出 args、整体挂进 enrichedConfig.toolCall——这条 config 链是 toolCallId 与 ToolRuntime 注入的源头。
- 校验双引擎按 schema 判型分派：Zod 走 interopParseAsync（校验+transform 一步到位），JSON Schema 走 @cfworker validate（纯断言）；失败统一抛 ToolInputParsingException 并携带原始输入。
- _call 支持返回 AsyncGenerator 实现工具级流式事件；content_and_artifact 模式对返回二元组是硬校验，不猜测不降级。
- 下一课看 tool() 工厂如何用十几个函数重载把这些类封装成一行的声明式体验。
`,
    null,
    [
      {
        text: 'schema 是普通 JSON Schema 对象（非 Zod）时，call() 的校验走哪条路？',
        options: [
          'interopParseAsync（Zod 路径）',
          '@cfworker/json-schema 的 validate()，校验失败抛 ToolInputParsingException',
          '完全不校验，直接执行 _call',
          'JSON.stringify 后做正则检查',
        ],
        answer: 1,
        explain:
          'call() 里 if (isInteropZodSchema(this.schema)) 为假时进入 else 分支，用 @cfworker/json-schema 的 validate(inputForValidation, this.schema) 做校验，!result.valid 即抛 ToolInputParsingException。注意 DynamicStructuredTool 类注释声称「JSON schema 不会校验」是过时描述，实际实现校验两类 schema——tool() 的文档注释（Both schema types will be validated）才是现行行为。',
        concept: 'lc-structured-tool',
      },
      {
        text: 'ToolInputParsingException 的构造参数里携带了什么？',
        options: [
          '只有错误消息',
          '错误消息 + 原始输入的 JSON.stringify 结果（供上层把失败输入回喂或记录）',
          '错误消息 + 解析后的部分结果',
          '错误消息 + provider 的原始响应',
        ],
        answer: 1,
        explain:
          '两条校验路径抛错时都执行 new ToolInputParsingException(message, JSON.stringify(arg))——第二个参数是**原始输入**（若输入是 ToolCall 则是整个 call 的序列化），不是被校验后的中间产物。verboseParsingErrors 为 true 时 message 会追加 Details（Zod 错误还会用 z4.prettifyError 美化），这个开关默认 false。',
        concept: 'lc-structured-tool',
      },
      {
        text: '对 tool.invoke(someToolCall) 传入完整 ToolCall 对象时，invoke 内部做了什么？',
        options: [
          '丢弃 ToolCall，只按 args 执行',
          '取 input.args 作为工具输入，并把整个 ToolCall 挂到 enrichedConfig.toolCall，供下游（如 ToolRuntime）读取',
          '直接抛错，invoke 只接受裸输入',
          '先 JSON.parse 一遍 args 再执行',
        ],
        answer: 1,
        explain:
          'invoke() 里 if (_isToolCall(input)) 分支做了两件事：toolInput = input.args，以及 enrichedConfig = { ...enrichedConfig, toolCall: input }。挂载到 config 是关键——ToolCall.id 正是从这条 config 链路流向 ToolMessage.tool_call_id 与 ToolRuntime（L23），把 AIMessage 与工具结果串成链。C 错在 ToolCall 是 agent 循环里的标准输入形态；D 错在 args 早已是解析后的对象（L12），无需再 parse。',
        concept: 'lc-structured-tool',
      },
      {
        text: '_call 返回 AsyncGenerator 时，call() 如何处理？',
        options: [
          '抛错，工具只允许返回 Promise',
          '经 consumeAsyncGenerator 消费：每个 chunk 触发 runManager.handleToolEvent，聚合最终返回值',
          '把生成器整体作为字符串返回',
          '静默丢弃生成器，返回 undefined',
        ],
        answer: 1,
        explain:
          '_call 的签名是 Promise<ToolOutputT> | AsyncGenerator<ToolEventT, ToolOutputT>——工具可以流式产出事件。call() 里 isAsyncGenerator(raw) 为真时用 consumeAsyncGenerator 逐块回调 handleToolEvent（事件处理出错走 handleToolError 而不中断聚合），最终以生成器的 return 值作为工具输出。这是「工具执行也能流式」的框架层落点。',
        concept: 'lc-structured-tool',
      },
      {
        text: 'responseFormat 设为 content_and_artifact 但 _call 返回的不是二元组时？',
        options: [
          '整个返回值被当作 content',
          '抛出 Error：Tool response format is "content_and_artifact" but the output was not a two-tuple',
          'artifact 自动为 undefined，静默降级',
          '返回值被 JSON 序列化后拆成两个元素',
        ],
        answer: 1,
        explain:
          'call() 里 if (this.responseFormat === "content_and_artifact") 分支要求 Array.isArray(result) && result.length === 2 才解构出 [content, artifact]，否则显式抛错并附上实际返回值。双通道输出（content 给模型、artifact 给程序，呼应 L13）是显式契约，框架不猜测降级。',
        concept: 'lc-structured-tool',
      },
    ],
    [
      ['StructuredTool', '带结构化 schema 的工具基类：抽象 name/description/schema，内置双引擎输入校验'],
      [
        'ToolInputParsingException',
        '工具输入不匹配 schema 时抛出的专用异常，携带原始输入序列化，verboseParsingErrors 控制详情开关',
      ],
      ['interopParseAsync', 'Zod v3/v4 互操作层的异步解析函数——同一套工具代码兼容两个 Zod 大版本'],
      ['responseFormat', '工具输出形态开关：content（默认）或 content_and_artifact（要求返回二元组）'],
    ],
    [
      'DynamicStructuredTool 的类注释写着「The tool will not validate input if JSON schema is passed」——这是过时描述，call() 的 @cfworker 分支实际会校验 JSON Schema；以实现为准',
      'verboseParsingErrors 默认 false，schema 校验失败时错误消息不含 Details，排查工具输入问题记得在构造参数里显式打开',
      'ToolCall 形态输入与裸输入走的是同一条 call() 但分叉在 invoke：前者把 call 挂进 config，丢了这一步 toolCallId 就断了链',
    ],
  ),
  'framework',
)
