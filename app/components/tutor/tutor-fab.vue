<script setup lang="ts">
/** 全局悬浮球：右下角固定，抽屉打开时隐藏；未配置 LLM 时显示「配」角标。 */
import { useTutor } from '~/composables/use-tutor'

const { isOpen, configStatus, toggle } = useTutor()
const label = computed(() => (isOpen.value ? '关闭助学助手' : '打开助学助手'))
</script>

<template>
  <button v-show="!isOpen" type="button" class="tutor-fab" :aria-label="label" :title="label" @click="toggle">
    <span class="fab-ico" aria-hidden="true">✦</span>
    <span v-if="configStatus !== 'ok'" class="fab-badge" aria-hidden="true">配</span>
    <span class="fab-text">助学</span>
  </button>
</template>

<style scoped>
.tutor-fab {
  position: fixed;
  right: 22px;
  z-index: 62;
  bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 50px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 26px;
  background: linear-gradient(135deg, var(--primary), #38a9c4);
  color: #fff;
  box-shadow: 0 6px 20px rgba(40, 70, 140, 0.32);
  cursor: pointer;
  font-weight: 700;
  font-size: 13.5px;
  letter-spacing: 0.02em;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.tutor-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 9px 26px rgba(40, 70, 140, 0.42);
}
.tutor-fab:active {
  transform: translateY(0);
}
.fab-ico {
  font-size: 17px;
  line-height: 1;
}
.fab-text {
  line-height: 1;
}
.fab-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 10px;
  background: var(--warn);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  border: 2px solid var(--surface);
}

/* 移动端：抬到 780px 底部标签栏之上，避免遮挡导航 */
@media (max-width: 780px) {
  .tutor-fab {
    right: 14px;
    height: 46px;
    padding: 0 14px;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
  .fab-text {
    display: none;
  }
  .tutor-fab {
    padding: 0;
    width: 46px;
    justify-content: center;
  }
}
</style>
