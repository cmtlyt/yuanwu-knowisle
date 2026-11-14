// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 2. 惰性蓝图 ---------- */
import { esc, button, makeCtx, group, box } from '../dom.ts'

export function blueprint(root, onDone) {
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
