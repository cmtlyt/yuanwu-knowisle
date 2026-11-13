<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'

const { course, data, base, stages, lessons, conceptName } = useRequiredCourse()

const design = computed(() => data.value?.DESIGN ?? null)
const stageName = (id: number) => stages.value.find((s) => s.id === id)?.name ?? `S${id}`
const calloutIcon = (tone: string) => (tone === 'warn' ? '⚠️' : tone === 'deep' ? '🔬' : '💡')
</script>

<template>
  <div v-if="design">
    <div class="crumb">
      <NuxtLink to="/">知识岛</NuxtLink><span>/</span><NuxtLink :to="base">{{ course!.title }}</NuxtLink
      ><span>/</span><span>教学设计</span>
    </div>
    <div class="view-head">
      <h1>{{ design.title }}</h1>
      <p>{{ design.summary }}</p>
    </div>

    <template v-for="sec in design.sections" :key="sec.id">
      <div class="section-title">{{ sec.title }}</div>
      <p v-if="sec.intro" class="muted small">{{ sec.intro }}</p>

      <template v-for="(b, i) in sec.blocks" :key="i">
        <div v-if="b.type === 'prose'" class="block">
          <h3 v-if="b.title">{{ b.title }}</h3>
          <p v-for="(p, pi) in b.text.split('\n')" :key="pi">{{ p }}</p>
        </div>

        <div v-else-if="b.type === 'list'" class="block list-block">
          <h3 v-if="b.title">{{ b.title }}</h3>
          <ul>
            <li v-for="(it, li) in b.items" :key="li">{{ it }}</li>
          </ul>
        </div>

        <div v-else-if="b.type === 'callout'" class="callout" :class="b.tone">
          <b>{{ calloutIcon(b.tone) }} {{ b.title }}</b>
          <p>{{ b.text }}</p>
        </div>

        <div v-else-if="b.type === 'kv'" class="card tbl-wrap">
          <div v-if="b.title" class="section-title" style="margin-top: 0">{{ b.title }}</div>
          <table class="tbl">
            <tbody>
              <tr v-for="(r, ri) in b.rows" :key="ri">
                <th>{{ r.k }}</th>
                <td>{{ r.v }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="b.type === 'table'" class="card tbl-wrap">
          <div v-if="b.title" class="section-title" style="margin-top: 0">{{ b.title }}</div>
          <table class="tbl">
            <thead>
              <tr>
                <th v-for="(c, ci) in b.columns" :key="ci">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in b.rows" :key="ri">
                <td v-for="(c, ci) in row" :key="ci">{{ c }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="b.type === 'code'" class="block">
          <div v-if="b.title" class="code-title">{{ b.title }}</div>
          <div class="code-scroll-hint">← 代码可左右滑动 →</div>
          <pre class="code-block"><code>{{ b.code }}</code></pre>
          <div v-if="b.note" class="code-note">💡 {{ b.note }}</div>
        </div>

        <div v-else-if="b.type === 'lessons'" class="card tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>阶段</th>
                <th>课时</th>
                <th>标题</th>
                <th>分钟</th>
                <th>难度</th>
                <th>核心概念</th>
                <th>演练</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lessons" :key="l.id">
                <td>{{ stageName(l.stage) }}</td>
                <td>{{ l.id }}</td>
                <td>{{ l.title }}</td>
                <td>{{ l.minutes }}</td>
                <td>{{ '●'.repeat(l.difficulty) }}{{ '○'.repeat(5 - l.difficulty) }}</td>
                <td>{{ l.concepts.map(conceptName).join(' / ') }}</td>
                <td>{{ l.widget ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>
