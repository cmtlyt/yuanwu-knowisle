<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import { difficultyDots } from '~/lib/difficulty'
import { lessonMinutes } from '~/lib/lesson-time'

const router = useRouter()
const {
  course,
  data,
  base,
  stages,
  modules,
  lessons,
  conceptName,
  lessonPath,
  stagesOfModule,
  subStagesOf,
  subStageName,
} = useRequiredCourse()
const learning = useLearning()

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const overall = computed(() => engine.value.overall(state.value))
const recommend = computed(() => engine.value.recommend(state.value))
const reviews = computed(() => engine.value.reviewQueue(state.value))

const isDone = (id: string) => !!state.value.lessons[id]?.completedAt
const needsReview = (l: { concepts: string[] }) =>
  l.concepts.some((cid) => reviews.value.some((r) => r.cid === cid))
const stageRow = (id: number) => overall.value.stageRows.find((r) => r.id === id)
const moduleRow = (id: number) => overall.value.moduleRows.find((r) => r.id === id)
const lessonsOfStage = (stageId: number) => lessons.value.filter((l) => l.stage === stageId)
const lessonsOfSub = (stageId: number, subId: string) =>
  lessons.value.filter((l) => l.stage === stageId && (l.subStage ?? null) === subId)
const orphanLessons = (stageId: number) =>
  lessons.value.filter((l) => l.stage === stageId && (l.subStage ?? null) === null)

function goStage(stageId: number) {
  const rows = lessonsOfStage(stageId)
  const l = rows.find((x) => !isDone(x.id)) || rows[0]
  if (l) router.push(lessonPath(l.id))
}
function goLesson(id: string) {
  router.push(lessonPath(id))
}
function scrollToModule(id: number) {
  if (import.meta.client) document.getElementById('mod-' + id)?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div>
    <div class="crumb"><NuxtLink to="/">知识岛</NuxtLink><span>/</span><span>{{ course!.title }}</span></div>

    <div class="hero">
      <h2>{{ course!.tagline || course!.subtitle }}</h2>
      <p>
        {{ modules.length }} 个模块 · {{ stages.length }} 个阶段 · {{ lessons.length }} 课时 ·
        {{ data!.CONCEPTS.length }} 个知识点，每课都配原理演练与即时反馈。
      </p>
      <div class="small" style="margin: 0 0 14px; color: var(--primary)">
        📌 <b>学情建议</b>：{{ recommend.advice }}
      </div>
      <div class="btn-row">
        <NuxtLink v-if="recommend.next" :to="lessonPath(recommend.next.lesson.id)" class="btn primary">
          继续学习：{{ recommend.next.lesson.id }} {{ recommend.next.lesson.title }}
        </NuxtLink>
        <NuxtLink v-if="reviews.length" :to="`${base}/review`" class="btn ghost"
          >今日复习（{{ reviews.length }}）</NuxtLink
        >
        <NuxtLink :to="`${base}/dashboard`" class="btn">查看学情分析</NuxtLink>
      </div>
    </div>

    <!-- 模块导航条：快速跳转到模块 -->
    <div class="section-title">学习路径 · {{ modules.length }} 个模块</div>
    <div class="mod-nav">
      <button
        v-for="m in modules"
        :key="m.id"
        type="button"
        class="mod-chip"
        :style="{ '--mod-color': m.color }"
        @click="scrollToModule(m.id)"
      >
        <span class="mod-name">{{ m.name }}</span>
        <span class="mod-meta"
          >掌握度 {{ moduleRow(m.id)?.mastery ?? 0 }}% · {{ moduleRow(m.id)?.done ?? 0 }}/{{
            moduleRow(m.id)?.lessonCount ?? 0
          }}
          课</span
        >
      </button>
      <div v-if="!modules.length" class="muted small">该课程未配置模块数据。</div>
    </div>

    <!-- 模块手风琴 -->
    <template v-for="m in modules" :key="m.id">
      <div :id="`mod-${m.id}`" class="module-block" :style="{ '--mod-color': m.color }">
        <div class="mod-head">
          <div class="section-title module-title">
            <span class="mod-dot" />{{ m.name }} <span class="en">{{ m.en }}</span>
          </div>
          <span class="mod-mastery pill">掌握度 {{ moduleRow(m.id)?.mastery ?? 0 }}%</span>
        </div>
        <div class="mod-desc">{{ m.summary }}<span class="mod-goal">🎯 {{ m.goal }}</span></div>

        <template v-for="s in stagesOfModule(m.id)" :key="s.id">
          <div
            class="card stage-card"
            style="cursor: pointer; margin-top: 14px"
            :style="{ '--stage-color': s.color }"
            @click="goStage(s.id)"
          >
            <h3>{{ s.name }} <span class="en">{{ s.en }}</span></h3>
            <div class="muted small">{{ s.summary }}</div>
            <div class="goal">🎯 {{ s.goal }}</div>
            <div class="mbar">
              <span>掌握度 {{ stageRow(s.id)?.mastery ?? 0 }}%</span>
              <div class="bar"><i :style="{ width: `${stageRow(s.id)?.mastery ?? 0}%` }" /></div>
            </div>
            <div class="muted small" style="margin-top: 8px">
              课时 {{ stageRow(s.id)?.done ?? 0 }}/{{ stageRow(s.id)?.lessonCount ?? 0 }} 完成 · 知识点
              {{ stageRow(s.id)?.learned ?? 0 }}/{{ stageRow(s.id)?.total ?? 0 }} 已接触
            </div>
          </div>

          <!-- 子阶段三级头：仅当该阶段定义了 subStages -->
          <template v-if="subStagesOf(s.id).length">
            <template v-for="sub in subStagesOf(s.id)" :key="sub.id">
              <div class="sub-title">
                <span class="sub-dot" />{{ sub.name
                }}<span v-if="sub.summary" class="muted small"> — {{ sub.summary }}</span>
              </div>
              <div class="grid c2" style="margin-top: 10px">
                <div
                  v-for="l in lessonsOfSub(s.id, sub.id)"
                  :key="l.id"
                  class="lesson-card"
                  @click="goLesson(l.id)"
                >
                  <span class="num">{{ l.id }}</span>
                  <div>
                    <div class="t">{{ l.title }}</div>
                    <div class="meta">
                      <span>⏱ {{ lessonMinutes(l) }} min</span>
                      <span>难度 {{ difficultyDots(l.difficulty) }}</span>
                      <span>{{ l.concepts.map(conceptName).join(' / ') }}</span>
                    </div>
                  </div>
                  <span class="state pill" :class="{ ok: isDone(l.id) }">
                    {{ isDone(l.id) ? '✓ 已完成' : needsReview(l) ? '建议复习' : '未开始' }}
                  </span>
                </div>
              </div>
            </template>
            <!-- 不属于任何子阶段的基础课时 -->
            <div v-if="orphanLessons(s.id).length" class="sub-title">基础课时</div>
            <div v-if="orphanLessons(s.id).length" class="grid c2" style="margin-top: 10px">
              <div v-for="l in orphanLessons(s.id)" :key="l.id" class="lesson-card" @click="goLesson(l.id)">
                <span class="num">{{ l.id }}</span>
                <div>
                  <div class="t">{{ l.title }}</div>
                  <div class="meta">
                    <span>⏱ {{ lessonMinutes(l) }} min</span>
                    <span>难度 {{ difficultyDots(l.difficulty) }}</span>
                    <span>{{ l.concepts.map(conceptName).join(' / ') }}</span>
                  </div>
                </div>
                <span class="state pill" :class="{ ok: isDone(l.id) }">
                  {{ isDone(l.id) ? '✓ 已完成' : needsReview(l) ? '建议复习' : '未开始' }}
                </span>
              </div>
            </div>
          </template>

          <!-- 无子阶段：直接列课时 -->
          <template v-else>
            <div class="grid c2" style="margin-top: 12px">
              <div v-for="l in lessonsOfStage(s.id)" :key="l.id" class="lesson-card" @click="goLesson(l.id)">
                <span class="num">{{ l.id }}</span>
                <div>
                  <div class="t">{{ l.title }}</div>
                  <div class="meta">
                    <span>⏱ {{ lessonMinutes(l) }} min</span>
                    <span>难度 {{ difficultyDots(l.difficulty) }}</span>
                    <span>{{ l.concepts.map(conceptName).join(' / ') }}</span>
                  </div>
                </div>
                <span class="state pill" :class="{ ok: isDone(l.id) }">
                  {{ isDone(l.id) ? '✓ 已完成' : needsReview(l) ? '建议复习' : '未开始' }}
                </span>
              </div>
            </div>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mod-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.mod-chip {
  flex: 1 1 180px;
  min-width: 160px;
  text-align: left;
  background: color-mix(in srgb, var(--mod-color) 10%, var(--surface));
  border: 0.5px solid var(--border);
  border-left: 3px solid var(--mod-color);
  border-radius: var(--radius);
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}
.mod-chip:hover {
  background: color-mix(in srgb, var(--mod-color) 18%, var(--surface));
  border-color: var(--mod-color);
}
.mod-name {
  display: block;
  font-weight: 500;
  font-size: 13px;
}
.mod-meta {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.module-block {
  margin-top: 26px;
}
.mod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.module-title {
  font-size: 16px !important;
  margin: 0;
}
.mod-mastery {
  font-weight: 500;
  background: color-mix(in srgb, var(--mod-color) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--mod-color) 30%, var(--border));
  color: var(--text);
}
.mod-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mod-goal {
  color: var(--text);
}
.mod-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mod-color);
  margin-right: 8px;
}
.sub-title {
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--mod-color);
  opacity: 0.7;
}
</style>
