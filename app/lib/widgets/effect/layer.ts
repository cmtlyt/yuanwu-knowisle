// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- 6. Layer 依赖图 ---------- */
import { esc, h, button, makeCtx, group, box } from '../dom.ts'

export function layer(root, onDone) {
  const c = makeCtx(
    root,
    'Layer 依赖图：类型就是架构',
    '切换组合方式，观察 RIn / ROut 类型如何演算，以及记忆化为什么重要。',
    onDone,
  )
  let mode = 'raw',
    memo = true
  const graph = box(c.body, 'w-graph')
  const typeBox = box(c.body, 'code-out')
  const explain = box(c.body, 'w-explain')
  const metric = box(c.body, 'w-metric')
  const modes = {
    raw: {
      out: 'Config | Logger | Db',
      in: 'Config | Logger',
      label: '未装配',
      desc: '三份配方各自声明需求，R 还消不掉，无法直接运行。',
      edges: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    },
    merge: {
      out: 'Config | Logger',
      in: 'Config',
      label: 'Layer.merge',
      desc: '并联：产出与需求都取并集。Config 同时被 Logger 与 Db 需要。',
      edges: [
        [0, 1],
        [0, 2],
      ],
    },
    provide: {
      out: 'Db',
      in: 'never',
      label: 'Layer.provide',
      desc: '纵向消解：上游产出喂给下游输入，最终只暴露最外层输出，RIn 归零 = 装配完成。',
      edges: [
        [0, 1],
        [1, 2],
      ],
    },
    provideMerge: {
      out: 'Db | Config | Logger',
      in: 'never',
      label: 'Layer.provideMerge',
      desc: '消解依赖的同时把被提供方的服务也保留在输出里，供其他消费者复用。',
      edges: [
        [0, 1],
        [1, 2],
      ],
    },
  }
  const nodes = [
    { x: 80, y: 60, n: 'Config' },
    { x: 290, y: 60, n: 'Logger' },
    { x: 500, y: 60, n: 'Database' },
  ]
  function draw() {
    const m = modes[mode]
    let content = ''
    m.edges.forEach(([a, b]) => {
      const A = nodes[a],
        B = nodes[b]
      content +=
        '<line x1="' +
        (A.x + 90) +
        '" y1="' +
        A.y +
        '" x2="' +
        (B.x - 10) +
        '" y2="' +
        B.y +
        '" stroke="currentColor" stroke-width="1.5" opacity="0.45" stroke-dasharray="4 3"/>'
    })
    nodes.forEach((n, i) => {
      const active = m.edges.some((e) => e[0] === i || e[1] === i)
      content +=
        '<rect x="' +
        (n.x - 70) +
        '" y="' +
        (n.y - 22) +
        '" width="140" height="44" rx="8" fill="' +
        (active ? '#5b8def' : '#8a94a6') +
        '" opacity="0.92"/>'
      content +=
        '<text x="' +
        n.x +
        '" y="' +
        (n.y + 5) +
        '" text-anchor="middle" font-size="13" fill="#fff">' +
        n.n +
        '</text>'
    })
    graph.innerHTML = '<svg viewBox="0 0 620 120">' + content + '</svg>'
    typeBox.innerHTML =
      '<code>' + esc(m.label) + ' → Layer&lt;' + esc(m.out) + ', never, ' + esc(m.in) + '&gt;</code>'
    explain.innerHTML = '<p>' + esc(m.desc) + '</p>'
    metric.innerHTML = memo
      ? '记忆化 ON：Config 在依赖图中被引用 2 次，实际构造 <strong>1</strong> 次，连接池／客户端保持单例'
      : '记忆化 OFF（假设）：Config 被构造 <strong>2</strong> 次，可能产生两个连接池'
    c.setStatus('当前：' + m.label + ' —— RIn = ' + m.in)
    c.finish()
  }
  const g1 = h('div', 'w-btnrow')
  Object.keys(modes).forEach((k) =>
    g1.appendChild(
      button(
        modes[k].label,
        () => {
          mode = k
          draw()
        },
        mode === k ? 'primary' : '',
      ),
    ),
  )
  c.body.appendChild(g1)
  group(c.body, [
    button(
      '切换记忆化',
      () => {
        memo = !memo
        draw()
      },
      'ghost',
    ),
  ])
  draw()
  return c.cleanup
}
