import { L, withKind } from '../../course-builders.ts'

export const L27 = withKind(
  L(
    'L27',
    8,
    '四大支柱 invoke/batch/stream/transform 与降级链：默认实现即行为说明书',
    3,
    ['L16'],
    ['lc-runnable-pillars'],
    [
      '能逐行说出 Runnable 基类对 batch/stream/transform 三个能力的默认实现，并解释它们之间的降级依赖方向',
      '能解释 _callWithConfig 与 _transformStreamWithConfig 两个通用骨架如何统一回调生命周期与 AbortSignal 处理',
      '能判断一个自定义 Runnable 子类最少需要覆写哪个方法、其余能力各自退化成什么行为',
    ],
    `### 一个抽象方法，三个默认降级

从本课起进入模块三：Runnable 与组合。L16 里我们看过 BaseChatModel.invoke 的全链路——但那是模型层；这一课下沉到所有一切的基座 \`Runnable\` 抽象类。它的类注释只有一句话：*A Runnable is a generic unit of work that can be invoked, batched, streamed, and/or transformed*。这四个动词就是本课全部剧情。

\`\`\`ts
export abstract class Runnable<
  RunInput = any,
  RunOutput = any,
  CallOptions extends RunnableConfig = RunnableConfig,
> extends Serializable {
  protected lc_runnable = true;

  abstract invoke(
    input: RunInput,
    options?: Partial<CallOptions>
  ): Promise<RunOutput>;
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:125-149（commit 7704471）*

整个抽象类**只有 invoke 是 abstract**。这不是偷懒，而是一份刻意写进代码的「行为说明书」：只要你能算出单个输入的结果，batch、stream、transform 三个能力就自动到手——只是形态打折。降级链是单向的：stream 的默认实现调 invoke，transform 的默认实现调 stream（也就是再间接调 invoke），覆写一层就能修复一层的能力。

### 默认 batch：N 次 invoke + 并发闸门

\`\`\`ts
async batch(
  inputs: RunInput[],
  options?: Partial<CallOptions> | Partial<CallOptions>[],
  batchOptions?: RunnableBatchOptions
): Promise<(RunOutput | Error)[]> {
  const configList = this._getOptionsList(options ?? {}, inputs.length);
  const maxConcurrency =
    configList[0]?.maxConcurrency ?? batchOptions?.maxConcurrency;
  const caller = new AsyncCaller({
    maxConcurrency,
    onFailedAttempt: (e) => {
      throw e;
    },
  });
  const batchCalls = inputs.map((input, i) =>
    caller.call(async () => {
      try {
        const result = await this.invoke(input, configList[i]);
        return result;
      } catch (e) {
        if (batchOptions?.returnExceptions) {
          return e as Error;
        }
        throw e;
      }
    })
  );
  return Promise.all(batchCalls);
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:262-290（commit 7704471）*

三个要点值得停一停。第一，每个输入各自拿一份 config（\`_getOptionsList\` 负责展开成数组，L28 细讲），所以 batch 内部不是共享状态的黑盒，而是 N 次独立 invoke 的并发编排。第二，\`returnExceptions: true\` 时错误被捕获后**作为 Error 元素放进结果数组**，否则原样抛出——同一个 API 两种错误哲学，靠重载签名区分（base.ts:244-260 三个重载正是为了让 TS 推出「结果是否含 Error」）。第三，AsyncCaller 传入了 \`onFailedAttempt: (e) => { throw e; }\`，等于显式关掉了 AsyncCaller 自带的重试（默认 maxRetries 是 6）——batch 场景要不要重试，交给外层 withRetry 决定，默认实现自己不抢戏。并发细节留到 L28。

### 默认 stream：一个元素的「流」与首块缓冲

\`\`\`ts
async *_streamIterator(
  input: RunInput,
  options?: Partial<CallOptions>
): AsyncGenerator<RunOutput> {
  yield this.invoke(input, options);
}

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

*— libs/langchain-core/src/runnables/base.ts:298-324（commit 7704471）*

默认 \`_streamIterator\` 只有一行：把 invoke 的完整结果 yield 出去。所以「不覆写就没有流式」不是比喻，是字面事实。而 \`stream()\` 本体做了一件对所有子类都成立的事：**先 await 首块再返回流对象**（\`await wrappedGenerator.setup\`）。源码注释直言动机——让初始错误立刻浮出。如果模型名写错、密钥无效，异常会在 \`await chain.stream(...)\` 这一行抛出，而不是等消费者 \`for await\` 时才炸。这个设计的代价与收益在 L29 逐行拆。

### 默认 transform 与两个通用骨架

\`\`\`ts
async *transform(
  generator: AsyncGenerator<RunInput>,
  options: Partial<CallOptions>
): AsyncGenerator<RunOutput> {
  let finalChunk;
  for await (const chunk of generator) {
    if (finalChunk === undefined) {
      finalChunk = chunk;
    } else {
      // Make a best effort to gather, for any type that supports concat.
      finalChunk = this._concatOutputChunks(finalChunk, chunk as any);
    }
  }
  yield* this._streamIterator(finalChunk, ensureConfig(options));
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:656-672（commit 7704471）*

默认 transform 的策略是「攒齐再说」：把输入流全部 concat 成 finalChunk（\`_concatOutputChunks\` 委托给 utils 的 concat 函数，base.ts:460-463），再走 \`_streamIterator\`。增量能力只能来自子类覆写。

无论子类怎么覆写 invoke，只要它走 \`_callWithConfig\` 这个骨架，回调生命周期就被统一接管：

\`\`\`ts
const config = ensureConfig(options);
const callbackManager_ = await getCallbackManagerForConfig(config);
const runManager = await callbackManager_?.handleChainStart(
  this.toJSON(),
  _coerceToDict(input, "input"),
  config.runId,
  config?.runType,
  undefined,
  undefined,
  config?.runName ?? this.getName()
);
delete config.runId;
let output;
try {
  const promise = func.call(this, input, config, runManager);
  output = await raceWithSignal(promise, config.signal);
} catch (e) {
  await runManager?.handleChainError(e);
  throw e;
}
await runManager?.handleChainEnd(_coerceToDict(output, "output"));
return output;
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:371-392（commit 7704471）*

start → 执行（与 signal 竞速）→ end/error，四段结构固定；\`delete config.runId\` 保证子 run 不会复用父 run 的 id（L35 展开）。流式侧的对应骨架是 \`_transformStreamWithConfig\`（base.ts:470-586）：它额外做两件事——边流边聚合 finalInput/finalOutput 供回调补报输入输出（\`lc_defers_inputs: true\` 延迟上报），并在检测到 streamEvents/logStream 专用 handler 时用 \`tapOutputIterable\` 给输出流打上事件 tap（base.ts:535-552）。这两个骨架解释了为什么 LCEL 链路里的每一跳都能被追踪：**框架在骨架层统一埋点，子类只管算**。

| 支柱 | 默认实现 | 降级来源 | 覆写后获得 |
|---|---|---|---|
| invoke | abstract，必须实现 | — | 一切的基础 |
| batch | N 次 invoke 并发 | invoke | 真·批量接口（如模型批量生成） |
| stream | yield invoke 结果 | invoke | 逐块流式输出 |
| transform | 攒齐输入再 stream | stream←invoke | 输入输出同时增量 |

### 身份三件套：lc_runnable、isRunnable 与 getName

四个支柱之外，Runnable 还有一组支撑整个组合子生态的「身份设施」。类体的开头就是品牌标记与命名方法：

\`\`\`ts
protected lc_runnable = true;

name?: string;

getName(suffix?: string): string {
  const name =
    this.name ?? (this.constructor as any).lc_name() ?? this.constructor.name;
  return suffix ? \`\${name}\${suffix}\` : name;
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:135-144（commit 7704471）*

\`lc_runnable\` 是受保护的品牌属性；静态判型 \`Runnable.isRunnable(thing)\` 只检查这一个字段（base.ts:1196-1198），底层 \`isRunnableInterface\` 的实现是 \`thing ? thing.lc_runnable : false\`（runnables/utils.ts:5-7）——**鸭子类型而非 instanceof**，跨实例、跨包副本同样成立，与 L05 的 Symbol.for 判型属同一工程策略；L30 的 \`_coerceToRunnable\` 与 \`isRunnableSequence\`（base.ts:2248）都依赖它。\`getName\` 的三级回退（实例 name → 类静态 lc_name → 构造器名）则是回调命名的源头：\`_callWithConfig\` 里 \`config?.runName ?? this.getName()\`（base.ts:380）让每个 run 在追踪树上都有可读名字；lc_name 是各子类显式声明的稳定名——序列化往返后构造器名可能漂移，lc_name 不会。命名机制的工程意义可以和默认 getGraph 一起看：基类的图视图固定画 \`getName()Input → 本体 → getName()Output\` 三节点，但 input/output 的 schema 都是 \`z.any()\` 占位，源码里留着两条 TODO 注释 *"Add input schema for runnables"* / *"Add output schemas for runnables"*（base.ts:588-608）——**图承载拓扑、暂不承载类型**。这与「唯一 abstract 是 invoke」的设计一脉相承：基类只承诺结构与行为的最小公约数，其余交给子类填充；读懂这层克制，后面四课的组合子才不会读成「魔法」。判型的边界也值得说破：\`lc_runnable\` 判定只看一个真值字段，意味着任何带该标记的对象都会被 \`_coerceToRunnable\` 当成 Runnable——宽容换来了跨实例互通，也把责任压给实现者（伪造标记的对象会在 invoke 时才炸）。getName 的 \`suffix\` 参数同样是这套机制的细节：默认图节点名的 \`\${this.getName()}Input\` / \`\${this.getName()}Output\`（base.ts:593,601）就是靠后缀拼接出来的，追踪树上看到的 \`RunnableSequenceInput\` 之类节点名即源于此，而不是写死的字符串。

### 本课小结

- Runnable 的抽象面刻意收窄到 **invoke 一个方法**；batch/stream/transform 的默认实现构成单向降级链：transform←stream←invoke，覆写一层恢复一层能力。
- 默认 batch 用 AsyncCaller 并发跑 N 次 invoke，\`returnExceptions\` 决定错误入数组还是抛出，且**主动禁用了 AsyncCaller 的默认重试**（onFailedAttempt 直接 throw）。
- \`stream()\` 统一做了首块缓冲（AsyncGeneratorWithSetup），把初始化错误提前到调用点而非消费点——细节是 L29 的主题。
- \`_callWithConfig\` / \`_transformStreamWithConfig\` 是回调生命周期与取消语义的统一骨架，子类不经过它们就脱离了追踪体系。
- 下一课沿降级链下行，逐行读 batch 的并发工程：AsyncCaller、maxConcurrency 与 returnExceptions 的工程取舍。
`,
    null,
    [
      {
        text: 'Runnable 基类中唯一声明为 abstract 的方法是？',
        options: [
          'invoke、batch、stream、transform 四个都是 abstract',
          '只有 invoke 是 abstract，batch/stream/transform 都有可用的默认实现',
          'batch 和 transform 是 abstract，stream 有默认实现',
          '四个都不是 abstract，全部有默认实现',
        ],
        answer: 1,
        explain:
          'base.ts:146-149 只声明了 abstract invoke(input, options?): Promise<RunOutput>。batch 默认循环调用 invoke（base.ts:262-290），stream 默认包装 _streamIterator（base.ts:311-324），transform 默认缓冲输入后转 stream（base.ts:656-672），三者都可用。选项 A 高估了抽象面；选项 C 把 batch 也当 abstract；选项 D 忽略了 invoke 没有任何合理默认值——基类不知道子类要算什么。',
        concept: 'lc-runnable-pillars',
      },
      {
        text: '一个子类只覆写了 invoke，其余全部用默认实现。对它调用 stream() 会得到什么？',
        options: [
          '抛出 Not implemented 错误',
          '一个流式逐块输出的流',
          '一个只 yield 一个元素的「流」，该元素就是 invoke 的完整结果——流式被降级为单发',
          '返回 null',
        ],
        answer: 2,
        explain:
          '默认 _streamIterator 就是 yield this.invoke(input, options)（base.ts:298-303），所以不覆写流式的子类在 stream() 里只会拿到一个块。选项 A 混淆了模型层的 _streamResponseChunks（那个才默认抛错，L17 已讲）；选项 B 描述的是覆写后的行为；选项 D 无出处。这正是「降级链」的含义：stream ← invoke。',
        concept: 'lc-runnable-pillars',
      },
      {
        text: '默认 transform(generator) 的行为是？',
        options: [
          '边读输入边产出输出，天然支持增量计算',
          '把输入 generator 的所有 chunk 用 _concatOutputChunks 尽力拼接成 finalChunk，再走 _streamIterator 一次性流出',
          '直接把 generator 原样透传给下游',
          '抛错，要求子类必须覆写',
        ],
        answer: 1,
        explain:
          'base.ts:656-672 的默认实现先 for await 收集全部输入块并尝试 concat 聚合（失败即抛），然后 yield* this._streamIterator(finalChunk)。也就是说 transform 的默认降级来源是 stream，而 stream 的降级来源是 invoke——两级降级后等价于「攒齐输入调一次 invoke」。选项 A 描述的是子类覆写 transform 后才能获得的能力；选项 C 无此实现；选项 D 与事实相反，默认实现恰恰保证了不覆写也能用。',
        concept: 'lc-runnable-pillars',
      },
      {
        text: '_callWithConfig 骨架在 func 抛错时会做哪两件事？',
        options: [
          '静默吞掉错误并返回 undefined',
          '调用 runManager.handleChainError 上报回调，然后把错误原样 rethrow',
          '立即重试一次 func',
          '只把错误写进 console，不影响调用方',
        ],
        answer: 1,
        explain:
          'base.ts:384-390 的结构是 try { ... raceWithSignal(promise, config.signal) } catch (e) { await runManager?.handleChainError(e); throw e; }——回调系统先收到错误事件（追踪树才能标记 run 失败），随后错误继续向上抛，绝不吞。选项 A/D 描述的是「尽力而为」的 handler 内部行为（L36 的 raiseError 语义），不是骨架行为；选项 C 属于 withRetry 的职责，与 _callWithConfig 无关。',
        concept: 'lc-runnable-pillars',
      },
    ],
    [
      [
        'Runnable',
        'langchain-core 对「可调用工作单元」的最小抽象：可 invoke、可 batch、可 stream、可 transform（base.ts:121-124 类注释）',
      ],
      ['降级链', '四个支柱间的默认依赖方向：stream←invoke、transform←stream；覆写越少能力越弱，但永远可用'],
      [
        '_callWithConfig',
        'Runnable 的同步调用通用骨架：ensureConfig → handleChainStart → raceWithSignal → handleChainEnd/Error（base.ts:360-393）',
      ],
      [
        'raceWithSignal',
        '把任意 Promise 与 AbortSignal 竞速的工具，中断时抛出 AbortError，是全库取消语义的统一入口',
      ],
    ],
    [
      '以为 stream() 不覆写也能流式——默认 _streamIterator 只 yield 一个完整结果，「流」只是形似',
      '以为 transform 一定要子类自己写——基类给了缓冲降级版，不写也能跑，只是丧失增量性',
      '在子类 invoke 里绕过 _callWithConfig 直接干活——回调树（handleChainStart/End）不会生长，追踪会断链',
    ],
  ),
  'framework',
)
