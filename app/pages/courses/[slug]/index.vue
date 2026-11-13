<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'

const router = useRouter()
const { course, data, base, stages, lessons, conceptName, lessonPath } = useRequiredCourse()
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

function goStage(stageId: number) {
  const rows = lessons.value.filter((l) => l.stage === stageId)
  const l = rows.find((x) => !isDone(x.id)) || rows[0]
  if (l) router.push(lessonPath(l.id))
}
function goLesson(id: string) {
  router.push(lessonPath(id))
}
</script>

<template>
  <div>
    <div class="crumb"><NuxtLink to="/">知识岛</NuxtLink><span>/</span><span>{{ course!.title }}</span></div>

    <div class="hero">
      <h2>{{ course!.tagline || course!.subtitle }}</h2>
      <p>
        {{ stages.length }} 个阶段 · {{ lessons.length }} 课时 ·
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

    <div class="section-title">六个阶段 · 平缓递进</div>
    <div class="grid c2">
      <div
        v-for="s in stages"
        :key="s.id"
        class="card stage-card"
        style="cursor: pointer"
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
    </div>

    <div class="section-title">全部课时</div>
    <template v-for="s in stages" :key="`g-${s.id}`">
      <div class="section-title" style="margin-top: 20px">
        <span :style="{ width: '9px', height: '9px', borderRadius: '50%', background: s.color }" />{{
          s.name
        }}
      </div>
      <div class="grid c2">
        <div
          v-for="l in lessons.filter((x) => x.stage === s.id)"
          :key="l.id"
          class="lesson-card"
          @click="goLesson(l.id)"
        >
          <span class="num">{{ l.id }}</span>
          <div>
            <div class="t">{{ l.title }}</div>
            <div class="meta">
              <span>⏱ {{ l.minutes }} min</span>
              <span>难度 {{ '●'.repeat(l.difficulty) }}{{ '○'.repeat(5 - l.difficulty) }}</span>
              <span>{{ l.concepts.map(conceptName).join(' / ') }}</span>
            </div>
          </div>
          <span class="state pill" :class="{ ok: isDone(l.id) }">
            {{ isDone(l.id) ? '✓ 已完成' : needsReview(l) ? '建议复习' : '未开始' }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
