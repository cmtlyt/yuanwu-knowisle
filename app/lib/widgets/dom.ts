// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/**
 * 24 个演练共用的零依赖 DOM helper。
 * 每个演练：render(root, onComplete) -> cleanup()；定时器由 makeCtx().cleanup() 统一回收。
 */

export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export function h(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}
export function button(label, onClick, cls) {
  const b = h('button', 'w-btn ' + (cls || ''), esc(label))
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}
export function slider(min, max, value, step, onInput) {
  const s = h('input', 'w-slider')
  s.type = 'range'
  s.min = min
  s.max = max
  s.value = value
  s.step = step || 1
  s.addEventListener('input', () => onInput(Number(s.value)))
  return s
}
export function makeCtx(root, title, desc, onComplete) {
  const timers = []
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timers.push(t)
    return t
  }
  const every = (fn: () => void, ms: number) => {
    const t = setInterval(fn, ms)
    timers.push(t)
    return t
  }
  const wrap = h('div', 'widget')
  const head = h('div', 'widget-head', '<h4>' + esc(title) + '</h4><p>' + esc(desc) + '</p>')
  const body = h('div', 'widget-body')
  const foot = h('div', 'widget-foot')
  const status = h('span', 'widget-status', '动手试一试：所有操作都只影响本页演示')
  let finished = false,
    interacted = false
  // 只有真正操作过演练组件才计入学情，避免打开课时即被判定完成
  const markInteract = () => {
    interacted = true
  }
  ;['pointerdown', 'change', 'input', 'keydown'].forEach((ev) =>
    wrap.addEventListener(ev, markInteract, true),
  )
  const finish = () => {
    if (finished || !interacted) return
    finished = true
    status.textContent = '✅ 演练完成，学情已记录'
    status.classList.add('ok')
    if (onComplete) onComplete()
  }
  const doneBtn = button(
    '标记为已演练',
    () => {
      interacted = true
      finish()
    },
    'ghost',
  )
  foot.append(status, doneBtn)
  wrap.append(head, body, foot)
  root.appendChild(wrap)
  return {
    body,
    status,
    finish,
    later,
    every,
    setStatus: (t) => {
      status.textContent = t
    },
    cleanup: () => {
      timers.forEach((t) => {
        clearTimeout(t)
        clearInterval(t)
      })
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap)
    },
  }
}
export function row(parent, label, control) {
  const r = h('div', 'w-row', '<span class="w-label">' + esc(label) + '</span>')
  r.appendChild(control)
  parent.appendChild(r)
  return r
}
export function group(parent, buttons) {
  const g = h('div', 'w-btnrow')
  buttons.forEach((b) => g.appendChild(b))
  parent.appendChild(g)
  return g
}
export function box(parent, cls, html) {
  const e = h('div', 'w-box ' + (cls || ''), html || '')
  parent.appendChild(e)
  return e
}
export function svg(parent, viewBox, content, cls) {
  const s = h('div', 'w-svg ' + (cls || ''))
  s.innerHTML = '<svg viewBox="' + viewBox + '" preserveAspectRatio="xMidYMid meet">' + content + '</svg>'
  parent.appendChild(s)
  return s
}
