<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import QuizCard from '~/components/course/quiz-card.vue'
import type { Lesson, QuizQuestion } from '~/types/course'

const { course, base, lessons, lessonPath } = useRequiredCourse()
const learning = useLearning()

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const reviews = computed(() => engine.value.reviewQueue(state.value))
const wrongAttempts = computed(() =>
  state.value.attempts
    .filter((a) => !a.correct)
    .slice(-12)
    .reverse(),
)

interface Picked {
  lesson: Lesson
  qi: number
  q: QuizQuestion
}
const session = ref<{ cid: string; name: string; picked: Picked | null } | null>(null)

function pick(cid: string): Picked | null {
  const pool: Picked[] = []
  lessons.value.forEach((l) =>
    l.quiz.forEach((q, qi) => {
      if (q.concept === cid) pool.push({ lesson: l, qi, q })
    }),
  )
  return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null
}
function startReview(cid: string, name: string) {
  session.value = { cid, name, picked: pick(cid) }
}
function repick() {
  if (session.value) session.value.picked = pick(session.value.cid)
}
function onAnswer(correct: boolean) {
  if (!session.value?.picked) return
  const { lesson, qi, q } = session.value.picked
  learning.mutate(course.value, (s) => engine.value.recordAttempt(s, lesson.id, qi, correct, q.concept, true))
}
function questionText(a: { lessonId: string; qIndex: number }) {
  const l = lessons.value.find((x) => x.id === a.lessonId)
  return l?.quiz[a.qIndex]?.text || '（题目已更新）'
}
</script>

<template>
  <div>
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span><NuxtLink :to="base">{{ course!.title }}</NuxtLink
      ><span>/</span><span>复习中心</span>
    </div>
    <div class="view-head">
      <h1>复习中心</h1>
      <p>按遗忘曲线排出的复习队列：优先练记忆保持度最低的概念，答对会延长下次复习间隔</p>
    </div>

    <div v-if="!reviews.length" class="card empty-state">
      <div class="big">🌱</div>
      目前没有进入遗忘区的概念。先去课程地图推进新课时吧。
    </div>
    <div v-else class="card">
      <div class="section-title" style="margin-top: 0">今日复习队列（{{ reviews.length }}）</div>
      <div v-for="r in reviews" :key="r.cid" class="review-item">
        <div style="flex: 1">
          <div class="name">{{ r.name }}</div>
          <div class="muted small">{{ r.reason }}　·　掌握度 {{ r.mastery }}</div>
        </div>
        <div class="bar"><i :style="{ width: `${r.retention}%` }" /></div>
        <span class="mono small">{{ r.retention }}%</span>
        <button type="button" class="btn primary sm" @click="startReview(r.cid, r.name)">练一题</button>
      </div>
    </div>

    <div v-if="session?.picked" class="card" style="margin-top: 16px">
      <div class="section-title" style="margin-top: 0">
        复习：{{ session.name }} <span class="pill">{{ session.picked.lesson.id }}</span>
      </div>
      <QuizCard
        :key="`${session.cid}:${session.picked.lesson.id}:${session.picked.qi}`"
        :question="session.picked.q"
        :index="0"
        review
        @answer="onAnswer"
      />
      <div class="btn-row" style="margin-top: 10px">
        <button type="button" class="btn ghost sm" @click="repick">换一题</button>
        <button type="button" class="btn sm" @click="session = null">结束复习</button>
      </div>
    </div>

    <div class="section-title">最近错题</div>
    <div class="card">
      <div v-if="!wrongAttempts.length" class="muted small">暂无错题记录。</div>
      <div v-for="(a, i) in wrongAttempts" :key="i" class="review-item">
        <span class="pill danger">{{ a.concept }}</span>
        <span style="flex: 1">{{ questionText(a) }}</span>
        <span class="muted small">{{ a.lessonId }}</span>
        <NuxtLink :to="lessonPath(a.lessonId)" class="btn ghost sm">重做</NuxtLink>
      </div>
    </div>
  </div>
</template>
