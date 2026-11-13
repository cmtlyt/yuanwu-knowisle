<script setup lang="ts">
import { courseBase, availableCourses, COURSES } from '~/data/courses'
import { useCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'

interface Tab {
  label: string
  short: string
  icon: string
  to: string
}

const { route, course, base, data, stages, lessons } = useCourse()
const learning = useLearning()

const themeCourse = computed(() => course.value || availableCourses()[0])
const state = computed(() => (themeCourse.value ? learning.stateOf(themeCourse.value) : null))
const engine = computed(() => (course.value ? learning.engineOf(course.value) : null))
const overall = computed(() => {
  if (!course.value || !state.value || !engine.value) return null
  return engine.value.overall(state.value)
})

const theme = computed(() => state.value?.profile.theme || 'light')
function applyTheme() {
  if (import.meta.client) document.documentElement.dataset.theme = theme.value
}
watch(theme, applyTheme, { immediate: true })
function toggleTheme() {
  if (!themeCourse.value) return
  learning.mutate(themeCourse.value, (s) => {
    s.profile.theme = s.profile.theme === 'dark' ? 'light' : 'dark'
  })
}

const tabs = computed<Tab[]>(() =>
  course.value
    ? [
        { label: '课程地图', short: '地图', icon: '🗺', to: base.value },
        { label: '学情仪表盘', short: '学情', icon: '📊', to: `${base.value}/dashboard` },
        { label: '复习中心', short: '复习', icon: '🔁', to: `${base.value}/review` },
        { label: '教学准备', short: '教学', icon: '🧰', to: `${base.value}/teacher` },
        { label: '教学设计', short: '设计', icon: '📘', to: `${base.value}/design` },
        { label: '设置', short: '设置', icon: '⚙', to: `${base.value}/settings` },
      ]
    : [
        { label: '知识岛', short: '首页', icon: '🏝', to: '/' },
        // 由注册表驱动：新增可用课程自动出现在首页导航（不硬编码 effect-ts）
        ...availableCourses().map((c) => ({
          label: c.title,
          short: c.title.replace(/ 深度课$/, ''),
          icon: c.icon,
          to: courseBase(c.slug),
        })),
      ],
)

function isActive(t: Tab) {
  if (t.to === base.value && course.value) {
    return route.path === base.value || route.path.startsWith(`${base.value}/lessons/`)
  }
  return route.path === t.to || route.path.startsWith(`${t.to}/`)
}

/* ---------- 抽屉（移动端课程目录） ---------- */
const drawerOpen = ref(false)
function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}
function closeDrawer() {
  drawerOpen.value = false
}
watch(
  drawerOpen,
  (v) => {
    if (import.meta.client) document.body.classList.toggle('nav-open', v)
  },
  { immediate: true },
)
watch(() => route.fullPath, closeDrawer)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeDrawer()
}
function onResize() {
  if (window.innerWidth > 780) closeDrawer()
}
onMounted(() => {
  applyTheme()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  syncOpenStages()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})

/* ---------- 侧栏阶段展开 ---------- */
const openStages = ref<Record<number, boolean>>({})
function toggleStage(id: number) {
  openStages.value = { ...openStages.value, [id]: !openStages.value[id] }
}
function syncOpenStages() {
  const lid = String(route.params.id || '')
  const hit = lessons.value.find((l) => l.id === lid)
  const first = hit
    ? hit.stage
    : import.meta.client && window.innerWidth <= 780
      ? stages.value[0]?.id
      : undefined
  openStages.value = first === undefined ? {} : { [first]: true }
}
watch(() => route.fullPath, syncOpenStages)

const isDone = (id: string) => !!state.value?.lessons[id]?.completedAt
const sidebarCourses = COURSES.filter((c) => c.status === 'available')
</script>

<template>
  <div class="app">
    <header class="topbar">
      <button
        id="menuBtn"
        class="icon-btn menu-btn"
        type="button"
        title="打开目录"
        aria-label="打开目录"
        :aria-expanded="drawerOpen"
        @click="toggleDrawer"
      >
        ☰
      </button>
      <NuxtLink to="/" class="brand">
        <span class="logo">E</span>
        <span class="t">{{ course ? course.title : '源悟的知识岛' }}</span>
      </NuxtLink>
      <span v-if="course && data" class="ver-badge" :title="`版本基线核实于 ${data.META.verifiedAt}`">
        {{ data.META.version }} · LTS
      </span>
      <nav id="nav" class="nav">
        <NuxtLink
          v-for="t in tabs"
          :key="t.to"
          :to="t.to"
          :title="t.label"
          :aria-label="t.label"
          :class="{ active: isActive(t) }"
        >
          <span class="ico" aria-hidden="true">{{ t.icon }}</span>
          <span class="lbl">{{ t.label }}</span>
          <span class="short">{{ t.short }}</span>
        </NuxtLink>
      </nav>
      <button
        id="themeBtn"
        class="icon-btn"
        type="button"
        title="切换主题"
        aria-label="切换主题"
        @click="toggleTheme"
      >
        {{ theme === 'dark' ? '☀' : '☾' }}
      </button>
    </header>

    <div class="layout">
      <aside id="sidebar" class="sidebar">
        <div class="drawer-head">
          <b>{{ course ? '课程目录' : '知识岛导航' }}</b>
          <button class="icon-btn" type="button" aria-label="关闭目录" @click="closeDrawer">✕</button>
        </div>

        <template v-if="course && data">
          <div class="side-title">学习路径 · {{ lessons.length }} 课时</div>
          <div class="side-progress">
            <div class="big">{{ overall?.progress ?? 0 }}%</div>
            <div class="sub">
              已完成 {{ overall?.doneCount ?? 0 }} / {{ lessons.length }} 课时　·　连续
              {{ overall?.streak ?? 0 }} 天
            </div>
            <div class="bar"><i :style="{ width: `${overall?.progress ?? 0}%` }" /></div>
          </div>

          <div v-for="s in stages" :key="s.id" class="stage-group">
            <button class="stage-head" type="button" @click="toggleStage(s.id)">
              <span class="stage-dot" :style="{ background: s.color }" />
              <span>{{ s.name }}</span>
              <span class="cnt"
                >{{ lessons.filter((l) => l.stage === s.id && isDone(l.id)).length }}/{{
                  lessons.filter((l) => l.stage === s.id).length
                }}</span
              >
            </button>
            <div v-show="openStages[s.id]" class="lesson-list">
              <NuxtLink
                v-for="l in lessons.filter((x) => x.stage === s.id)"
                :key="l.id"
                :to="`${base}/lessons/${l.id}`"
                class="lesson-item"
                :class="{ done: isDone(l.id), active: route.params.id === l.id }"
              >
                <span class="mark">{{ isDone(l.id) ? '✓' : '○' }}</span>
                <span>{{ l.id }} {{ l.title }}</span>
              </NuxtLink>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="side-title">知识岛 · 课程</div>
          <div v-for="c in sidebarCourses" :key="c.slug" class="stage-group">
            <NuxtLink :to="courseBase(c.slug)" class="lesson-item">
              <span class="mark">{{ c.icon }}</span><span>{{ c.title }}</span>
            </NuxtLink>
          </div>
          <div class="side-progress">
            <div class="sub">所有学习进度保存在本机浏览器，可在课程设置页导出 JSON 备份。</div>
          </div>
        </template>
      </aside>

      <main id="main" class="main">
        <slot />
      </main>
    </div>
  </div>
  <div class="drawer-backdrop" @click="closeDrawer" />
</template>
