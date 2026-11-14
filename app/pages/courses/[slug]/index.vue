<script setup lang="ts">
import { useRequiredCourse } from '~/composables/use-course'
import CourseMapSimple from '~/components/course/simple/map.vue'
import CourseMapComplex from '~/components/course/complex/map.vue'

const { renderMode } = useRequiredCourse()
</script>

<template>
  <CourseMapSimple v-if="renderMode === 'simple'" />
  <CourseMapComplex v-else />
</template>
