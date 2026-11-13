<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'

const { course, data, base, lessons } = useRequiredCourse()
const learning = useLearning()

const state = computed(() => learning.stateOf(course.value))
const engine = computed(() => learning.engineOf(course.value))
const report = computed(() => engine.value.teacherReport(state.value))
const flagged = computed(() => report.value.filter((r) => r.flag))
const meta = computed(() => data.value!.META)
</script>

<template>
  <div>
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span><NuxtLink :to="base">{{ course!.title }}</NuxtLink
      ><span>/</span><span>教学准备</span>
    </div>
    <div class="view-head">
      <h1>长期教学准备</h1>
      <p>课程质量视图：内容迭代依据、课时数据、版本基线与扩展方式</p>
    </div>

    <div class="grid c3">
      <div class="card kpi">
        <div class="v">{{ lessons.length }} 课</div>
        <div class="l">当前课程容量</div>
      </div>
      <div class="card kpi">
        <div class="v">{{ data!.CONCEPTS.length }} 个</div>
        <div class="l">知识点图谱节点</div>
      </div>
      <div class="card kpi">
        <div class="v">{{ flagged.length }} 处</div>
        <div class="l">需修订的讲解/题目</div>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="section-title" style="margin-top: 0">版本基线与内容校验</div>
      <p class="small"><b>{{ meta.version }}</b> · 核实于 {{ meta.verifiedAt }} · {{ meta.lts }}</p>
      <ul class="note-list">
        <li v-for="(n, i) in meta.notes" :key="i">{{ n }}</li>
      </ul>
      <div class="btn-row" style="margin-top: 10px">
        <a class="btn sm" :href="meta.docs" target="_blank" rel="noopener">官方文档</a>
        <a class="btn sm" :href="meta.release" target="_blank" rel="noopener">发布公告</a>
        <a class="btn sm" :href="meta.playground" target="_blank" rel="noopener">在线 Playground</a>
        <a class="btn sm" :href="meta.source" target="_blank" rel="noopener">源码仓库</a>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="section-title" style="margin-top: 0">扩课与版本更新机制</div>
      <ul class="note-list">
        <li>
          <b>课程为单位</b>：知识岛首页按 <code>app/data/courses.ts</code> 注册课程，每门课有独立学情
          key；新增课程追加一项即可。
        </li>
        <li>
          <b>内容层独立</b>：全部课时、知识点、测验集中在该课的内容数据文件
          （<code>app/data/&lt;topic&gt;-course.ts</code>），新增课时只需追加一项并登记概念。
        </li>
        <li>
          <b>自动联动</b>：地图、侧栏、雷达、复习队列、薄弱点归因全部按数据生成，新课时自动接入学情模型。
        </li>
        <li>
          <b>版本标注</b>：升级课程所基于的版本时只需更新
          <code>META</code> 并复核受影响的课时代码；本页会标出核实日期与 LTS 承诺。
        </li>
        <li><b>数据可迁移</b>：学情档案按 v1 schema 存于 localStorage，可导出 JSON 备份、跨设备导入。</li>
        <li>
          <b>质量闭环</b>：某课时正确率长期低于 55%（≥3 次作答）会被标记为「需修订」，提示重写讲解或拆细课时。
        </li>
      </ul>
    </div>

    <div class="section-title">课时数据（教学复盘）</div>
    <div class="card tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>课时</th>
            <th>访问</th>
            <th>停留(分)</th>
            <th>作答</th>
            <th>正确率</th>
            <th>重做</th>
            <th>演练</th>
            <th>完成</th>
            <th>标记</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in report" :key="r.id">
            <td>{{ r.id }} {{ r.title.slice(0, 16) }}</td>
            <td>{{ r.visited }}</td>
            <td>{{ Math.round(r.seconds / 60) }}</td>
            <td>{{ r.attempts }}</td>
            <td>{{ r.accuracy === null ? '—' : `${r.accuracy}%` }}</td>
            <td>{{ r.retries }}</td>
            <td>{{ r.widgetDone ? '✓' : '—' }}</td>
            <td>{{ r.completed ? '✓' : '—' }}</td>
            <td><span v-if="r.flag" class="pill danger">需修订</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
