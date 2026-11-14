// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 2. 冷 / 热对比 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxColdHot(root, onDone) {
  const c = makeCtx(
    root,
    '冷源 vs 热源：晚到的订阅者看到什么',
    '先推热 Subject 的 next，再让 C「晚到」订阅，看它是否错过早期值；冷源则两个订阅者各自独立。',
    onDone,
  )
  let hot = []
  const lanes = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  function draw() {
    const w = 620
    let content = '<text x="8" y="14" font-size="11" fill="currentColor">热 Subject（独立计时）</text>'
    hot.forEach((v, i) => {
      const x = 40 + i * 64
      content += '<circle cx="' + x + '" cy="44" r="10" fill="#5b8def"/>'
      content += '<text x="' + x + '" y="48" font-size="10" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    content += '<line x1="40" y1="84" x2="600" y2="84" stroke="currentColor" opacity="0.3"/>'
    content +=
      '<text x="40" y="104" font-size="10" fill="currentColor">冷 interval：A、B 各自独立从 0 起（互不共享时间线）</text>'
    lanes.innerHTML =
      '<svg viewBox="0 0 ' + w + ' 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
  }
  group(c.body, [
    button('Subject.next()', () => {
      hot.push(hot.length)
      log.innerHTML +=
        '<div class="w-line">next(' + (hot.length - 1) + ')：早到的 A 看到它；晚到的 C 尚未订阅、错过</div>'
      draw()
      c.setStatus('热流独立计时，推了几次就发了几次')
    }),
    button('C 晚到订阅', () => {
      const last = hot.length ? hot[hot.length - 1] : null
      log.innerHTML +=
        '<div class="w-line ok">C 现在订阅：只看到 ' +
        (last === null ? '之后的值（目前还没有）' : '值 ' + last + ' 之后的内容') +
        '；不重放历史</div>'
      c.setStatus('C 错过了 ' + hot.length + ' 个早期值（普通 Subject 不重放）')
      c.finish()
    }),
    button('重置', () => {
      hot = []
      log.innerHTML = ''
      draw()
    }),
  ])
  draw()
  return c.cleanup
}
