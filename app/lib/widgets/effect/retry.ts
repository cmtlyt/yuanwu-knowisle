// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 11. Schedule 重试策略 ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function retry(root, onDone) {
  const c = makeCtx(
    root,
    'Schedule：指数退避与抖动',
    '调节策略参数，看重试时刻如何排布，以及 jitter 为什么能避免重试风暴。',
    onDone,
  )
  let base = 100,
    factor = 2,
    count = 4,
    jitter = true
  const vals = {}
  const ctl = h('div', 'w-controls')
  const mk = (label, min, max, val, key, fmt) => {
    const lab = h('span', 'w-value', fmt(val))
    vals[key] = lab
    row(
      ctl,
      label,
      slider(min, max, val, 1, (v) => {
        if (key === 'base') base = v * 50
        else if (key === 'factor') factor = v
        else if (key === 'count') count = v
        lab.textContent = fmt(v)
        draw()
      }),
    )
    row(ctl, '', lab)
  }
  mk('初始延迟', 1, 6, 2, 'base', (v) => v * 50 + ' ms')
  mk('退避因子', 1, 4, 2, 'factor', (v) => '×' + v)
  mk('最多重试', 1, 6, 4, 'count', (v) => v + ' 次')
  c.body.appendChild(ctl)
  const chart = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  function draw() {
    const delays = []
    for (let i = 0; i < count; i++) {
      let d = base * Math.pow(factor, i)
      if (jitter) d = Math.round(d * (0.6 + ((i * 37) % 40) / 100))
      delays.push(d)
    }
    const total = delays.reduce((a, b) => a + b, 0)
    let content = '<line x1="20" y1="86" x2="600" y2="86" stroke="currentColor" opacity="0.35"/>'
    let acc = 0
    delays.forEach((d, i) => {
      acc += d
      const x = 20 + (acc / (total || 1)) * 560
      content +=
        '<line x1="' +
        x +
        '" y1="30" x2="' +
        x +
        '" y2="92" stroke="' +
        (jitter ? '#3fb984' : '#e46a70') +
        '" stroke-width="2" opacity="0.85"/>'
      content += '<circle cx="' + x + '" cy="86" r="5" fill="' + (jitter ? '#3fb984' : '#e46a70') + '"/>'
      content +=
        '<text x="' +
        x +
        '" y="24" text-anchor="middle" font-size="10" fill="currentColor">#' +
        (i + 1) +
        '</text>'
      content +=
        '<text x="' +
        x +
        '" y="106" text-anchor="middle" font-size="10" fill="currentColor">' +
        d +
        'ms</text>'
    })
    chart.innerHTML = '<svg viewBox="0 0 620 120">' + content + '</svg>'
    stats.innerHTML =
      '<p>延迟序列：<code>' +
      delays.join(' / ') +
      ' ms</code>，累计预算约 <b>' +
      total +
      ' ms</b>。</p><p>' +
      (jitter
        ? 'jittered 给每次延迟加入扰动：大量客户端不会在同一毫秒一起重试，下游恢复期不会被二次打垮。'
        : '未加抖动时，所有客户端按同一节奏重试，容易形成同步峰值（重试风暴）。') +
      '</p><p class="w-muted">先 retry 再 timeout = 总时长受限；反过来则为每次尝试各自限时。</p>'
    c.setStatus('策略已更新；Schedule 是值，retry 只是解释它')
    c.finish()
  }
  group(c.body, [
    button(
      '切换 jitter',
      () => {
        jitter = !jitter
        draw()
      },
      'primary',
    ),
  ])
  draw()
  return c.cleanup
}

/* ===================== RxJS 7.8.x 课程演练（13 个） ===================== */
