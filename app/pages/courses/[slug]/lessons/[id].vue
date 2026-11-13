<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import LessonBlock from '~/components/course/lesson-block.vue'
import QuizCard from '~/components/course/quiz-card.vue'
import CourseWidget from '~/components/course/course-widget.vue'

definePageMeta({ key: (route) => route.fullPath })

const router = useRouter()
const route = useRoute()
const { course, base, lessons, stageById, conceptName, lessonPath } = useRequiredCourse()
const learning = useLearning()

const lessonId = computed(() => String(route.params.id || ''))
const lesson = computed(() => lessons.value.find((l) => l.id === lessonId.value))
if (!lesson.value) throw createError({ statusCode: 404, statusMessage: '课时不存在' })

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const isDone = computed(() => !!state.value.lessons[lesson.value!.id]?.completedAt)
const missing = computed(() => lesson.value!.prereqs.filter((p) => !state.value.lessons[p]?.completedAt))
const idx = computed(() => lessons.value.findIndex((l) => l.id === lesson.value!.id))
const prev = computed(() => lessons.value[idx.value - 1])
const next = computed(() => lessons.value[idx.value + 1])

let enteredAt = 0
onMounted(() => {
  enteredAt = Date.now()
  learning.mutate(course.value, (s) => engine.value.visitLesson(s, lesson.value!.id))
})
onBeforeUnmount(() => {
  const sec = Math.min(3600, Math.round((Date.now() - enteredAt) / 1000))
  if (enteredAt && sec > 0) learning.mutate(course.value, (s) => engine.value.addStudySeconds(s, sec))
})

function onAnswer(correct: boolean, qi: number) {
  const q = lesson.value!.quiz[qi]!
  learning.mutate(course.value, (s) =>
    engine.value.recordAttempt(s, lesson.value!.id, qi, correct, q.concept, false),
  )
}
function onWidgetDone() {
  learning.mutate(course.value, (s) => engine.value.markWidgetDone(s, lesson.value!.id))
}
function complete() {
  learning.mutate(course.value, (s) => engine.value.completeLesson(s, lesson.value!.id))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function go(id: string) {
  router.push(lessonPath(id))
}
</script>

<template>
  <div>
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span>
      <NuxtLink :to="base">{{ course!.title }}</NuxtLink><span>/</span><span>{{ lesson!.id }}</span>
    </div>

    <div class="lesson-top">
      <div style="flex: 1">
        <div class="pill">{{ stageById(lesson!.stage)?.name }}</div>
        <h1>{{ lesson!.id }}　{{ lesson!.title }}</h1>
        <div class="lesson-meta">
          <span class="pill">⏱ {{ lesson!.minutes }} min</span>
          <span class="pill">难度 {{ lesson!.difficulty }}/5</span>
          <span class="pill">前置：{{ lesson!.prereqs.length ? lesson!.prereqs.join('、') : '无' }}</span>
        </div>
      </div>
    </div>

    <div class="goal-box">
      <b>本课目标</b>
      <ul>
        <li v-for="(g, i) in lesson!.goals" :key="i">{{ g }}</li>
      </ul>
    </div>

    <div v-if="missing.length" class="callout warn">
      <b>前置课时尚未完成：{{ missing.join('、') }}</b>
      <p>可以自行跳转学习，但按顺序推进会更省力；学情分析会把这类缺口归入「前置缺口」。</p>
    </div>

    <LessonBlock v-for="(b, i) in lesson!.blocks" :key="i" :block="b" />

    <template v-if="lesson!.widget">
      <div class="section-title">交互演练</div>
      <CourseWidget :key="lesson!.id" :name="lesson!.widget" @done="onWidgetDone" />
    </template>

    <div class="section-title">关键术语</div>
    <div class="terms">
      <div v-for="(t, i) in lesson!.terms" :key="i" class="term">
        <b>{{ t[0] }}</b>
        <div>{{ t[1] }}</div>
      </div>
    </div>

    <div class="section-title">常见误区</div>
    <div v-for="(p, i) in lesson!.pitfalls" :key="i" class="pitfall">× {{ p }}</div>

    <div class="section-title">随堂测验（即时反馈，答题计入掌握度）</div>
    <QuizCard
      v-for="(q, qi) in lesson!.quiz"
      :key="`${lesson!.id}:${qi}`"
      :question="q"
      :index="qi"
      :concept-name="conceptName(q.concept)"
      @answer="onAnswer"
    />

    <div class="lesson-footer">
      <button v-if="prev" type="button" class="btn sm" @click="go(prev.id)">← 上一课</button>
      <button v-if="next" type="button" class="btn sm" @click="go(next.id)">下一课 →</button>
      <button type="button" class="btn sm" :class="{ primary: !isDone }" @click="complete">
        {{ isDone ? '✓ 已完成本课' : '完成本课时' }}
      </button>
      <span class="muted small">答题与演练会自动写入学情档案，随时可在仪表盘查看</span>
    </div>
  </div>
</template>
