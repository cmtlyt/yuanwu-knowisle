<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import type { LearningState } from '~/types/course'

const { course, base } = useRequiredCourse()
const learning = useLearning()

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const storageKey = computed(() => course.value.storageKey)

function setProfile(fn: (s: LearningState) => void) {
  learning.mutate(course.value, fn)
}
function setName(e: Event) {
  const v = (e.target as HTMLInputElement).value.slice(0, 40)
  setProfile((s) => {
    s.profile.name = v
  })
}
function setGoal(e: Event) {
  const v = Math.max(5, Math.min(240, Number((e.target as HTMLInputElement).value) || 25))
  setProfile((s) => {
    s.profile.dailyGoal = v
  })
}

function exportBackup() {
  const blob = new Blob([engine.value.exportState(state.value)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `knowisle-${course.value.slug}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileInput = ref<HTMLInputElement | null>(null)
function importBackup(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const imported = engine.value.importState(String(reader.result)) as LearningState
      learning.replace(course.value, imported)
      window.alert('学情档案已导入')
    } catch (err) {
      window.alert(`导入失败：${(err as Error).message}`)
    }
    input.value = ''
  }
  reader.readAsText(f)
}

function clearAll() {
  if (!window.confirm('确定清空全部学习记录？此操作不可撤销，建议先导出备份。')) return
  learning.replace(course.value, engine.value.reset() as LearningState)
}
</script>

<template>
  <div>
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span><NuxtLink :to="base">{{ course!.title }}</NuxtLink
      ><span>/</span><span>设置</span>
    </div>
    <div class="view-head">
      <h1>设置与数据</h1>
      <p>学习目标、外观、学情档案的备份与迁移</p>
    </div>

    <div class="card">
      <div class="setting-row">
        <label>学习者名称</label>
        <input
          type="text"
          :value="state.profile.name"
          placeholder="给自己起个名字"
          maxlength="40"
          @change="setName"
        />
      </div>
      <div class="setting-row">
        <label>每日目标（分钟）</label>
        <input type="number" min="5" max="240" :value="state.profile.dailyGoal" @change="setGoal" />
      </div>
      <div class="setting-row">
        <label>外观主题</label>
        <button
          type="button"
          class="btn sm"
          @click="
            setProfile((s) => {
              s.profile.theme = s.profile.theme === 'dark' ? 'light' : 'dark'
            })
          "
        >
          {{ state.profile.theme === 'dark' ? '切换为浅色' : '切换为深色' }}
        </button>
      </div>
      <div class="setting-row">
        <label>学情档案</label>
        <button type="button" class="btn primary sm" @click="exportBackup">导出 JSON 备份</button>
        <button type="button" class="btn sm" @click="fileInput?.click()">导入备份</button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="importBackup"
        />
        <button type="button" class="btn ghost sm" @click="clearAll">清空学习记录</button>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="section-title" style="margin-top: 0">关于本课程</div>
      <p class="small">
        Nuxt 4 单页应用，内容、引擎、演练、视图四层解耦；所有进度保存在浏览器 localStorage（键：<code>{{
          storageKey
        }}</code
        >），不会上传。
      </p>
      <p class="small">
        从旧的静态课程应用迁移过来越域名不同，旧进度不会自动带过来：请在旧应用「设置」导出
        JSON，再在此页导入。
      </p>
      <p class="small">
        内容基线：<b>{{ course!.data!.META.version }}</b>（核实于 {{ course!.data!.META.verifiedAt }}）。{{
          course!.data!.META.lts
        }}。
      </p>
    </div>
  </div>
</template>
