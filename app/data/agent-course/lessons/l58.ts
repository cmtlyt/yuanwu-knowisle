import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L58 = withKind(
  L(
    'L58',
    8,
    'Scratchpad：让 Agent「写下来」再思考',
    2,
    ['L54'],
    ['scratchpad'],
    [
      '区分 CoT、Scratchpad、外部工作区三种「写下来」的形态',
      '设计一块可丢弃、可重置的草稿区，并把它接进运行时',
      '避免草稿污染：错误中间值被后续步骤当成事实',
    ],
    `
### 一块草稿纸的价值

一个做数据核对的任务里，模型需要连续比较十几个数字。直接让它输出答案，错误率很高；加了 CoT 之后好一些，但又出现新问题：**推理过程污染了输出格式**——它本该返回一个 JSON 数组，实际返回的是「先看第一个数……我的结论是 [...]」这种混合文本。

Scratchpad 的思路很朴素：**给模型一块独立的书写空间，在那里算，算完了再在输出区给结论。**

它和 CoT 的差别不在「写不写」，而在「写在哪个区域」：

- CoT 写在输出里，与最终答案混同一个通道。
- Scratchpad 写在隔离区（独立的字段、独立的标签，或者干脆是上一轮的观测），可以随时清空，不进入对外的格式。

这个隔离带来两个直接好处：**格式契约不被推理内容破坏**，以及**草稿可以丢弃**（压缩上下文时整块删掉，不需要精心摘要）。

### 三种「写下来」

| 形态 | 位置 | 生命周期 | 适用 |
|---|---|---|---|
| CoT | 输出通道内 | 随输出留存 | 一次性推理，输出格式宽松 |
| Scratchpad | 隔离区（字段/标签） | 可清空、可重置 | 多步计算、需要严格输出格式 |
| 外部工作区 | 文件 / 记忆 | 跨轮次、跨会话 | 大量中间结果、需要人审 |

三者的选择依据是「中间结果的量与寿命」：小且短命用 CoT，中等用 Scratchpad，大且要跨轮用外部工作区（L48 的情节记忆）。

Scratchpad 处在一个甜区：它比 CoT 多一层结构，比外部工作区少一套存储。**大多数「多步但不需要跨会话」的任务都落在这一档。**

### 结构：分槽位，而不是堆文本

一个能用的 Scratchpad 不是「一段越来越长的文本」，而是**几个有明确用途的槽位**：

\`\`\`ts title="Scratchpad 的三个槽位" note="槽位分离的作用是「知道该清什么」——计算的中间值可以清，收集到的事实不能随便清。"
export interface Scratchpad {
  /** 计算草稿：中间值，可随时清空重算 */
  calc: string[]
  /** 事实清单：带来源的已确认信息，清空要谨慎 */
  facts: { text: string; source: string; verified: boolean }[]
  /** 计划与进度：待办与已完成 */
  plan: { step: string; done: boolean }[]
}

export function emptyPad(): Scratchpad {
  return { calc: [], facts: [], plan: [] }
}

export function appendCalc(pad: Scratchpad, line: string): Scratchpad {
  // 只保留最近 20 行：草稿是「工作区」不是「档案」
  const calc = [...pad.calc, line].slice(-20)
  return { ...pad, calc }
}

export function addFact(pad: Scratchpad, text: string, source: string, verified: boolean): Scratchpad {
  return { ...pad, facts: [...pad.facts, { text, source, verified }] }
}

/** 渲染进上下文：未验证的事实显式标注，防止被当成定论 */
export function renderPad(pad: Scratchpad): string {
  const lines = ['<scratchpad>']
  if (pad.plan.length) {
    lines.push('## 进度')
    for (const s of pad.plan) lines.push(\`- [\${s.done ? 'x' : ' '}] \${s.step}\`)
  }
  if (pad.facts.length) {
    lines.push('## 事实')
    for (const f of pad.facts) lines.push(\`- \${f.text}（来源：\${f.source}\${f.verified ? '' : '，未验证'}）\`)
  }
  if (pad.calc.length) {
    lines.push('## 计算草稿')
    lines.push(...pad.calc.map((l) => '- ' + l))
  }
  lines.push('</scratchpad>')
  return lines.join('\\n')
}
\`\`\`

三个槽位的设计对应三种不同的「清理策略」：

- \`calc\` 可以随时清（重算一遍就行），保留最近 20 行足够。
- \`facts\` 不能随便清（重新查一次要花调用），但可以压缩成一行一条。
- \`plan\` 是控制流的一部分，清掉等于丢失进度。

显式区分它们的好处是：上下文紧张时你知道「先清 calc，再压 facts，绝对保留 plan」。如果混成一段文本，你只能整段删或整段留。

### 接进运行时：草稿是「第三种消息」

Scratchpad 在执行器里的位置很具体：它是一段**每轮重新渲染、始终位于上下文后部**的内容，而不是一条累积的历史消息。

\`\`\`ts title="每轮注入：先渲染草稿，再让模型决策" note="草稿每轮重渲染而不是追加，天然避免了「草稿越来越长」。"
export async function stepWithPad(
  msgs: Msg[],
  pad: Scratchpad,
  decide: (m: Msg[]) => Promise<{ text: string; patch?: Partial<Scratchpad> }>,
): Promise<{ msgs: Msg[]; pad: Scratchpad }> {
  const withPad: Msg[] = [
    ...msgs,
    { role: 'user', text: '当前工作区（仅供参考，不进入最终输出）：\\n' + renderPad(pad) },
  ]

  const out = await decide(withPad)
  // 模型返回的是「补丁」而不是完整草稿：减少输出 token，也避免它重写已确认的事实
  const nextPad: Scratchpad = {
    calc: out.patch?.calc ?? pad.calc,
    facts: out.patch?.facts ?? pad.facts,
    plan: out.patch?.plan ?? pad.plan,
  }
  return { msgs: [...msgs, { role: 'assistant', text: out.text }], pad: nextPad }
}
\`\`\`

「模型返回补丁而不是整块草稿」这个决定很关键。让它重写草稿有两个问题：输出 token 翻倍；以及它可能在重写时**悄悄改掉已确认的事实**——这比不改更糟。

补丁的语义是「追加几行计算」「新增一条事实」「勾掉一个待办」，范围有限，也便于校验（比如拒绝「删除已验证事实」的补丁）。

### 草稿污染：最需要防的失效

Scratchpad 最大的风险是「错误的中间值被当成事实」。两个具体场景：

**场景一：算错了一个数。** 第 3 步把 12.5 × 8 算成 90（实际是 100），后面所有基于它的推导都错，而草稿里它和正确的数长得一模一样。

**场景二：猜了一个值。** 「假设 API 返回 200」写进草稿，后面就按 200 继续，而真实的返回可能是 500。

三条防御：

1. **事实必须带来源**。来自工具的结果 \`source: 'tool:...'\`，模型推断的 \`source: 'assumed'\`。渲染时标注，模型自己也会更谨慎。
2. **计算类中间值标注「未校验」**。如果任务里存在可校验的手段（用代码算、用工具查），在关键节点做一次校验并更新 \`verified\`。
3. **关键结论不写进草稿区**。最终答案走输出通道，草稿只承载过程——这样即使草稿有错，也不会被当成「已经交付的结论」。

第 3 条是结构性的：**草稿的定位是「可丢弃的」，一旦某条信息被写进输出或持久层，它就不再是草稿。**

:::deep

### 为什么「隔离」能提升质量而不只是整洁

一个自然的疑问：既然模型都要读，写在草稿区与写在输出里有什么区别？

区别在**约束的目标不同**：

- 输出通道有格式契约（JSON、固定字段、字数限制）。把推理混进去，模型要在「遵守格式」和「充分推理」之间取舍，通常两边都做不好。
- 草稿区没有格式约束，模型可以自由书写、试错、甚至自我否定。它不必担心「这段话会不会破坏 JSON」。

这就是为什么 Scratchpad 在「既要严格格式、又需要多步推理」的任务上收益最大——比如结构化抽取（要 JSON）、带校验的计算（要准确数字）、多约束规划（要满足一堆条件）。

另一个收益是**可丢弃性**。CoT 一旦写进输出，就永远留在上下文里（L32 说的 Thought 污染）。而草稿可以整块重置：走到死路时，清空 \`calc\` 重新算，不带历史包袱。这在调试时尤其有用——你能看到「重算之后结果是否一致」，一致说明结论稳，不一致说明原路径有问题。

:::

:::warn

### 草稿区也会膨胀

一个不易察觉的问题：草稿区每轮都渲染进上下文，如果它自己无限增长，就变成了「第二个上下文」。

三个具体限制：

- **calc 只留最近 20 行**（上面的 \`appendCalc\` 已经实现）。更早的计算如果还需要，说明该把结论提炼进 \`facts\`。
- **facts 每条不超过一行**。长结论要压缩成「结论 + 来源」，细节留在原文里（按需检索）。
- **plan 只保留未完成与最近完成的**。已完成的老步骤移出，或折叠成「已完成 12 步」。

这三条合起来，草稿区通常能控制在 500–1500 token，占上下文的 5% 以内——这个量级既能提供工作记忆，又不会成为负担。

如果发现草稿长期超过 3000 token，通常不是「任务太复杂」，而是「没做提炼」：该进 facts 的还在 calc 里堆着，该丢弃的还在 plan 里挂着。

:::

### 收束：草稿是「可丢弃的工作记忆」

把三种「写下来」放在一条轴上：CoT 是「写给输出看的」，Scratchpad 是「写给自己算的」，外部工作区是「写给以后看的」。三者的差别不是形式，而是**寿命与约束**。

选型的判断很简单：**如果你希望这段内容在任务结束后消失，它就该在草稿区。**

Stage 9 进入规划：当一个任务需要「先想清楚整体步骤再动手」时，草稿区不够用——你需要一个显式的计划对象，以及「计划过期后怎么重规划」的机制。

`,
    null,
    [
      {
        text: 'Scratchpad 与 CoT 的核心差别是？',
        options: ['更短', '写在隔离区而非输出通道，可清空且不破坏输出格式', '需要工具', '只能用一次'],
        answer: 1,
        explain: '隔离带来「格式契约不被污染」与「可丢弃」。',
        concept: 'scratchpad',
      },
      {
        text: 'Scratchpad 分三个槽位的主要目的是？',
        options: ['好看', '知道该清什么：calc 可清、facts 谨慎、plan 必留', '减少 token', '便于日志'],
        answer: 1,
        explain: '混成一段文本时只能整段删或整段留。',
        concept: 'scratchpad',
      },
      {
        text: '让模型返回「补丁」而不是整块草稿的好处是？',
        options: ['省内存', '减少输出 token，并避免它重写时悄悄改掉已确认事实', '提高准确率', '便于并发'],
        answer: 1,
        explain: '补丁范围有限，也便于校验。',
        concept: 'scratchpad',
      },
      {
        text: '草稿污染最典型的场景是？',
        options: ['草稿太长', '算错或假设的中间值后续被当成事实继续推导', '格式错误', '多轮丢消息'],
        answer: 1,
        explain: '事实带来源、关键值做校验、结论走输出通道。',
        concept: 'scratchpad',
      },
      {
        text: '什么任务最受益于 Scratchpad？',
        options: ['闲聊', '既要严格输出格式又要多步推理的任务', '单步分类', '纯检索'],
        answer: 1,
        explain: '格式约束与推理内容解耦，两边都做得好。',
        concept: 'scratchpad',
      },
    ],
    [
      ['Scratchpad', '隔离的草稿区，承载中间计算与待办，可清空'],
      ['草稿污染', '错误的中间值被后续步骤当作事实引用'],
      ['补丁式更新', '模型只返回草稿的增量修改，减少重写风险'],
      ['可丢弃性', '草稿在任务结束后整体移除，不进入持久层'],
    ],
    [
      '把推理混进输出通道，破坏 JSON 等格式契约。',
      '草稿无上限增长，变成第二个上下文。',
      '假设值写进草稿后不带标记，被后续步骤当成已确认事实。',
    ],
  ),
  'theory',
)
