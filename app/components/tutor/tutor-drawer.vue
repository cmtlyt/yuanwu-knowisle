<script setup lang="ts">
/**
 * 助学 agent 主抽屉：桌面右侧 420px / 移动底部 75vh sheet。
 * 只消费 useTutor() 的状态与动作，不把 LLM 副作用写进模板。
 * 消息流按 kind 混排：turn → tutor-message / nav → tutor-card / note → tutor-system-note。
 */
import { useTutor } from '~/composables/use-tutor'
import TutorMessage from '~/components/tutor/tutor-message.vue'
import TutorCard from '~/components/tutor/tutor-card.vue'
import TutorSystemNote from '~/components/tutor/tutor-system-note.vue'
import type { FeedItem } from '~/types/tutor'

const tutor = useTutor()
const {
  isOpen,
  busy,
  llmReady,
  conversation,
  conversations,
  feed,
  streaming,
  close,
  send,
  retry,
  askAi,
  goSettings,
  newConversation,
  switchTo,
} = tutor

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const textarea = ref<HTMLTextAreaElement | null>(null)

/** 快捷意图 chips：点击即发送（意图由 context.ts 粗路由 + 系统提示词自决）。 */
const chips = [
  { label: '直接告诉我', text: '直接告诉我这个概念的原理' },
  { label: '考考我', text: '考考我，别直接给答案' },
  { label: '下一步学什么', text: '下一步学什么' },
] as const

/** 当前正在流式输出的气泡 id（最后一个 assistant 且为空/流式态）。 */
const streamingId = computed(() => {
  if (!streaming.value) return null
  const last = feed.value.toReversed().find((f) => f.kind === 'turn' && f.turn.role === 'assistant')
  return last && last.kind === 'turn' ? last.id : null
})

async function submitText(text: string) {
  const value = text.trim()
  if (!value || streaming.value) return
  draft.value = ''
  await send(value)
}
function onSubmit() {
  void submitText(draft.value)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    onSubmit()
  }
}
function onSwitch(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (id && id !== conversation.value?.id) void switchTo(id)
}
function onSettings() {
  goSettings()
  close()
}

/* 自动滚到底：新消息 / 流式逐字都触发 */
watch(
  () => {
    const last = feed.value[feed.value.length - 1]
    const tailLen = last && last.kind === 'turn' ? last.turn.content.length : 0
    return `${feed.value.length}:${tailLen}:${streaming.value}`
  },
  () => {
    if (!isOpen.value) return
    void nextTick(() => {
      const el = scroller.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

/* 抽屉打开时聚焦输入框；Escape 关闭 */
watch(isOpen, (v) => {
  if (v) {
    document.body.classList.add('tutor-open')
    void nextTick(() => textarea.value?.focus())
  } else {
    document.body.classList.remove('tutor-open')
  }
})
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) close()
}
onMounted(() => window.addEventListener('keydown', onEsc))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEsc)
  document.body.classList.remove('tutor-open')
})

function isStreamingTurn(item: FeedItem): boolean {
  return streamingId.value === item.id
}
</script>

<template>
  <div v-if="isOpen" class="tutor-layer">
    <div class="tutor-backdrop" @click="close" />

    <section class="tutor-drawer" role="dialog" aria-modal="true" aria-label="助学助手对话">
      <header class="td-head">
        <div class="td-title">
          <span class="td-logo" aria-hidden="true">✦</span>
          <b>助学助手</b>
          <span class="pill" :class="llmReady ? 'ok' : 'warn'">{{ llmReady ? '已连接' : '本地模式' }}</span>
        </div>
        <div class="td-actions">
          <button
            type="button"
            class="icon-btn"
            title="新建对话"
            aria-label="新建对话"
            :disabled="streaming"
            @click="newConversation"
          >
            ＋
          </button>
          <NuxtLink
            to="/settings/llm"
            class="icon-btn td-link"
            title="助手设置"
            aria-label="助手设置"
            @click="close"
            >⚙</NuxtLink
          >
          <button type="button" class="icon-btn" title="关闭" aria-label="关闭" @click="close">✕</button>
        </div>
      </header>

      <div class="td-convbar">
        <label for="tutor-conv" class="td-conv-label">对话</label>
        <select id="tutor-conv" :value="conversation?.id || ''" :disabled="streaming" @change="onSwitch">
          <option v-for="c in conversations" :key="c.id" :value="c.id">
            {{ c.main ? '★ ' : ''
            }}{{ c.snapshot.lessonTitle || c.snapshot.courseTitle || c.snapshot.pageKind }} ·
            {{
              new Date(c.updatedAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            }}
          </option>
        </select>
        <span v-if="busy" class="td-busy">载入中…</span>
      </div>

      <div ref="scroller" class="td-body">
        <div v-if="!feed.length && !busy" class="td-empty">
          <div class="td-empty-ico" aria-hidden="true">✦</div>
          <p>卡住了？问我一个问题，或点下面的快捷入口。</p>
          <p class="small">答疑 · 苏格拉底式追问 · 学情导航，按你这句话的意图自动切换。</p>
        </div>
        <template v-for="item in feed" :key="item.id">
          <TutorMessage v-if="item.kind === 'turn'" :turn="item.turn" :streaming="isStreamingTurn(item)" />
          <TutorCard
            v-else-if="item.kind === 'nav'"
            :cards="item.cards"
            :can-ask-ai="item.id === feed[feed.length - 1]?.id"
            @ask-ai="askAi"
          />
          <TutorSystemNote v-else :note="item.note" @retry="retry" @settings="onSettings" />
        </template>
      </div>

      <footer class="td-foot">
        <div class="td-chips">
          <button
            v-for="c in chips"
            :key="c.label"
            type="button"
            class="td-chip"
            :disabled="streaming"
            @click="submitText(c.text)"
          >
            {{ c.label }}
          </button>
        </div>
        <div class="td-inputrow">
          <textarea
            ref="textarea"
            v-model="draft"
            rows="1"
            :placeholder="
              llmReady ? '问点什么…（Enter 发送 / Shift+Enter 换行）' : '本地导航可用；配置 LLM 后可答疑…'
            "
            :disabled="streaming"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="td-send"
            :disabled="streaming || !draft.trim()"
            aria-label="发送"
            @click="onSubmit"
          >
            {{ streaming ? '…' : '➤' }}
          </button>
        </div>
        <p class="td-hint">配置绑定本机设备，key 保存在本机并随请求发往你配置的端点。</p>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.tutor-layer {
  position: fixed;
  inset: 0;
  z-index: 66;
  pointer-events: none;
}
.tutor-backdrop {
  position: absolute;
  inset: 0;
  z-index: 64;
  pointer-events: auto;
  background: rgba(10, 16, 28, 0.42);
}
.tutor-drawer {
  position: absolute;
  z-index: 66;
  pointer-events: auto;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 30px rgba(10, 16, 28, 0.22);
}

/* 头部 */
.td-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.td-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.td-logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--primary), #38a9c4);
  color: #fff;
  font-size: 14px;
}
.td-title .pill {
  font-size: 10px;
}
.td-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.td-actions .icon-btn {
  width: 32px;
  height: 32px;
  font-size: 14px;
}
.td-link {
  display: grid;
  place-items: center;
  text-decoration: none;
}
.td-link:hover {
  text-decoration: none;
}
.td-actions .icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 会话切换条 */
.td-convbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.td-conv-label {
  font-size: 11px;
  color: var(--muted);
  flex: none;
}
.td-convbar select {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--text);
  min-height: 34px;
}
.td-busy {
  font-size: 11px;
  color: var(--muted);
  flex: none;
}

/* 消息区 */
.td-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  background: var(--bg);
}
.td-empty {
  text-align: center;
  color: var(--muted);
  padding: 28px 12px;
}
.td-empty-ico {
  font-size: 30px;
  opacity: 0.5;
  margin-bottom: 8px;
}
.td-empty p {
  margin: 4px 0;
  font-size: 13px;
}
.td-empty .small {
  font-size: 11.5px;
}

/* 底部输入 */
.td-foot {
  flex: none;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.td-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.td-chip {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 11.5px;
  cursor: pointer;
  min-height: 32px;
}
.td-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.td-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.td-inputrow {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.td-inputrow textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  max-height: 120px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text);
}
.td-inputrow textarea:focus {
  outline: none;
  border-color: var(--primary);
}
.td-inputrow textarea:disabled {
  opacity: 0.6;
}
.td-send {
  flex: none;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}
.td-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.td-hint {
  margin: 7px 0 0;
  font-size: 10.5px;
  color: var(--muted);
  line-height: 1.4;
}

/* 移动端：底部 sheet，盖住底部标签栏 */
@media (max-width: 780px) {
  .tutor-drawer {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: none;
    height: 75vh;
    max-height: 90vh;
    border-left: 0;
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 30px rgba(10, 16, 28, 0.26);
  }
  .td-head {
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
  }
}
@media (prefers-reduced-motion: reduce) {
  .tutor-fab {
    transition: none;
  }
}
</style>
