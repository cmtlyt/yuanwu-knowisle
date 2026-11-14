// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 13. 组合多源 ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxCombine(root, onDone) {
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
