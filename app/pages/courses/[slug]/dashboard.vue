<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import CourseDashboardSimple from '~/components/course/simple/dashboard.vue'
import CourseDashboardComplex from '~/components/course/complex/dashboard.vue'

const { renderMode } = useRequiredCourse()
</script>

<template>
  <CourseDashboardSimple v-if="renderMode === 'simple'" />
  <CourseDashboardComplex v-else />
</template>
