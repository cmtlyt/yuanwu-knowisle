// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 11. share 引用计数 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxShare(root, onDone) {
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
