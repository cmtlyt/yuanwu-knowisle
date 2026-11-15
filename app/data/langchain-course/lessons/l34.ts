import { L, withKind } from '../../course-builders.ts'

export const L34 = withKind(
  L(
    'L34',
    9,
    'withRetry/withConfig/withFallbacks/withListeners：bind 家族实现本质',
    2,
    ['L30'],
    ['lc-bind-family'],
    [
      '说出四个 with* 修饰器各自返回的包装类（RunnableRetry/RunnableBinding/RunnableWithFallbacks/RunnableBinding+configFactories）并解释「修饰即新建」的不可变语义',
      '解释 bind 的实现本质 = withConfig 固定 kwargs，以及 RunnableBinding.invoke 的 _mergeConfig 合并顺序',
      '读 RunnableRetry 的 pRetry 循环：默认 3 次尝试、randomize 抖动、retry:attempt:N 子回调标签',
    ],
    `### 修饰器的统一答案：包装类

L27-L33 里的 Runnable 一直是「被组合」的材料；本课的四个 with* 方法是「被修饰」的入口。它们实现思路完全一致：**不修改原对象、不注册回调列表，而是返回一个持有原 Runnable 的新包装类实例**。withRetry→RunnableRetry、withConfig→RunnableBinding、withFallbacks→RunnableWithFallbacks（L33 已讲）、withListeners→RunnableBinding+configFactories。四个方法四行核心代码，先总览再逐个拆。

### 四个入口的构造现场

\`\`\`ts
withRetry(fields?): RunnableRetry<RunInput, RunOutput, CallOptions> {
  return new RunnableRetry({
    bound: this,
    kwargs: {},
    config: {},
    maxAttemptNumber: fields?.stopAfterAttempt,
    ...fields,
  });
}

withConfig(config: Partial<CallOptions>): Runnable<...> {
  return new RunnableBinding({
    bound: this,
    config,
    kwargs: {},
  });
}

withFallbacks(fields): RunnableWithFallbacks<RunInput, RunOutput> {
  const fallbacks = Array.isArray(fields) ? fields : fields.fallbacks;
  return new RunnableWithFallbacks<RunInput, RunOutput>({
    runnable: this,
    fallbacks,
  });
}

withListeners({ onStart, onEnd, onError }): Runnable<...> {
  return new RunnableBinding<RunInput, RunOutput, CallOptions>({
    bound: this,
    config: {},
    configFactories: [
      (config) => ({
        callbacks: [
          new RootListenersTracer({ config, onStart, onEnd, onError }),
        ],
      }),
    ],
  });
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:157-206,1211-1237（commit 7704471，有裁剪）*

「修饰即新建」带来两个可推论的性质。其一，**链式修饰 = wrapper 嵌套**：\`.withRetry().withConfig()\` 的调用栈是 Binding 包着 Retry 包着原 Runnable，每层都会在 invoke 时加一次 config 合并与转发开销。其二，**同一基底可派生多实例**：base.ts:1294-1312 的官方示例用 \`runnable.withConfig({ configurable: { role: "Admin" } })\` 与 \`role: "User"\` 造出两个独立 Runnable——装饰器语义而非单例状态。withListeners 的 configFactories 是唯一的动态通道：回调工厂在**每次调用**时执行，RootListenersTracer 拿到当次 config，所以监听器的 Run 对象反映本次 run 的真实 id/tags（base.ts:1269-1271 定义）。

### RunnableBinding：mergeConfig 与转发

\`\`\`ts
async invoke(
  input: RunInput,
  options?: Partial<CallOptions>
): Promise<RunOutput> {
  return this.bound.invoke(
    input,
    await this._mergeConfig(options, this.kwargs)
  );
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:1394-1402（commit 7704471）*

RunnableBinding 的 invoke/batch/stream/transform 全是同一个模式：_mergeConfig（内部走 config.ts:49-148 的 mergeConfigs 语义）把固定 config/kwargs 与调用期 options 合并后转发给 bound。合并规则的细节：tags 去重拼接、metadata/configurable 浅合并、timeout 取较小值、signal 用 AbortSignal.any 合流、callbacks 六种形态分支处理（config.ts:84-140）。**后到者覆盖前者**——用户 invoke 时传的 tags 会叠加而非替换固定 config，同名标量则被后者覆盖。RunnableBinding 自身还覆写了 withRetry/withConfig（base.ts:1360-1392）：在 wrapper 上再修饰时保留 bound 与 kwargs 继续外层包装，避免嵌套失控。kwargs 字段已被标记 deprecated（base.ts:1266-1267），新代码统一用 config。

bind 的本质由此可以一句话陈述：**bindTools = 携带 kwargs 的 RunnableBinding + 模型层的 config/callOptions 剥离**。\`_separateRunnableConfigFromCallOptions\`（base.ts:326-358）白名单剥走十个 RunnableConfig 键，剩余 options（tools、temperature、toolsChoice…）原样进 provider 调用——「框架配置」与「模型参数」的切分线就在这一步，provider 的自定义参数正是靠它获得挂载点（L19 的能力契约在此落地）。

### RunnableRetry：pRetry 循环与 retry:attempt:N

\`\`\`ts
protected maxAttemptNumber = 3;

_patchConfigForRetry(
  attempt: number,
  config?: Partial<CallOptions>,
  runManager?: CallbackManagerForChainRun
): Partial<CallOptions> {
  const tag = attempt > 1 ? \`retry:attempt:\${attempt}\` : undefined;
  return patchConfig(config, { callbacks: runManager?.getChild(tag) });
}

protected async _invoke(input, config?, runManager?) {
  return pRetry(
    (attemptNumber: number) =>
      super.invoke(
        input,
        this._patchConfigForRetry(attemptNumber, config, runManager)
      ),
    {
      onFailedAttempt: ({ error }) => this.onFailedAttempt(error, input),
      retries: Math.max(this.maxAttemptNumber - 1, 0),
      randomize: true,
    }
  );
}

async invoke(input, config?) {
  return this._callWithConfig(this._invoke.bind(this), input, config);
}
\`\`\`

*— libs/langchain-core/src/runnables/base.ts:1753-1815（commit 7704471，有裁剪）*

与 batch 里「onFailedAttempt throw 关重试」（L28）对照：RunnableRetry 是**正经启用**重试的组合子，maxAttemptNumber 默认 3，pRetry 的 retries 是「尝试次数减一」。每次尝试的 config 都经 _patchConfigForRetry 换上新子回调：第二次尝试起打 \`retry:attempt:N\` 标签——追踪树里每次重试是独立子 run，一眼可数。整个重试循环包在 _callWithConfig 里（base.ts:1810-1815）：外层 run 一次，内层每次 attempt 一个子 run。onFailedAttempt 钩子拿到原始错误与输入，供用户做告警/分类。batch 版本（base.ts:1817-1884）按 L28 讲过：pRetry 整体驱动、每轮只重跑失败下标。**与 AsyncCaller 重试的关系要分清**：模型 SDK 请求层的 maxRetries（默认 6）与 Runnable 层的 withRetry 是两层独立重试，同时启用最坏情况放大 maxAttemptNumber × (maxRetries+1) 倍请求——生产上通常只留一层。

### RootListenersTracer：withListeners 的回调内核

withListeners 注入的 RootListenersTracer 是「根事件监听」语义的实现体：

\`\`\`ts
export class RootListenersTracer extends BaseTracer {
  async onRunCreate(run: Run) {
    if (this.rootId) {
      return;
    }
    this.rootId = run.id;
    if (this.argOnStart) {
      await this.argOnStart(run, this.config);
    }
  }

  async onRunUpdate(run: Run) {
    if (run.id !== this.rootId) {
      return;
    }
    if (!run.error) {
      if (this.argOnEnd) {
        await this.argOnEnd(run, this.config);
      }
    } else if (this.argOnError) {
      await this.argOnError(run, this.config);
    }
  }
}
\`\`\`

*— libs/langchain-core/src/tracers/root_listener.ts:44-60 裁剪（commit 7704471）*

「只监听根 run」没有用任何特殊开关，而是靠两条纪律实现：**onRunCreate 只认第一次**——rootId 已设置就跳过，首个被创建的 run 即根；**onRunUpdate 只对 rootId 反应**——其他 run 的事件一律忽略。persistRun 是空操作（root_listener.ts:41-42），tracer 不落盘，用户回调拿到的 \`run\` 对象就是 BaseTracer 维护的 Run 记录，构造参数里还带着当次 config（:20-33），所以 onEnd 里能读到本次调用的 tags/metadata。为什么用 tracer 而不是普通 handler？因为「根 run」是树的概念——普通 handler 挂在 config.callbacks 上，跟随继承集进入每个子 run；而 tracer 走 BaseTracer 的 run 创建/更新生命周期，天然能看到整棵树的创建时序，从中挑出根节点。这也反过来解释了 configFactories 的必要性（base.ts:1211-1237）：每个 tracer 实例维护自己的 rootId 状态，**每次调用必须新建一个**——工厂模式在这里不是风格偏好，而是状态隔离的硬需求；用共享实例监听第二次调用，rootId 已经被上一次占用，监听器就聋了。构造签名（root_listener.ts:16-33）也顺带记全：onStart/onEnd/onError 三个回调都收 \`(run: Run, config: RunnableConfig)\` 两参——回调里不仅能拿 Run 对象（含 runId、inputs、outputs），还能读当次调用的 tags/metadata，这就是「监听器拿到的是当次调用的 config 上下文」的落实处。它与 L36 的执行树有一条隐形接口：BaseTracer 的 run 预建（manager.ts:1013-1027 的 isBaseTracer 同步分支）正是 RootListenersTracer 得以在 onRunCreate 里可靠锁定 rootId 的前提——预建同步发生，首个创建的 run 必然是根，没有后台回调的竞态窗口。至此本课的结论可以压缩成一条：「bind 家族」的全部成员——withRetry/withConfig/withFallbacks/withListeners/bind——共享同一个实现母题：**参数进入包装类的构造器，行为留在被包装的 Runnable 里，包装层只负责在调用边界合并 config 与转发**。理解了 RunnableBinding 的 _mergeConfig 与 configFactories 这两条「参数进入」的通道，其余成员只是同一母题在不同维度（重试次数、兜底序列、根监听）上的变奏，模块三的组合子版图在此闭合。

### 本课小结

- 四个 with* 修饰器的实现全部是「新建包装类」：Retry/Binding/WithFallbacks/Binding+configFactories；不修改原对象、链式修饰即 wrapper 嵌套。
- RunnableBinding.invoke 的合并顺序：固定 config/kwargs 先展开、调用期 options 后到覆盖；tags/metadata 叠加、timeout 取小、signal 合流（mergeConfigs 六分支）。
- bind 的本质 = withConfig 固定 kwargs + \`_separateRunnableConfigFromCallOptions\` 剥离十个 config 键；框架配置与 provider 参数的切分线在此。
- RunnableRetry：maxAttemptNumber 默认 3、randomize 抖动、\`retry:attempt:N\` 子回调让每次尝试在追踪树独立成 run；与 AsyncCaller 的 SDK 层重试是两层机制，叠加会放大流量。
- 下一课进入配置层：RunnableConfig 的显式参数与 AsyncLocalStorage 隐式上下文的双轨传播——本课反复出现的 ensureConfig/patchConfig 将被完整解剖。
`,
    null,
    [
      {
        text: 'withConfig({configurable: {...}}) 返回的是什么？',
        options: [
          '修改原 Runnable 的 config 字段并返回 this',
          'new RunnableBinding({ bound: this, config, kwargs: {} })——一个持有原 Runnable 与固定 config 的包装实例',
          '深拷贝原 Runnable',
          '抛错，config 只能在 invoke 时传',
        ],
        answer: 1,
        explain:
          'base.ts:176-185：return new RunnableBinding({ bound: this, config, kwargs: {} })。修饰不修改——每次 with* 产生新 Runnable，原对象不变，可以同一基底派生多个不同配置的实例（文档示例 base.ts:1294-1298 正是 adminRunnable/userRunnable 双派生）。选项 A 违反不可变组合；选项 C 无拷贝逻辑；选项 D 与源码相反。',
        concept: 'lc-bind-family',
      },
      {
        text: 'model.bindTools(tools) 的实现本质是？',
        options: [
          '模型类内部直接改 this.tools',
          '调用 withConfig 固定 kwargs（工具清单作为 call options），运行时由 _separateRunnableConfigFromCallOptions 把它们从 RunnableConfig 中剥离交给模型',
          '新建一个专用的 ToolBoundModel 类',
          '注册全局回调把工具清单传下去',
        ],
        answer: 1,
        explain:
          'bind 家族统一走「包装类固定参数」路线：模型层 bindTools 的返回是带 kwargs 的 RunnableBinding 形态（BaseChatModel.bindTools 签名要求返回 Runnable，chat_models.ts:276-279），invoke 时 RunnableBinding._mergeConfig 把 kwargs 并入 options，随后模型用 _separateRunnableConfigFromCallOptions（base.ts:326-358）把 callbacks/tags/metadata/runName/configurable/recursionLimit/maxConcurrency/runId/timeout/signal 十个 config 键剥走，剩下的就是 provider 的 call options（如 tools/temperature）。选项 A/C/D 都不是这套机制。',
        concept: 'lc-bind-family',
      },
      {
        text: 'RunnableRetry 的默认尝试次数与重试间的退避特征是？',
        options: [
          'maxAttemptNumber 默认 3，pRetry 带 randomize: true（指数退避加随机抖动）',
          '默认 6 次，固定间隔 1 秒',
          '默认无限重试直到成功',
          '默认 1 次（不重试）',
        ],
        answer: 0,
        explain:
          'base.ts:1753 的字段默认 protected maxAttemptNumber = 3；_invoke 里 retries: Math.max(this.maxAttemptNumber - 1, 0)（:1794）——3 次尝试意味着 2 次 pRetry 重试；randomize: true 让退避带抖动（与 AsyncCaller 的默认一致，L28）。选项 B 的 6 次是 AsyncCaller 的 maxRetries 默认，不是 RunnableRetry 的；选项 C/D 与源码相反。',
        concept: 'lc-bind-family',
      },
      {
        text: 'withListeners({onStart, onEnd, onError}) 是怎么实现的？',
        options: [
          '在 Runnable 上注册事件总线监听',
          '返回 RunnableBinding，configFactories 工厂在每次调用时生成带 RootListenersTracer 的 callbacks',
          '直接覆写原 Runnable 的 _callWithConfig',
          '返回 RunnableRetry 的一个特例',
        ],
        answer: 1,
        explain:
          'base.ts:1211-1237：return new RunnableBinding({ bound: this, config: {}, configFactories: [(config) => ({ callbacks: [new RootListenersTracer({ config, onStart, onEnd, onError })] })] })。configFactories 是 RunnableBindingArgs 的字段（base.ts:1269-1271），每次调用时动态构造 config——监听器拿到的是**当次调用**的 config 上下文。选项 A 错：没有事件总线，仍走回调体系；选项 C 错：不可变组合不改原对象；选项 D 无此实现。',
        concept: 'lc-bind-family',
      },
    ],
    [
      [
        'RunnableBinding',
        '「绑定配置」的包装类：持有 bound 与 config/kwargs，invoke 时 _mergeConfig 合并后转发给 bound；bind 家族的通用载体（base.ts:1260-1460）',
      ],
      [
        'configFactories',
        'RunnableBinding 的高级字段：函数数组，每次调用时动态生成 config 片段；withListeners 用它按调用注入 RootListenersTracer',
      ],
      [
        'RunnableRetry',
        '重试包装类：继承 RunnableBinding，pRetry 循环 + retry:attempt:N 子回调标签，maxAttemptNumber 默认 3（base.ts:1740-1916）',
      ],
      [
        'RootListenersTracer',
        'withListeners 内部构造的回调 tracer：只在根 run 上触发 onStart/onEnd/onError，把 Run 对象交给用户回调',
      ],
    ],
    [
      '以为 with* 系列是「注册钩子」——它们全部返回新包装类实例，持有旧实例的是 wrapper 不是 callback 列表；链式 withRetry().withConfig() 会嵌两层 wrapper',
      '以为 RunnableBinding.invoke 里用户传入的 options 会覆盖固定 config——合并顺序是 this.config/kwargs 先展开、用户 options 后到（_mergeConfig 用 mergeConfigs 语义），同名键以后到者为准',
      '把 withRetry 与模型层 maxRetries 混为一谈——AsyncCaller（L28）的重试在 SDK 请求层，RunnableRetry 在 Runnable 层，双层叠加会放大请求次数',
    ],
  ),
  'framework',
)
