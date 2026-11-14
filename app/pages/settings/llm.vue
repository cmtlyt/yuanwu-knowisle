<script setup lang="ts">
/**
 * 助手设置（独立于课程的全站共享配置）。
 * - baseUrl / apiKey / model 三字段，走 config.ts 的 AES-GCM 加密存取。
 * - 连接测试复用 llm.ts 的 chatOnce（同时验证端点 + key + 模型名可用）。
 * - 指纹漂移（stale）明确提示「配置已重置，请重新配置」。
 * - 清除入口：清除本机配置、清除全部对话记录。
 */
import { getTutorConfig, saveTutorConfig, clearTutorConfig } from '~/lib/tutor/config'
import { chatOnce, LlmRequestError } from '~/lib/tutor/llm'
import { clearAll } from '~/lib/tutor/history'
import { useTutor } from '~/composables/use-tutor'
import type { TutorConfigStatus } from '~/types/tutor'

const { refreshConfig } = useTutor()

const baseUrl = ref('https://api.openai.com/v1')
const apiKey = ref('')
const model = ref('gpt-4o-mini')
const showKey = ref(false)

const status = ref<TutorConfigStatus>('absent')
const saved = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const loading = ref(true)

async function refresh() {
  try {
    const read = await getTutorConfig()
    status.value = read.status
    if (read.config) {
      baseUrl.value = read.config.baseUrl
      apiKey.value = read.config.apiKey
      model.value = read.config.model
      saved.value = true
    } else {
      saved.value = false
    }
  } catch {
    // A2：加密 API / 存储异常时不能让 loading 永久为 true
    status.value = 'stale'
    saved.value = false
    testResult.value = { ok: false, text: '读取本机配置失败：浏览器可能禁用了加密 API。' }
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  if (import.meta.client) void refresh()
})

function markDirty() {
  saved.value = false
  testResult.value = null
}

async function onSave() {
  const url = baseUrl.value.trim().replace(/\/+$/, '')
  const key = apiKey.value.trim()
  const mdl = model.value.trim()
  if (!url || !key || !mdl) {
    window.alert('请填写完整：baseUrl、API Key、模型名。')
    return
  }
  try {
    await saveTutorConfig({ baseUrl: url, apiKey: key, model: mdl })
    // C1：保存后立刻刷新全局配置状态（FAB 角标 / 抽屉能力）
    await refreshConfig()
    testResult.value = null
  } catch (err) {
    testResult.value = {
      ok: false,
      text: `保存失败：${err instanceof Error ? err.message : String(err)}`,
    }
  }
  await refresh()
}

async function onTest() {
  const url = baseUrl.value.trim().replace(/\/+$/, '')
  const key = apiKey.value.trim()
  const mdl = model.value.trim()
  if (!url || !key || !mdl) {
    testResult.value = { ok: false, text: '请先填写三项配置再测试。' }
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const cfg = { baseUrl: url, apiKey: key, model: mdl, fingerprintHash: '' }
    const reply = await chatOnce(cfg, [{ role: 'user', content: '回复一个字：好' }], { timeoutMs: 20_000 })
    testResult.value = { ok: true, text: `连接成功，模型返回：${reply.slice(0, 60)}` }
  } catch (err) {
    const msg = err instanceof LlmRequestError ? err.message : (err as Error).message
    testResult.value = { ok: false, text: `连接失败：${msg}` }
  } finally {
    testing.value = false
  }
}

async function onClearConfig() {
  if (!window.confirm('确定清除本机保存的 LLM 配置？此操作不可撤销。')) return
  clearTutorConfig()
  apiKey.value = ''
  testResult.value = null
  await refreshConfig()
  await refresh()
}

async function onClearHistory() {
  if (!window.confirm('确定清除全部助学对话记录？此操作不可撤销，会话与消息将全部删除。')) return
  await clearAll()
  window.alert('助学对话记录已清除')
}
</script>

<template>
  <div>
    <div class="crumb"><NuxtLink to="/">知识岛</NuxtLink><span>/</span><span>助手设置</span></div>
    <div class="view-head">
      <h1>助手设置</h1>
      <p>配置助学 Agent 的 OpenAI 兼容端点（全站共享一套，独立于课程）</p>
    </div>

    <div v-if="status === 'stale'" class="card tutor-stale">
      <b>⚠ 本机环境已变化，配置已重置</b>
      <p class="small">
        设备指纹与加密时不一致，之前的配置无法解密，已被忽略。请重新填写并保存；其他学习数据与对话记录不受影响。
      </p>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top: 0">LLM 端点</div>
      <p class="small muted">
        需要 OpenAI Chat Completions 兼容接口（支持 <code>POST /chat/completions</code> 与 SSE 流式）。
        baseUrl 完全自由，不做白名单限制；请确认端点允许浏览器跨域（CORS）。
      </p>

      <div class="setting-row">
        <label for="llm-base">Base URL</label>
        <input
          id="llm-base"
          type="text"
          v-model="baseUrl"
          placeholder="https://api.openai.com/v1"
          @input="markDirty"
        />
      </div>
      <div class="setting-row">
        <label for="llm-key">API Key</label>
        <input
          id="llm-key"
          :type="showKey ? 'text' : 'password'"
          v-model="apiKey"
          placeholder="sk-…"
          autocomplete="off"
          @input="markDirty"
        />
        <button type="button" class="btn ghost sm" @click="showKey = !showKey">
          {{ showKey ? '隐藏' : '显示' }}
        </button>
      </div>
      <div class="setting-row">
        <label for="llm-model">模型名</label>
        <input id="llm-model" type="text" v-model="model" placeholder="gpt-4o-mini" @input="markDirty" />
      </div>

      <div class="btn-row" style="margin-top: 14px">
        <button type="button" class="btn primary" :disabled="loading" @click="onSave">保存配置</button>
        <button type="button" class="btn" :disabled="testing" @click="onTest">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <NuxtLink to="/" class="btn ghost">返回首页</NuxtLink>
      </div>

      <p v-if="saved && !loading" class="tutor-ok">✓ 配置已加密保存在本机，答疑 / 追问可用。</p>
      <p v-else-if="!saved && !loading" class="tutor-absent small muted">
        尚未保存配置：助学助手将以「本地导航模式」运行。
      </p>
      <p v-if="testResult" class="tutor-test" :class="testResult.ok ? 'ok' : 'no'">{{ testResult.text }}</p>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="section-title" style="margin-top: 0">隐私与存储</div>
      <ul class="note-list small">
        <li>
          <b>配置绑定本机设备</b>：API Key 经 AES-GCM 加密后存于本机
          localStorage，密钥由设备指纹派生；换浏览器 / 设备或指纹漂移即无法解密，会提示重新配置。
        </li>
        <li>
          <b>Key 随请求发出</b>：调用时以
          <code>Authorization: Bearer</code>
          明文发往你配置的端点，不会发到本站点服务器（本功能纯客户端，无服务端）。
        </li>
        <li>
          <b>对话记录</b>：存于浏览器 OPFS，按课时 / 课程分组，每组保留最近 10 轮；学情导出 JSON 不含 LLM
          配置与对话记录。
        </li>
        <li><b>可降级</b>：未配置或调用失败时，本地「下一步导航」仍可离线使用，站点其余功能不受影响。</li>
      </ul>
      <div class="btn-row" style="margin-top: 14px">
        <button type="button" class="btn ghost sm" @click="onClearConfig">清除本机配置</button>
        <button type="button" class="btn ghost sm" @click="onClearHistory">清除全部对话记录</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setting-row input[type='text'],
.setting-row input[type='password'] {
  flex: 1 1 320px;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 16px;
  min-height: 42px;
}
.setting-row input:focus {
  outline: none;
  border-color: var(--primary);
}
.tutor-stale {
  background: var(--warn-soft);
  border-color: transparent;
  margin-bottom: 16px;
}
.tutor-stale b {
  color: var(--warn);
}
.tutor-stale p {
  margin: 6px 0 0;
}
.tutor-ok {
  margin: 12px 0 0;
  color: var(--ok);
  font-size: 13px;
  font-weight: 600;
}
.tutor-absent {
  margin: 12px 0 0;
}
.tutor-test {
  margin: 10px 0 0;
  font-size: 12.5px;
  padding: 8px 10px;
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.tutor-test.ok {
  background: var(--ok-soft);
  color: var(--ok);
}
.tutor-test.no {
  background: var(--danger-soft);
  color: var(--danger);
}
code {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
@media (max-width: 780px) {
  .setting-row input[type='text'],
  .setting-row input[type='password'] {
    flex: 1 1 100%;
  }
}
</style>
