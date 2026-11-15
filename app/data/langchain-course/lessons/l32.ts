import { L, withKind } from '../../course-builders.ts'

export const L32 = withKind(
  L(
    'L32',
    9,
    'RunnableLambda 行为分派：返回 Runnable 委托（recursionLimit:25）、返回 AsyncIterable 流式',
    3,
    ['L30'],
    ['lc-runnable-lambda'],
    [
      '说出 RunnableLambda._invoke 对三种返回值的分派：Runnable → 委托调用（recursionLimit 递减）、AsyncIterable → 聚合为最终值、IterableIterator → 同左',
      '解释构造函数对 traceable 函数的改道（RunnableTraceable.from）与 AsyncLocalStorage 如何把 config 隐式注入 lambda 第二参',
      '区分 _invoke 与 _transform 对 AsyncIterable 的不同处理：前者聚合、后者逐块 yield',
    ],
    `### lambda 的三种命运

组合子家族里 RunnableLambda 最「民主」：它不对函数做任何语义约定，而是**看函数返回什么来决定自己做什么**。返回一个值，它就是终点；返回一个 Runnable，它变成委托代理；返回一个生成器，它变成流式源。加上构造期对 traceable 函数的改道，一个类承载四种行为。本课按「构造改道 → ALS 注入 → invoke 分派 → transform 分派」读 base.ts:2450-2852 区段。

### 构造即分流：traceable 改道

\`\`\`ts
constructor(fields: {
  func: RunnableFunc<...> | TraceableFunction<...>;
}) {
  if (isTraceableFunction(fields.func)) {
    // oxlint-disable-next-line no-constructor-return
    return RunnableTraceable.from(fields.func) as unknown as RunnableLambda<
      RunInput, RunOutput, CallOptions
    >;
  }

  super(fields);

  assertNonTraceableFunction(fields.func);
  this.func = fields.func;
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2589-2617（commit 7704471）*

traceable 是 LangSmith 的装饰器 API（把普通函数纳入 traceable 追踪体系）。RunnableLambda 检测到它就**在构造函数里返回另一个实例**——RunnableTraceable——用户拿到的已经不是 RunnableLambda。RunnableTraceable 的 invoke 也不同：\`this.func(patchConfig(config, { callbacks }), input)\`（base.ts:2475-2478），config 是**第一参**，追踪完全交给 traceable 体系而非 getChild 子回调。后面的 assertNonTraceableFunction 是防内部 bug 的双重保险（报错文案 This shouldn't happen 自证其防御性质）。这是「装饰器生态」里特殊的一环：L34 的 withRetry/withConfig 都包 wrapper 类，traceable 却是换实现类。

### ALS 注入与 _invoke 的三路分派

\`\`\`ts
async _invoke(
  input: RunInput,
  config?: Partial<CallOptions>,
  runManager?: CallbackManagerForChainRun
) {
  return new Promise<RunOutput>((resolve, reject) => {
    const childConfig = patchConfig(config, {
      callbacks: runManager?.getChild(),
      recursionLimit: (config?.recursionLimit ?? DEFAULT_RECURSION_LIMIT) - 1,
    });
    void AsyncLocalStorageProviderSingleton.runWithConfig(
      pickRunnableConfigKeys(childConfig),
      async () => {
        try {
          let output = await this.func(input, {
            ...childConfig,
          });
          if (output && Runnable.isRunnable(output)) {
            if (config?.recursionLimit === 0) {
              throw new Error("Recursion limit reached.");
            }
            output = await output.invoke(input, {
              ...childConfig,
              recursionLimit:
                (childConfig.recursionLimit ?? DEFAULT_RECURSION_LIMIT) - 1,
            });
          } else if (isAsyncIterable(output)) {
            let finalOutput: RunOutput | undefined;
            for await (const chunk of consumeAsyncIterableInContext(
              childConfig,
              output
            )) {
              config?.signal?.throwIfAborted();
              ...
              finalOutput = this._concatOutputChunks(finalOutput, chunk as any);
              ...
            }
            output = finalOutput as typeof output;
          } else if (isIterableIterator(output)) { ...同款聚合... }
          resolve(output);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2669-2742（commit 7704471，有裁剪）*

先看注入的双轨结构：childConfig 经 patchConfig 换上新子回调并把 recursionLimit 减 1；\`func(input, {...childConfig})\` 是**显式**第二参；\`runWithConfig(pickRunnableConfigKeys(childConfig), ...)\` 是**隐式** ALS 上下文。后者意味着函数体内任何不带参数的 Runnable 调用（比如 \`model.invoke(x)\`）仍能被 ensureConfig 从 ALS 取到 callbacks/tags 等配置——lambda 不会成为追踪链的断点。分派规则逐条背：**Runnable → 委托执行**（注意传的是原始 input，且 recursionLimit 每层递减、归零抛 Recursion limit reached.，config.ts:5 的 DEFAULT_RECURSION_LIMIT = 25 就是上限）；**AsyncIterable / IterableIterator → 逐块消费并 concat 聚合成单值**（聚合并非必须——concat 失败时 catch 里直接取最后一个 chunk，base.ts:2713-2715 的 catch 分支）；**其他值 → 原样 resolve**。消费生成器用的是 consumeAsyncIterableInContext（iter.ts:76-94）——每次 next() 都重新包进 runWithConfig，用户生成器体内的异步间隔不会丢 ALS 上下文。

### _transform 的分派：AsyncIterable 逐块 yield

\`\`\`ts
const output = await new Promise<RunOutput | Runnable>((resolve, reject) => {
  void AsyncLocalStorageProviderSingleton.runWithConfig(
    pickRunnableConfigKeys(childConfig),
    async () => {
      try {
        const res = await this.func(finalChunk as RunInput, {
          ...childConfig,
          config: childConfig,
        });
        resolve(res);
      } catch (e) {
        reject(e);
      }
    }
  );
});
if (output && Runnable.isRunnable(output)) {
  ...
  const stream = await output.stream(finalChunk as RunInput, childConfig);
  for await (const chunk of stream) {
    yield chunk;
  }
} else if (isAsyncIterable(output)) {
  for await (const chunk of consumeAsyncIterableInContext(
    childConfig,
    output
  )) {
    config?.signal?.throwIfAborted();
    yield chunk as RunOutput;
  }
} else if (isIterableIterator(output)) {
  for (const chunk of consumeIteratorInContext(childConfig, output)) {
    config?.signal?.throwIfAborted();
    yield chunk as RunOutput;
  }
} else {
  yield output;
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2782-2824（commit 7704471，有裁剪）*

与 _invoke 的镜像差异一眼可见：AsyncIterable 在这里是**逐块 yield** 而非聚合——lambda 返回生成器就自动获得流式输出，这是 LCEL 流式管线里「用户函数也能流」的机制。返回 Runnable 时改调 \`output.stream(...)\`（而非 invoke），委托在流式路径上仍然成立。**「lambda 返回什么决定行为」在两条支柱上各有一份对照实现**：invoke 路径聚合，transform 路径透传。stream() 本身则亲自走 transform（base.ts:2838-2852：包单元素生成器 → AsyncGeneratorWithSetup → fromAsyncGenerator），与 L27/L31 的套路完全一致——三个流式组合子的 stream() 是同一段代码的复用。

### RunnableTraceable 的另一套调用约定

改道产物 RunnableTraceable 的调用约定与 RunnableLambda 是两个世界，值得并排看：

\`\`\`ts
async invoke(input, options?) {
  const [config] = this._getOptionsList(options ?? {}, 1);
  const callbacks = await getCallbackManagerForConfig(config);
  const promise = this.func(
    patchConfig(config, { callbacks }),
    input
  ) as Promise<RunOutput>;
  return raceWithSignal(promise, config?.signal);
}

static from(func: AnyTraceableFunction) {
  return new RunnableTraceable({ func });
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:2470-2513 裁剪（commit 7704471）*

两个约定差异一眼可见。**参数顺序反转**：traceable 函数的第一参是 config（经 patchConfig 挂上回调管理器），第二参才是输入，与 RunnableLambda 的 \`(input, config)\` 相反——这就是「调用约定都变了」这条 pitfall 的实指，迁移函数时签名要跟着翻。**不走 _callWithConfig**：没有 handleChainStart/End 的 wrapper run，core 回调树在这条路径上是旁观者，追踪完全交给 LangSmith 的 traceable 体系。流式侧 \`_streamIterator\`（base.ts:2481-2508）先 await invoke 拿结果，再按返回值形态分流：AsyncIterable 就 for await 逐块 yield（每块前 throwIfAborted），同步迭代器手动 next 循环，其余单值 yield——traceable 函数返回生成器同样能流式，只是消费发生在 _streamIterator 而非 transform 管线。**设计动机**可以一句话概括：traceable 是 LangSmith 生态的既有装饰器，改道让它保持原有调用约定与追踪方式，RunnableLambda 不必也不该兼容两套函数签名——用「换实现类」替代「双形态兼容」，比在 _invoke 里塞 if 分支干净得多；这与 L34 的「修饰即包装」构成装饰器生态的两极，一个换内核、一个包外壳。invoke 的开头也别漏看：\`this._getOptionsList(options ?? {}, 1)\`（base.ts:2471）——即使只有单输入也走配置展开管线，ensureConfig 的默认值与 ALS 隐式合并同样生效；末尾的 raceWithSignal 则保证 traceable 路径同样接受 AbortSignal 取消，取消语义并不因改道而缺席。

### 本课小结

- RunnableLambda 是「返回值驱动的行为分派」：值→输出；Runnable→委托执行（input 用原始值、recursionLimit 每层递减、上限 25）；AsyncIterable/迭代器→消费（invoke 聚合、transform 逐块 yield）。
- 构造期对 traceable 函数改道 RunnableTraceable：constructor-return 换实例，config 变第一参，追踪交给 LangSmith 体系。
- config 注入双轨并存：显式第二参 \`func(input, childConfig)\` + ALS runWithConfig 隐式上下文，lambda 体内嵌套调用不断追踪链。
- 流式三大组合子（Sequence/Map/Lambda）的 stream() 是同一套「单元素生成器 + AsyncGeneratorWithSetup + fromAsyncGenerator」复用。
- 下一课收束实用组合子：RunnableWithFallbacks 的错误保留策略、RunnableAssign 的字典扩展器，以及都建立在 pipe 之上的 pick/assign。
`,
    null,
    [
      {
        text: 'RunnableLambda 构造时传入的函数被 traceable() 包装过，会发生什么？',
        options: [
          '照常包装成 RunnableLambda，运行时打日志',
          '构造函数直接 return RunnableTraceable.from(fields.func)，改道到 LangSmith 追踪专用实现',
          '抛错，RunnableLambda 禁止 traceable 函数',
          '自动去掉 traceable 包装再包装',
        ],
        answer: 1,
        explain:
          "base.ts:2604-2611：if (isTraceableFunction(fields.func)) { return RunnableTraceable.from(fields.func) as unknown as RunnableLambda<...>; }——构造函数返回别的实例（constructor-return 技巧），oxlint 的 no-constructor-return 被显式豁免。选项 C 错：assertNonTraceableFunction（base.ts:2516-2544）只在「非改道路径」断言，是防御性内部检查，报错文案里写着 This shouldn't happen；选项 A/D 无出处，行为就是换实现类。",
        concept: 'lc-runnable-lambda',
      },
      {
        text: 'lambda 返回一个 Runnable 时，_invoke 的行为是？',
        options: [
          '把该 Runnable 作为输出直接 resolve',
          '调用 output.invoke(input, {...childConfig, recursionLimit: childConfig.recursionLimit - 1}) 委托执行，recursionLimit 为 0 时抛 Recursion limit reached.',
          '把 Runnable 序列化后返回',
          '静默丢弃',
        ],
        answer: 1,
        explain:
          'base.ts:2687-2695：if (output && Runnable.isRunnable(output)) { if (config?.recursionLimit === 0) throw new Error("Recursion limit reached."); output = await output.invoke(input, {...childConfig, recursionLimit: (childConfig.recursionLimit ?? DEFAULT_RECURSION_LIMIT) - 1}); }。注意输入用的是**原始 input** 而非 lambda 返回值。选项 A 错：Runnable 不是可用的输出值；选项 C/D 无此行为。DEFAULT_RECURSION_LIMIT = 25（config.ts:5），每层委托递减一次防无限自引用。',
        concept: 'lc-runnable-lambda',
      },
      {
        text: 'lambda 返回 AsyncGenerator 时，invoke() 与 stream() 各拿到什么？',
        options: [
          'invoke 拿生成器对象本身，stream 抛错',
          'invoke 把生成器的块全部消费并 concat 成最终值；stream 走 _transform 分派，把生成器的块逐个 yield——lambda 返回生成器就自动获得流式',
          '两者都聚合为最终值',
          '两者都逐块 yield',
        ],
        answer: 1,
        explain:
          '_invoke 路径：isAsyncIterable 分支用 consumeAsyncIterableInContext 逐块消费并 _concatOutputChunks 聚合（base.ts:2696-2718），invoke 的契约是单值。_transform 路径：isAsyncIterable 分支直接 for await + yield chunk（base.ts:2809-2816）。同一个函数返回值，两种支柱两种形态——这正是「行为分派」课名的含义。选项 C 混入了 stream 的行为；选项 D 混入了 invoke 的行为。',
        concept: 'lc-runnable-lambda',
      },
      {
        text: 'lambda 函数的第二个参数 config 是怎么来的？',
        options: [
          '没有第二参，只能拿闭包变量',
          'func(input, {...childConfig}) 显式传入，同时整个执行包在 AsyncLocalStorageProviderSingleton.runWithConfig(childConfig) 里——嵌套的 Runnable 调用也能隐式取到同一份 config',
          '来自全局单例，与调用链无关',
          '每次调用随机生成',
        ],
        answer: 1,
        explain:
          'base.ts:2675-2686：childConfig = patchConfig(config, { callbacks: runManager?.getChild(), recursionLimit: ... - 1 })，随后 func(input, {...childConfig}) 显式传参；同时 _invoke 整体包在 runWithConfig(pickRunnableConfigKeys(childConfig), async () => {...})（:2680-2682）里。双轨——显式第二参 + ALS 隐式上下文——是 L35 的主题，这里先看到落点。选项 A 错：源码明确传了；选项 C 错：ALS 的值就是当前 childConfig，随调用链传播；选项 D 无出处。',
        concept: 'lc-runnable-lambda',
      },
    ],
    [
      [
        'RunnableLambda',
        '把任意单参函数提升为 Runnable 的胶水类；返回值类型决定行为：值→输出、Runnable→委托、AsyncIterable/迭代器→消费',
      ],
      [
        'RunnableTraceable',
        'traceable 函数的专用 Runnable 包装，直接把 config 作为第一参传给函数、由 LangSmith traceable 体系接管追踪（base.ts:2450-2514）',
      ],
      [
        'DEFAULT_RECURSION_LIMIT',
        '委托递归的默认上限 25（config.ts:5）；RunnableLambda 每层委托递减 1，归零抛 Recursion limit reached.',
      ],
      [
        'consumeAsyncIterableInContext',
        '在 ALS config 上下文中消费用户生成器的工具：每步 next() 都包 runWithConfig，保证生成器体内嵌套调用不断链（iter.ts:76-94）',
      ],
    ],
    [
      '以为 lambda 返回 Runnable 只是「换个值」——它会**执行**那个 Runnable（拿原始 input），并且递归深度受 25 层限制，lambda 返回 self 会直接炸 Recursion limit',
      '在 _transform 场景假设 lambda 返回的生成器被整体聚合——流式路径是逐块 yield，聚合只发生在 invoke 路径',
      '给 lambda 传 traceable 函数还期待 RunnableLambda 行为——构造函数已改道 RunnableTraceable，函数的调用约定（config 是第一参）都变了',
    ],
  ),
  'theory',
)
