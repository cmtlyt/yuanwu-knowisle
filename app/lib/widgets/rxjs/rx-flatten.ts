// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 7. 嵌套流展开 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxFlatten(root, onDone) {
  const c = makeCtx(
    root,
    '嵌套流：外层发射「内层流」，如何摊回',
    '选 concatMap / mergeMap，看外层 a、b 的内层值按什么顺序摊回。',
    onDone,
  )
  let mode = 'concat'
  const chart = box(c.body, 'w-lanes')
  const explain = box(c.body, 'w-explain')
  const outer = [
    { id: 'a', vals: ['a1', 'a2'] },
    { id: 'b', vals: ['b1', 'b2'] },
  ]
  function draw() {
    let content = '<text x="8" y="14" font-size="11" fill="currentColor">外层 a / b（各 2 个内层值）</text>'
    outer.forEach((o, oi) => {
      const y = 28 + oi * 26
      content +=
        '<rect x="60" y="' +
        y +
        '" width="180" height="18" rx="4" fill="' +
        (oi === 0 ? '#5b8def' : '#3fb984') +
        '" opacity="0.55"/>'
      o.vals.forEach((v, vi) => {
        content +=
          '<circle cx="' +
          (80 + vi * 90) +
          '" cy="' +
          (y + 9) +
          '" r="8" fill="' +
          (oi === 0 ? '#5b8def' : '#3fb984') +
          '"/>'
        content +=
          '<text x="' +
          (80 + vi * 90) +
          '" y="' +
          (y + 12) +
          '" font-size="9" text-anchor="middle" fill="#fff">' +
          v +
          '</text>'
      })
      content += '<text x="66" y="' + (y + 14) + '" font-size="10" fill="#fff">' + o.id + '</text>'
    })
    let seq = mode === 'concat' ? ['a1', 'a2', 'b1', 'b2'] : ['a1', 'b1', 'a2', 'b2']
    content += '<line x1="8" y1="86" x2="600" y2="86" stroke="currentColor" opacity="0.3"/>'
    content +=
      '<text x="8" y="106" font-size="10" fill="currentColor">摊回（' +
      (mode === 'concat' ? 'concatMap' : 'mergeMap') +
      '）</text>'
    seq.forEach((v, i) => {
      const x = 60 + i * 70
      content += '<circle cx="' + x + '" cy="86" r="12" fill="#e8a33d"/>'
      content += '<text x="' + x + '" y="90" font-size="11" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    chart.innerHTML = '<svg viewBox="0 0 620 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    explain.innerHTML =
      mode === 'concat'
        ? '<p><strong>concatMap</strong>：a 的两个内层值发完才轮到 b —— 保序、串行限流。</p>'
        : '<p><strong>mergeMap</strong>：a、b 内层并发，相同 tick 的 a1/b1 先发、a2/b2 后发 —— 乱序、并发。</p>'
    c.finish()
  }
  const b1 = button(
    'concatMap',
    () => {
      mode = 'concat'
      b1.classList.add('primary')
      b2.classList.remove('primary')
      draw()
    },
    'primary',
  )
  const b2 = button('mergeMap', () => {
    mode = 'merge'
    b2.classList.add('primary')
    b1.classList.remove('primary')
    draw()
  })
  group(c.body, [b1, b2])
  draw()
  return c.cleanup
}
