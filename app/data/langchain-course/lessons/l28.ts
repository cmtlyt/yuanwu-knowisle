import { L, withKind } from '../../course-builders.ts'

export const L28 = withKind(
  L(
    'L28',
    8,
    'batch 的并发工程：AsyncCaller、maxConcurrency、returnExceptions',
    2,
    ['L27'],
    ['lc-batch-concurrency'],
    [
      '能画出 batch 默认实现的调用链：_getOptionsList → AsyncCaller(p-queue) → N 次 invoke → Promise.all，并指出每一步的语义',
      '能解释 AsyncCaller 的 maxConcurrency/maxRetries 默认值，以及 batch 为何用 onFailedAttempt throw 关掉重试',
      '能说明 returnExceptions 与 RunnableRetry._batch 两种「错误不炸全局」策略的差别并按场景选型',
    ],
    `### batch 是第一块被「默认实现」的支柱

L27 给了 batch 的骨架，本课把并发工程摊开：默认 batch 的本质是**一次用 AsyncCaller 编排的 N 路 invoke**。它要同时回答三个问题——配置怎么分发（N 份 config）、并发怎么限流（p-queue）、错误怎么收场（returnExceptions 或炸全局）。这三个问题的答案全部写在 base.ts 的 60 行里。

### 配置分发：_getOptionsList 与 runId 警告

\`\`\`ts
protected _getOptionsList<O extends CallOptions & { runType?: string }>(
  options: Partial<O> | Partial<O>[],
  length = 0
): Partial<O>[] {
  if (Array.isArray(options) && options.length !== length) {
    throw new Error(
      \`Passed "options" must be an array with the same length as the inputs, but got \${options.length} options for \${length} inputs\`
    );
  }

  if (Array.isArray(options)) {
    return options.map(ensureConfig);
  }
  if (length > 1 && !Array.isArray(options) && options.runId) {
    console.warn(
      "Provided runId will be used only for the first element of the batch."
    );
    const subsequent = Object.fromEntries(
      Object.entries(options).filter(([key]) => key !== "runId")
    );

    return Array.from({ length }, (_, i) =>
      ensureConfig(i === 0 ? options : subsequent)
    ) as Partial<O>[];
  }
  return Array.from({ length }, () => ensureConfig(options));
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:208-234（commit 7704471）*

三条分支对应三种输入形态：数组（长度必须精确匹配，否则抛错）；单对象带 runId（剔除后仅首项保留，并 console.warn——runId 是 run 的身份，批量复用一个 id 会让追踪树错乱）；单对象不带 runId（最常见路径，逐项 ensureConfig）。注意 ensureConfig 每次调用都返回新对象（config.ts:153-240），所以不存在「共享引用」陷阱；真正要小心的是数组形态下**每个 config 自带的 runId 也只对自己那一项生效**，与追踪树的一致性由调用方负责。

### 并发闸门：AsyncCaller 与 p-queue

\`\`\`ts
export class AsyncCaller {
  constructor(params: AsyncCallerParams) {
    this.maxConcurrency = params.maxConcurrency ?? Infinity;
    this.maxRetries = params.maxRetries ?? 6;
    this.onFailedAttempt =
      params.onFailedAttempt ?? defaultFailedAttemptHandler;

    const PQueue = (
      "default" in PQueueMod ? PQueueMod.default : PQueueMod
    ) as typeof PQueueMod;
    this.queue = new PQueue({ concurrency: this.maxConcurrency });
  }

  private callWithRetries<...>(
    retries: AsyncCallerParams["maxRetries"],
    callable: T,
    args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> {
    return this.queue.add(
      () =>
        pRetry(
          () =>
            callable(...args).catch((error) => {
              if (error instanceof Error) {
                throw error;
              } else {
                throw new Error(error);
              }
            }),
          {
            onFailedAttempt: ({ error }) => this.onFailedAttempt?.(error),
            retries,
            randomize: true,
          }
        ),
      { throwOnTimeout: true }
    );
  }
}
\`\`\`

*— libs/langchain-core/src/utils/async_caller.ts:381-433（commit 7704471）*

AsyncCaller 是 core 依赖表里 p-queue 的落点（E04 台账：core 直接依赖 p-queue）：所有任务先进 PQueue 排队，\`concurrency\` 即 maxConcurrency，默认 Infinity（不排队）；每个出队任务再包一层 pRetry，默认 6 次、\`randomize: true\` 给退避加抖动。defaultFailedAttemptHandler（async_caller.ts:258-330）内置了一整套「哪些错误不值得重试」的判断：400/401/403/404 等确定性客户端错误、insufficient_quota、用户主动 AbortError 都会被打上不可重试标记。这套分类是模型调用层共享的基础设施，batch 只是它的一位客户。

关键在 batch 的用法：

\`\`\`ts
const caller = new AsyncCaller({
  maxConcurrency,
  onFailedAttempt: (e) => {
    throw e;
  },
});
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:270-275（commit 7704471）*

\`onFailedAttempt\` 直接 throw，意味着 pRetry 第一次失败就终止——**batch 默认实现主动放弃了 AsyncCaller 的重试能力**。为什么？如果 batch 内部重试 6 次、外层 withRetry 又重试 3 次，最坏情况一个坏输入放大出 18 次请求。把重试权上交给组合层（L34 的 RunnableRetry），是控制放大系数的纪律。同时 maxConcurrency 的读取只取 \`configList[0]\`——并发闸是 batch 级全局值，per-input 的 maxConcurrency（除第一项外）不生效，这是一个少有人注意的边界。

### 错误收场：两种「部分失败」策略

默认实现的收场代码只有五行：\`returnExceptions: true\` 时 catch 住并 \`return e as Error\`（错误成为结果数组的一个元素），否则 rethrow 让 Promise.all 整体 reject（base.ts:282-286）。也就是说默认 batch 是**要么全对、要么炸全局**（带开关可以把错误降级为数据）。这继承了 ToolMessage「错误即数据」的哲学（L13），但粒度是批级。

对照另一位客户——RunnableRetry._batch 的细粒度策略：

\`\`\`ts
await pRetry(
  async (attemptNumber: number) => {
    const remainingIndexes = inputs
      .map((_, i) => i)
      .filter(
        (i) =>
          resultsMap[i.toString()] === undefined ||
          resultsMap[i.toString()] instanceof Error
      );
    const remainingInputs = remainingIndexes.map((i) => inputs[i]);
    const results = await super.batch(remainingInputs, patchedConfigs, {
      ...batchOptions,
      returnExceptions: true,
    });
    ...
    resultsMap[resultMapIndex.toString()] = result;
    ...
  },
  { ... retries: Math.max(this.maxAttemptNumber - 1, 0), randomize: true }
);
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:1825-1873（commit 7704471）*

每轮 pRetry 只重跑「上一轮还是 Error」的下标，成功项写进 resultsMap 就不再动；\`returnExceptions: true\` 在这里是实现前提——没有它，单个失败项会把整轮 batch 炸掉，细粒度重试无从谈起。最终结果按 \`parseInt(key)\` 排序还原原始顺序（base.ts:1879-1883）。选型建议：**偶发限流/网络抖动用 withRetry 包 batch（细粒度重试），异构输入容忍部分失败用 returnExceptions（错误降级为数据）**，两者可叠加但层次要分清——外层重试看到的是已含 Error 元素的数组，它自己决定要不要再来一轮。

### 哪些错误不值得重试：defaultFailedAttemptHandler

AsyncCaller 默认的失败处理器（async_caller.ts:258-330）是一份「重试价值判断」的分类表，规则按优先级排列：

\`\`\`ts
// Honor a verdict already reached inside the callable, e.g. by a provider.
if (getRetryable(error) === false) {
  throw error;
}
if (
  error.message.startsWith("Cancel") ||
  error.message.startsWith("AbortError") ||
  error.name === "AbortError"
) {
  // Deliberate cancellation, not a failure worth another attempt.
  throw stampRetryable(error, false);
}
const status = getResponseStatus(error) ?? getDirectStatus(error);
if (status && STATUS_NO_RETRY.includes(+status)) {
  // Deterministic client error; retrying it unchanged fails identically.
  throw stampRetryable(error, false);
}
\`\`\`

*— libs/langchain-core/src/utils/async_caller.ts:262-295 裁剪（commit 7704471）*

逐条读：**provider 已下结论的尊重结论**——错误对象上若带 \`retryable === false\` 的裁决标记，直接终止重试；**主动取消不是失败**——Cancel/AbortError 被打上不可重试标记（用户按了停止键，再试就是违背意图）；**STATUS_NO_RETRY 名单里的确定性客户端错误**（400/401/403/404 等）原样终止——注释直言 *retrying it unchanged fails identically*。之后的分支更细：\`insufficient_quota\` 被改名为 \`InsufficientQuotaError\` 并盖上 rate-limit 元数据（action: "stop"）；\`classifyRateLimitError\` 把限流错误分成两路——action 为 "wait" 的容量型限流（等退避即可恢复）**保留重试**并盖元数据，action 为 "stop" 的配额耗尽改名 \`RateLimitQuotaExhaustedError\` 终止，"capacity" 型改名 \`RateLimitCapacityError\` 且可重试（async_caller.ts:300-330）。这套分类同时服务于 batch（本课）与模型 SDK 层的默认重试路径，是「错误分类先于重试策略」的完整实例：重试次数只是旋钮，**分类表才是方向盘**。

### 本课小结

- batch 默认实现 = _getOptionsList 分发 N 份独立 config → AsyncCaller(p-queue) 限流排队 → N 次 invoke → Promise.all 收束；配置分发对数组形态有**长度精确匹配**的硬校验。
- AsyncCaller 默认 maxConcurrency=Infinity、maxRetries=6，但 batch 用 onFailedAttempt throw 关掉重试，把重试权留给组合层，避免双层重试放大流量。
- maxConcurrency 只从 configList[0] 读取——它是 batch 级全局闸，per-input 配置除首项外不生效。
- 错误收场两档：默认「炸全局」+ returnExceptions 把错误降级为数据；RunnableRetry._batch 则以 returnExceptions 为前提做按下标的细粒度重试并保留部分成功。
- 下一课转向另一个支柱的暗层：stream() 为什么要在返回前先 await 首块——IterableReadableStream 与首块缓冲的工程动机。
`,
    null,
    [
      {
        text: 'batch 传入单个 options 对象与 100 个 inputs 时，每个 input 拿到的 config 是？',
        options: [
          '共享同一个对象引用，改一个全变',
          '每个 input 各拿一份经 ensureConfig 展开的独立副本',
          '只有第一个 input 拿 config，其余全部裸奔',
          '直接抛错，要求 options 必须是数组',
        ],
        answer: 1,
        explain:
          '_getOptionsList（base.ts:208-234）在 options 不是数组时用 Array.from({length}, () => ensureConfig(options)) 为每个输入独立展开。选项 A 错：每次 ensureConfig 都新建对象；选项 C 错：invoke(input, configList[i]) 每项都传；选项 D 错：单个对象是合法输入，数组也合法但**长度必须等于 inputs 数量**，不匹配才抛错（base.ts:212-216）。',
        concept: 'lc-batch-concurrency',
      },
      {
        text: 'AsyncCaller 构造时 maxConcurrency 与 maxRetries 的默认值分别是？',
        options: ['10 和 3', 'Infinity 和 6', '5 和 0', 'Infinity 和 0'],
        answer: 1,
        explain:
          'async_caller.ts:382-383：this.maxConcurrency = params.maxConcurrency ?? Infinity; this.maxRetries = params.maxRetries ?? 6。并发默认不设限、重试默认 6 次（指数退避，内部用 pRetry，randomize: true 加抖动）。选项 A 是常见的直觉猜测但无出处；选项 C/D 与源码相反。',
        concept: 'lc-batch-concurrency',
      },
      {
        text: 'batch 默认实现里 AsyncCaller 的重试为什么实际不生效？',
        options: [
          'batch 把 maxRetries 设成了 0',
          '传入的 onFailedAttempt 直接 throw，pRetry 的 onFailedAttempt 抛错会终止重试',
          'Promise.all 会吞掉重试信号',
          'AsyncCaller 在 batch 场景下不走 pRetry',
        ],
        answer: 1,
        explain:
          'base.ts:270-275 构造 AsyncCaller 时传 onFailedAttempt: (e) => { throw e; }。AsyncCaller.callWithRetries 里 pRetry 的每次失败都会先走这个 handler（async_caller.ts:424），handler 抛错即终止重试循环。这是有意设计：batch 的重试语义交给外层 withRetry/RunnableRetry，避免两层重试叠加放大流量。选项 A 错：maxRetries 默认仍是 6，只是被 handler 短路；选项 C、D 均无出处。',
        concept: 'lc-batch-concurrency',
      },
      {
        text: 'maxConcurrency 取值的优先级是？',
        options: [
          '只看 batchOptions.maxConcurrency',
          'configList[0]?.maxConcurrency ?? batchOptions?.maxConcurrency——config 里的值优先，batchOptions 兜底',
          '只看 options 数组第一项',
          '恒为 Infinity，不可配置',
        ],
        answer: 1,
        explain:
          'base.ts:268-269 的原式即 configList[0]?.maxConcurrency ?? batchOptions?.maxConcurrency。注意它只看 configList 第一项——batch 级并发闸是全局一个值，不是每输入一个。选项 A 忽略了 config 通道；选项 C 描述片面；选项 D 与源码相反，这正是它最值得配置的原因。',
        concept: 'lc-batch-concurrency',
      },
      {
        text: 'RunnableRetry._batch 与默认 batch 在错误处理上的关键差别是？',
        options: [
          '_batch 会让失败的 input 无限重试',
          '_batch 以 returnExceptions: true 跑每轮 super.batch，把 Error 记进 resultsMap，下一轮 pRetry 只重跑失败的下标，最终按原始顺序还原结果',
          '_batch 遇到第一个错误立即抛出并放弃全部输入',
          '_batch 不支持 returnExceptions',
        ],
        answer: 1,
        explain:
          'base.ts:1817-1884：每轮把上一轮仍为 Error 的下标挑出来重跑（remainingIndexes），成功后写 resultsMap；只有整轮仍有失败才抛 firstException 驱动 pRetry 下一轮。所以**部分成功会被保留**，重试是细粒度的。选项 A 错：重试次数受 maxAttemptNumber 限制（默认 3）；选项 C 描述的是默认 batch + returnExceptions=false 的行为；选项 D 与源码相反，_batch 恰恰用 returnExceptions: true 作为实现前提。',
        concept: 'lc-batch-concurrency',
      },
    ],
    [
      [
        'AsyncCaller',
        'core 对「带并发与重试的异步调用」的封装：内部 p-queue 排队 + pRetry 重试（async_caller.ts:372-433）',
      ],
      [
        'maxConcurrency',
        '并发闸门：限制同时在途的请求数，默认 Infinity；batch 从 config[0].maxConcurrency 或 batchOptions 读取',
      ],
      [
        'returnExceptions',
        'batchOptions 开关：true 时每个失败项以 Error 对象占位进结果数组，false 时首个错误抛出炸掉整个 batch',
      ],
      [
        '_getOptionsList',
        '把单个 options 或数组展开成与 inputs 等长的 config 列表的内部工具，附带 runId 只给第一项的警告（base.ts:208-234）',
      ],
    ],
    [
      '以为 batch 自带重试——默认实现用 onFailedAttempt throw 显式关掉了 AsyncCaller 的 6 次默认重试，要重试得套 withRetry',
      '传入 options 数组但长度与 inputs 不一致——_getOptionsList 会直接抛错，报错信息里带两个长度（base.ts:212-216）',
      '在 options 对象里传 runId 跑批量——只有第一个输入会用它，其余被剔除，且控制台有 console.warn 提示（base.ts:221-224）',
    ],
  ),
  'theory',
)
