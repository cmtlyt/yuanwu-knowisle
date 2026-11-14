// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 3. 订阅回收 ---------- */
import { esc, button, makeCtx, group, box } from '../dom.ts'

export function rxTeardown(root, onDone) {
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
            .toReversed()
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
    const seq = items.toReversed()
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
