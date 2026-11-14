// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 8. Fiber 监督树 ---------- */
import { esc, h, button, makeCtx, group, box } from '../dom.ts'

export function fiber(root, onDone) {
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
