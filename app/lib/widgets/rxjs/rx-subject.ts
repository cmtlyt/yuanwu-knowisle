// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 10. Subject 多播 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxSubject(root, onDone) {
  const c = makeCtx(
    root,
    'Subject 多播：一条时间线，多个订阅者',
    '推 next，看早到订阅者 A 与晚到订阅者 B 各看到什么；切换 BehaviorSubject 看「补最近值」。',
    onDone,
  )
  let mode = 'subject'
  let ticks = []
  const lanes = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  function draw() {
    let content =
      '<text x="8" y="14" font-size="11" fill="currentColor">发射时间线（' +
      (mode === 'subject' ? 'Subject' : 'BehaviorSubject') +
      '）</text>'
    ticks.forEach((v, i) => {
      const x = 40 + i * 56
      content += '<circle cx="' + x + '" cy="44" r="10" fill="#5b8def"/>'
      content += '<text x="' + x + '" y="48" font-size="10" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    lanes.innerHTML = '<svg viewBox="0 0 620 90" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
  }
  group(c.body, [
    button(
      'next(v)',
      () => {
        ticks.push(ticks.length)
        log.innerHTML +=
          '<div class="w-line">next(' +
          (ticks.length - 1) +
          ')：A 看到它；' +
          (mode === 'subject' ? 'B 尚未订阅→错过' : 'B 若订阅会先补最近值再跟随') +
          '</div>'
        draw()
        c.setStatus('已推 ' + ticks.length + ' 个值')
        c.finish()
      },
      'primary',
    ),
    button('B 订阅', () => {
      const last = ticks.length ? ticks[ticks.length - 1] : null
      log.innerHTML +=
        '<div class="w-line ok">' +
        (mode === 'subject'
          ? 'B 现在订阅：只看到之后的值（已错过 ' + ticks.length + ' 个，不重放）'
          : 'B 现在订阅：立刻补最近值 ' + (last === null ? '∅' : last) + '，再跟随后续') +
        '</div>'
      c.setStatus(mode === 'subject' ? '普通 Subject 不重放历史' : 'BehaviorSubject 新订阅者立刻拿到当前值')
      c.finish()
    }),
    button('切到 BehaviorSubject', () => {
      mode = 'behavior'
      ticks = []
      log.innerHTML = ''
      draw()
    }),
    button('重置', () => {
      ticks = []
      log.innerHTML = ''
      mode = 'subject'
      draw()
    }),
  ])
  draw()
  return c.cleanup
}
