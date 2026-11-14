// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 1. 源操作符节奏 ---------- */
import { esc, h, button, makeCtx, group, box } from '../dom.ts'

export function rxjsSource(root, onDone) {
  const c = makeCtx(
    root,
    '源操作符节奏：同一序列，不同源发得不同',
    '切换源类型，点「运行」看时间轴上值与 complete 标记的排布。',
    onDone,
  )
  const modes = [
    { label: 'of(1,2,3)', vals: [1, 2, 3], hot: false, note: '同步逐个发射、最后 complete' },
    { label: 'interval(1s)+take(3)', vals: [0, 1, 2], hot: true, note: '每 1s 一个，take(3) 后 complete' },
    { label: 'timer(200,1000)', vals: [0, 1, 2], hot: true, note: '先 200ms 首发射，之后每 1000ms' },
    { label: 'from([1,2,3])', vals: [1, 2, 3], hot: false, note: '数组逐元素同步发射' },
    { label: 'defer(工厂)', vals: [7], hot: false, note: '每次订阅重执行工厂，再发射' },
  ]
  let cur = 0
  const g = h('div', 'w-btnrow')
  modes.forEach((m, i) =>
    g.appendChild(
      button(
        m.label,
        () => {
          cur = i
          draw()
        },
        i === 0 ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(g)
  const chart = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  function draw() {
    Array.from(g.children).forEach((b, i) => b.classList.toggle('primary', i === cur))
    const m = modes[cur]
    const w = 620,
      cell = 90
    let content = '<line x1="8" y1="70" x2="' + (w - 8) + '" y2="70" stroke="currentColor" opacity="0.3"/>'
    content += '<text x="8" y="24" font-size="11" fill="currentColor">' + esc(m.label) + '</text>'
    m.vals.forEach((v, i) => {
      const x = 40 + i * cell
      content += '<circle cx="' + x + '" cy="70" r="10" fill="#3fb984"/>'
      content += '<text x="' + x + '" y="74" font-size="11" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    content += '<text x="' + (40 + m.vals.length * cell) + '" y="74" font-size="16" fill="#e46a70">|</text>'
    chart.innerHTML =
      '<svg viewBox="0 0 ' + w + ' 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    stats.innerHTML =
      '<p><strong>' +
      esc(m.note) +
      '</strong></p><p class="w-muted">' +
      (m.hot
        ? '持续/热型：不随某个订阅停止计时，需 take / unsubscribe 收口。'
        : '冷型：无订阅者则不执行；每个订阅独立重放。') +
      '</p>'
    c.setStatus('当前源：' + m.label)
    c.finish()
  }
  group(c.body, [
    button(
      '运行',
      () => {
        draw()
        c.finish()
      },
      'primary',
    ),
    button('重置', () => {
      cur = 0
      draw()
    }),
  ])
  draw()
  return c.cleanup
}
