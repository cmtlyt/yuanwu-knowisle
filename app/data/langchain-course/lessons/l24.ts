import { L, withKind } from '../../course-builders.ts'

export const L24 = withKind(
  L(
    'L24',
    7,
    'PromptTemplate：f-string/mustache 双格式与类型级参数提取',
    2,
    ['L10'],
    ['lc-prompt-template'],
    [
      '说出 PromptTemplate 的双模板格式与校验规则差异：f-string 可启动校验，mustache 默认且强制跳过校验',
      '读懂 ExtractTemplateParamsRecursive 的递归条件类型提取与 NonAlphanumeric 排除规则',
      '解释 fromTemplate 的双通道设计：类型级 ExtractedFStringParams 推导参数表、运行时 parseTemplate 提取 inputVariables',
    ],
    `进入最后一组：Prompt 与解析。三课的地图是「字符串模板 → 消息模板 → few-shot 与解析器」，本课从最小单元 \`PromptTemplate\` 开始。它表面上是最简单的类——一张字符串模板加一堆变量——但源码里藏着本课程罕见的**类型体操实战**：用递归条件类型从字符串字面量里提取变量名，让 \`fromTemplate("Say {foo}")\` 的返回类型自动带上 \`{ foo: any }\` 参数表。核心命题：**同一个模板，编译期与运行时各提取一次变量，两套机制共用同一份解析语义**。证据来自 \`prompts/prompt.ts\` 与 \`prompts/base.ts\`（commit 7704471）。

### 双格式与校验规则

先看配置面与构造逻辑：

\`\`\`ts
export interface PromptTemplateInput<...> extends BasePromptTemplateInput<...> {
  template: MessageContent;
  templateFormat?: Format;      // "f-string" | "mustache"
  validateTemplate?: boolean;   // 默认 true
  additionalContentFields?: ContentBlock;
}

constructor(input: PromptTemplateInput<RunInput, PartialVariableName>) {
  super(input);
  // If input is mustache and validateTemplate is not defined, set it to false
  if (
    input.templateFormat === "mustache" &&
    input.validateTemplate === undefined
  ) {
    this.validateTemplate = false;
  }
  Object.assign(this, input);

  if (this.validateTemplate) {
    if (this.templateFormat === "mustache") {
      throw new Error("Mustache templates cannot be validated.");
    }
    let totalInputVariables: string[] = this.inputVariables;
    if (this.partialVariables) {
      totalInputVariables = totalInputVariables.concat(
        Object.keys(this.partialVariables)
      );
    }
    checkValidTemplate(this.template, this.templateFormat, totalInputVariables);
  }
}
\`\`\`

*— langchain-core/src/prompts/prompt.ts:24-166 裁剪（commit 7704471）*

校验规则的不对称是有意为之：f-string 的 \`{var}\` 语法天然定义了「变量全集」，\`checkValidTemplate\` 可以核对声明与使用是否一致；mustache 的 \`{{var}}\` 之外还有 section/倒转段/部分模板等语法，无法简单穷举变量——所以 mustache **默认关校验、显式开校验必炸**。这不是能力缺失而是语义边界：一个引擎能校验、另一个不能，框架把差异如实暴露而不是抹平。另外注意 \`template: MessageContent\`——模板字段类型不是 string 而是消息内容类型，为多模态留了口子。

### 类型级参数提取：递归条件类型

本课的技术核心是这段类型定义：

\`\`\`ts
type NonAlphanumeric =
  | " " | "\\t" | "\\n" | "\\r"
  | '"' | "'" | "{" | "[" | "(" | "\`" | ":" | ";";

type ExtractTemplateParamsRecursive<
  T extends string,
  Result extends string[] = [],
> = T extends \`\${string}{\${infer Param}}\${infer Rest}\`
  ? Param extends \`\${NonAlphanumeric}\${string}\`
    ? ExtractTemplateParamsRecursive<Rest, Result>
    : ExtractTemplateParamsRecursive<Rest, [...Result, Param]>
  : Result;

export type ParamsFromFString<T extends string> = {
  [Key in ExtractTemplateParamsRecursive<T>[number] | (string & Record<never, never>)]: any;
};

export type ExtractedFStringParams<
  T extends string,
  RunInput extends InputValues = Symbol,
> = RunInput extends Symbol ? ParamsFromFString<T> : RunInput;
\`\`\`

*— langchain-core/src/prompts/prompt.ts:56-96（commit 7704471）*

逐层拆：**提取层**用模板字面量的 \`infer\` 反复切分——\`{\${infer Param}}\${infer Rest}\` 找到第一个花括号对，Param 合法则推入 Result 数组、然后对 Rest 递归，直到不匹配返回累积数组。**过滤层**是 NonAlphanumeric 规则：提取出的 Param 若以这些字符开头就被丢弃——源码注释直接给了现实案例链接（query_constructor 的 prompt 模板里内嵌 JSON 示例），\`{"foo": 1}\` 提取出的 Param 以 \`"\` 开头，被跳过，避免把 JSON 键误当变量。**映射层**把变量名数组展开成对象类型 \`{ foo: any; bar: any }\`，值统一 any——类型体操的精度到此为止，只保证「键对」，不保证「值型」。**守卫层**是 \`RunInput extends Symbol\` 的分支：显式给了 RunInput 就尊重用户类型，缺省（Symbol 哨兵值）才自动推导。四层各司其职，是「体操有真实用途」的范本。

### fromTemplate：双通道提取

类型推导在编译期完成，运行时还要一份真的 inputVariables：

\`\`\`ts
static fromTemplate<
  RunInput extends InputValues = Symbol,
  T extends string = string,
>(
  template: T,
  options?: Omit<PromptTemplateInput<RunInput, string>, "template" | "inputVariables">
): PromptTemplate<ExtractedFStringParams<T, RunInput>> {
  const { templateFormat = "f-string", ...rest } = options ?? {};
  const names = new Set<string>();
  parseTemplate(template, templateFormat).forEach((node) => {
    if (node.type === "variable") {
      names.add(node.name);
    }
  });

  return new PromptTemplate({
    inputVariables: [...names] as any[],
    templateFormat,
    template,
    ...rest,
  });
}
\`\`\`

*— langchain-core/src/prompts/prompt.ts:249-275 裁剪（commit 7704471）*

注意三个细节。**其一**，运行时提取用 \`parseTemplate\`（template.ts 的正式解析器）而非正则——解析器按格式返回节点序列，\`type === "variable"\` 的才是插值点，语义与类型层的 ExtractTemplateParamsRecursive 严格对应（同一条 NonAlphanumeric 规则在两边各实现一次）。**其二**，\`Set\` 去重：模板里写两次 \`{foo}\` 只产生一个 inputVariable。**其三**，重载矩阵里 mustache 版本的返回类型是 \`PromptTemplate<InputValues>\`——类型级提取**只对 f-string 生效**，因为模板字面量类型系统解析不了 mustache 的 \`{{var}}\` 语义（\`{{\` 在 TS 模板字面量里与 f-string 规则冲突）。format 的执行路径则是标准的两步：\`mergePartialAndUserVariables(values)\` 合并 partial 与用户变量，再 \`renderTemplate(template, templateFormat, allValues)\` 渲染——渲染也走同一套 template.ts。

### partial 的延迟求值

partial 变量在 \`BasePromptTemplate.mergePartialAndUserVariables\` 里被消费：

\`\`\`ts
async mergePartialAndUserVariables(
  userVariables: TypedPromptInputValues<RunInput>
): Promise<...> {
  const partialVariables = this.partialVariables ?? {};
  const partialValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(partialVariables)) {
    if (typeof value === "string") {
      partialValues[key] = value;
    } else {
      partialValues[key] = await (value as () => Promise<string>)();
    }
  }

  const allKwargs = {
    ...(partialValues as Record<PartialVariableName, string>),
    ...userVariables,
  };
  return allKwargs;
}
\`\`\`

*— langchain-core/src/prompts/base.ts:104-125（commit 7704471）*

非字符串值被当作函数调用并 \`await\`——partial 可以是「每次 format 时动态求值」的钩子，典型用法如注入当前时间。合并顺序是 partial 在前、用户变量在后（后者可覆盖前者），\`partial()\` 方法则相反地「锁定」变量：从 inputVariables 里移除已 partial 的键并生成新实例。这一小段代码是 L25 的伏笔——ChatPromptTemplate.fromMessages 会把嵌套模板的 partialVariables 逐层向上合并，同一个机制在消息级模板里再演一遍。

### 渲染器的另一半：插值行为与深度护栏

运行时的插值行为也有可讲的差异。f-string 的 \`interpolateFString\` 对变量值的处理是「非字符串一律 JSON.stringify」——数字、数组、对象都以 JSON 形态进模板，而变量缺失直接抛 \`(f-string) Missing value for input X\`（prompts/template.ts:139-150）。mustache 的渲染则整体委托给 mustache.render，但传入了一个特殊选项：

\`\`\`ts
const MUSTACHE_RENDER_OPTIONS: mustache.RenderOptions = {
  escape: (text) => text,
};
\`\`\`

*— langchain-core/src/prompts/template.ts:8-13（commit 7704471）*

\`escape\` 被替换为恒等函数——mustache 默认会对插值做 HTML 转义，提示词场景显然不需要（\`&amp;\` 对模型毫无意义），注释还特意说明按渲染调用传入、以避免污染同进程里其他 mustache 使用者（template.ts:4-6）。第三个护栏是递归深度：mustache 的 section 语法允许模板嵌套展开，\`mustacheTemplateToNodes\` 递归解析时以 \`MAX_PROMPT_TEMPLATE_DEPTH = 256\` 封顶，超限抛专用深度错误（prompts/utils.ts:3-9，template.ts:99）——一张防模板构造炸弹的保险单。

### 本课小结

- 双格式的校验不对称是语义差异的如实暴露：f-string 可校验，mustache 默认跳过且显式开启即抛错——框架拒绝假装能校验。
- 类型提取四层结构：递归 infer 提取 → NonAlphanumeric 过滤（防 JSON 误判）→ 映射成参数表 → RunInput 哨兵守卫用户显式类型。
- fromTemplate 双通道：编译期 ExtractedFStringParams 推类型、运行时 parseTemplate 提取 inputVariables，两者共用同一套变量语义；mustache 只有运行时通道。
- partialVariables 支持异步函数延迟求值，合并顺序 partial 在前、用户变量可覆盖。
- 下一课把单字符串升级为消息列表：ChatPromptTemplate.fromMessages 如何归一化多种消息形态，以及 Prompt 之于 Runnable 的身份问题。
`,
    null,
    [
      {
        text: 'templateFormat 为 mustache 且显式传 validateTemplate: true 时，构造函数的行为是？',
        options: [
          '正常校验模板变量',
          '抛出错误：Mustache templates cannot be validated.',
          '静默忽略 validateTemplate，按 mustache 默认行为处理',
          '自动降级为 f-string 后校验',
        ],
        answer: 1,
        explain:
          '构造函数两段逻辑：第一段在 templateFormat === "mustache" 且 validateTemplate 未显式给出时把 this.validateTemplate 置 false；第二段 if (this.validateTemplate) 内部再判 mustache 则直接 throw "Mustache templates cannot be validated."。所以默认关闭校验，但显式开启必炸——框架明确拒绝假装能校验。C 错，显式传 true 不会被静默忽略。',
        concept: 'lc-prompt-template',
      },
      {
        text: 'ExtractTemplateParamsRecursive 遇到模板里的 JSON 片段 {"foo": 1} 时，为什么不会把 foo 当成变量？',
        options: [
          '它只匹配纯字母变量名',
          '提取出的 Param 若以 NonAlphanumeric 字符（如引号、冒号、左括号）开头则被跳过，继续处理剩余串',
          'JSON 片段会先被正则移除',
          '会把 foo 误判为变量——这是已知 bug',
        ],
        answer: 1,
        explain:
          '类型定义里 NonAlphanumeric 是空格、引号、冒号、左括号等字符的联合；递归分支里 Param extends `${NonAlphanumeric}${string}` 时走「跳过该段、继续 Rest」的分支。源码注释还引用了 query_constructor/prompt.ts 作为现实案例——那里的模板内嵌 JSON 示例，靠这条规则避免误判。设计意图就是区分「插值变量」与「长得像插值的字面量」。',
        concept: 'lc-prompt-template',
      },
      {
        text: 'PromptTemplate.fromTemplate("Say {foo} to {bar}") 的返回类型是？',
        options: [
          'PromptTemplate<any>',
          'PromptTemplate<{ foo: any; bar: any }>——由 ParamsFromFString 从模板字面量类型推导',
          'PromptTemplate<InputValues>',
          'unknown，需要手动断言',
        ],
        answer: 1,
        explain:
          'fromTemplate 的返回类型是 PromptTemplate<ExtractedFStringParams<T, RunInput>>，RunInput 缺省为 Symbol 时 ExtractedFStringParams 退到 ParamsFromFString<T>——用映射类型把 ExtractTemplateParamsRecursive<T>[number] 展开成 { foo: any; bar: any }。之后 format({ wrong: 1 }) 会在类型层报错。C 是 mustache 重载的返回类型——mustache 模板不做类型级提取。',
        concept: 'lc-prompt-template',
      },
      {
        text: 'fromTemplate 在运行时如何得到 inputVariables？',
        options: [
          '从 TypeScript 编译产物里读取类型信息',
          '用 parseTemplate 解析模板节点，收集 type === "variable" 的节点名放进 Set',
          '要求调用方手动传入',
          '用正则全局匹配 {xxx}',
        ],
        answer: 1,
        explain:
          'fromTemplate 实现里 parseTemplate(template, templateFormat).forEach((node) => { if (node.type === "variable") names.add(node.name); })——运行时与类型层共用同一套解析器（template.ts），保证两边的变量清单一致。之后 new PromptTemplate({ inputVariables: [...names], ... })。注意这是 Set 去重的，重复变量只计一次。',
        concept: 'lc-prompt-template',
      },
      {
        text: 'partialVariables 的值可以是函数吗？',
        options: [
          '不行，只能是字符串',
          '可以——mergePartialAndUserVariables 对非字符串值做 await 调用，支持异步 partial',
          '可以，但函数必须同步返回',
          '只有 mustache 格式支持',
        ],
        answer: 1,
        explain:
          'BasePromptTemplate.mergePartialAndUserVariables 的循环里：typeof value === "string" 直接用，否则 partialValues[key] = await (value as () => Promise<string>)()——函数会被调用并 await，天然支持异步（比如运行时取当前日期）。这个设计让 partial 成为延迟求值的钩子，L25 的 fromMessages 还会把它沿模板嵌套向上合并。',
        concept: 'lc-prompt-template',
      },
    ],
    [
      ['PromptTemplate', '单字符串提示模板：支持 f-string 与 mustache 双格式，可从模板字面量推导参数类型'],
      [
        'ExtractTemplateParamsRecursive',
        '递归条件类型：从模板字符串类型中提取 {var} 变量名，NonAlphanumeric 开头的疑似变量被跳过',
      ],
      ['templateFormat', '模板引擎开关：f-string（默认，可校验）或 mustache（不可校验）'],
      ['partialVariables', '预填变量表：值为字符串或返回 Promise 的函数，format 时与用户变量合并'],
    ],
    [
      'mustache 模板显式传 validateTemplate: true 会直接抛错——不是被忽略；mustache 之所以不可校验，是它没有「变量清单即全集」的语义',
      'mustache 路径的 fromTemplate 返回 PromptTemplate<InputValues>，不做类型级参数提取——想要参数类型安全就用 f-string',
      '模板里写 JSON 示例时，值若以引号或括号开头不会被误判为变量（NonAlphanumeric 规则），但纯 {word} 形态的字面量仍会被当成变量，需转义处理',
    ],
  ),
  'theory',
)
