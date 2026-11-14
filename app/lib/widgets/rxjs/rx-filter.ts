// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 6. 过滤与取舍 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxFilter(root, onDone) {
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
