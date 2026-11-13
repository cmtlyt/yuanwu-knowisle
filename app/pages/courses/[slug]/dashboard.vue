<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import RadarChart from '~/components/course/radar-chart.vue'
import TimelineChart from '~/components/course/timeline-chart.vue'

const { course, data, base, stages, lessonPath } = useRequiredCourse()
const learning = useLearning()

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const overall = computed(() => engine.value.overall(state.value))
const recommend = computed(() => engine.value.recommend(state.value))
const reviews = computed(() => engine.value.reviewQueue(state.value))
const diagnosis = computed(() => engine.value.diagnose(state.value))
const timeline = computed(() => engine.value.timeline(state.value, 14))
</script>

<template>
  <div>
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span><NuxtLink :to="base">{{ course!.title }}</NuxtLink
      ><span>/</span><span>学情仪表盘</span>
    </div>
    <div class="view-head">
      <h1>学情仪表盘</h1>
      <p>基于概念级掌握度、记忆保持度与答题轨迹的持续评估 · 数据保存在本机</p>
    </div>

    <div class="grid c4">
      <div class="card kpi">
        <div class="v">{{ overall.progress }}%</div>
        <div class="l">课程进度 {{ overall.doneCount }}/{{ overall.lessonCount }}</div>
      </div>
      <div class="card kpi">
        <div class="v">{{ overall.mastery }}</div>
        <div class="l">综合掌握度</div>
      </div>
      <div class="card kpi">
        <div class="v">{{ overall.accuracy }}%</div>
        <div class="l">累计正确率（{{ overall.quizTotal }} 题）</div>
      </div>
      <div class="card kpi">
        <div class="v">{{ overall.streak }} 天</div>
        <div class="l">连续学习（累计 {{ overall.minutes }} 分钟）</div>
      </div>
    </div>

    <div class="hero" style="margin-top: 16px">
      <h2>下一步建议</h2>
      <p>{{ recommend.advice }}</p>
      <div class="btn-row">
        <NuxtLink v-if="recommend.next" :to="lessonPath(recommend.next.lesson.id)" class="btn primary"
          >前往 {{ recommend.next.lesson.id }}</NuxtLink
        >
        <NuxtLink v-if="reviews.length" :to="`${base}/review`" class="btn ghost">开始复习</NuxtLink>
      </div>
    </div>

    <div class="grid c2" style="margin-top: 18px">
      <div class="card">
        <div class="section-title" style="margin-top: 0">能力雷达（按阶段）</div>
        <RadarChart :rows="overall.stageRows" />
      </div>
      <div class="card">
        <div class="section-title" style="margin-top: 0">阶段掌握度</div>
        <div v-for="r in overall.stageRows" :key="r.id" class="concept-row">
          <span>{{ r.name }}</span>
          <div class="bar"><i :style="{ width: `${r.mastery}%` }" /></div>
          <span class="val">{{ r.mastery }}</span>
        </div>
        <div class="muted small">
          <br />掌握度 = 近期表现 30% + 历史正确率 20% + 记忆保持度 25% + 练习覆盖 25%
        </div>
      </div>
    </div>

    <div class="section-title">知识点掌握度明细</div>
    <div class="card">
      <template v-for="s in stages" :key="s.id">
        <div class="small"><b>{{ s.name }}</b></div>
        <div v-for="c in data!.CONCEPTS.filter((x) => x.stage === s.id)" :key="c.id" class="concept-row">
          <span>{{ c.name }}</span>
          <div class="bar"><i :style="{ width: `${overall.cmap[c.id].mastery}%` }" /></div>
          <span
            class="val"
            :style="{
              color:
                overall.cmap[c.id].status === 'solid'
                  ? 'var(--ok)'
                  : overall.cmap[c.id].status === 'developing'
                    ? 'var(--warn)'
                    : overall.cmap[c.id].status === 'weak'
                      ? 'var(--danger)'
                      : 'var(--muted)',
            }"
            >{{ overall.cmap[c.id].total ? overall.cmap[c.id].mastery : '—' }}</span
          >
        </div>
      </template>
    </div>

    <div class="grid c2" style="margin-top: 18px">
      <div class="card">
        <div class="section-title" style="margin-top: 0">近 14 天学习时长（分钟）</div>
        <TimelineChart :days="timeline" />
        <div class="muted small">
          每日目标：{{ state.profile.dailyGoal }} 分钟　·　目标只在本地用于自我提醒
        </div>
      </div>
      <div class="card">
        <div class="section-title" style="margin-top: 0">薄弱点归因</div>
        <div v-if="!diagnosis.length" class="empty-state">
          <div class="big">🎯</div>
          暂无明显薄弱点。继续推进课时，系统会持续追踪。
        </div>
        <template v-else>
          <div v-for="d in diagnosis" :key="d.cid" class="diag-item">
            <div class="t">{{ d.name }}　<span class="pill danger">{{ d.mastery }} 分</span></div>
            <div class="c">{{ d.cause }}</div>
            <div class="a">→ {{ d.action }}</div>
            <NuxtLink
              v-if="d.lessonId"
              :to="lessonPath(d.lessonId)"
              class="btn ghost sm"
              style="margin-top: 8px"
              >回到 {{ d.lessonId }}</NuxtLink
            >
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
