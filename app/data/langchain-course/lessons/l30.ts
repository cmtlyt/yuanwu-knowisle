import { L, withKind } from '../../course-builders.ts'

export const L30 = withKind(
  L(
    'L30',
    9,
    'pipe 与 RunnableSequence：first/middle/last、吸并扁平化、seq:step:N 子回调',
    3,
    ['L27'],
    ['lc-runnable-sequence'],
    [
      '实现一个经 pipe 组合的多步链并预测 invoke/batch/stream 三种调用下的子回调命名（seq:step:N）',
      '解释 RunnableSequence 用 first/middle/last 三字段存储与 pipe 吸并扁平化如何避免嵌套黑洞',
      '说出 _coerceToRunnable 对函数/Runnable/对象三种输入的分派结果，并解释序列 getGraph 如何拼接子图',
    ],
    `### LCEL 的心脏：一条永远扁平的链

模块三第二阶段从组合子开始。\`chain = prompt.pipe(model).pipe(parser)\` 这行代码在源码里是三层事实：pipe 每次返回**新的** RunnableSequence（不可变组合）、序列内部用 first/middle/last 三字段存储、序列接序列时**吸并成单链**。本课按「构造 → 存储 → 执行 → 可视化」走读 base.ts 的 RunnableSequence 区段，它是理解后面四个组合子（Map/Lambda/Fallbacks/bind 家族）的语法基线。

### pipe 与 _coerceToRunnable：三种输入的分派

\`\`\`ts
pipe<NewRunOutput>(
  coerceable: RunnableLike<RunOutput, NewRunOutput>
): Runnable<RunInput, Exclude<NewRunOutput, Error>> {
  return new RunnableSequence({
    first: this,
    last: _coerceToRunnable(coerceable),
  });
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:616-624（commit 7704471）*

\`\`\`ts
if (typeof coerceable === "function") {
  return new RunnableLambda({ func: coerceable }) as Runnable<...>;
} else if (Runnable.isRunnable(coerceable)) {
  return coerceable as Runnable<...>;
} else if (!Array.isArray(coerceable) && typeof coerceable === "object") {
  const runnables: Record<string, Runnable<RunInput>> = {};
  for (const [key, value] of Object.entries(coerceable)) {
    runnables[key] = _coerceToRunnable(value as RunnableLike);
  }
  return new RunnableMap({ steps: runnables }) as unknown as Runnable<...>;
} else {
  throw new Error(
    \`Expected a Runnable, function or object.\\nInstead got an unsupported type.\`
  );
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:3184-3208（commit 7704471）*

coerce 规则要背下来：**函数 → RunnableLambda；Runnable → 原样；对象 → 递归 coerce 后包成 RunnableMap**（并行扇出！）。所以 \`model.pipe({ a: f, b: g })\` 不是语法错误，而是串行后接一个并行字典——\`.pipe()\` 传入对象的隐式并行语义是 LCEL 速记法的来源。判型用 \`Runnable.isRunnable\`（检查 lc_runnable 标记，utils.ts:5-7），与 L05 的 Symbol 判型同属「跨实例安全」策略。

### first/middle/last 与吸并 pipe

\`\`\`ts
export class RunnableSequence<RunInput = any, RunOutput = any>
  extends Runnable<RunInput, RunOutput>
{
  protected first: Runnable<RunInput>;
  protected middle: Runnable[] = [];
  protected last: Runnable<any, RunOutput>;
  omitSequenceTags = false;

  get steps() {
    return [this.first, ...this.middle, this.last];
  }
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:1944-1989（commit 7704471）*

为什么不用一个 steps 数组？答案在 pipe 的吸并覆写里：

\`\`\`ts
pipe<NewRunOutput>(
  coerceable: RunnableLike<RunOutput, NewRunOutput>
): RunnableSequence<RunInput, Exclude<NewRunOutput, Error>> {
  if (RunnableSequence.isRunnableSequence(coerceable)) {
    return new RunnableSequence({
      first: this.first,
      middle: this.middle.concat([
        this.last,
        coerceable.first,
        ...coerceable.middle,
      ]),
      last: coerceable.last,
      name: this.name ?? coerceable.name,
    });
  } else {
    return new RunnableSequence({
      first: this.first,
      middle: [...this.middle, this.last],
      last: _coerceToRunnable(coerceable),
      name: this.name,
    });
  }
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2222-2244（commit 7704471）*

把 this.last 从 last 挪进 middle、对方 first 也进 middle——两条链在交接处被缝合，**无论 pipe 多少次，结果都是一条单层序列**。isRunnableSequence 的判型是 \`Array.isArray(thing.middle) && Runnable.isRunnable(thing)\`（base.ts:2247-2249），鸭子类型而非 instanceof，跨包实例同样成立。这是 LCEL「可视化不出现嵌套黑洞」的机制保证：getGraph 展开与 invoke 的 wrapper run 都只有一层。

### invoke：逐步接力与 seq:step:N 子回调

\`\`\`ts
const initialSteps = [this.first, ...this.middle];
for (let i = 0; i < initialSteps.length; i += 1) {
  const step = initialSteps[i];
  const promise = step.invoke(
    nextStepInput,
    patchConfig(config, {
      callbacks: runManager?.getChild(
        this.omitSequenceTags ? undefined : \`seq:step:\${i + 1}\`
      ),
    })
  );
  nextStepInput = await raceWithSignal(promise, config.signal);
}
finalOutput = await this.last.invoke(
  nextStepInput,
  patchConfig(config, {
    callbacks: runManager?.getChild(
      this.omitSequenceTags ? undefined : \`seq:step:\${this.steps.length}\`
    ),
  })
);
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2009-2033（commit 7704471）*

逐项核对四件事：每步拿到的 config 经 patchConfig 换成 **getChild 产生的子回调管理器**（执行树在此分叉，L36 详述）；每步 await 都套 raceWithSignal，AbortSignal 全链贯通；last 单独调出循环只是为了让 TS 认出 RunOutput 类型（base.ts:2022 注释原话）；\`delete config.runId\`（base.ts:2005）在 handleChainStart 后立即执行，父 run 的 id 不下渗。batch 的对应版本（base.ts:2060-2115）更有意思：它按**步**而不是按输入组织并发——每步对整批输入调 step.batch，交接处下一步拿到的是上一批的输出数组，天然是「列式」批处理。

流式版本则是 transform 链：\`steps[0].transform(inputGenerator())\` 起步，每步 \`await step.transform(finalGenerator)\` 接龙（base.ts:2145-2164）。链式流式的瓶颈定理在这里可以严格陈述：**整条链的流式能力等于最不流式的那一步**——某步没覆写 transform 就会在它那里攒齐（L27 降级链），下游只能等。

### getGraph：序列的图视图

\`\`\`ts
getGraph(config?: RunnableConfig): Graph {
  const graph = new Graph();
  let currentLastNode: any = null;

  this.steps.forEach((step, index) => {
    const stepGraph = step.getGraph(config);

    if (index !== 0) {
      stepGraph.trimFirstNode();
    }

    if (index !== this.steps.length - 1) {
      stepGraph.trimLastNode();
    }

    graph.extend(stepGraph);

    const stepFirstNode = stepGraph.firstNode();
    if (!stepFirstNode) {
      throw new Error(\`Runnable \${step} has no first node\`);
    }

    if (currentLastNode) {
      graph.addEdge(currentLastNode, stepFirstNode);
    }

    currentLastNode = stepGraph.lastNode();
  });

  return graph;
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2189-2220（commit 7704471）*

递归子图拼接：每个 step 自报一张图（默认是 Input→自身→Output 三节点，base.ts:588-608），序列把首尾的 IO 占位节点掐掉（trimFirstNode/trimLastNode）后 extend 进总图，再用 addEdge 把上一步的尾节点接到下一步的首节点。这就是 \`chain.getGraph()\` 导出 mermaid、Studio 里看到拓扑的源码起源——**图不是事后画的，是每个 Runnable 自带、组合子负责缝**。L38 会把 Graph 类与 mermaid 导出单独走读。

### RunnableSequence.from 与命名的落点

pipe 是逐段拼装，静态工厂 \`from\` 则是一步到位的入口：

\`\`\`ts
static from<RunInput, RunOutput>(
  [first, ...runnables]: [
    RunnableLike<RunInput>,
    ...RunnableLike[],
    RunnableLike<any, RunOutput>,
  ],
  nameOrFields?: string | Omit<RunnableSequenceFields<...>, "first" | "middle" | "last">
) {
  let extra: Record<string, unknown> = {};
  if (typeof nameOrFields === "string") {
    extra.name = nameOrFields;
  } else if (nameOrFields !== undefined) {
    extra = nameOrFields;
  }
  return new RunnableSequence<RunInput, Exclude<RunOutput, Error>>({
    ...extra,
    first: _coerceToRunnable(first),
    middle: runnables.slice(0, -1).map(_coerceToRunnable),
    last: _coerceToRunnable(runnables[runnables.length - 1]),
  });
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2252-2277 裁剪（commit 7704471）*

解构签名 \`[first, ...runnables]\` 要求至少两个元素——first 与最后一个元素分派到 first/last 槽位，中间的进 middle，每个都过 \`_coerceToRunnable\`（前文的分派规则全部适用，所以 \`RunnableSequence.from([prompt, model, parserFn])\` 里的裸函数同样被提升为 RunnableLambda）。第二参数是便捷命名：传字符串直接当 \`name\`，传对象则展开为其余字段。**命名在这里落点**的意义要接回 L27 的 getName：给序列一个 name，追踪树上的根 run 就显示这个名字而不是 "RunnableSequence"；\`withConfig({ runName })\`（L19 的结构化输出管线、L34 的 bind 家族）改的也是同一个槽位——runName 优先于 getName，这是回调命名链的最后一环。另外注意 from 的返回类型把 RunOutput 排除了 Error——与 pipe 的签名（base.ts:616-624）同款，类型层就声明「链的正常输出不是异常」，错误走 returnExceptions（L28）或 fallback（L33）的显式通道。一句话收束：**pipe 负责生长，from 负责出生，两者共享同一套 coerce 与扁平化语义**。吸并分支里还有一条名字合并规则没有展示：\`name: this.name ?? coerceable.name\`（base.ts:2238）——两条链都有名字时取前者，\`a.pipe(b)\` 的结果跟随 a 的命名；想让拼接后的链换名字，得显式 withConfig({ runName }) 或用 from 的第二参。流式入口同样值得再看一眼：\`_streamIterator\` 的起点是 \`steps[0].transform(inputGenerator())\`——把 invoke 的单次输入包成单元素生成器再喂给首步的 transform（base.ts:2145-2150），这与 L31 的 \`stream()\` 内 \`generator() { yield input }\` 是同一个手法：**序列在流式世界里的自我描述，就是「一条 transform 接龙」**。由此可推两个边界结论：其一，单步链（pipe 一次）的流式能力完全等于那一步的 transform；其二，链首若是模型这样的真流式步骤，首块缓冲（L27/L29）只发生在 stream() 的包装层，链内各步之间没有额外缓冲——中间步骤攒齐再放行的延迟会逐级传导到最终输出。对照 L31 可以收个尾：序列与 Map 是 LCEL 组合的两极——序列串行接力、Map 并行扇出，而 \`{a: f, b: g}\` 的对象字面量让两者可以自由嵌套（串行里嵌并行、并行里嵌串行），嵌套的深度由 pipe 的吸并保证只在序列维度扁平，Map 的嵌套则如实保留为 steps 字典的树——「扁平」从来是针对追踪噪音的设计目标，不是对组合自由度的限制。

### 本课小结

- pipe 是「每次新建」的不可变组合；_coerceToRunnable 三分派（函数→Lambda、Runnable→原样、对象→RunnableMap 并行）是 LCEL 速记法的实现层。
- first/middle/last 三字段 + pipe 吸并 = 永远扁平的单链；isRunnableSequence 用鸭子判型保证跨实例成立。
- invoke 每步 patchConfig + getChild(\`seq:step:N\`) 下发子回调，raceWithSignal 贯通取消；batch 按步列式批处理；流式走 transform 接龙，瓶颈步决定整链流式能力。
- getGraph 靠「子图自报 + 掐头去尾 + addEdge 缝合」生成拓扑，LCEL 可视化是内建能力而非外挂。
- 下一课看并行侧的组合子：RunnableMap 的两种时序——Promise.all 的 invoke 语义与 Promise.race 的流式语义。
`,
    null,
    [
      {
        text: 'seq.pipe(seq2)（两个都是 RunnableSequence）的结果结构是？',
        options: [
          '外层 Sequence 只有 first=seq，last=seq2 的两层嵌套',
          '吸并成一条单链：first=seq.first，middle=[...seq.middle, seq.last, seq2.first, ...seq2.middle]，last=seq2.last',
          '抛错，不支持序列接序列',
          '变成 RunnableMap 并行执行两条序列',
        ],
        answer: 1,
        explain:
          'base.ts:2225-2235 的 pipe 覆写用 isRunnableSequence 判型后把 this.last 与 coerceable.first 摘出并入 middle，保证 LCEL 链永远是扁平单链而非嵌套树。选项 A 描述的是不吸并的反例——那样 invoke 会多一层 wrapper run，追踪树也多一层噪音；选项 C 错：这正是 pipe 最核心的场景；选项 D 与序列语义无关。',
        concept: 'lc-runnable-sequence',
      },
      {
        text: '_coerceToRunnable 收到一个普通函数时返回什么？',
        options: [
          '原样返回该函数',
          'new RunnableLambda({ func })——函数被提升为 Runnable',
          'new RunnableMap({ steps: { input: 函数 } })',
          '抛错，必须是 Runnable 实例',
        ],
        answer: 1,
        explain:
          'base.ts:3184-3189：typeof coerceable === "function" 分支直接包成 RunnableLambda。选项 A 错：pipe 的返回类型要求 Runnable，裸函数无法承载子回调与 config 传播；选项 C 混淆了对象形态——普通对象分支（:3196-3203）才走 RunnableMap，每个值递归 coerce；选项 D 错：函数/Runnable/普通对象三种都合法，只有数组等其他类型才抛 Expected a Runnable, function or object。',
        concept: 'lc-runnable-sequence',
      },
      {
        text: 'RunnableSequence.invoke 给每一步的子回调打什么标签？',
        options: [
          '不打标签，共用父 run 的 callbacks',
          'seq:step:N（N 从 1 计），由 runManager?.getChild(tag) 生成子回调管理器',
          'step-N',
          '随机 uuid',
        ],
        answer: 1,
        explain:
          'base.ts:2014-2018 与 2029-2032：每步 patchConfig(config, { callbacks: runManager?.getChild(`seq:step:${i + 1}`) })。标签让追踪树每个可读命名（step 1/2/3…），omitSequenceTags 字段可关掉（构造字段与 base.ts:1961、2016 的条件可见）。选项 A 错：getChild 正是执行树逐层下发的机制（L36）；选项 C/D 无出处。',
        concept: 'lc-runnable-sequence',
      },
      {
        text: 'RunnableSequence._streamIterator 如何让整条链支持流式？',
        options: [
          '对每步依次调用 invoke，最后把结果切成块',
          '从 steps[0].transform(单元素输入流) 开始，逐步 await step.transform(finalGenerator)，让上一条的输出流成为下一条的输入流',
          '只对流式模型那一步做流式，其余步骤缓存',
          '不支持流式，直接降级 invoke',
        ],
        answer: 1,
        explain:
          'base.ts:2145-2164：finalGenerator 起点是 steps[0].transform(inputGenerator())，随后 for 循环把每一步 transform 接上去，形成 transform 链。能否逐块流出取决于**瓶颈步**——不覆写 transform 的步骤会按默认实现攒齐再放行（L27 的降级链）。选项 A 错：那连首步的流式都丢失；选项 C 错：不存在「识别模型步」的特殊逻辑；选项 D 错：_streamIterator 是覆写过的，序列永远走 transform 链而非 yield invoke。',
        concept: 'lc-runnable-sequence',
      },
    ],
    [
      [
        'RunnableSequence',
        'LCEL 串行心脏：输出逐级接力为下一步输入；内部以 first/middle/last 三字段存储，steps getter 展开为完整数组（base.ts:1954-1989）',
      ],
      [
        '吸并扁平化',
        '序列.pipe(序列) 时把交接处两步并入 middle 的操作，保证组合结果是单层链而非嵌套序列（base.ts:2222-2244）',
      ],
      [
        '_coerceToRunnable',
        'RunnableLike（函数/Runnable/对象）到 Runnable 的统一 coerce 入口；对象递归 coerce 后包成 RunnableMap（base.ts:3177-3209）',
      ],
      [
        'getGraph',
        '每个 Runnable 自带的图描述方法；序列覆写版逐 step 取子图、掐头去尾后 addEdge 串接（base.ts:2189-2220）',
      ],
    ],
    [
      '以为链是嵌套结构——pipe 吸并后无论链多长都是一条扁平 RunnableSequence，invoke 只有一层 wrapper run',
      '给 pipe 传对象以为得到单步——对象会被 _coerceToRunnable 转成 RunnableMap 并行扇出，这是语法糖不是 bug',
      '在 invoke 循环外自行 await 而不用 raceWithSignal——链的每步都做 signal 竞速（base.ts:2020），绕开就丢了 AbortSignal 传播',
    ],
  ),
  'framework',
)
