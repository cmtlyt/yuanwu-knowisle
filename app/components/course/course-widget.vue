<script setup lang="ts">
import { Widgets } from '~/lib/widgets'

/**
 * 演练宿主：11 个零依赖 DOM 演练内核由 Vue 托管挂载 / 销毁，
 * 定时器与事件在 cleanup 中统一回收，切课时不会残留。
 */
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ done: [] }>()
const host = ref<HTMLElement | null>(null)
let cleanup: (() => void) | null = null

function mountWidget() {
  if (!host.value || !Widgets.has(props.name)) return
  cleanup = Widgets.render(props.name, host.value, () => emit('done'))
}
function unmountWidget() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  if (host.value) host.value.innerHTML = ''
}

onMounted(mountWidget)
onBeforeUnmount(unmountWidget)
watch(
  () => props.name,
  () => {
    unmountWidget()
    mountWidget()
  },
)
</script>

<template>
  <div ref="host" />
</template>
