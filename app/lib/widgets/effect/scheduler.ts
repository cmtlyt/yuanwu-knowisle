// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 4. Scheduler ---------- */
import { h, button, slider, makeCtx, row, group, box } from '../dom.ts'

export function scheduler(root, onDone) {
  const c = makeCtx(
    root,
    'MixedScheduler：协作让出与公平性',
    '调节操作预算，观察两个 fiber 如何在同一线程上轮流推进，而不是一个跑到底。',
    onDone,
  )
  let budget = 3,
    mode = 'async',
    events = []
  const budgetLabel = h('span', 'w-value', '3（演示值；真实默认 2048）')
  const ctl = h('div', 'w-controls')
  const s = slider(1, 8, 3, 1, (v) => {
    budget = v
    budgetLabel.textContent = v + '（演示值；真实默认 2048）'
    draw()
  })
  row(ctl, 'maxOpsBeforeYield', s)
  row(ctl, '', budgetLabel)
  c.body.appendChild(ctl)
  const modeRow = h('div', 'w-btnrow')
  const bAsync = button(
    'executionMode: async',
    () => {
      mode = 'async'
      draw()
    },
    'primary',
  )
  const bSync = button('executionMode: sync', () => {
    mode = 'sync'
    draw()
  })
  modeRow.append(bAsync, bSync)
  c.body.appendChild(modeRow)
  const lanes = box(c.body, 'w-lanes')
  const queue = box(c.body, 'w-explain')
  const legend = box(c.body, 'w-metric')
  function simulate() {
    events = []
    let a = 0,
      b = 0,
      tick = 0,
      opsA = 0,
      opsB = 0
    const totalA = 10,
      totalB = 8
    while ((a < totalA || b < totalB) && tick < 60) {
      const cur = a < totalA && (tick % 2 === 0 || b >= totalB) ? 'A' : 'B'
      const ops = cur === 'A' ? opsA : opsB
      if (ops >= budget) {
        events.push({ f: cur, kind: 'yield', tick: tick++ })
        if (cur === 'A') opsA = 0
        else opsB = 0
        continue
      }
      events.push({ f: cur, kind: 'op', tick: tick++ })
      if (cur === 'A') {
        a++
        opsA++
      } else {
        b++
        opsB++
      }
    }
    draw()
  }
  function draw() {
    const width = 660,
      cw = Math.max(10, Math.min(24, Math.floor(width / Math.max(events.length, 12))))
    let content = '<rect x="0" y="0" width="' + width + '" height="120" fill="transparent"/>'
    events.forEach((ev, idx) => {
      const x = 8 + idx * (cw + 2),
        y = ev.f === 'A' ? 18 : 68
      const fill = ev.kind === 'yield' ? '#e46a70' : ev.f === 'A' ? '#5b8def' : '#3fb984'
      content +=
        '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        cw +
        '" height="30" rx="4" fill="' +
        fill +
        '" opacity="0.9"/>'
      content +=
        '<text x="' +
        (x + cw / 2) +
        '" y="' +
        (y + 20) +
        '" font-size="10" text-anchor="middle" fill="#fff">' +
        (ev.kind === 'yield' ? 'Y' : '·') +
        '</text>'
    })
    content +=
      '<text x="8" y="12" font-size="11" fill="currentColor">Fiber A</text><text x="8" y="62" font-size="11" fill="currentColor">Fiber B</text>'
    lanes.innerHTML =
      '<svg viewBox="0 0 ' + width + ' 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    const yields = events.filter((e) => e.kind === 'yield').length
    queue.innerHTML =
      '<strong>SchedulerDispatcher</strong><p>优先级桶：数值小的先跑，同优先级 FIFO；' +
      (mode === 'async'
        ? 'async 模式经 setImmediate 回到宿主事件循环。'
        : 'sync 模式不向事件循环让出，CPU 密集任务会拖慢其他请求。') +
      '</p><p>本轮 shouldYield 命中 <b>' +
      yields +
      '</b> 次，每次把 continuation 交回队列后恢复，两个 fiber 交替推进。</p>'
    legend.innerHTML = '红格 = yieldNow / 让出点　·　蓝绿格 = 一条被解释的指令　·　预算 ' + budget
    bAsync.className = 'w-btn ' + (mode === 'async' ? 'primary' : '')
    bSync.className = 'w-btn ' + (mode === 'sync' ? 'primary' : '')
  }
  group(c.body, [
    button(
      '重新模拟',
      () => {
        simulate()
        c.setStatus('模拟完成：注意 fiber 不会独占线程')
        c.finish()
      },
      'primary',
    ),
  ])
  simulate()
  c.setStatus('拖动预算再看变化：预算越小，让出越频繁、公平性越好但切换开销越高')
  return c.cleanup
}
