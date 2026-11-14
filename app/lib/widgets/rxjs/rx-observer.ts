// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 4. 观察者协议 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxObserver(root, onDone) {
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
