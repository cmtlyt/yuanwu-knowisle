<script setup lang="ts">
import { esc } from '~/lib/highlight'

interface Day {
  date: string
  label: string
  minutes: number
  quizzes: number
  lessons: number
}
const props = defineProps<{ days: Day[] }>()
const maxMinutes = computed(() => Math.max(1, ...props.days.map((d) => d.minutes)))
</script>

<template>
  <div class="tl-scroll">
    <div class="timeline">
      <div v-for="d in days" :key="d.date" class="col">
        <div
          class="stick"
          :style="{ height: `${Math.max(2, (d.minutes / maxMinutes) * 78)}px` }"
          :title="`${d.date} · ${d.minutes} 分钟 · ${d.quizzes} 题`"
        />
        <div class="lb" v-html="esc(d.label)" />
      </div>
    </div>
  </div>
</template>
