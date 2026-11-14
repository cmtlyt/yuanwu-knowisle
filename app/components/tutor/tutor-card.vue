<script setup lang="ts">
/** 本地导航卡（零 LLM）：一句话理由 + 下一步课时 / 薄弱概念，点击可跳转。 */
import type { TutorNavCards } from '~/types/tutor'

defineProps<{ cards: TutorNavCards; canAskAi?: boolean }>()
const emit = defineEmits<{ askAi: [] }>()
</script>

<template>
  <div class="tutor-row">
    <div class="tutor-navcard">
      <div class="tnc-head">
        <span class="tnc-ico" aria-hidden="true">🧭</span><b>本地导航</b><span class="pill">离线可用</span>
      </div>
      <p class="tnc-advice">{{ cards.advice }}</p>

      <NuxtLink v-if="cards.next" :to="cards.next.path" class="tnc-item tnc-next">
        <span class="tnc-item-ico" aria-hidden="true">▶</span>
        <span class="tnc-item-body">
          <b>{{ cards.next.label }}</b>
          <span class="tnc-item-detail">{{ cards.next.detail }}</span>
        </span>
        <span class="tnc-arrow" aria-hidden="true">→</span>
      </NuxtLink>

      <div v-if="cards.weaks.length" class="tnc-weaks">
        <div class="tnc-label">需要巩固的概念</div>
        <template v-for="w in cards.weaks" :key="w.name">
          <NuxtLink v-if="w.path" :to="w.path" class="tnc-item">
            <span class="tnc-item-ico" aria-hidden="true">◇</span>
            <span class="tnc-item-body">
              <b>{{ w.name }}</b>
              <span class="tnc-item-detail">{{ w.reason }} · 掌握度 {{ Math.round(w.mastery) }}</span>
            </span>
            <span class="tnc-arrow" aria-hidden="true">→</span>
          </NuxtLink>
          <div v-else class="tnc-item tnc-plain">
            <span class="tnc-item-ico" aria-hidden="true">◇</span>
            <span class="tnc-item-body">
              <b>{{ w.name }}</b>
              <span class="tnc-item-detail">{{ w.reason }} · 掌握度 {{ Math.round(w.mastery) }}</span>
            </span>
          </div>
        </template>
      </div>

      <p v-if="!cards.next && !cards.weaks.length" class="tnc-empty">
        暂无可推荐的下一步，先去课程地图选一课吧。
      </p>

      <!-- A2：意图误判后的自助出口，只有最近一张卡可操作 -->
      <button v-if="canAskAi" type="button" class="btn ghost sm tnc-ask" @click="emit('askAi')">
        改用 AI 回答
      </button>
    </div>
  </div>
</template>

<style scoped>
.tutor-row {
  display: flex;
  justify-content: flex-start;
  margin: 2px 0;
}
.tutor-navcard {
  width: 100%;
  max-width: 92%;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 12px;
  box-shadow: var(--shadow);
}
.tnc-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}
.tnc-head .pill {
  margin-left: auto;
  font-size: 10px;
}
.tnc-ico {
  font-size: 14px;
}
.tnc-advice {
  margin: 8px 0 10px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.55;
}
.tnc-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
  margin: 10px 0 5px;
}
.tnc-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text);
  text-decoration: none;
  min-height: 44px;
}
a.tnc-item:hover {
  border-color: var(--primary);
  text-decoration: none;
}
.tnc-item.tnc-next {
  background: var(--primary-soft);
  border-color: transparent;
}
.tnc-item.tnc-plain {
  cursor: default;
}
.tnc-item-ico {
  color: var(--primary);
  flex: none;
  font-size: 12px;
}
.tnc-item-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.tnc-item-body b {
  font-size: 12.5px;
  font-weight: 650;
}
.tnc-item-detail {
  font-size: 11px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.tnc-arrow {
  flex: none;
  color: var(--primary);
  font-size: 14px;
}
.tnc-empty {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.tnc-ask {
  display: block;
  width: 100%;
  margin-top: 10px;
  min-height: 40px;
}
</style>
