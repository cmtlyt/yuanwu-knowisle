import { L } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L17 = L(
  'L17',
  2,
  'Reflexion：让 Agent 从失败里学',
  12,
  2,
  ['L12'],
  ['reflexion'],
  [
    '理解 Reflexion 的「失败反思 → 改进重试」闭环',
    '认识「语言化记忆」与「参数更新」的本质区别',
    '知道 Reflexion 适合反复试错的复杂任务',
  ],
  `
### 把失败经验写成文字，喂回给下一次

普通 ReAct 失败了就失败了。Reflexion 在失败后多做一步：让模型**反思失败原因**，把反思写进记忆，再重试时把反思一并喂给模型。它靠「语言化记忆」改进，而不是更新模型参数。

\`\`\` title="Reflexion 的三段循环" note="核心：反思（reflection）作为文字记忆，在下一轮作为上下文注入。"
// ① 尝试：跑一次 ReAct，得到轨迹 + 结果
const { trajectory, result } = await runReAct(task)

// ② 评估：用外部信号（测试 / 规则 / LLM 裁判）判断成败
const feedback = evaluate(result)   // 如 "结果缺少关键数据源"

// ③ 反思：让模型把「为什么失败」写成语义
const reflection = await reflect(trajectory, feedback)
//   → "我应该在查询前先确认数据源的时效性"

memory.push(reflection)  // ④ 存进持久化记忆

// ⑤ 重试：把反思注入下一轮上下文
await runReAct(task, { memory })
\`\`\`

:::deep

### 语言化记忆 vs 参数更新

传统机器学习靠更新参数改进模型；Reflexion 靠「把经验写成自然语言」改进**行为**。它的好处是不用训练、即时生效、可读可审；代价是反思质量取决于模型，且会占用上下文。

:::

### Reflexion 的三要素

- 评估信号：必须有办法判断成败（测试、规则、LLM 裁判），否则无从反思。
- 反思生成：把「失败原因」提炼成语义，而非复述错误。
- 记忆注入：反思要能在下一轮真正进入上下文，否则白反思。

:::warn

### 没有评估信号就没有 Reflexion

如果无法自动判断结果对不对，Reflexion 无从触发。这也是为什么模块六「评测」是 Reflexion 落地的前提。

:::

`,
  null,
  [
    {
      text: 'Reflexion 靠什么改进 Agent 行为？',
      options: [
        '更新模型参数',
        '把失败经验写成自然语言记忆，注入下一轮上下文',
        '换更大的模型',
        '增加工具数量',
      ],
      answer: 1,
      explain: 'Reflexion 用语言化记忆改进行为，不更新参数。',
      concept: 'reflexion',
    },
    {
      text: 'Reflexion 的三段循环是？',
      options: ['规划-执行-汇总', '尝试 → 评估 → 反思 → 存记忆 → 重试', '搜索-回溯-剪枝', '投票-汇总-输出'],
      answer: 1,
      explain: '尝试、评估、反思、存记忆、重试。',
      concept: 'reflexion',
    },
    {
      text: 'Reflexion 落地的前提条件是？',
      options: ['有 GPU', '有评估信号能判断成败', '用 Python', '有多个 Agent'],
      answer: 1,
      explain: '无法自动判断成败就无从反思，评估信号是前提。',
      concept: 'reflexion',
    },
  ],
  [
    ['reflection', '对「为什么失败」的语义化总结，作为记忆'],
    ['评估信号', '判断结果成败的外部依据（测试/规则/LLM 裁判）'],
    ['语言化记忆', '用自然语言保存经验、即时生效的改进方式'],
  ],
  [
    '把反思写成「复述错误」而非「提炼原因」，重试时帮助有限。',
    '没有评估信号就硬上 Reflexion，反思无处触发。',
  ],
)
