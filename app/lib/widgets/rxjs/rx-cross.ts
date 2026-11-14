// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/* ---------- RxJS 8. 四扁平化操作符时序对比（核心） ---------- */
import { button, makeCtx, group, box } from '../dom.ts'

export function rxCross(root, onDone) {
  const c = makeCtx(
    root,
    '四扁平化操作符时序对比（核心）',
    '同样输入 A@0 / B@2 / C@4（每内层持续 3 单位），看 concatMap / mergeMap / switchMap / exhaustMap 各自何时取消、何时忽略。',
    onDone,
  )
  const W0 = 620,
    unit = 20,
    x0 = 40,
    yTop = 14,
    laneH = 30
  const defs = [
    {
      name: 'concatMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 3, e: 6, v: 'B', ok: true },
        { s: 6, e: 9, v: 'C', ok: true },
      ],
      note: 'A 发完才 B，B 发完才 C：严格保序、串行限流。',
    },
    {
      name: 'mergeMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 2, e: 5, v: 'B', ok: true },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'A、B、C 并发，同 tick 内层交错：最快，但可能乱序、过载。',
    },
    {
      name: 'switchMap',
      segs: [
        { s: 0, e: 2, v: 'A', ok: false, label: '取消' },
        { s: 2, e: 4, v: 'B', ok: false, label: '取消' },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'B 到→取消 A；C 到→取消 B；只有最新 C 存活：取最新。',
    },
    {
      name: 'exhaustMap',
      segs: [
        { s: 0, e: 3, v: 'A', ok: true },
        { s: 2, e: 5, v: 'B', ok: false, label: '忽略' },
        { s: 4, e: 7, v: 'C', ok: true },
      ],
      note: 'A 进行中时 B 被忽略；A 完成后才接受 C：排空、防重复提交。',
    },
  ]
  const chart = box(c.body, 'w-lanes')
  const explain = box(c.body, 'w-explain')
  function draw() {
    let content = ''
    content +=
      '<line x1="' +
      x0 +
      '" y1="' +
      (yTop + defs.length * laneH + 6) +
      '" x2="' +
      (W0 - 8) +
      '" y2="' +
      (yTop + defs.length * laneH + 6) +
      '" stroke="currentColor" opacity="0.3"/>'
    content +=
      '<text x="' +
      x0 +
      '" y="' +
      (yTop + defs.length * laneH + 24) +
      '" font-size="10" fill="currentColor">0 ─── 时间 ───► 9（每内层 3 单位；外值 A@0 B@2 C@4）</text>'
    defs.forEach((d, di) => {
      const y = yTop + di * laneH
      content += '<text x="8" y="' + (y + 16) + '" font-size="10" fill="currentColor">' + d.name + '</text>'
      d.segs.forEach((sg) => {
        const x1 = x0 + sg.s * unit
        const w = (sg.e - sg.s) * unit
        const fill = sg.ok ? '#5b8def' : '#e46a70'
        content +=
          '<rect x="' +
          x1 +
          '" y="' +
          y +
          '" width="' +
          w +
          '" height="20" rx="4" fill="' +
          fill +
          '" opacity="' +
          (sg.ok ? 0.9 : 0.45) +
          '"/>'
        content +=
          '<text x="' +
          (x1 + w / 2) +
          '" y="' +
          (y + 14) +
          '" font-size="10" text-anchor="middle" fill="#fff">' +
          sg.v +
          (sg.ok ? '' : '✕') +
          '</text>'
      })
    })
    chart.innerHTML =
      '<svg viewBox="0 0 ' +
      W0 +
      ' ' +
      (yTop + defs.length * laneH + 32) +
      '" preserveAspectRatio="xMinYMin meet">' +
      content +
      '</svg>'
    explain.innerHTML = defs.map((d) => '<p><strong>' + d.name + '</strong>：' + d.note + '</p>').join('')
    c.setStatus('对比四条泳道：红色 = 被取消 / 被忽略的内层')
    c.finish()
  }
  group(c.body, [
    button(
      '高亮差异',
      () => {
        c.setStatus('switch 取消旧的；exhaust 忽略新的——差别就在这')
        c.finish()
      },
      'primary',
    ),
  ])
  draw()
  return c.cleanup
}
