import { L } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L120 = L(
  'L120',
  23,
  '语音 Agent：低时延对话流水线',
  17,
  3,
  ['L37'],
  ['voice-agent'],
  [
    '理解语音 Agent 的「ASR → LLM → TTS」三段流水线',
    '掌握低时延的核心：流式 + 打断（barge-in）',
    '认识语音场景下的时延预算与降级',
  ],
  `
### 语音 Agent 是一条三段流水线

语音 Agent 把「说 → 听 → 想 → 说」串起来：ASR（语音转文字）→ LLM（生成回复）→ TTS（文字转语音）。用户体验取决于端到端时延——人对话的「响应感」窗口只有几百毫秒。

\`\`\` title="低时延语音流水线" note="关键：时延预算 = ASR 首字 + 端点检测 + LLM 首 token + TTS 首帧，全程流式 + 可打断。"
// 全链路流式，避免「说完再转」
inputStream = mic.onData()               // 音频流
partial = asrStream(inputStream)        // ① ASR 流式识别（边听边出字）

// ② 端点检测：用户说完（静音）→ 立刻触发 LLM
onVadEnd(() => {
  const reply = llmStream(partial.text)  // 流式生成
  ttsStream(reply)                       // ③ 边生成边合成、边播放
})

// ④ 打断（barge-in）：用户又开始说话 → 立即中断 LLM + TTS
mic.onSpeechStart(() => abort(llmStream, ttsStream))
\`\`\`

:::deep

### 时延预算与「全双工」

人类对话是全双工的：可以边听边打断。语音 Agent 要「好用」，至少做到「用户一开口就打断当前输出」。这要求 ASR 持续监听、LLM 可中止、TTS 可即时切换——工程上比文字 Agent 复杂一个量级。

:::

### 语音 Agent 的工程要点

- ASR 流式出字，配合 VAD（端点检测）判断「说完」。
- LLM 用流式（L37 的 async iterator），先出首 token 再 TTS。
- 打断机制：用户开口 → abort LLM/TTS，进入新回合。
- 降级：弱网 / ASR 失败时，回退到文字输入（L124 兜底思想）。
- 语音场景要处理「语气 / 停顿 / 噪声」，ASR 质量是下限。

:::warn

### 别把语音 Agent 当「文字 Agent + 两层转换」

简单的「录音 → 转写 → 全文进 LLM → 全文合成」端到端时延会到秒级，体验极差。语音 Agent 的核心是「流式 + 打断」，这两点不做，等于没有语音 Agent。

:::

`,
  null,
  [
    {
      text: '语音 Agent 的三段流水线是？',
      options: ['ASR → LLM → TTS', 'TTS → ASR → LLM', 'LLM → ASR → TTS', 'OCR → LLM → 渲染'],
      answer: 1,
      explain: '听 → 想 → 说。',
      concept: 'voice-agent',
    },
    {
      text: '语音 Agent 体验的关键是？',
      options: ['更贵的模型', '低时延：流式 + 打断（barge-in）', '更长的回复', '更响的音量'],
      answer: 1,
      explain: '流式 + 打断决定体验。',
      concept: 'voice-agent',
    },
    {
      text: '「打断」机制做的是？',
      options: ['用户开口时中止 LLM/TTS 进入新回合', '关掉麦克风', '加快语速', '降低音量'],
      answer: 1,
      explain: '用户一开口就中断当前输出。',
      concept: 'voice-agent',
    },
  ],
  [
    ['ASR', '自动语音识别'],
    ['TTS', '文字转语音'],
    ['barge-in', '用户开口即打断当前输出'],
    ['VAD', '语音活动检测，判断「说完」'],
  ],
  [
    '把语音 Agent 做成「录音 + 全文转写 + 全文合成」，端到端时延秒级。',
    '不做打断机制，用户只能等 Agent 说完才能插话。',
  ],
)
