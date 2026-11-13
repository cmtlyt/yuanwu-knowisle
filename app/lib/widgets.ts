/*
 * 交互式原理演练组件（零依赖）
 * 每个组件：render(root, onComplete) -> cleanup()
 * 所有动画定时器在 cleanup 中统一清理，切换课时不会残留。
 */
// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
function h(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}
function button(label, onClick, cls) {
  const b = h('button', 'w-btn ' + (cls || ''), esc(label))
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}
function slider(min, max, value, step, onInput) {
  const s = h('input', 'w-slider')
  s.type = 'range'
  s.min = min
  s.max = max
  s.value = value
  s.step = step || 1
  s.addEventListener('input', () => onInput(Number(s.value)))
  return s
}
function makeCtx(root, title, desc, onComplete) {
  const timers = []
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timers.push(t)
    return t
  }
  const every = (fn: () => void, ms: number) => {
    const t = setInterval(fn, ms)
    timers.push(t)
    return t
  }
  const wrap = h('div', 'widget')
  const head = h('div', 'widget-head', '<h4>' + esc(title) + '</h4><p>' + esc(desc) + '</p>')
  const body = h('div', 'widget-body')
  const foot = h('div', 'widget-foot')
  const status = h('span', 'widget-status', '动手试一试：所有操作都只影响本页演示')
  let finished = false,
    interacted = false
  // 只有真正操作过演练组件才计入学情，避免打开课时即被判定完成
  const markInteract = () => {
    interacted = true
  }
  ;['pointerdown', 'change', 'input', 'keydown'].forEach((ev) =>
    wrap.addEventListener(ev, markInteract, true),
  )
  const finish = () => {
    if (finished || !interacted) return
    finished = true
    status.textContent = '✅ 演练完成，学情已记录'
    status.classList.add('ok')
    if (onComplete) onComplete()
  }
  const doneBtn = button(
    '标记为已演练',
    () => {
      interacted = true
      finish()
    },
    'ghost',
  )
  foot.append(status, doneBtn)
  wrap.append(head, body, foot)
  root.appendChild(wrap)
  return {
    body,
    status,
    finish,
    later,
    every,
    setStatus: (t) => {
      status.textContent = t
    },
    cleanup: () => {
      timers.forEach((t) => {
        clearTimeout(t)
        clearInterval(t)
      })
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap)
    },
  }
}
function row(parent, label, control) {
  const r = h('div', 'w-row', '<span class="w-label">' + esc(label) + '</span>')
  r.appendChild(control)
  parent.appendChild(r)
  return r
}
function group(parent, buttons) {
  const g = h('div', 'w-btnrow')
  buttons.forEach((b) => g.appendChild(b))
  parent.appendChild(g)
  return g
}
function box(parent, cls, html) {
  const e = h('div', 'w-box ' + (cls || ''), html || '')
  parent.appendChild(e)
  return e
}
function svg(parent, viewBox, content, cls) {
  const s = h('div', 'w-svg ' + (cls || ''))
  s.innerHTML = '<svg viewBox="' + viewBox + '" preserveAspectRatio="xMidYMid meet">' + content + '</svg>'
  parent.appendChild(s)
  return s
}

const W = {}

/* ---------- 1. 三通道类型 ---------- */
W.triple = function (root, onDone) {
  const c = makeCtx(
    root,
    '三通道类型拼装台',
    '切换三个通道，观察类型签名与「是否可直接运行」如何变化。',
    onDone,
  )
  const sel = (opts) => {
    const s = h('select', 'w-select')
    opts.forEach((o) => {
      const op = h('option', null, esc(o[0]))
      op.value = o[1]
      s.appendChild(op)
    })
    return s
  }
  const a = sel([
    ['number', 'number'],
    ['string', 'string'],
    ['void', 'void'],
    ['never（永不成功）', 'never'],
  ])
  const e = sel([
    ['never（不会失败）', 'never'],
    ['HttpError', 'HttpError'],
    ['NotFound | Timeout', 'NotFound | Timeout'],
  ])
  const r = sel([
    ['never（无依赖）', 'never'],
    ['Db', 'Db'],
    ['Config | Logger', 'Config | Logger'],
  ])
  row(c.body, 'Success', a)
  row(c.body, 'Error', e)
  row(c.body, 'Requirements', r)
  const sig = box(c.body, 'code-out')
  const explain = box(c.body, 'w-explain')
  const render = () => {
    const A = a.value,
      E = e.value,
      R = r.value
    sig.innerHTML = '<code>Effect&lt;' + esc(A) + ', ' + esc(E) + ', ' + esc(R) + '&gt;</code>'
    const runnable = R === 'never'
    const notes = []
    notes.push(
      A === 'never'
        ? 'Success=never：该程序不会成功返回，只能一直运行或失败。'
        : 'Success=' + A + '：成功时恰好产出 1 个值。',
    )
    notes.push(
      E === 'never'
        ? 'Error=never：没有可构造的预期错误。'
        : 'Error 含 ' + E + '：调用方必须处理或继续向外传播。',
    )
    notes.push(
      runnable
        ? 'R=never ✅ 依赖已全部满足，可以直接交给 run*。'
        : 'R ≠ never ⛔ 还有依赖未装配，必须先 Effect.provide 或用 run*With(context)。',
    )
    explain.innerHTML = '<ul>' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>'
    c.setStatus('已解析：' + (runnable ? '可执行程序' : '仍需装配依赖'))
    c.finish()
  }
  ;[a, e, r].forEach((s) => s.addEventListener('change', render))
  group(c.body, [button('解析类型', render)])
  render()
  return c.cleanup
}

/* ---------- 2. 惰性蓝图 ---------- */
W.blueprint = function (root, onDone) {
  const c = makeCtx(
    root,
    '惰性蓝图：什么时候才真的执行？',
    '先不断添加算子，观察副作用计数；再按「运行」看 runtime 逐步解释指令。',
    onDone,
  )
  let nodes = ['Effect.succeed(1)', 'Effect.map(n => n + 1)', 'Effect.tap(log)']
  let executed = 0,
    running = false
  const tree = box(c.body, 'w-tree')
  const counter = box(c.body, 'w-metric')
  const log = box(c.body, 'w-log')
  const draw = () => {
    tree.innerHTML = nodes
      .map(
        (n, i) =>
          '<div class="w-node" data-i="' +
          i +
          '"><span class="w-idx">' +
          (i + 1) +
          '</span><code>' +
          esc(n) +
          '</code></div>',
      )
      .join('<div class="w-link">↓</div>')
    counter.innerHTML =
      '<strong>' +
      executed +
      '</strong> 次实际副作用　·　指令节点 ' +
      nodes.length +
      ' 个　·　构建阶段执行次数恒为 0'
  }
  const add = () => {
    if (running) return
    const pool = [
      'Effect.map(n => n * 2)',
      'Effect.tap(n => Effect.log(n))',
      'Effect.flatMap(n => Effect.succeed(n))',
      'Effect.zip(Effect.succeed("x"))',
    ]
    nodes.push(pool[nodes.length % pool.length])
    draw()
    c.setStatus('只是往蓝图上加了一个节点 —— 依然什么都没执行')
  }
  const run = () => {
    if (running) return
    running = true
    executed = 0
    log.innerHTML = ''
    draw()
    c.setStatus('run* 创建 root fiber，开始逐条解释…')
    let i = 0
    const step = () => {
      if (i >= nodes.length) {
        log.innerHTML += '<div class="w-line ok">Exit.succeed( 结果 ) —— 执行结束</div>'
        running = false
        c.setStatus('✅ 关键：只有 run* 之后才产生副作用')
        c.finish()
        return
      }
      const el = tree.querySelector('[data-i="' + i + '"]')
      if (el) el.classList.add('active')
      executed += 1
      draw()
      log.innerHTML += '<div class="w-line">解释指令 ' + (i + 1) + '：' + esc(nodes[i]) + '</div>'
      i += 1
      c.later(step, 420)
    }
    c.later(step, 200)
  }
  group(c.body, [
    button('添加算子', add),
    button('运行 runPromise', run, 'primary'),
    button('重置', () => {
      if (running) return
      nodes = ['Effect.succeed(1)', 'Effect.map(n => n + 1)', 'Effect.tap(log)']
      executed = 0
      log.innerHTML = ''
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- 3. runLoop 指令解释器 ---------- */
W.runloop = function (root, onDone) {
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
            .slice()
            .reverse()
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

/* ---------- 4. Scheduler ---------- */
W.scheduler = function (root, onDone) {
  const c = makeCtx(
    root,
    'MixedScheduler：协作让出与公平性',
    '调节操作预算，观察两个 fiber 如何在同一线程上轮流推进，而不是一个跑到底。',
    onDone,
  )
  let budget = 3,
    mode = 'async',
    events = [],
    running = false
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

/* ---------- 5. Cause ---------- */
W.cause = function (root, onDone) {
  const c = makeCtx(
    root,
    'Cause：扁平 reasons 数组',
    '往 Cause 里添加失败事实，观察 guards 判定与失败报告，理解为什么它「无损」。',
    onDone,
  )
  let reasons = []
  const jsonBox = box(c.body, 'code-out')
  const guards = box(c.body, 'w-guard')
  const pretty = box(c.body, 'w-log')
  const draw = () => {
    const items = reasons
      .map(
        (r) =>
          '{ _tag: "' +
          r.tag +
          '", ' +
          (r.tag === 'Fail' ? 'error: ' : r.tag === 'Die' ? 'defect: ' : 'fiberId: ') +
          '"' +
          esc(r.val) +
          '" }',
      )
      .join(', ')
    jsonBox.innerHTML = '<code>Cause { reasons: [' + (items || '/* 空 */') + '] }</code>'
    const has = (t) => reasons.some((r) => r.tag === t)
    const rows = [
      ['cause.reasons.length === 0', reasons.length === 0, '空 Cause'],
      ['Cause.hasFails', has('Fail'), '含预期失败'],
      ['Cause.hasDies', has('Die'), '含缺陷'],
      ['Cause.hasInterrupts', has('Interrupt'), '含中断'],
      [
        'Cause.hasInterruptsOnly',
        reasons.length > 0 && reasons.every((r) => r.tag === 'Interrupt'),
        '全是中断',
      ],
    ]
    guards.innerHTML =
      '<div class="w-box-title">guards 实时判定</div>' +
      rows
        .map(
          (r) =>
            '<div class="w-guard-row"><code>' +
            esc(r[0]) +
            '</code><span class="' +
            (r[1] ? 'yes' : 'no') +
            '">' +
            (r[1] ? 'true' : 'false') +
            '</span><span class="w-muted">' +
            esc(r[2]) +
            '</span></div>',
        )
        .join('')
    pretty.innerHTML =
      '<div class="w-box-title">Cause.pretty 预览</div>' +
      (reasons.length
        ? reasons
            .map(
              (r) =>
                '<div class="w-line">' +
                (r.tag === 'Fail' ? 'Error: ' : r.tag === 'Die' ? 'Defect: ' : 'InterruptError: fiber ') +
                esc(r.val) +
                '</div>',
            )
            .join('')
        : '<div class="w-line w-muted">（空字符串）</div>')
    c.finish()
  }
  const add = (tag, val) => {
    reasons.push({ tag, val })
    draw()
    c.setStatus('已添加 ' + tag + ' reason；注意它是数组元素，不是树节点')
  }
  group(c.body, [
    button('+ Fail（预期错误）', () => add('Fail', 'db down')),
    button('+ Die（缺陷）', () => add('Die', 'bug in mapper')),
    button('+ Interrupt（中断）', () => add('Interrupt', '#7')),
    button('Cause.combine 合并一份', () => {
      reasons = reasons.concat([
        { tag: 'Fail', val: 'concurrent task failed' },
        { tag: 'Interrupt', val: '#9' },
      ])
      draw()
      c.setStatus('combine 只是拼接两个 reasons 数组')
    }),
    button('清空', () => {
      reasons = []
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- 6. Layer 依赖图 ---------- */
W.layer = function (root, onDone) {
  const c = makeCtx(
    root,
    'Layer 依赖图：类型就是架构',
    '切换组合方式，观察 RIn / ROut 类型如何演算，以及记忆化为什么重要。',
    onDone,
  )
  let mode = 'raw',
    memo = true
  const graph = box(c.body, 'w-graph')
  const typeBox = box(c.body, 'code-out')
  const explain = box(c.body, 'w-explain')
  const metric = box(c.body, 'w-metric')
  const modes = {
    raw: {
      out: 'Config | Logger | Db',
      in: 'Config | Logger',
      label: '未装配',
      desc: '三份配方各自声明需求，R 还消不掉，无法直接运行。',
      edges: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    },
    merge: {
      out: 'Config | Logger',
      in: 'Config',
      label: 'Layer.merge',
      desc: '并联：产出与需求都取并集。Config 同时被 Logger 与 Db 需要。',
      edges: [
        [0, 1],
        [0, 2],
      ],
    },
    provide: {
      out: 'Db',
      in: 'never',
      label: 'Layer.provide',
      desc: '纵向消解：上游产出喂给下游输入，最终只暴露最外层输出，RIn 归零 = 装配完成。',
      edges: [
        [0, 1],
        [1, 2],
      ],
    },
    provideMerge: {
      out: 'Db | Config | Logger',
      in: 'never',
      label: 'Layer.provideMerge',
      desc: '消解依赖的同时把被提供方的服务也保留在输出里，供其他消费者复用。',
      edges: [
        [0, 1],
        [1, 2],
      ],
    },
  }
  const nodes = [
    { x: 80, y: 60, n: 'Config' },
    { x: 290, y: 60, n: 'Logger' },
    { x: 500, y: 60, n: 'Database' },
  ]
  function draw() {
    const m = modes[mode]
    let content = ''
    m.edges.forEach(([a, b]) => {
      const A = nodes[a],
        B = nodes[b]
      content +=
        '<line x1="' +
        (A.x + 90) +
        '" y1="' +
        A.y +
        '" x2="' +
        (B.x - 10) +
        '" y2="' +
        B.y +
        '" stroke="currentColor" stroke-width="1.5" opacity="0.45" stroke-dasharray="4 3"/>'
    })
    nodes.forEach((n, i) => {
      const active = m.edges.some((e) => e[0] === i || e[1] === i)
      content +=
        '<rect x="' +
        (n.x - 70) +
        '" y="' +
        (n.y - 22) +
        '" width="140" height="44" rx="8" fill="' +
        (active ? '#5b8def' : '#8a94a6') +
        '" opacity="0.92"/>'
      content +=
        '<text x="' +
        n.x +
        '" y="' +
        (n.y + 5) +
        '" text-anchor="middle" font-size="13" fill="#fff">' +
        n.n +
        '</text>'
    })
    graph.innerHTML = '<svg viewBox="0 0 620 120">' + content + '</svg>'
    typeBox.innerHTML =
      '<code>' + esc(m.label) + ' → Layer&lt;' + esc(m.out) + ', never, ' + esc(m.in) + '&gt;</code>'
    explain.innerHTML = '<p>' + esc(m.desc) + '</p>'
    metric.innerHTML = memo
      ? '记忆化 ON：Config 在依赖图中被引用 2 次，实际构造 <strong>1</strong> 次，连接池／客户端保持单例'
      : '记忆化 OFF（假设）：Config 被构造 <strong>2</strong> 次，可能产生两个连接池'
    c.setStatus('当前：' + m.label + ' —— RIn = ' + m.in)
    c.finish()
  }
  const g1 = h('div', 'w-btnrow')
  Object.keys(modes).forEach((k) =>
    g1.appendChild(
      button(
        modes[k].label,
        () => {
          mode = k
          draw()
        },
        mode === k ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(g1)
  group(c.body, [
    button(
      '切换记忆化',
      () => {
        memo = !memo
        draw()
      },
      'ghost',
    ),
  ])
  draw()
  return c.cleanup
}

/* ---------- 7. Scope finalizer ---------- */
W.scope = function (root, onDone) {
  const c = makeCtx(
    root,
    'Scope：finalizer 的逆序释放',
    '注册若干资源，选择一种退出方式，观察关闭 Scope 时的释放顺序。',
    onDone,
  )
  let items = [],
    exit = 'Success',
    busy = false
  const stackBox = box(c.body, 'w-stack')
  const log = box(c.body, 'w-log')
  const draw = () => {
    stackBox.innerHTML =
      '<div class="w-box-title">Scope 中的 finalizer 栈</div>' +
      (items.length
        ? items
            .slice()
            .reverse()
            .map(
              (x, i) =>
                '<div class="w-frame">' +
                esc(x) +
                ' <span class="w-muted">（第 ' +
                (items.length - i) +
                ' 个释放）</span></div>',
            )
            .join('')
        : '<div class="w-empty">（空，点「获取资源」）</div>')
  }
  const acquire = () => {
    if (busy) return
    items.push(
      'release ' +
        ['file', 'socket', 'db-conn', 'lock', 'temp-dir'][items.length % 5] +
        ' #' +
        (items.length + 1),
    )
    draw()
    c.setStatus('acquireRelease：获取阶段不可中断，避免拿到一半资源被取消')
  }
  const close = () => {
    if (busy || !items.length) return
    busy = true
    log.innerHTML = '<div class="w-line">程序以 <b>' + esc(exit) + '</b> 结束 → 关闭 Scope</div>'
    const seq = items.slice().reverse()
    let i = 0
    const step = () => {
      if (i >= seq.length) {
        log.innerHTML += '<div class="w-line ok">所有 finalizer 执行完毕（LIFO），资源零泄漏</div>'
        busy = false
        c.setStatus('✅ 成功 / 失败 / 中断三条路径都会走到这里')
        c.finish()
        return
      }
      log.innerHTML += '<div class="w-line">→ ' + esc(seq[i]) + '</div>'
      i += 1
      c.later(step, 380)
    }
    c.later(step, 250)
  }
  group(c.body, [button('获取资源', acquire), button('关闭 Scope', close, 'primary')])
  const exits = h('div', 'w-btnrow')
  ;['Success', 'Failure', 'Interrupted'].forEach((x) =>
    exits.appendChild(
      button(
        x,
        () => {
          exit = x
          Array.from(exits.children).forEach((b) => b.classList.remove('primary'))
          exits.children[['Success', 'Failure', 'Interrupted'].indexOf(x)].classList.add('primary')
        },
        x === 'Success' ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(exits)
  draw()
  return c.cleanup
}

/* ---------- 8. Fiber 监督树 ---------- */
W.fiber = function (root, onDone) {
  const c = makeCtx(
    root,
    'Fiber 监督树：四种 fork 策略',
    '选择 fork 方式，再结束或中断父 fiber，看子 fiber 的命运由谁决定。',
    onDone,
  )
  let mode = 'forkChild',
    state = 'running'
  const strategies = {
    forkChild: {
      bind: '父 fiber（自动监督）',
      survive: false,
      note: '结构化并发：父结束或被中断，子 fiber 一起终止，finalizer 保证执行。',
    },
    forkDetach: {
      bind: '全局 scope（daemon）',
      survive: true,
      note: '无 parent、不被监督；父被中断后仍继续，直到自然完成或应用退出。',
    },
    forkScoped: {
      bind: '局部 Scope',
      survive: false,
      note: '不受父监督，可活得比父久；局部 Scope 关闭时才终止。',
    },
    forkIn: {
      bind: '指定 Scope',
      survive: true,
      note: '绑定到外部传入的 Scope，可以越过内层作用域继续运行。',
    },
  }
  const tree = box(c.body, 'w-graph')
  const explain = box(c.body, 'w-explain')
  function draw() {
    const s = strategies[mode]
    const childColor =
      state === 'running' ? '#3fb984' : s.survive && state === 'parent-ended' ? '#3fb984' : '#e46a70'
    let content =
      '<rect x="230" y="14" width="160" height="40" rx="8" fill="' +
      (state === 'running' ? '#5b8def' : '#8a94a6') +
      '"/><text x="310" y="39" text-anchor="middle" font-size="13" fill="#fff">parent fiber</text>'
    content +=
      '<line x1="270" y1="54" x2="170" y2="90" stroke="currentColor" opacity="0.5" stroke-width="1.5"/><line x1="350" y1="54" x2="450" y2="90" stroke="currentColor" opacity="0.5" stroke-width="1.5"/>'
    content +=
      '<rect x="90" y="92" width="160" height="36" rx="8" fill="' +
      childColor +
      '"/><text x="170" y="115" text-anchor="middle" font-size="12" fill="#fff">child #1</text>'
    content +=
      '<rect x="370" y="92" width="160" height="36" rx="8" fill="' +
      childColor +
      '"/><text x="450" y="115" text-anchor="middle" font-size="12" fill="#fff">child #2</text>'
    tree.innerHTML = '<svg viewBox="0 0 620 140">' + content + '</svg>'
    explain.innerHTML =
      '<strong>生命周期绑定到：' +
      esc(s.bind) +
      '</strong><p>' +
      esc(s.note) +
      '</p><p>当前状态：<b>' +
      (state === 'running'
        ? '运行中'
        : '父 fiber 已结束／被中断 → 子 fiber ' + (s.survive ? '仍存活' : '被终止')) +
      '</b></p><p class="w-muted">Fiber.interrupt 会等待子 fiber 完全终止并跑完 finalizer；interruptUnsafe() 不等。</p>'
    c.finish()
  }
  const g = h('div', 'w-btnrow')
  Object.keys(strategies).forEach((k) =>
    g.appendChild(
      button(
        k,
        () => {
          mode = k
          state = 'running'
          draw()
        },
        k === mode ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(g)
  group(c.body, [
    button(
      '结束 / 中断父 fiber',
      () => {
        state = 'parent-ended'
        draw()
        c.setStatus('观察子 fiber 颜色变化：绿色存活 / 红色终止')
      },
      'primary',
    ),
    button('重置', () => {
      state = 'running'
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- 9. 并发选项时间轴 ---------- */
W.concurrency = function (root, onDone) {
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

/* ---------- 10. Stream 背压 ---------- */
W.stream = function (root, onDone) {
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

/* ---------- 11. Schedule 重试策略 ---------- */
W.retry = function (root, onDone) {
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
    const maxD = Math.max.apply(null, delays.concat([1]))
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

/* ---------- RxJS 1. 源操作符节奏 ---------- */
W.rxjsSource = function (root, onDone) {
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

/* ---------- RxJS 2. 冷 / 热对比 ---------- */
W.rxColdHot = function (root, onDone) {
  const c = makeCtx(
    root,
    '冷源 vs 热源：晚到的订阅者看到什么',
    '先推热 Subject 的 next，再让 C「晚到」订阅，看它是否错过早期值；冷源则两个订阅者各自独立。',
    onDone,
  )
  let hot = []
  const lanes = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  function draw() {
    const w = 620
    let content = '<text x="8" y="14" font-size="11" fill="currentColor">热 Subject（独立计时）</text>'
    hot.forEach((v, i) => {
      const x = 40 + i * 64
      content += '<circle cx="' + x + '" cy="44" r="10" fill="#5b8def"/>'
      content += '<text x="' + x + '" y="48" font-size="10" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    content += '<line x1="40" y1="84" x2="600" y2="84" stroke="currentColor" opacity="0.3"/>'
    content +=
      '<text x="40" y="104" font-size="10" fill="currentColor">冷 interval：A、B 各自独立从 0 起（互不共享时间线）</text>'
    lanes.innerHTML =
      '<svg viewBox="0 0 ' + w + ' 120" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
  }
  group(c.body, [
    button('Subject.next()', () => {
      hot.push(hot.length)
      log.innerHTML +=
        '<div class="w-line">next(' + (hot.length - 1) + ')：早到的 A 看到它；晚到的 C 尚未订阅、错过</div>'
      draw()
      c.setStatus('热流独立计时，推了几次就发了几次')
    }),
    button('C 晚到订阅', () => {
      const last = hot.length ? hot[hot.length - 1] : null
      log.innerHTML +=
        '<div class="w-line ok">C 现在订阅：只看到 ' +
        (last === null ? '之后的值（目前还没有）' : '值 ' + last + ' 之后的内容') +
        '；不重放历史</div>'
      c.setStatus('C 错过了 ' + hot.length + ' 个早期值（普通 Subject 不重放）')
      c.finish()
    }),
    button('重置', () => {
      hot = []
      log.innerHTML = ''
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 3. 订阅回收 ---------- */
W.rxTeardown = function (root, onDone) {
  const c = makeCtx(
    root,
    '订阅回收：取消父订阅，级联回收子资源',
    '往订阅里 add 几个子资源，再取消父订阅，看它们是否按 LIFO 全部回收。',
    onDone,
  )
  let items = []
  const pool = ['setInterval 定时器', 'addEventListener', 'WebSocket 连接', '子订阅 sub2']
  const stackBox = box(c.body, 'w-stack')
  const log = box(c.body, 'w-log')
  function draw() {
    stackBox.innerHTML =
      '<div class="w-box-title">父订阅持有的子资源（' +
      items.length +
      '）</div>' +
      (items.length
        ? items
            .slice()
            .reverse()
            .map((x) => '<div class="w-frame">' + esc(x) + '</div>')
            .join('')
        : '<div class="w-empty">（空，点「添加子资源」）</div>')
  }
  const acquire = () => {
    items.push(pool[items.length % pool.length])
    draw()
    c.setStatus('Subscription.add：子资源挂到父订阅，取消时会级联回收')
  }
  const cancel = () => {
    if (!items.length) return
    log.innerHTML = '<div class="w-line">父订阅 unsubscribe() → 级联回收（LIFO）：</div>'
    const seq = items.slice().reverse()
    let i = 0
    const step = () => {
      if (i >= seq.length) {
        log.innerHTML += '<div class="w-line ok">全部子资源已回收，零泄漏</div>'
        c.setStatus('✅ 取消父订阅后所有子资源都释放')
        c.finish()
        return
      }
      log.innerHTML += '<div class="w-line">→ 回收 ' + esc(seq[i]) + '</div>'
      i += 1
      c.later(step, 280)
    }
    c.later(step, 160)
  }
  group(c.body, [button('添加子资源', acquire), button('取消父订阅', cancel, 'primary')])
  draw()
  return c.cleanup
}

/* ---------- RxJS 4. 观察者协议 ---------- */
W.rxObserver = function (root, onDone) {
  const c = makeCtx(
    root,
    '观察者协议：手写 new Observable 的发射序列',
    '依次 next / error / complete，观察序列；终结后再点其它按钮，看它被忽略。',
    onDone,
  )
  let seq = []
  let terminated = false
  const mark = { v: '·', error: '✕', complete: '✓' }
  const fill = { v: '#5b8def', error: '#e46a70', complete: '#3fb984' }
  const chart = box(c.body, 'w-lanes')
  function draw() {
    let content = '<line x1="8" y1="40" x2="600" y2="40" stroke="currentColor" opacity="0.3"/>'
    seq.forEach((s, i) => {
      const x = 48 + i * 56
      content += '<circle cx="' + x + '" cy="40" r="12" fill="' + fill[s] + '"/>'
      content +=
        '<text x="' + x + '" y="44" font-size="11" text-anchor="middle" fill="#fff">' + mark[s] + '</text>'
    })
    chart.innerHTML = '<svg viewBox="0 0 620 80" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
  }
  const emit = (s) => {
    if (terminated) {
      c.setStatus('⚠️ 已终结：' + s + ' 被忽略（终结不可逆）')
      return
    }
    seq.push(s)
    if (s === 'error' || s === 'complete') terminated = true
    draw()
    c.setStatus(terminated ? '✅ 流已终结，后续 next 不再生效' : '已发射 ' + seq.length + ' 个值')
    c.finish()
  }
  group(c.body, [
    button('next(值)', () => emit('v')),
    button('error', () => emit('error')),
    button('complete', () => emit('complete')),
    button('重置', () => {
      seq = []
      terminated = false
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 5. map 流水线 ---------- */
W.rxTransform = function (root, onDone) {
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

/* ---------- RxJS 6. 过滤与取舍 ---------- */
W.rxFilter = function (root, onDone) {
  const c = makeCtx(
    root,
    '过滤与取舍：哪些值被丢、哪些被留',
    '勾选谓词，看原始流 1..8 里哪些元素被保留（绿）、被丢（红×）。',
    onDone,
  )
  const src = [1, 2, 2, 3, 4, 5, 5, 6]
  let even = true
  let takeN = 0
  let distinct = true
  const chart = box(c.body, 'w-lanes')
  function pass(v, idx) {
    if (distinct && src.slice(0, idx).indexOf(v) >= 0) return false
    if (even && v % 2 !== 0) return false
    if (takeN > 0 && idx >= takeN) return false
    return true
  }
  function draw() {
    let kept = 0
    let content = '<line x1="8" y1="40" x2="600" y2="40" stroke="currentColor" opacity="0.3"/>'
    src.forEach((v, i) => {
      const x = 56 + i * 68
      const ok = pass(v, i)
      if (ok) kept += 1
      content += '<circle cx="' + x + '" cy="40" r="12" fill="' + (ok ? '#3fb984' : '#e46a70') + '"/>'
      content +=
        '<text x="' +
        x +
        '" y="44" font-size="11" text-anchor="middle" fill="#fff">' +
        (ok ? v : '✕') +
        '</text>'
    })
    chart.innerHTML = '<svg viewBox="0 0 620 80" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
    c.setStatus('保留 ' + kept + '/' + src.length + ' 个；过滤改变「次数」但保持相对顺序')
    c.finish()
  }
  const btnE = button(
    'filter(偶数)',
    () => {
      even = !even
      btnE.classList.toggle('primary', even)
      draw()
    },
    'primary',
  )
  const btnN = button('take(3)', () => {
    takeN = takeN === 0 ? 3 : 0
    btnN.classList.toggle('primary', takeN > 0)
    draw()
  })
  const btnD = button(
    '去重相邻',
    () => {
      distinct = !distinct
      btnD.classList.toggle('primary', distinct)
      draw()
    },
    'primary',
  )
  group(c.body, [
    btnE,
    btnN,
    btnD,
    button('重置', () => {
      even = true
      takeN = 0
      distinct = true
      btnE.classList.add('primary')
      btnN.classList.remove('primary')
      btnD.classList.add('primary')
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 7. 嵌套流展开 ---------- */
W.rxFlatten = function (root, onDone) {
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

/* ---------- RxJS 8. 四扁平化操作符时序对比（核心） ---------- */
W.rxCross = function (root, onDone) {
  const c = makeCtx(
    root,
    '四扁平化操作符时序对比（核心）',
    '同样输入 A@0 / B@2 / C@4（每内层持续 3 单位），看 concatMap / mergeMap / switchMap / exhaustMap 各自何时取消、何时忽略。',
    onDone,
  )
  const W0 = 620,
    unit = 20,
    x0 = 40,
    yTop = 14,
    laneH = 30
  const defs = [
    {
      name: 'concatMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 3, e: 6, v: 'B', ok: true },
        { s: 6, e: 9, v: 'C', ok: true },
      ],
      note: 'A 发完才 B，B 发完才 C：严格保序、串行限流。',
    },
    {
      name: 'mergeMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 2, e: 5, v: 'B', ok: true },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'A、B、C 并发，同 tick 内层交错：最快，但可能乱序、过载。',
    },
    {
      name: 'switchMap',
      segs: [
        { s: 0, e: 2, v: 'A', ok: false, label: '取消' },
        { s: 2, e: 4, v: 'B', ok: false, label: '取消' },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'B 到→取消 A；C 到→取消 B；只有最新 C 存活：取最新。',
    },
    {
      name: 'exhaustMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 2, e: 5, v: 'B', ok: false, label: '忽略' },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'A 进行中时 B 被忽略；A 完成后才接受 C：排空、防重复提交。',
    },
  ]
  const chart = box(c.body, 'w-lanes')
  const explain = box(c.body, 'w-explain')
  function draw() {
    let content = ''
    content +=
      '<line x1="' +
      x0 +
      '" y1="' +
      (yTop + defs.length * laneH + 6) +
      '" x2="' +
      (W0 - 8) +
      '" y2="' +
      (yTop + defs.length * laneH + 6) +
      '" stroke="currentColor" opacity="0.3"/>'
    content +=
      '<text x="' +
      x0 +
      '" y="' +
      (yTop + defs.length * laneH + 24) +
      '" font-size="10" fill="currentColor">0 ─── 时间 ───► 9（每内层 3 单位；外值 A@0 B@2 C@4）</text>'
    defs.forEach((d, di) => {
      const y = yTop + di * laneH
      content += '<text x="8" y="' + (y + 16) + '" font-size="10" fill="currentColor">' + d.name + '</text>'
      d.segs.forEach((sg) => {
        const x1 = x0 + sg.s * unit
        const w = (sg.e - sg.s) * unit
        const fill = sg.ok ? '#5b8def' : '#e46a70'
        content +=
          '<rect x="' +
          x1 +
          '" y="' +
          y +
          '" width="' +
          w +
          '" height="20" rx="4" fill="' +
          fill +
          '" opacity="' +
          (sg.ok ? 0.9 : 0.45) +
          '"/>'
        content +=
          '<text x="' +
          (x1 + w / 2) +
          '" y="' +
          (y + 14) +
          '" font-size="10" text-anchor="middle" fill="#fff">' +
          sg.v +
          (sg.ok ? '' : '✕') +
          '</text>'
      })
    })
    chart.innerHTML =
      '<svg viewBox="0 0 ' +
      W0 +
      ' ' +
      (yTop + defs.length * laneH + 32) +
      '" preserveAspectRatio="xMinYMin meet">' +
      content +
      '</svg>'
    explain.innerHTML = defs.map((d) => '<p><strong>' + d.name + '</strong>：' + d.note + '</p>').join('')
    c.setStatus('对比四条泳道：红色 = 被取消 / 被忽略的内层')
    c.finish()
  }
  group(c.body, [
    button(
      '高亮差异',
      () => {
        c.setStatus('switch 取消旧的；exhaust 忽略新的——差别就在这')
        c.finish()
      },
      'primary',
    ),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 9. 重试与指数退避 ---------- */
W.rxRetry = function (root, onDone) {
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

/* ---------- RxJS 10. Subject 多播 ---------- */
W.rxSubject = function (root, onDone) {
  const c = makeCtx(
    root,
    'Subject 多播：一条时间线，多个订阅者',
    '推 next，看早到订阅者 A 与晚到订阅者 B 各看到什么；切换 BehaviorSubject 看「补最近值」。',
    onDone,
  )
  let mode = 'subject'
  let ticks = []
  const lanes = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  function draw() {
    let content =
      '<text x="8" y="14" font-size="11" fill="currentColor">发射时间线（' +
      (mode === 'subject' ? 'Subject' : 'BehaviorSubject') +
      '）</text>'
    ticks.forEach((v, i) => {
      const x = 40 + i * 56
      content += '<circle cx="' + x + '" cy="44" r="10" fill="#5b8def"/>'
      content += '<text x="' + x + '" y="48" font-size="10" text-anchor="middle" fill="#fff">' + v + '</text>'
    })
    lanes.innerHTML = '<svg viewBox="0 0 620 90" preserveAspectRatio="xMinYMin meet">' + content + '</svg>'
  }
  group(c.body, [
    button(
      'next(v)',
      () => {
        ticks.push(ticks.length)
        log.innerHTML +=
          '<div class="w-line">next(' +
          (ticks.length - 1) +
          ')：A 看到它；' +
          (mode === 'subject' ? 'B 尚未订阅→错过' : 'B 若订阅会先补最近值再跟随') +
          '</div>'
        draw()
        c.setStatus('已推 ' + ticks.length + ' 个值')
        c.finish()
      },
      'primary',
    ),
    button('B 订阅', () => {
      const last = ticks.length ? ticks[ticks.length - 1] : null
      log.innerHTML +=
        '<div class="w-line ok">' +
        (mode === 'subject'
          ? 'B 现在订阅：只看到之后的值（已错过 ' + ticks.length + ' 个，不重放）'
          : 'B 现在订阅：立刻补最近值 ' + (last === null ? '∅' : last) + '，再跟随后续') +
        '</div>'
      c.setStatus(mode === 'subject' ? '普通 Subject 不重放历史' : 'BehaviorSubject 新订阅者立刻拿到当前值')
      c.finish()
    }),
    button('切到 BehaviorSubject', () => {
      mode = 'behavior'
      ticks = []
      log.innerHTML = ''
      draw()
    }),
    button('重置', () => {
      ticks = []
      log.innerHTML = ''
      mode = 'subject'
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 11. share 引用计数 ---------- */
W.rxShare = function (root, onDone) {
  const c = makeCtx(
    root,
    'share 引用计数：第一个连接、最后一个断开',
    '让订阅者 A / B 先后订阅与取消，看 refCount 与「昂贵源是否连接中」的变化。',
    onDone,
  )
  let refs = 0
  const metric = box(c.body, 'w-metric')
  const bar = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  function draw() {
    const connected = refs > 0
    metric.innerHTML =
      'refCount = <strong>' +
      refs +
      '</strong>　·　昂贵源 ' +
      (connected ? '已连接（执行中）' : '未连接') +
      '　·　规则：第一个订阅者连接，最后一个取消时断开'
    bar.innerHTML =
      '<svg viewBox="0 0 620 60" preserveAspectRatio="xMinYMin meet">' +
      '<rect x="20" y="20" width="120" height="24" rx="4" fill="#38a9c4"/><text x="80" y="37" text-anchor="middle" font-size="11" fill="#fff">昂贵源</text>' +
      '<line x1="140" y1="32" x2="360" y2="32" stroke="' +
      (connected ? '#3fb984' : '#8a94a6') +
      '" stroke-width="3"/>' +
      '<rect x="360" y="20" width="120" height="24" rx="4" fill="' +
      (connected ? '#3fb984' : '#8a94a6') +
      '"/><text x="420" y="37" text-anchor="middle" font-size="11" fill="#fff">' +
      (connected ? 'share 中' : 'idle') +
      '</text>' +
      '</svg>'
  }
  const sub = (name) => {
    refs += 1
    log.innerHTML +=
      '<div class="w-line">' +
      name +
      ' 订阅 → refCount ' +
      refs +
      (refs === 1 ? '（连接昂贵源）' : '') +
      '</div>'
    draw()
    c.finish()
  }
  const un = (name) => {
    refs = Math.max(0, refs - 1)
    log.innerHTML +=
      '<div class="w-line">' +
      name +
      ' 取消 → refCount ' +
      refs +
      (refs === 0 ? '（无人订阅，断开昂贵源）' : '') +
      '</div>'
    draw()
    c.finish()
  }
  group(c.body, [
    button('A 订阅', () => sub('A')),
    button('A 取消', () => un('A')),
    button('B 订阅', () => sub('B')),
    button('B 取消', () => un('B')),
  ])
  draw()
  return c.cleanup
}

/* ---------- RxJS 12. 调度器时间注入 ---------- */
W.rxScheduler = function (root, onDone) {
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

/* ---------- RxJS 13. 组合多源 ---------- */
W.rxCombine = function (root, onDone) {
  const c = makeCtx(
    root,
    '组合多源：merge / zip / combineLatest / withLatestFrom',
    '给源 A 或 B 推值，看四个组合算子各自何时、发什么。',
    onDone,
  )
  let a = 0
  let b = 0
  const chart = box(c.body, 'w-lanes')
  const log = box(c.body, 'w-log')
  const rows = ['merge', 'zip', 'combineLatest', 'withLatestFrom']
  function draw() {
    let content =
      '<text x="8" y="16" font-size="11" fill="currentColor">当前：A=' +
      (a || '∅') +
      '  B=' +
      (b || '∅') +
      '</text>'
    rows.forEach((r, i) => {
      const y = 40 + i * 24
      content += '<text x="8" y="' + (y + 4) + '" font-size="10" fill="currentColor">' + r + '</text>'
    })
    chart.innerHTML =
      '<svg viewBox="0 0 620 ' +
      (40 + rows.length * 24 + 10) +
      '" preserveAspectRatio="xMinYMin meet">' +
      content +
      '</svg>'
  }
  group(c.body, [
    button(
      'A.next',
      () => {
        a += 1
        log.innerHTML +=
          '<div class="w-line">A.next(' +
          a +
          ') → merge 转发 A' +
          a +
          '；combineLatest ' +
          (b ? '发 [A' + a + ', B' + b + ']' : '（B 还没值，暂不发）') +
          '</div>'
        draw()
        c.finish()
      },
      'primary',
    ),
    button(
      'B.next',
      () => {
        b += 1
        log.innerHTML +=
          '<div class="w-line">B.next(' +
          b +
          ') → merge 转发 B' +
          b +
          '；withLatestFrom 此刻 A 触发会带 B' +
          b +
          '</div>'
        draw()
        c.finish()
      },
      'primary',
    ),
    button('重置', () => {
      a = 0
      b = 0
      log.innerHTML = ''
      draw()
    }),
  ])
  draw()
  return c.cleanup
}

export const Widgets = {
  render(name, root, onDone) {
    if (!name || !W[name]) return function () {}
    try {
      return W[name](root, onDone)
    } catch (err) {
      root.innerHTML =
        '<div class="widget"><div class="widget-head"><h4>演练加载失败</h4><p>' +
        esc(err.message) +
        '</p></div></div>'
      return function () {}
    }
  },
  has: (name) => !!W[name],
}
