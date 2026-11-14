// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 5. map 流水线 ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function rxTransform(root, onDone) {
  const c = makeCtx(
    root,
    'map 流水线：只变换值，不改次数与时机',
    '调变换系数 k，看每个阶段（原始 → ×k → +1）的值如何一对一变化。',
    onDone,
  )
  let k = 2
  const label = h('span', 'w-value', '×2')
  const ctl = h('div', 'w-controls')
  row(
    ctl,
    '变换系数 k',
    slider(1, 5, 2, 1, (v) => {
      k = v
      label.textContent = '×' + v
      draw()
    }),
  )
  row(ctl, '', label)
  c.body.appendChild(ctl)
  const chart = box(c.body, 'w-lanes')
  const src = [0, 1, 2, 3]
  function draw() {
    const w = 620,
      cell = 100
    const ys = [30, 60, 90]
    const stages = ['原始', '×k (map)', '+1']
    let content = ''
    stages.forEach((name, si) => {
      content += '<text x="8" y="' + (ys[si] + 4) + '" font-size="10" fill="currentColor">' + name + '</text>'
      src.forEach((v, i) => {
        const x = 120 + i * cell
        let val = v
        if (si === 1) val = v * k
        if (si === 2) val = v * k + 1
        content +=
          '<circle cx="' +
          x +
          '" cy="' +
          ys[si] +
          '" r="12" fill="' +
          (si === 0 ? '#8a94a6' : si === 1 ? '#5b8def' : '#3fb984') +
          '"/>'
        content +=
          '<text x="' +
          x +
          '" y="' +
          (ys[si] + 4) +
          '" font-size="11" text-anchor="middle" fill="#fff">' +
          val +
          '</text>'
      })
    })
    src.forEach((_, i) => {
      const x = 120 + i * cell
      content += '<line x1="' + x + '" y1="42" x2="' + x + '" y2="102" stroke="currentColor" opacity="0.2"/>'
    })
    chart.innerHTML =
      '<svg viewBox="0 0 ' + w + ' 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    c.setStatus('每列上下严格对齐：map 不改次数与时机，只变换每个值的形态')
    c.finish()
  }
  group(c.body, [button('应用变换', draw, 'primary')])
  draw()
  return c.cleanup
}
