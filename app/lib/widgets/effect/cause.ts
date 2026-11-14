// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 5. Cause ---------- */
import { esc, button, makeCtx, group, box } from '../dom.ts'

export function cause(root, onDone) {
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
