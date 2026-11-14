// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 1. 三通道类型 ---------- */
import { esc, h, button, makeCtx, row, group, box } from '../dom.ts'

/** 三通道下拉选择器（模块级纯函数，不捕获演练作用域）。 */
const sel = (opts) => {
  const s = h('select', 'w-select')
  opts.forEach((o) => {
    const op = h('option', null, esc(o[0]))
    op.value = o[1]
    s.appendChild(op)
  })
  return s
}

export function triple(root, onDone) {
  const c = makeCtx(
    root,
    '三通道类型拼装台',
    '切换三个通道，观察类型签名与「是否可直接运行」如何变化。',
    onDone,
  )
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
