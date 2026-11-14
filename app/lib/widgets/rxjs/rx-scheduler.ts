// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 12. 调度器时间注入 ---------- */
import { h, button, makeCtx, box } from '../dom.ts'

export function rxScheduler(root, onDone) {
  const c = makeCtx(
    root,
    '调度器：把「时间」变成可替换的依赖',
    '切换调度器，观察同一套时间逻辑在宏任务 / 微任务 / 动画帧 / 虚拟时间下的执行顺序。',
    onDone,
  )
  let mode = 'async'
  const lanes = box(c.body, 'w-lanes')
  const stats = box(c.body, 'w-explain')
  const modes = {
    async: {
      label: 'asyncScheduler（宏任务）',
      order: ['订阅', 'emit1', 'emit2', 'complete'],
      note: 'setTimeout 队列，让出主线程；适合默认异步。',
    },
    queue: {
      label: 'queueScheduler（微任务）',
      order: ['订阅', 'emit1', 'emit2', 'complete'],
      note: 'Promise.resolve 微任务，最接近同步；批处理友好。',
    },
    raf: {
      label: 'animationFrameScheduler',
      order: ['订阅', '帧1', '帧2', 'complete'],
      note: '对齐 requestAnimationFrame，做动画不掉帧。',
    },
    virtual: {
      label: 'TestScheduler（虚拟时间）',
      order: ['0s', '300ms', '700ms', '1000ms'],
      note: '不真实等待，用虚拟时钟推进，专测时间类操作符。',
    },
  }
  function draw() {
    const m = modes[mode]
    let content = '<line x1="8" y1="40" x2="600" y2="40" stroke="currentColor" opacity="0.3"/>'
    m.order.forEach((o, i) => {
      const x = 60 + i * 130
      content +=
        '<circle cx="' + x + '" cy="40" r="14" fill="' + (mode === 'virtual' ? '#e8a33d' : '#5b8def') + '"/>'
      content += '<text x="' + x + '" y="44" font-size="9" text-anchor="middle" fill="#fff">' + o + '</text>'
    })
    lanes.innerHTML = '<svg viewBox="0 0 620 80" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    stats.innerHTML =
      '<p><strong>' +
      m.label +
      '</strong>：' +
      m.note +
      '</p><p class="w-muted">subscribeOn 决定「何时订阅/首发射」；observeOn 决定「每个值在哪个任务上被消费」。</p>'
    c.setStatus('当前：' + m.label)
    c.finish()
  }
  const g = h('div', 'w-btnrow')
  Object.keys(modes).forEach((k, i) =>
    g.appendChild(
      button(
        modes[k].label,
        () => {
          mode = k
          Array.from(g.children).forEach((b, bi) => b.classList.toggle('primary', bi === i))
          draw()
        },
        i === 0 ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(g)
  draw()
  return c.cleanup
}
