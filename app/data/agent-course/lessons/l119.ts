import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L119 = withKind(
  L(
    'L119',
    23,
    'GUI / 具身 Agent：让 Agent 会点界面（可选短单元）',
    2,
    ['L31'],
    ['gui-agent'],
    [
      '实现「快照 → 决策 → 动作 → 再观察 → 状态断言」的 Web 界面 Agent 闭环',
      '写出可运行的动作后校验器与三类界面陷阱守卫（异步/弹窗/位置漂移）',
      '能说明为什么点击只是发出意图，不等于状态已改变',
    ],
    `
### 确认框上连点两次，删了两条记录

一个负责后台清理的 Agent 接到「删掉那条重复订单」。它找到了目标行、点了删除、弹出确认框、点了确认——然后**又点了一次确认**。因为第一次点击后它没有重新取界面状态，而是把「我刚才点了确认，所以应该已经删完了」当成事实推进下一步；偏偏页面有个 300ms 的关闭动画，弹窗消失前第二次点击落到了列表里下一行的删除按钮上，接着又把新弹窗确认了。两条记录没了，其中一条是正常订单。

日志里每一步都「执行成功」：两次 \`click\` 都返回 200，没有异常、没有超时。问题在于**这个循环里根本没有观察环节**，只有一串动作。GUI Agent 不可退让的约束因此是：**动作之后必须重新观察，并断言状态真的按预期改变了**。这一课只讲 Web 界面——不谈机器人、不谈视觉模型训练、不谈硬件控制；把「短单元」的短落在范围收敛上，不落在体量上。

### 三类界面状态陷阱

| 陷阱 | 具体表现 | 为什么「点成功」不等于「做成了」 | 守卫 |
|---|---|---|---|
| 异步 / 乐观更新 | 列表先变灰、请求还在飞；或前端先加一行、后端随后失败回滚 | DOM 已变但服务端状态未定，甚至会变回去 | 等待连续两次快照一致 + 查业务态标识 |
| 弹窗与焦点 | 确认框覆盖在原页面上，坐标点击落到被遮住的元素 | 同一个 \`ref\` 在不同状态下语义不同 | 快照里显式带模态层，动作前校验目标可交互 |
| 位置漂移 | 排序/筛选/动画让第 3 行不再是原来的那条记录 | 坐标或序号在两次观察之间失效 | 用稳定 \`ref\` 与业务主键重解析，绝不缓存坐标 |

这三类的共同点是：**界面是一个异步分布式系统**。点击只是向它发出了一个意图，最终状态由网络、后端、渲染三者共同决定。把「意图已发出」当「状态已达成」，是所有 GUI Agent 事故的第一根因。

### 用可访问性树当状态，而不是截图

最小可用的做法是不接视觉模型：把页面的可访问性树（a11y tree）导成结构化快照，每个可交互元素带 \`role\`、可读名称、稳定 \`ref\`、当前状态。模型读的是这段文本，输出的也是结构化动作 \`{ ref, action, args }\`，而不是像素坐标。这既是成本选择，也是可靠性选择——坐标在任何动画下都会漂，\`ref\` 不会。

\`\`\`ts title="结构化界面快照" note="要点：每个元素带稳定 ref 与业务主键；快照自带版本与时间戳，动作前后两份可比对。"
type UiNode = {
  ref: string             // 稳定引用，如 btn:del:ord-8842
  role: 'button' | 'link' | 'textbox' | 'dialog' | 'row' | 'text'
  name: string            // 可读名称，来自 aria-label 或可见文本
  state: { disabled?: boolean; checked?: boolean; busy?: boolean }
  entityId?: string       // 业务主键，防止「第 3 行」这类位置描述
  modal?: boolean         // 是否处于模态层内
}

type Snapshot = {
  seq: number
  takenAt: number
  url: string
  dialogs: UiNode[]
  nodes: UiNode[]
}

async function observe(page: Page, seq: number): Promise<Snapshot> {
  const raw = await page.accessibility.snapshot() // 由运行时提供，非视觉模型
  const nodes: UiNode[] = raw.map((n) => ({
    ref: n.ref, role: n.role, name: n.name,
    state: { disabled: n.disabled, checked: n.checked, busy: n.busy },
    entityId: n.dataset?.entityId,
    modal: Boolean(n.closestDialog),
  }))
  return {
    seq, takenAt: Date.now(), url: page.url(),
    dialogs: nodes.filter((n) => n.role === 'dialog'), nodes,
  }
}

function findByEntity(s: Snapshot, entityId: string, role: UiNode['role']): UiNode {
  const hit = s.nodes.find((n) => n.entityId === entityId && n.role === role)
  if (!hit) throw new Error('entity not visible: ' + entityId)
  if (hit.state.disabled) throw new Error('element disabled: ' + hit.ref)
  return hit
}
\`\`\`

\`entityId\` 是这里最关键的一列。有了它，模型说的是「删除 \`ord-8842\` 这一行」，而不是「点第三个删除按钮」；下一帧即使列表重排，我们仍能按主键重新找到目标。删掉这一列，位置漂移就防不住。

:::deep
### 为什么循环里必须有两个 observation

L36 的通用循环是「观察 → 决策 → 动作」，很多实现把观察放在循环开头，于是动作执行完就直接回到决策，形成「观察₁ → 动作₁ → 动作₂ → …」的隐式链条。GUI 场景必须把它改成「观察₁ → 决策₁ → 动作₁ → **观察₂ → 断言** → 决策₂」：观察₂ 不是可省的优化，是唯一能证明动作₁ 生效的证据。

这也解释了 L61 的重规划为什么在这里格外重要：当断言发现「弹窗还在」「行没消失」「出现了错误提示」，下一步不是重试同一个动作，而是**基于观察₂ 重新规划**。上面那起删两条的事故，如果循环里存在观察₂，第二次点击前就会看到「\`ord-8842\` 已不在列表里」，直接终止任务。
:::

### 动作后状态断言：把「成功」定义成可判定的变化

\`\`\`ts title="观察—动作—再观察闭环与状态断言" note="要点：每个动作声明 expected / forbidden / timeout；断言不过立即停，绝不盲目重试。"
type Action = {
  ref: string
  kind: 'click' | 'fill' | 'select'
  args?: Record<string, string>
  expect: (before: Snapshot, after: Snapshot) => boolean
  forbidden?: (after: Snapshot) => boolean
  danger?: boolean          // 危险动作要二次确认
  timeoutMs?: number
}

async function step(page: Page, before: Snapshot, action: Action): Promise<Snapshot> {
  if (action.danger && before.dialogs.length === 0) {
    throw new Error('dangerous action without explicit dialog: ' + action.ref)
  }
  await page.perform(action.ref, action.kind, action.args ?? {})
  const after = await waitStable(page, before.seq + 1, action.timeoutMs ?? 3000)
  if (!action.expect(before, after)) {
    throw new Error('post-condition failed for ' + action.ref + ' -> 停止，不重试')
  }
  if (action.forbidden?.(after)) {
    throw new Error('forbidden state reached: ' + JSON.stringify(after.dialogs))
  }
  return after
}

const deleteRow = (entityId: string): Action => ({
  ref: 'btn:del:' + entityId, kind: 'click', danger: true,
  expect: (before, after) =>
    before.nodes.some((n) => n.entityId === entityId) &&
    !after.nodes.some((n) => n.entityId === entityId),
  forbidden: (after) => after.nodes.some((n) => n.name.includes('失败')),
  timeoutMs: 4000,
})
\`\`\`

\`expect\` 必须写成**状态差**，不能写成「没有抛异常」。\`deleteRow\` 的判据是「动作前这一行存在、动作后不存在」——那个 300ms 动画里若行还在，\`waitStable\` 会继续等；若等完仍在，断言失败并停机。停机比重试安全：重试意味着再点一次，而这正是事故的动作。

### 等待稳定：三类陷阱的守卫实现

\`\`\`ts title="waitStable 与模态守卫" note="要点：连续两次快照一致才算渲染完成；模态层存在时只允许点模态内元素。"
function sameView(a: Snapshot, b: Snapshot): boolean {
  const key = (s: Snapshot) => s.url + '|' + s.dialogs.map((d) => d.name).join(',') + '|'
    + s.nodes.map((n) => n.ref + ':' + n.entityId + ':' + JSON.stringify(n.state)).join(',')
  return key(a) === key(b)
}

async function waitStable(page: Page, seq: number, timeoutMs: number): Promise<Snapshot> {
  const deadline = Date.now() + timeoutMs
  let prev = await observe(page, seq)
  while (Date.now() < deadline) {
    await page.waitFor(120)                       // 让动画/请求落地
    const curr = await observe(page, seq + 1)
    const pending = curr.nodes.some((n) => n.state.busy)
    if (!pending && sameView(prev, curr)) return curr
    prev = curr
  }
  throw new Error('UI did not stabilize within ' + timeoutMs + 'ms')
}

function assertTargetReachable(s: Snapshot, action: Action): void {
  const target = s.nodes.find((n) => n.ref === action.ref)
  if (!target) throw new Error('ref stale, re-resolve by entityId')
  if (s.dialogs.length > 0 && !target.modal) {
    throw new Error('modal blocks background element: ' + action.ref)
  }
}
\`\`\`

\`sameView\` 把「稳定」定义成连续两次快照一致，而不是「等固定 300ms」：动画时长会随机器负载变化，固定 sleep 在慢机器上必然偶发失败。\`assertTargetReachable\` 则直接封死第二起事故的路径——模态层存在时，背景元素不允许被点击。

:::warn
### 两个必踩的坑

- **把截图直接喂给模型当状态**。截图里既有目标也有无关内容，模型会按像素位置猜；一旦列表滚动或动画未结束，同一个坐标指向另一条记录。结构化快照 + 稳定 \`ref\` 才是可断言的状态。
- **断言失败就重试同一动作**。GUI 里很多动作不幂等（删除、提交、支付），重试等于再执行一次。失败后必须回到观察₂ 重新规划，并给整轮任务设动作预算上限（例如 12 步），触顶即转人工。
:::

### 什么时候这套做法会失效：CV 与人工交接的边界

结构化快照有个硬前提：界面得有可访问性标注、有稳定的业务主键。三种情况会击穿它——Canvas 绘制的图表、没有 \`aria-label\` 的自绘控件、需要从截图里读数字或验证码的场景。这时才需要上视觉模型，但边界要划清楚：**视觉模型只负责把画面翻译成结构化节点，不负责决策，也不负责判定动作是否成功**。把它接进 \`observe()\` 后面当一层适配器，输出仍然是 \`UiNode[]\`，下游闭环一行都不用改。反过来说，如果为了让视觉模型「直接看图点坐标」而把 \`ref\` / \`entityId\` 拿掉，前面所有状态断言就全废了——这是本课最想防住的架构滑坡。

第二道边界是人工交接。动作预算（上面是 12 步）、连续两次断言失败、出现未知弹窗、遇到危险动作却没有确认层，四种情况任意一种都该停机转人，而不是「再试一轮」。判据要写成代码里的硬条件，不能留给模型自己判断——模型对「我快成功了」的估计没有校准，尤其在已经点了五步之后。**GUI Agent 的价值是替人跑掉那些确定性的重复步骤，不是替人承担不可逆操作的后果。**

顺带说清本课的范围：机器人与具身控制还多出一层「动作执行后物理世界不会立刻反馈」的问题，涉及传感器融合与实时控制栈，不是 TS Web 主线能覆盖的。这里讲的观察—动作—断言闭环是它的必要子集，但不是充分条件。

### 验收：用假界面把闭环跑通

\`\`\`ts title="闭环验收断言" note="要点：断言观察次数、危险动作二次确认、失败不重试、动作预算四项。"
async function runGuiTask(page: Page, goal: string) {
  const trace: { seq: number; kind: string }[] = []
  let before = await observe(page, 0)
  let budget = 12

  while (budget-- > 0) {
    const action = await model.decideAction(goal, before, trace)
    if (action.kind === 'done') return trace
    assertTargetReachable(before, action)
    const after = await step(page, before, action)   // 内部强制观察₂ + 断言
    trace.push({ seq: before.seq, kind: 'action:' + action.ref })
    trace.push({ seq: after.seq, kind: 'observe' })
    before = after
  }
  throw new Error('action budget exhausted -> 转人工')
}

// 断言：每个动作后必有一条 observe；危险动作前必有 dialog；失败后 trace 不再增长
assert.ok(trace.filter((t) => t.kind === 'observe').length >= trace.filter((t) => t.kind.startsWith('action')).length)
\`\`\`

这套断言可以用一个假界面驱动（返回预设快照序列），完全不需要真浏览器，因而能进 CI。它和 L74 的回放调试天然契合：每帧快照本身就是回放材料，事故复盘时可以逐帧看「观察₂ 里到底有没有那一行」，而不是靠猜。

### 与相邻课的分工

- **L31**：感知与状态表示的一般原则，本课把它具体化成可访问性树快照。
- **L36 / L61**：通用循环与动态重规划；本课的特殊处是**每步强制两次观察**与「断言失败不重试」。
- **L42**：工具调用机制，本课的 \`perform\` 是它的一种实现，但增加了状态差断言。
- **L85**：最小权限，GUI 场景要落到「危险动作二次确认 + 只读账号 + 动作预算」。
- **L74**：回放调试，快照序列即回放素材。

**一句话收束**：GUI Agent 的循环不是「想好一串动作然后执行」，是**每次只做一个动作，然后重新看一眼**。
`,
    null,
    [
      {
        text: 'Agent 在确认框上连点两次删了两条记录，根因是？',
        options: [
          'click 接口报错',
          '动作后没有重新观察，把「意图已发出」当成「状态已达成」',
          '视觉模型识别错了按钮',
          '网络延迟过高',
        ],
        answer: 1,
        explain: '日志里两步都成功，缺的是观察₂ 与状态差断言。',
        concept: 'gui-agent',
      },
      {
        text: '防止列表重排导致点错行，最有效的做法是？',
        options: ['点击前多等 300ms', '用截图坐标', '稳定 ref 加业务主键 entityId 重解析', '提高模型温度'],
        answer: 2,
        explain: '坐标会漂，业务主键不会；位置描述本身就不该进模型输出。',
        concept: 'gui-agent',
      },
      {
        text: '动作后状态断言失败，正确处理是？',
        options: [
          '立即重试同一动作',
          '基于观察₂ 重新规划，且危险动作不重试',
          '忽略断言继续下一步',
          '换更大的模型',
        ],
        answer: 1,
        explain: 'GUI 里删除/提交/支付不幂等，重试等于再执行一次。',
        concept: 'gui-agent',
      },
    ],
    [
      ['可访问性树快照', '结构化界面状态：role / name / 稳定 ref / entityId / state'],
      ['状态差断言', '用「动作前存在、动作后不存在」这类可判定变化定义成功'],
      ['waitStable', '连续两次快照一致且无 busy 才认为渲染完成，替代固定 sleep'],
    ],
    [
      '把截图直接喂给模型当状态，坐标在动画和滚动下必然漂移。',
      '断言失败就重试同一动作，会把删除/提交执行两次。',
    ],
  ),
  'scenario',
)
