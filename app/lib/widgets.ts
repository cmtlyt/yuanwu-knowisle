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
