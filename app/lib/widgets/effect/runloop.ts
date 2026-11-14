// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 3. runLoop 指令解释器 ---------- */
import { esc, h, button, makeCtx, group, box } from '../dom.ts'

export function runloop(root, onDone) {
  const c = makeCtx(
    root,
    'runLoop：指令解释与 continuation 栈',
    '单步执行一条真实感指令序列，观察当前指令、续体栈与挂起／恢复。',
    onDone,
  )
  const steps = [
    { op: 'sync', text: 'sync(() => 1)', note: '同步 thunk 立即求值，结果 1 传给成功续体', push: null },
    {
      op: 'flatMap',
      text: 'map(n => n + 1)',
      note: '成功续体入栈；runLoop 用显式栈代替 JS 调用栈（trampoline）',
      push: 'contA: n => n+1',
    },
    {
      op: 'async',
      text: 'async(fetchUser)',
      note: '注册异步回调 → fiber 挂起 → 回调到达时重新入队恢复',
      push: 'contA: resume',
    },
    {
      op: 'yield',
      text: 'yieldNow()',
      note: '达到操作预算，插入让出指令，续体交给 Scheduler 排队',
      push: 'contA: resume',
    },
    {
      op: 'finalizer',
      text: 'ensure(close)',
      note: 'finalizer 续体压栈，无论成功/失败/中断都会执行',
      push: 'contAll: close',
    },
    {
      op: 'success',
      text: 'success(value)',
      note: '弹出续体依次应用，最终得到 Exit.succeed(value)',
      push: null,
    },
  ]
  let i = 0,
    stack = [],
    playing = false,
    opCount = 0
  const instr = box(c.body, 'w-instr')
  const grid = h('div', 'w-grid2')
  c.body.appendChild(grid)
  const stackBox = box(grid, 'w-stack')
  const noteBox = box(grid, 'w-explain')
  const log = box(c.body, 'w-log')
  const metrics = box(c.body, 'w-metric')
  const draw = () => {
    instr.innerHTML =
      '<span class="w-tag ' +
      (i < steps.length ? steps[i].op : 'done') +
      '">' +
      esc(i < steps.length ? steps[i].op.toUpperCase() : 'DONE') +
      '</span><code>' +
      esc(i < steps.length ? steps[i].text : 'Exit.succeed(...)') +
      '</code>'
    stackBox.innerHTML =
      '<div class="w-box-title">continuation 栈</div>' +
      (stack.length
        ? stack
            .toReversed()
            .map((s) => '<div class="w-frame">' + esc(s) + '</div>')
            .join('')
        : '<div class="w-empty">（空）</div>')
    metrics.innerHTML =
      'currentOpCount <strong>' +
      opCount +
      '</strong>　·　步骤 ' +
      Math.min(i + 1, steps.length) +
      '/' +
      steps.length
    log.querySelectorAll('.w-line').forEach((n) => n.classList.remove('last'))
  }
  const step = () => {
    if (i >= steps.length) {
      playing = false
      c.setStatus('✅ 执行链完成：蓝图 → root fiber → runLoop → Exit')
      c.finish()
      return
    }
    const s = steps[i]
    if (s.push) stack.push(s.push)
    if (s.op === 'success') stack = []
    opCount += 1
    noteBox.innerHTML = '<strong>' + esc(s.text) + '</strong><p>' + esc(s.note) + '</p>'
    log.innerHTML +=
      '<div class="w-line last">#' + (i + 1) + ' ' + esc(s.text) + ' → ' + esc(s.note) + '</div>'
    i += 1
    draw()
    if (playing && i < steps.length) c.later(step, 750)
    else if (i >= steps.length) {
      playing = false
      c.setStatus('✅ 执行链完成：蓝图 → root fiber → runLoop → Exit')
      c.finish()
    }
  }
  group(c.body, [
    button(
      '单步',
      () => {
        playing = false
        step()
      },
      'primary',
    ),
    button('自动播放', () => {
      if (playing) return
      if (i >= steps.length) return
      playing = true
      step()
    }),
    button('重置', () => {
      playing = false
      i = 0
      stack = []
      opCount = 0
      log.innerHTML = ''
      noteBox.innerHTML = '<p>点击「单步」开始解释。</p>'
      draw()
      c.setStatus('已重置')
    }),
  ])
  noteBox.innerHTML = '<p>点击「单步」开始解释。</p>'
  draw()
  return c.cleanup
}
