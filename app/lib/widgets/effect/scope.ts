// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 7. Scope finalizer ---------- */
import { esc, h, button, makeCtx, group, box } from '../dom.ts'

export function scope(root, onDone) {
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
            .toReversed()
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
    const seq = items.toReversed()
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
