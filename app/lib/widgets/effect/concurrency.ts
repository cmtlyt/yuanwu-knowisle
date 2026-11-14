// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 9. 并发选项时间轴 ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function concurrency(root, onDone) {
  const c = makeCtx(
    root,
    'Effect.all：顺序 / 有界 / 无界',
    '调节 concurrency，看 5 个任务如何排布；打开中断开关观察失败传播。',
    onDone,
  )
  const durations = [5, 3, 6, 4, 5]
  let limit = 1,
    interrupt = false
  const label = h('span', 'w-value', '1 = 顺序')
  const ctl = h('div', 'w-controls')
  row(
    ctl,
    'concurrency',
    slider(1, 5, 1, 1, (v) => {
      limit = v
      label.textContent = v === 1 ? '1 = 顺序' : String(v) + ' = 最多 ' + v + ' 个同时跑'
      redraw()
    }),
  )
  row(ctl, '', label)
  c.body.appendChild(ctl)
  const chart = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  function redraw() {
    const starts = [],
      finishes = []
    let free = Array.from({ length: limit === 1 ? 1 : limit }, () => 0)
    for (let i = 0; i < durations.length; i++) {
      const slot = free.indexOf(Math.min.apply(null, free))
      const st = free[slot]
      starts.push(st)
      const fi = st + durations[i]
      finishes.push(fi)
      free[slot] = fi
    }
    const failAt = interrupt ? 2 : -1
    const stopAt = interrupt ? Math.max(finishes[failAt] - 1, 1) : Math.max.apply(null, finishes)
    let content = ''
    durations.forEach((d, i) => {
      const y = 12 + i * 26
      const x = 12 + starts[i] * 34
      const w = Math.max(0, (Math.min(finishes[i], stopAt) - starts[i]) * 34)
      const cut = interrupt && starts[i] < stopAt && finishes[i] > stopAt
      content +=
        '<rect x="12" y="' +
        y +
        '" width="' +
        stopAt * 34 +
        '" height="18" rx="3" fill="currentColor" opacity="0.07"/>'
      content +=
        '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        w +
        '" height="18" rx="3" fill="' +
        (cut ? '#e46a70' : ['#5b8def', '#3fb984', '#e8a33d', '#a878e6', '#38a9c4'][i]) +
        '" opacity="0.9"/>'
      content +=
        '<text x="' +
        (x + 4) +
        '" y="' +
        (y + 13) +
        '" font-size="10" fill="#fff">task' +
        (i + 1) +
        (cut ? ' ✂' : '') +
        '</text>'
    })
    content +=
      '<text x="12" y="' +
      (12 + 5 * 26 + 22) +
      '" font-size="11" fill="currentColor">0 ──────────────► 时间（示意刻度）</text>'
    chart.innerHTML = '<svg viewBox="0 0 620 ' + (12 + 5 * 26 + 32) + '">' + content + '</svg>'
    stats.innerHTML =
      '<p>concurrency = <b>' +
      (limit === 1 ? '1（默认顺序）' : limit) +
      '</b>；总耗时约 <b>' +
      stopAt +
      '</b> 个时间单位（顺序执行为 ' +
      durations.reduce((a, b) => a + b, 0) +
      '）。</p>' +
      (interrupt
        ? '<p>task3 被中断 → 其余并发任务<b>一起被中断</b>，race / forEach 的失败者不会留在后台运行，Cause 会记录被中断的 fiber。</p>'
        : '<p>v4 的 Effect.all 不传 concurrency 时是<b>顺序</b>执行，并发必须由作者显式声明。</p>')
    c.setStatus('当前：' + (limit === 1 ? '顺序' : '有界并发 ' + limit) + (interrupt ? ' + 中断传播' : ''))
    c.finish()
  }
  group(c.body, [
    button(
      '模拟一个任务中断',
      () => {
        interrupt = !interrupt
        redraw()
      },
      'ghost',
    ),
  ])
  redraw()
  return c.cleanup
}
