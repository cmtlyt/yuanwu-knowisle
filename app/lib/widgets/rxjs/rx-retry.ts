// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 9. 重试与指数退避 ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function rxRetry(root, onDone) {
  const c = makeCtx(
    root,
    '重试与指数退避：retry(n) / retryWhen',
    '调 maxRetry 与退避因子，看重试时刻如何拉开；切换「固定/指数」观察退避如何防风暴。',
    onDone,
  )
  let base = 1
  let factor = 2
  let count = 3
  let backoff = true
  const vals = {}
  const ctl = h('div', 'w-controls')
  const mk = (label, min, max, val, key, fmt) => {
    const lab = h('span', 'w-value', fmt(val))
    vals[key] = lab
    row(
      ctl,
      label,
      slider(min, max, val, 1, (v) => {
        if (key === 'base') base = v
        else if (key === 'factor') factor = v
        else if (key === 'count') count = v
        lab.textContent = fmt(v)
        draw()
      }),
    )
    row(ctl, '', lab)
  }
  mk('首次退避', 1, 4, 1, 'base', (v) => v + ' 单位')
  mk('退避因子', 1, 4, 2, 'factor', (v) => '×' + v)
  mk('最多重试', 1, 5, 3, 'count', (v) => v + ' 次')
  c.body.appendChild(ctl)
  const chart = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  function draw() {
    const d = []
    for (let i = 0; i < count; i++) d.push(backoff ? base * Math.pow(factor, i) : base)
    const total = d.reduce((a, b) => a + b, 0)
    let acc = 0
    let content = '<line x1="10" y1="80" x2="600" y2="80" stroke="currentColor" opacity="0.35"/>'
    content +=
      '<circle cx="40" cy="80" r="8" fill="#5b8def"/><text x="40" y="64" text-anchor="middle" font-size="10" fill="currentColor">首次</text>'
    d.forEach((x, i) => {
      acc += x
      const px = 40 + (acc / (total || 1)) * 540
      content += '<circle cx="' + px + '" cy="80" r="8" fill="' + (backoff ? '#3fb984' : '#e46a70') + '"/>'
      content +=
        '<text x="' +
        px +
        '" y="24" text-anchor="middle" font-size="10" fill="currentColor">retry #' +
        (i + 1) +
        '</text>'
      content +=
        '<text x="' +
        px +
        '" y="106" text-anchor="middle" font-size="10" fill="currentColor">' +
        x +
        ' 单位</text>'
    })
    chart.innerHTML = '<svg viewBox="0 0 620 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    stats.innerHTML =
      '<p>延迟序列 <code>' +
      d.join(' / ') +
      '</code>，累计 ' +
      total +
      ' 单位。</p><p>' +
      (backoff
        ? '指数退避：后一次比前一次更久，降低对下游的冲击，避免重试风暴。'
        : '固定间隔：每次都一样，故障未恢复时所有客户端同步重试，易打垮恢复中的服务。') +
      '</p>'
    c.setStatus('retry(' + count + ') 在 ' + (count + 1) + ' 次尝试内成功即停，否则向上抛 error')
    c.finish()
  }
  group(c.body, [
    button(
      '切换 固定/指数 退避',
      () => {
        backoff = !backoff
        draw()
        c.setStatus(backoff ? '指数退避：间隔递增' : '固定间隔：间隔不变')
      },
      'primary',
    ),
  ])
  draw()
  return c.cleanup
}
