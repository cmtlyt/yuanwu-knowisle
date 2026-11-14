// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 10. Stream 背压 ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function stream(root, onDone) {
  const c = makeCtx(
    root,
    'Stream：pull-based 背压',
    '调节生产／消费速度，观察缓冲区为什么不会无限增长。',
    onDone,
  )
  let prod = 4,
    cons = 2,
    tick = 0,
    buffer = 0,
    timer = null
  const pl = h('span', 'w-value', '4 chunk/s'),
    cl = h('span', 'w-value', '2 chunk/s')
  const ctl = h('div', 'w-controls')
  row(
    ctl,
    '上游产出',
    slider(1, 8, 4, 1, (v) => {
      prod = v
      pl.textContent = v + ' chunk/s'
    }),
  )
  row(ctl, '', pl)
  row(
    ctl,
    '下游消费',
    slider(1, 8, 2, 1, (v) => {
      cons = v
      cl.textContent = v + ' chunk/s'
    }),
  )
  row(ctl, '', cl)
  c.body.appendChild(ctl)
  const viz = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  const history = []
  function draw() {
    const maxBar = 12
    const cells = history.slice(-24)
    let content =
      '<text x="8" y="14" font-size="11" fill="currentColor">缓冲区长度（上限受下游 pull 节奏约束）</text>'
    cells.forEach((v, i) => {
      const x = 10 + i * 25,
        hh = Math.min(maxBar, v) * 7
      content +=
        '<rect x="' +
        x +
        '" y="' +
        (110 - hh) +
        '" width="18" height="' +
        hh +
        '" rx="3" fill="' +
        (v > 8 ? '#e8a33d' : '#38a9c4') +
        '" opacity="0.9"/>'
    })
    viz.innerHTML = '<svg viewBox="0 0 620 120">' + content + '</svg>'
    stats.innerHTML =
      '<p>上游速度 <b>' +
      prod +
      '</b>，下游 pull 速度 <b>' +
      cons +
      '</b>，当前缓冲 <b>' +
      buffer +
      '</b> 个 chunk。</p><p>生产者不会盲目推送：下游要一批才给一批。消费者慢，上游就停在等待状态 —— 这就是背压，不需要额外的阈值配置。</p>'
  }
  function loop() {
    tick += 1
    const produced = Math.min(prod, cons + 1) // 上游最多领先下游一"轮"
    buffer = Math.max(0, Math.min(12, buffer + produced - cons))
    history.push(buffer)
    draw()
    c.setStatus('tick ' + tick + ' · 缓冲稳定，未出现无界堆积')
    c.finish()
  }
  timer = c.every(loop, 900)
  group(c.body, [button('立即推进一拍', loop)])
  draw()
  return function () {
    if (timer) clearInterval(timer)
    c.cleanup()
  }
}
