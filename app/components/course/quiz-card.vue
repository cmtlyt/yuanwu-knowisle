<script setup lang="ts">
import type { QuizQuestion } from '~/types/course'

const props = defineProps<{
  question: QuizQuestion
  index: number
  conceptName?: string
  review?: boolean
}>()
const emit = defineEmits<{ answer: [correct: boolean, qIndex: number] }>()

const chosen = ref<number | null>(null)
const correct = computed(() => chosen.value === props.question.answer)

function choose(oi: number) {
  if (chosen.value !== null) return
  chosen.value = oi
  emit('answer', oi === props.question.answer, props.index)
}
function redo() {
  chosen.value = null
}
</script>

<template>
  <div class="quiz">
    <div class="qhead">
      <span class="n">{{ review ? 'Q' : `Q${index + 1}` }}</span><span>{{ question.text }}</span>
    </div>
    <button
      v-for="(opt, oi) in question.options"
      :key="oi"
      type="button"
      class="quiz-opt"
      :class="{
        correct: chosen !== null && oi === question.answer,
        wrong: chosen !== null && oi === chosen && oi !== question.answer,
      }"
      :disabled="chosen !== null"
      @click="choose(oi)"
    >
      {{ opt }}
    </button>

    <div v-if="chosen !== null" class="quiz-fb" :class="correct ? 'ok' : 'no'">
      <template v-if="review">
        <b>{{ correct ? '✓ 记起来了，记忆稳定度已延长' : '✗ 已记录，稍后会再次出现' }}</b>　{{
          question.explain
        }}
      </template>
      <template v-else>
        <b>{{ correct ? '✓ 答对了' : '✗ 再想想' }}</b>　{{ question.explain }}
        <div class="small" style="margin-top: 6px">知识点：{{ conceptName || question.concept }}</div>
      </template>
    </div>
    <button
      v-if="chosen !== null && !review"
      type="button"
      class="btn ghost sm"
      style="margin-top: 9px"
      @click="redo"
    >
      重做本题
    </button>
  </div>
</template>
