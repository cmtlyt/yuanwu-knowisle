<script setup lang="ts">
import { COURSES, courseBase } from '~/data/courses'
import { useLearning } from '~/composables/use-learning'
import type { CourseEntry } from '~/types/course'

const learning = useLearning()
const available = COURSES.filter((c) => c.status === 'available' && !!c.data)
const totalLessons = COURSES.reduce((n, c) => n + (c.data?.LESSONS.length || 0), 0)
const totalConcepts = COURSES.reduce((n, c) => n + (c.data?.CONCEPTS.length || 0), 0)

function progressOf(c: CourseEntry): number {
  if (!c.data) return 0
  return learning.engineOf(c).overall(learning.stateOf(c)).progress
}
const myProgress = computed(() =>
  available.length ? Math.round(available.reduce((n, c) => n + progressOf(c), 0) / available.length) : 0,
)
</script>

<template>
  <div>
    <div class="island-hero">
      <h1>🏝 源悟的知识岛</h1>
      <p>
        把每一门想学的技术做成一座可以反复回来的岛：完整课程、可动手的原理演练、即时反馈，以及会随时间追踪掌握度的学情档案。所有数据只存在你自己的浏览器里。
      </p>
      <div class="island-stats">
        <div><b>{{ available.length }}</b>门课程</div>
        <div><b>{{ totalLessons }}</b>课时</div>
        <div><b>{{ totalConcepts }}</b>知识点</div>
        <div><b>{{ myProgress }}%</b>我的总进度</div>
      </div>
    </div>

    <div class="section-title">课程</div>
    <div class="grid c2">
      <NuxtLink
        v-for="c in COURSES.filter((x) => x.status === 'available')"
        :key="c.slug"
        :to="courseBase(c.slug)"
        class="course-card"
        :style="{ '--course-color': c.color }"
      >
        <div class="cc-icon">{{ c.icon }}</div>
        <h3>{{ c.title }}</h3>
        <div class="cc-sub">{{ c.subtitle }}</div>
        <div class="cc-desc">{{ c.description }}</div>
        <div class="cc-tags"><span v-for="t in c.tags" :key="t" class="pill">{{ t }}</span></div>
        <div class="cc-foot">
          <span>{{ progressOf(c) }}%</span>
          <div class="bar"><i :style="{ width: `${progressOf(c)}%` }" /></div>
          <span>进入课程 →</span>
        </div>
      </NuxtLink>

      <div
        v-for="c in COURSES.filter((x) => x.status === 'soon')"
        :key="c.slug"
        class="course-card soon"
        :style="{ '--course-color': c.color }"
      >
        <div class="cc-icon">{{ c.icon }}</div>
        <h3>{{ c.title }}</h3>
        <div class="cc-sub">{{ c.subtitle }}</div>
        <div class="cc-desc">{{ c.description }}</div>
        <div class="cc-tags"><span v-for="t in c.tags" :key="t" class="pill">{{ t }}</span></div>
        <div class="cc-foot"><span>尚未开放</span></div>
      </div>
    </div>

    <div class="section-title">关于这座岛</div>
    <div class="card">
      <ul class="note-list">
        <li>
          <b>课程为单位</b>：每门课有独立的学习路径、概念图谱与学情档案，新增课程只需在
          <code>app/data/courses.ts</code> 注册。
        </li>
        <li>
          <b>内容即数据</b>：每门课的课时、概念、题目、术语、误区集中在
          <code>app/data/&lt;slug&gt;-course/</code> 目录（index.ts 聚合 +
          逐课时文件），加课时不改动引擎与视图。
        </li>
        <li>
          <b>学情会遗忘</b
          >：掌握度由近期表现、历史正确率、记忆保持度与练习覆盖加权计算，久未复习的概念会进入复习队列。
        </li>
        <li><b>数据属于你</b>：进度保存在本机 localStorage，可在课程设置页导出 / 导入 JSON 备份。</li>
      </ul>
    </div>
  </div>
</template>
