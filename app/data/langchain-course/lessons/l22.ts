import { L, withKind } from '../../course-builders.ts'

export const L22 = withKind(
  L(
    'L22',
    6,
    'tool() 重载矩阵：schema 分派、AsyncGenerator 工具事件、returnDirect',
    3,
    ['L21'],
    ['lc-tool-factory'],
    [
      '画出 tool() 的重载矩阵：ZodString → DynamicTool、ZodObject/JSONSchema → DynamicStructuredTool、第二参数形态决定是否带 ToolRuntime 泛型',
      '解释运行时唯一的实现如何按 schema 形状分派：isSimpleStringZodSchema / validatesOnlyStrings 判定 DynamicTool 路径',
      '说出 func 包装层的工程细节：runWithConfig 隐式上下文、AbortSignal 监听拒绝、AsyncGenerator 直接透传，以及 description 默认值链',
    ],
    `上一课读完 \`StructuredTool\` 的执行引擎，这一课看它上面的**声明式门面**：\`tool()\` 函数。它把「写一个类」压缩成「写一个函数」，代价是一份惊人的重载矩阵——TS 类型层十几个重载、运行时却只有一个实现体。这种「重载负责类型体验、实现负责行为分派」的分工正是本课的主线：**你给什么形状的 schema，就得到什么形态的工具**。证据来自 \`tools/index.ts\` 与 \`tools/types.ts\`（commit 7704471）。

### 重载矩阵：类型层的样子

先看矩阵的三个代表（完整矩阵从 L652 延伸到 L923，超过 270 行）：

\`\`\`ts
// ZodString → DynamicTool（v3/v4 各一个重载）
export function tool<
  SchemaT extends ZodStringV3,
  ToolOutputT = ToolOutputType,
  FuncT extends RunnableFunc<...> = ...,
>(
  func: FuncT,
  fields: ToolWrapperParams<SchemaT>
): DynamicTool<InferToolOutputFromFunc<FuncT>, InferToolEventFromFunc<FuncT>>;

// ZodObject → DynamicStructuredTool（v3/v4 各一个重载）
export function tool<
  SchemaT extends ZodObjectV3,
  NameT extends string,
  SchemaOutputT = InferInteropZodOutput<SchemaT>,
  ...
>(
  func: FuncT,
  fields: ToolWrapperParams<SchemaT, NameT>
): DynamicStructuredTool<SchemaT, SchemaOutputT, ..., NameT>;

// 带 ToolRuntime 的重载：func 第二参数形态变化
export function tool<
  SchemaT extends ZodObjectV3,
  NameT extends string,
  ...
  TState = unknown,
  TContext = unknown,
>(
  func: (
    input: SchemaOutputT,
    runtime: ToolRuntime<TState, TContext>
  ) => ToolOutputT | Promise<ToolOutputT>,
  fields: ToolWrapperParams<SchemaT, NameT>
): DynamicStructuredTool<...>;
\`\`\`

*— langchain-core/src/tools/index.ts:652-824 裁剪（commit 7704471）*

矩阵有三个维度：**schema 家族**（ZodString / ZodObject / JSONSchema / 缺省）× **Zod 大版本**（V3/V4 成对出现）× **第二参数形态**（裸 func 还是 \`(input, runtime)\` 二参）。类型层把每一格都展开成独立重载，换来的是调用方的精确类型推断——ZodObject 路径的返回类型里 \`NameT extends string\` 让工具名成为字面量类型，支撑下游的可辨识联合。JSONSchema 路径与缺省路径各再补两个重载；**所有重载只有类型声明，真正的函数体只有一个**。

### 运行时唯一实现：按形状分派

\`\`\`ts
const isSimpleStringSchema = isSimpleStringZodSchema(fields.schema);
const isStringJSONSchema = validatesOnlyStrings(fields.schema);

if (!fields.schema || isSimpleStringSchema || isStringJSONSchema) {
  return new DynamicTool<ToolOutputT, ToolEventT>({
    ...fields,
    description:
      fields.description ??
      (fields.schema as { description?: string } | undefined)?.description ??
      \`\${fields.name} tool\`,
    func: async (input, runManager, config) => {
      return new Promise<ToolOutputT>((resolve, reject) => {
        const childConfig = patchConfig(config, {
          callbacks: runManager?.getChild(),
        });
        void AsyncLocalStorageProviderSingleton.runWithConfig(
          pickRunnableConfigKeys(childConfig),
          async () => {
            try {
              resolve(func(input as any, childConfig as any));
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    },
  });
}

const schema = fields.schema as InteropZodObject | JSONSchema;
return new DynamicStructuredTool<...>({ ...fields, description, schema, func: ... });
\`\`\`

*— langchain-core/src/tools/index.ts:924-1031 裁剪（commit 7704471）*

分派条件读起来比想象中宽：无 schema、简单字符串 Zod schema、**只校验字符串的 JSON Schema** 都归入 DynamicTool——注意第三项，一个 \`{type: "string"}\` 的 JSON Schema 也会被当成字符串工具处理，这是 \`validatesOnlyStrings\` 做的深层判断，避免「字符串型 JSON Schema 强行走结构化路径」。两个包装函数共享同一套模板：\`patchConfig\` 把 runManager 的子回调接上（回调树的生长点，L36 的机制）、\`runWithConfig\` 把 config 塞进 AsyncLocalStorage（让工具函数体内部不传 config 也能被隐式捕获，L35 的隐式通道）、Promise 外壳统一 resolve/reject。

### 包装层的三个工程细节

DynamicStructuredTool 路径的包装函数比 DynamicTool 多两块逻辑，都值得单独记：

\`\`\`ts
func: async (input, runManager, config) => {
  return new Promise<ToolOutputT>((resolve, reject) => {
    let listener: (() => void) | undefined;
    const cleanup = () => {
      if (config?.signal && listener) {
        config.signal.removeEventListener("abort", listener);
      }
    };
    if (config?.signal) {
      listener = () => {
        cleanup();
        reject(getAbortSignalError(config.signal));
      };
      if (config.signal.aborted) {
        listener();
        return;
      }
      config.signal.addEventListener("abort", listener, { once: true });
    }
    // ... runWithConfig 内：
    const result = await func(input as any, childConfig as any);
    if (isAsyncGenerator(result)) {
      resolve(result as any);
      return;
    }
    if (config?.signal?.aborted) {
      cleanup();
      return;
    }
    cleanup();
    resolve(result);
  });
}
\`\`\`

*— langchain-core/src/tools/index.ts:975-1029 裁剪（commit 7704471）*

**细节一，AbortSignal 的三态防护**：注册前先查 \`aborted\`（已取消立即拒绝）、执行中监听 once 事件（中途取消拒绝并清理监听器）、完成后二次检查（func 返回时已取消则不 resolve——此时 Promise 早已被拒绝，重复 resolve 无效但要避免无谓的 cleanup 混乱）。**细节二，AsyncGenerator 透传**：func 返回生成器时 \`resolve(result)\` 放行，事件消费留给 L21 的 \`consumeAsyncGenerator\`——tool() 层不做消费，分层干净。**细节三，取消先于结果**：\`if (config?.signal?.aborted) { cleanup(); return; }\` 的位置在 \`resolve(result)\` 之前，保证「执行成功但世界已取消」时不会给出误导性的成功结果。

### returnDirect 与输出格式化

工厂参数接口 \`ToolWrapperParams\` 的字段面：\`name\`（必填）、\`description?\`、\`schema?\`、\`responseFormat?\`、\`returnDirect?\`，外加继承自 ToolParams 的 \`extras/metadata/defaultConfig\` 等。\`returnDirect\` 的注释值得原文引用——*"Setting this to true means that after the tool is called, an agent should stop looping"*——它是工具与 agent 循环之间的一份**消费方约定**：StructuredTool 只是把这个布尔值存在实例上，真正的短路逻辑在 ToolNode/agent 侧（L46）。输出侧的收尾在 \`_formatToolOutput\`：有 \`toolCallId\` 时把返回值包成 \`ToolMessage({ status: "success", content, artifact, tool_call_id, name })\`，字符串或内容块数组直接做 content、其他对象先 \`_stringify\`；带 \`lc_direct_tool_output\` 标记的返回值则原样穿透不包装。**从 tool() 一行声明到 ToolMessage 落地，中间要穿过包装 Promise → DynamicStructuredTool._call → StructuredTool.call 双引擎校验 → _formatToolOutput 四站**，每一站的失败形态不同（Promise 拒绝 / ToolInputParsingException / handleToolError / 直接抛错），排查工具问题时按站定位。

### Tool 基类与 validatesOnlyStrings：字符串判定的深层逻辑

DynamicTool 继承链的顶端是 \`Tool\` 抽象类——一个「输入固定为字符串」的 StructuredTool 特化：

\`\`\`ts
export abstract class Tool<ToolOutputT, ToolEventT>
  extends StructuredTool<
    StringInputToolSchema,
    ToolInputSchemaOutputType<StringInputToolSchema>,
    ToolInputSchemaInputType<StringInputToolSchema>,
    ToolOutputT,
    ToolEventT
  >
{
  schema = z
    .object({ input: z.string().optional() })
    .transform((obj) => obj.input);
  ...
}
\`\`\`

*— langchain-core/src/tools/index.ts:367-386 裁剪（commit 7704471）*

类注释 *"Base class for Tools that accept input as a string"* 点明设计意图：字符串工具不是独立物种，而是 StructuredTool 的一张预置 schema 门票——\`{input: "..."}\` 进、字符串出，transform 负责解包；\`DynamicTool._call\` 随后把解包结果直接交给 func（index.ts:452-460）。另一头的 \`validatesOnlyStrings\`（utils/json_schema.ts:96-135）决定「什么样的 JSON Schema 也算字符串工具」：显式 \`type: "string"\` 命中；\`type\` 是数组时要求**每项都是 "string"**——源码里留着一句自嘲注释 *"not sure why someone would do \`\\"type\\": [\\"string\\"]\` ... but we're not here to judge"*；无 type 时退而检查纯字符串 \`enum\` 或字符串常量；空 schema、数组 schema 一律返回 false（注释明说那是 *Validates anything, not just strings*）。两层判据合起来解释了本课分派规则的全貌：**Zod 侧看 schema 形状（isSimpleStringZodSchema），JSON Schema 侧看语义内容（validatesOnlyStrings）**——殊途同归地回答同一个问题：「这个 schema 是不是只描述了一个字符串」。理解这点后，\`tool(func, { schema: { type: "string" } })\` 得到 DynamicTool 而不是 DynamicStructuredTool 就不再是惊喜，而是分派矩阵的必然结果；反过来，\`{ type: ["string", "null"] }\` 会落入结构化路径，func 收到的将是对象。DynamicTool 类面上还有两个小口径：\`static lc_name()\` 返回固定名（index.ts:424-426），已弃用的 \`call()\` 里会把缺省的 \`config.runName\` 补成 \`this.name\`（index.ts:437-447）——工具自己的名字在旧调用路径上会兜底成 run 名，与 L27 的 getName 优先级（显式 runName 优先）不冲突；\`_call\` 的实现则是一行转发 \`this.func(input, runManager, parentConfig)\`（index.ts:452-460），没有任何加工。两条路径（DynamicTool 与 DynamicStructuredTool）的包装函数虽然字段不同，但工程模板完全一致——patchConfig 接子回调、runWithConfig 注入 ALS、Promise 外壳统一 resolve/reject——这意味着无论走哪个分派分支，工具函数拿到的 config 传播与取消语义都是同一套，分派只改变「输入形状」，不改变「运行时待遇」。

### 本课小结

- tool() 的重载矩阵三个维度：schema 家族 × Zod 版本 × 第二参数形态；类型层十几个重载全为推断服务，运行时只有一个实现体。
- 分派规则：无 schema / 简单字符串 Zod / 纯字符串 JSON Schema → DynamicTool（输入是字符串），其余 → DynamicStructuredTool。
- 包装层三件套：patchConfig 接子回调、runWithConfig 注入 ALS 隐式上下文、AbortSignal 三态防护（前置检查 / once 监听 / 完成后复查）。
- description 默认值链 fields.description ?? schema.description ?? \`\${name} tool\`；AsyncGenerator 由下层消费，tool() 只识别放行。
- 下一课拆开第二参数的另一半：ToolRuntime 如何把 agent 的 state/context/store/writer 送到工具函数手里。
`,
    null,
    [
      {
        text: 'tool(func, { name: "greet" }) 不传 schema，得到的是什么实例？',
        options: [
          'DynamicStructuredTool，schema 默认为空对象',
          'DynamicTool——无 schema 或纯字符串 schema 时走 DynamicTool 路径，输入是字符串',
          '抛错，schema 是必填项',
          'StructuredTool 的匿名子类',
        ],
        answer: 1,
        explain:
          '实现体里 if (!fields.schema || isSimpleStringSchema || isStringJSONSchema) return new DynamicTool({...})——schema 缺省、Zod 字符串 schema、只校验字符串的 JSON Schema 三种情况都归入 DynamicTool。它的底层 schema 固定为 z.object({ input: z.string().optional() }).transform(...)，函数收到的 input 是字符串。想收对象输入就传 ZodObject 或 JSON Schema 对象。',
        concept: 'lc-tool-factory',
      },
      {
        text: 'tool() 的 func 返回一个 AsyncGenerator 时，包装层如何处理？',
        options: [
          '把生成器消费完，聚合为字符串再返回',
          '直接 resolve 该生成器本身——由上层的 consumeAsyncGenerator 负责逐块回调事件并取最终值',
          '抛错，func 只能返回 Promise',
          '自动把生成器转成 ToolMessage',
        ],
        answer: 1,
        explain:
          'DynamicStructuredTool 包装函数里 if (isAsyncGenerator(result)) { resolve(result as any); return; }——生成器原样上抛。消费发生在 L21 讲过的 StructuredTool.call：consumeAsyncGenerator 逐块 handleToolEvent、聚合 return 值。分层很清晰：tool() 负责「识别并放行」，StructuredTool 负责「消费与回调」。A 会在 tool() 层就吞掉事件流，与实现相反。',
        concept: 'lc-tool-factory',
      },
      {
        text: 'description 的默认值链是？',
        options: [
          '恒为空字符串',
          'fields.description ?? schema.description ?? "${name} tool"',
          '恒为 "A function available to call."',
          '从 func 函数的 JSDoc 提取',
        ],
        answer: 1,
        explain:
          '实现体两处（DynamicTool 与 DynamicStructuredTool 路径）都是 fields.description ?? (fields.schema as {description?}).description ?? `${fields.name} tool`——显式传参优先，其次借用 schema 上自带的 description（Zod 的 .describe()），最后兜底「名字 + tool」。JSDoc 提取在 TS 里不存在；"A function available to call." 是 L19 里 withStructuredOutput 的 description 兜底，别混淆。',
        concept: 'lc-tool-factory',
      },
      {
        text: 'returnDirect: true 的语义是？',
        options: [
          '工具返回值跳过校验直接执行',
          '工具被调用后 agent 应停止循环——返回值直接作为最终答案',
          '工具必须同步返回，不能是 Promise',
          '返回值不包装成 ToolMessage',
        ],
        answer: 1,
        explain:
          'ToolWrapperParams.returnDirect 的注释原文：Setting this to true means that after the tool is called, an agent should stop looping。它是给 agent 循环看的约定（ToolNode 等消费方据此短路），与输入校验、异步性无关。是否包装 ToolMessage 由 toolCallId 存在与否和 isDirectToolOutput 决定，与 returnDirect 是两个维度。',
        concept: 'lc-tool-factory',
      },
      {
        text: '调用方传入的 AbortSignal 已经 aborted 时，DynamicStructuredTool 包装函数的行为是？',
        options: [
          '照常执行 func，忽略信号',
          '监听器立即触发，Promise 以 getAbortSignalError(signal) 拒绝',
          '返回 undefined',
          '等到 func 自然结束后再检查信号',
        ],
        answer: 1,
        explain:
          '包装函数在构造 Promise 时先注册 abort 监听器：if (config.signal.aborted) { listener(); return; }——listener 内部 cleanup 后 reject(getAbortSignalError(config.signal))。对已完成的结果也有保护：func 正常返回但此时 signal.aborted 则不 resolve（promise 已被拒绝）。这是把可取消性下沉到每个工具调用的实现。',
        concept: 'lc-tool-factory',
      },
    ],
    [
      [
        'tool()',
        '把 (func, fields) 声明式提升为一等工具的工厂函数：TS 层十几个重载 + 运行时单一实现按 schema 分派',
      ],
      ['DynamicTool', '字符串输入工具类：schema 固定为 { input?: string } 的 transform，func 收到字符串'],
      ['DynamicStructuredTool', '结构化输入工具类：Zod/JSON Schema 均可，校验由 StructuredTool 双引擎承担'],
      ['returnDirect', '工具级约定：true 表示该工具的返回值直接终结 agent 循环'],
    ],
    [
      'ZodString schema 产出的是 DynamicTool，func 的 input 参数是字符串而非对象——从 DynamicStructuredTool 迁移过来时容易按对象解构导致 undefined',
      'DynamicStructuredTool 类注释里「JSON schema 不校验」的说法已过时，tool() 的文档明确 Both schema types will be validated，以实现为准',
      'AsyncGenerator 返回值只在「func 直接 return 生成器」时被识别；用 async 函数包一层再 return 生成器虽然也能工作，但注意 resolve 的是生成器对象而非其产出值',
    ],
  ),
  'framework',
)
