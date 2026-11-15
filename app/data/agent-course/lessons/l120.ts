import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L120 = withKind(
  L(
    'L120',
    23,
    '语音 Agent：低时延对话流水线',
    3,
    ['L37'],
    ['voice-agent'],
    [
      '实现 ASR 增量 → LLM token 流 → 按句切分 → TTS 分块 → 音频队列的低时延流水线',
      '写出时延预算表、分段打点与 barge-in 取消传播',
      '能说明为什么首字节时延比总时长更重要，以及每段超时怎么降级',
    ],
    `
### 三段都在 SLA 内，用户还是挂了

上线第一周的通话记录里，有 18% 的会话在 Agent 开口前就结束了。可监控面板一片绿：ASR 平均 780ms、LLM 首 token 1.1s、TTS 合成 880ms，每一项都在各自服务的 SLA 内。把三段串起来看才明白——实现是「等用户整句说完 → 等 ASR 出完整文本 → 等 LLM 生成完整回复 → 等 TTS 合成整段音频 → 开始播放」，端到端 p95 到了 3.4 秒。用户听到的是三秒多的静默，第一反应是掉线，于是先挂断。

这个事故里没有任何一个服务「慢」，慢的是**架构把三段串行相加了**。语音场景不可退让的约束是端到端时延预算，而且预算的对象不是「整段说完要多久」，是「用户停止说话到第一个音频字节」——后者决定对话是否还像对话。本课就按这条约束倒推每一段允许花多少时间。

### 把预算拆到段，而不是只盯总时长

人类对话对静默的容忍大致在 700–1000ms 量级，超过就会开始怀疑对方没在听。取 1200ms 作为 p95 目标，倒推各段上限：

| 段 | 预算 | 超时的常见原因 | 降级动作 |
|---|---|---|---|
| VAD 收尾判定 | 200ms | 尾音拖长、把停顿当断句 | 提前出增量文本，不等待终判 |
| ASR 尾包 | 150ms | 等整句才给最终结果 | 用 partial 结果先起 LLM |
| LLM 首 token | 400ms | 完整生成、长 system prompt | 流式 + 前缀缓存（L91） |
| 首个可播句子攒够 | 300ms | 等全文结束才送 TTS | 按标点切句，见句即送 |
| TTS 首字节 | 200ms | 整段合成、未做分块 | 分块合成 + 边合成边播 |
| 网络与缓冲 | 150ms | 音频缓冲设得过大 | 小缓冲 + 预连接 |

合计 1400ms，留 200ms 给抖动。表里最反直觉的一行是「用 partial 结果先起 LLM」：ASR 的增量文本会有错字，但**早一点开始一个可能被纠正的推理，比晚一点开始一个完美的推理更值钱**——纠正的代价可以通过 barge-in 与上下文替换来兜，而三秒静默无法挽回。

### 首字节比总时长重要

\`\`\`ts title="时延预算与分段打点" note="要点：预算对象是首字节；每段独立 deadline，超时就降级而不是等齐。"
type Stage = 'vad' | 'asr' | 'llm' | 'sentence' | 'tts' | 'network'

const BUDGET: Record<Stage, number> = {
  vad: 200, asr: 150, llm: 400, sentence: 300, tts: 200, network: 150,
}

class LatencyMeter {
  private started = 0
  private marks = new Map<Stage, number>()
  begin() { this.started = performance.now() }
  mark(s: Stage) { this.marks.set(s, performance.now()) }
  elapsedSincePrev(s: Stage): number {
    const t = this.marks.get(s)
    if (!t) return 0
    const keys = Object.keys(BUDGET) as Stage[]
    const i = keys.indexOf(s)
    const prev = i === 0 ? this.started : (this.marks.get(keys[i - 1]) ?? this.started)
    return t - prev
  }
  overBudget(): Stage | undefined {
    return (Object.keys(BUDGET) as Stage[]).find((s) => this.elapsedSincePrev(s) > BUDGET[s])
  }
  firstByteMs(): number {
    return (this.marks.get('tts') ?? performance.now()) - this.started
  }
}
\`\`\`

\`overBudget\` 的返回值要真的触发降级，而不只是打一条日志。比如 LLM 首 token 超过 400ms 就切到低档模型或改走短回复模板（L88 的三档路由在这里是现成的）；TTS 首字节超时就先播一个预设的短应答音，把静默填上。**监控能看到超标却没人据此改行为，等于没有预算。**

:::deep
### 为什么「总时长」是个会骗人的指标

一段 12 秒的回答，如果第 0.9 秒就出了第一个字并在之后持续有声音，用户感知是「反应很快」；另一段 6 秒的回答，如果前 3 秒完全静默，用户感知是「卡住了」。两者总时长差一倍，体验却反过来。原因是对话的节奏单位是「轮次间隙」，不是「单轮总长」——人判断对方是否在听，依据的是自己说完后多久得到第一个反馈。

所以架构上的结论很硬：**任何要求「先拿到完整结果再往下走」的环节都是敌人**。LLM 必须流式出 token、TTS 必须按句分块、音频队列必须边填边播。反过来，总时长可以靠后续流式持续输出慢慢摊掉，不必优化到极限。这也是 L37 流式在语音场景里不是「体验优化」而是「及格线」的原因。
:::

### 流式级联：每一段都不等下一段齐

\`\`\`ts title="全链路流式级联" note="要点：AbortController 贯穿三段；按标点切句见句即送；音频队列边填边播。"
const SENTENCE_END = /[。！？；!?;\\n]/

async function speakTurn(audio: AudioSink, session: Session, ctrl: AbortController) {
  const meter = new LatencyMeter()
  meter.begin()

  let buffer = ''
  const queue: Promise<void>[] = []

  const asrStream = asr.partialStream(session.mic, { signal: ctrl.signal })
  // ① 不等 ASR 终判，用增量文本启动 LLM（终判到达后若差异大，由 barge-in 纠正）
  for await (const partial of asrStream) {
    if (ctrl.signal.aborted) return
    meter.mark('asr')
    const llmStream = llm.stream({
      messages: session.withUser(partial.text),
      signal: ctrl.signal,
      maxTokens: 180,
    })
    meter.mark('vad')

    let first = true
    for await (const token of llmStream) {
      if (ctrl.signal.aborted) return
      if (first) { meter.mark('llm'); first = false }
      buffer += token
      // ② 见句即送：攒够一个可播句子就交给 TTS，不等全文
      const cut = buffer.search(SENTENCE_END)
      if (cut >= 0) {
        const sentence = buffer.slice(0, cut + 1)
        buffer = buffer.slice(cut + 1)
        meter.mark('sentence')
        queue.push(synthAndPlay(sentence, audio, ctrl, meter))
      }
    }
    break // 只在 ASR 终判后重跑一次，避免每个 partial 都重开 LLM
  }

  if (buffer.trim()) queue.push(synthAndPlay(buffer.trim(), audio, ctrl, meter))
  await Promise.all(queue)
  session.appendAssistantText(buffer)
}

async function synthAndPlay(text: string, audio: AudioSink, ctrl: AbortController, meter: LatencyMeter) {
  for await (const chunk of tts.stream(text, { signal: ctrl.signal })) {
    if (ctrl.signal.aborted) return
    meter.mark('tts')
    if (meter.overBudget()) audio.playFiller()   // 填静默，别让用户以为掉线
    audio.enqueue(chunk.pcm)
  }
}
\`\`\`

这段代码里三处细节值得单独记住：\`AbortController\` 是**同一个实例贯穿 ASR / LLM / TTS**，否则打断时只能停一半；\`break\` 是为了不让每个 ASR partial 都重开一次 LLM（真实实现里用「终判信号 + 去重」更细，但结构上必须限制重开次数）；\`playFiller\` 是预算超标的兜底，一个 200ms 的「嗯」比静默好得多。

### barge-in：打断要取消到两端

用户不等 Agent 说完就插话时，系统必须同时做四件事：停掉正在播的音频、清空音频队列、取消 LLM 继续生成、取消 TTS 继续合成。少做一件就会在几秒后冒出一句不属于当前轮次的旧回复。

\`\`\`ts title="barge-in 取消传播" note="要点：一个 signal 贯穿；清空未播队列；把已说出的文本留在上下文里，避免「说过又不认」。"
function onUserSpeech(session: Session, audio: AudioSink, current: AbortController) {
  current.abort('barge-in')            // ① 同 signal 取消 LLM / TTS / ASR 旧流
  audio.stop()                        // ② 立刻停播，不等当前 chunk 播完
  audio.clearQueue()                  // ③ 丢弃已合成但还没播的帧
  const spoken = audio.drainPlayedText()
  session.commitPartialAssistant(spoken) // ④ 已说出口的算数，上下文不回滚
  return new AbortController()        // 新一轮用新 signal
}

// 回声消除标记：自己 TTS 的声音不能反过来触发 VAD
vad.onVoice((ev) => {
  if (ev.source === 'speaker' && !aec.isEchoCancelled(ev.frame)) return
  ctrl = onUserSpeech(session, audio, ctrl)
})
\`\`\`

第四件事最容易被漏掉：模型「说过一半」的内容如果从上下文里整个删掉，下一轮它会不记得自己刚说了什么，出现重复或自相矛盾。正确做法是把**已经播出去的文本**提交为一条部分 assistant 消息，未播的部分随队列一起丢弃。另一个隐蔽坑是回声：不接 AEC 标记，Agent 会被自己播放的声音反复打断，表现为每说两个字就卡一下。

:::warn
### 两个必踩的坑

- **把「流式」只理解成前端边打字边出**。后端仍是「等完整 ASR → 等完整 LLM → 等完整 TTS」，前端只是把最终结果分块显示，首字节时延一点没降。流式必须是**每一段的输入都不必等齐**。
- **打断只取消 TTS，不取消 LLM**。音频停了，LLM 还在后台烧 token 并生成旧轮次的文本，几秒后又进 TTS，用户听到一句迟到的、已经不相关的回答。取消必须走同一个 signal 到最上游。
:::

### 降级阶梯与预算怎么校准

预算表不是拍脑袋写死的常量。上线前用 50 轮真实录音（含安静环境、地铁背景、方言口音三类）跑一遍，取每段的 p95 作为初始值，之后按周回归——模型换版本、TTS 换供应商、加了一轮工具调用，都会让某一段悄悄涨上去。L80 的回归基线在这里的用处是：**首字节时延也要进基线，而不只是答案正确率进基线**。

超标时按代价从低到高逐级降，别一上来就切最差的模型：

1. **填静默**：先播 150–200ms 的填充音或短应答，把感知空隙补上，代价最小。
2. **缩短本轮回复**：把 \`maxTokens\` 从 180 降到 60，先给结论，细节留到下一轮。
3. **切低档模型**：只对首 token 超预算的轮次切（L88 的误路由盈亏平衡在这里同样适用，别全局切）。
4. **转文本通道**：连续两轮超预算就提示用户改用文字，避免在语音里反复消耗耐心。

这四级有个共同点：都是**本轮生效、可回退**，不像「整体换小模型」那样把质量长期压低。降级最忌讳的是不可逆——一次网络抖动就把整通电话切到低质量模式，用户会以为系统坏了。

### 验收：测首字节分布，不是测平均值

\`\`\`ts title="时延回归断言" note="要点：假时钟驱动，断言 p95 首字节、barge-in 残留帧、取消后无新 token。"
async function runLatencyCase(harness: FakeClockHarness) {
  const controller = new AbortController()
  const audio = harness.audioSink()
  const session = harness.session()

  await speakTurn(audio, session, controller)
  const samples = harness.firstByteSamples()   // 至少 50 轮
  const p95 = percentile(samples, 0.95)
  assert.ok(p95 <= 1400, 'p95 首字节超预算: ' + p95.toFixed(0) + 'ms')

  harness.fireUserSpeech()                      // 模拟中途插话
  await harness.tick(500)
  assert.equal(audio.queuedFrames(), 0, 'barge-in 后仍有残留音频帧')
  assert.equal(harness.llmTokensAfterAbort(), 0, '取消后 LLM 仍在产出 token')
  assert.ok(session.hasPartialAssistant(), '已播出的文本没进上下文')
}
\`\`\`

四条断言对应四种真实事故：整体超时、打断后旧音频残留、取消不彻底、上下文回滚。用假时钟和假音频槽驱动，能进 CI，不需要真麦克风——这一点和 L82「真实模型输出不进 CI」是同一个分层：确定性结构断言进流水线，真实听感只做人工抽检。

另外别忘了 L92 的教训：音频队列本身是有界并发问题，TTS 分句过多会让合成请求排队，反而把首字节之后的间隙拉大。给队列设上限（例如同时最多 2 个在合成、最多 4 句待播），超出的句子直接丢弃或合并，比无限排队更符合对话节奏。

### 与相邻课的分工

- **L37**：流式输出通用机制，本课把它推到「每段输入都不必等齐」的严格形态。
- **L88 / L91**：三档路由与前缀缓存，本课用它们做超预算时的降级与首 token 提速。
- **L36**：取消传播与循环终止，barge-in 是它在语音场景的具体化。
- **L92**：有界并发，本课的音频/合成队列直接复用其结论。
- **L74 / L77**：回放调试与评测维度，本课新增的是「首字节时延分布」这一维。

**一句话收束**：语音 Agent 优化的不是「回答总共多快」，是**用户说完后多久能听到第一个字**；预算要拆到段，打断要取消到最上游。
`,
    null,
    [
      {
        text: '三段服务都在 SLA 内，用户仍在 Agent 开口前挂断，最可能的原因是？',
        options: ['ASR 识别错', '三段串行相加导致首字节 p95 达 3.4s', 'TTS 音质差', '模型答错了'],
        answer: 1,
        explain: '慢的是架构把三段相加，且预算对象应是首字节而非总时长。',
        concept: 'voice-agent',
      },
      {
        text: 'barge-in 时最容易漏掉、导致下一轮自相矛盾的是？',
        options: ['停播音频', '清空队列', '把已播出的文本提交为部分 assistant 消息', '取消 TTS'],
        answer: 2,
        explain: '已说出口的内容若从上下文删掉，模型会不记得自己说过什么。',
        concept: 'voice-agent',
      },
      {
        text: '「流式」在语音场景里正确的含义是？',
        options: ['前端分块显示最终文本', '每一段的输入都不必等上一段齐', '提高并发数', '压缩音频码率'],
        answer: 1,
        explain: '只有整条链路都不等齐，首字节时延才真的下降。',
        concept: 'voice-agent',
      },
    ],
    [
      ['首字节时延', '用户停止说话到第一个音频字节的时间，语音场景的主指标'],
      ['barge-in', '用户插话时打断播放，并把取消传播到 LLM 与 TTS 两端'],
      ['按句切分', 'LLM token 流攒够一个可播句子即送 TTS，不等全文'],
    ],
    [
      '把流式只做成前端分块显示，后端仍三段串行，首字节一点没降。',
      '打断只取消 TTS 不取消 LLM，几秒后会冒出迟到的旧轮次回复。',
    ],
  ),
  'scenario',
)
