import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 7 ========== */

export const L51 = withKind(
  L(
    'L51',
    7,
    '结构化记忆：让 Agent「记得你说过的话」',
    2,
    ['L48'],
    ['structured-memory'],
    [
      '区分画像（profile）、偏好（preferences）、事实（facts）三类结构化记忆',
      '设计写入路径与冲突更新规则，避免画像被静默改写',
      '把结构化记忆渲染成短小、稳定的注入片段',
    ],
    `
### 第五次问同一个问题

一个写作助手每次会话开头都问：「你希望我用什么语气？」

用户在第一周就说过「简洁、不要敬语、不要加总结段」。这句话当时生效了，但下一个会话又归零。第三周用户开始在提问里自己重复这段要求——他把这个动作变成了习惯，说明他已经不相信系统会记住。

这类信息的特征是：**它是「关于用户的稳定事实」，不是「关于这次任务的内容」**。它适合结构化的存储方式，而不是「检索聊天记录」。

两者的差别很实际：如果第一条会话里用户说「用中文」，第二条说「报告用英文写」，检索式记忆会同时找出两条，让模型自己判断哪条有效；结构化记忆知道「语言偏好」是一个槽位，新值覆盖旧值，且能记录「报告场景」这个限定。

### 三类结构化记忆

| 类型 | 内容 | 例子 | 更新方式 |
|---|---|---|---|
| profile | 稳定属性 | 角色、团队、技术栈、时区 | 覆盖（单值槽位） |
| preferences | 偏好条目 | 语气、格式、避免项 | 覆盖 + 作用域 |
| facts | 业务实体事实 | 客户名、项目代号、环境地址 | 版本化（可能是多值） |

三者的更新语义不同，这点很关键：

- **profile 是单值**。用户不可能同时在两个团队。新值直接覆盖，但要保留旧值的历史（「上季度在 A 组」）。
- **preferences 带作用域**。「写代码时用英文注释、写文档用中文」是两条偏好，不是矛盾。作用域可以是场景、项目、语言。
- **facts 可能多值且要版本**。「测试环境地址」改过三次，你需要知道当前是哪个、什么时候改的。

把三者混成一张「记忆表」是常见错误——它们的冲突处理规则完全不同，混在一起就只能靠模型猜。

### 写入：三条路径，可信度不同

| 路径 | 触发 | 可信度 | 处理 |
|---|---|---|---|
| 显式 | 用户说「记住…」/ 在设置里填 | 最高 | 直接写 |
| 隐式确认 | 模型推断后询问「以后都这样？」 | 高 | 用户确认后写 |
| 隐式推断 | 模型从对话里总结 | 低 | 不直接写，进候选队列 |

第三条是事故来源。模型很擅长总结出「用户偏好 X」这类结论，但它的依据可能只是一次性的表达（「这次简短点」被总结成「用户偏好简短」）。

一个可用的折中是「候选队列 + 使用提示」：不把推断结果写进 profile，而是放进「待确认」池，在合适时机问一句「以后都按这个来吗」。用户点头才升级为正式偏好。

\`\`\`ts title="结构化记忆的写入与冲突处理" note="冲突处理的关键是「同槽位覆盖 + 保留历史」，而不是追加。"
export type Scope = { kind: 'global' } | { kind: 'project'; id: string } | { kind: 'task'; id: string }

export interface ProfileSlot {
  key: string
  value: string
  source: 'user' | 'confirmed' | 'inferred'
  at: number
}

export interface Preference {
  key: string
  value: string
  scope: Scope
  source: 'user' | 'confirmed' | 'inferred'
  at: number
}

export class Memory {
  private profile = new Map<string, ProfileSlot>()
  private prefs: Preference[] = []
  private history: { key: string; from: string; to: string; at: number }[] = []

  setProfile(key: string, value: string, source: ProfileSlot['source']) {
    const old = this.profile.get(key)
    // 低可信度不覆盖高可信度：推断不能改掉用户明说的
    if (old && rank(source) < rank(old.source)) return
    if (old && old.value === value) return
    if (old) this.history.push({ key, from: old.value, to: value, at: Date.now() })
    this.profile.set(key, { key, value, source, at: Date.now() })
  }

  setPref(key: string, value: string, scope: Scope, source: Preference['source']) {
    const same = this.prefs.find((p) => p.key === key && sameScope(p.scope, scope))
    if (same && rank(source) < rank(same.source)) return
    this.prefs = this.prefs.filter((p) => !(p.key === key && sameScope(p.scope, scope)))
    this.prefs.push({ key, value, scope, source, at: Date.now() })
  }

  /** 取当前生效的偏好：全局 + 当前 project，后者优先 */
  effective(projectId?: string): Preference[] {
    const globals = this.prefs.filter((p) => p.scope.kind === 'global')
    const local = projectId
      ? this.prefs.filter((p) => p.scope.kind === 'project' && p.scope.id === projectId)
      : []
    return [...globals, ...local]
  }
}

function rank(s: ProfileSlot['source']): number {
  return s === 'user' ? 3 : s === 'confirmed' ? 2 : 1
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.kind === b.kind && (a.kind === 'global' || (a as { id: string }).id === (b as { id: string }).id)
}
\`\`\`

\`rank\` 那条判断是整套逻辑里最重要的一行：**推断不能覆盖用户明说的**。没有它，模型某次总结失误就会永久改掉用户明确设置的偏好，而用户完全不知道发生了什么。

\`history\` 也不是可有可无的：用户说「我刚才设的时区不对」时，你需要知道它原来是什么，才能回滚或修正。

### 注入：短、稳、分层

结构化记忆的价值之一是「注入成本低」。一个 profile 渲染成几行文本就够：

\`\`\`ts title="渲染成注入片段" note="只注入与当前任务相关的部分——全局偏好常驻，项目级按需。"
export function renderMemory(m: Memory, projectId?: string): string {
  const lines: string[] = []
  const profile = [...m.profile.values()]
  if (profile.length) {
    lines.push('## 用户')
    for (const s of profile) lines.push(\`- \${s.key}：\${s.value}\`)
  }
  const prefs = m.effective(projectId)
  if (prefs.length) {
    lines.push('## 偏好')
    for (const p of prefs) {
      const tag = p.scope.kind === 'global' ? '' : \`（\${p.scope.kind}：\${(p.scope as { id: string }).id}）\`
      lines.push(\`- \${p.key}：\${p.value}\${tag}\`)
    }
  }
  return lines.join('\\n')
}
\`\`\`

输出大概是这样的一段：

\`\`\`text
## 用户
- 角色：后端工程师
- 技术栈：TypeScript / Node
## 偏好
- 语言：中文
- 语气：简洁，不要敬语
- 注释语言：英文（project：order-service）
\`\`\`

这段文本只有几十个 token，可以每轮常驻。这比「检索历史对话」便宜得多，也稳定得多——同样的输入永远得到同样的注入内容。

### 三类失效与防御

| 失效 | 表现 | 防御 |
|---|---|---|
| 过时 | 用户在 A 组，系统仍按 A 组回答 | 给 profile 加 \`at\`，超过 N 个月标记待确认 |
| 矛盾 | 同时注入「用中文」「用英文」 | 作用域 + 单值槽位覆盖 |
| 越权 | 画像里存了不该存的（身份证明细） | 字段白名单，敏感项不落画像 |

第三条是合规问题而非技术问题，但技术上的防线很简单：**画像只存「有助于服务的属性」，不存身份凭证类信息**。技术上做到「字段白名单 + 类型约束」，比事后清理容易得多。

:::deep

### 为什么画像比「检索聊天记录」更可靠

假设你有两条路获取「用户偏好」：一是结构化画像，二是从历史对话里向量检索「用户说过偏好的段落」。

结构化的优势在三点：

**可控**：用户可以打开设置看到「系统记住了什么」，并逐条删除。检索式记忆没有「清单」这个概念，用户无法审阅。

**可解释**：当回答不符合偏好时，你能定位到「哪条偏好没生效」，而不是「检索没找到」。

**可计算**：冲突可以按规则解决（作用域、时间、可信度）。检索式只能把两条都塞进上下文，让模型现场决定。

代价是**覆盖窄**：画像只装「事先设计好的槽位」，遇到没设计过的信息就丢。所以实践中两者常并存——画像管稳定属性，向量记忆管「用户提过的事」。

一个务实的判断：**如果一条信息会影响未来 10 次以上的交互，它就该进画像；只影响这几次的，进情节记忆。**

:::

:::warn

### 不要让模型静默改写画像

最常见的实现错误是：每轮对话后让模型「更新用户画像」，然后直接覆盖存储。

这条路会在几周内毁掉画像质量：模型的总结有偏差、会把一次性表达当稳定偏好、会在用户没提的情况下「推断」出新属性。而用户完全不知道自己的画像被改了。

三条纪律：

1. **推断只能进候选池**，且必须显示给用户确认。
2. **用户明说的值不可被推断覆盖**（\`rank\` 那行代码）。
3. **画像变更有 diff 日志**，用户能看到「什么时候、由什么触发的修改」。

第三条在客诉时特别有用：用户说「我没说过我喜欢简短回答」，你能立刻查到这条是什么时候、从哪句话推断出来的。

:::

### 收束：结构化是对「记忆」的约束

结构化记忆的本质是**用约束换可靠性**：限定字段、限定更新规则、限定注入方式，代价是覆盖不了没预想到的信息。

这个取舍在「用户画像」这类场景上是划算的——因为这类信息数量少、变化慢、影响大，值得为它设计结构。而在「用户提过的各种事情」上就不划算，那里该用检索（L48 的语义记忆）。

L52 处理另一个方向的压力：对话越长，上下文越重。压缩不是记忆，但它是让长对话能继续下去的必要手段。

`,
    null,
    [
      {
        text: 'profile、preferences、facts 三者的核心差别是？',
        options: ['存储位置', '更新语义：单值覆盖 / 带作用域覆盖 / 多值版本化', '数据大小', '读取频率'],
        answer: 1,
        explain: '混成一张表就只能靠模型猜冲突规则。',
        concept: 'structured-memory',
      },
      {
        text: '「推断不能覆盖用户明说的值」对应代码里哪一处？',
        options: ['history 记录', 'rank(source) 比较', 'effective() 合并', 'renderMemory'],
        answer: 1,
        explain: '可信度分级，低不能覆盖高。',
        concept: 'structured-memory',
      },
      {
        text: '隐式推断的记忆应该怎么处理？',
        options: ['直接写入 profile', '进候选池，合适时机请用户确认后再升级', '永远丢弃', '只写日志'],
        answer: 1,
        explain: '一次性表达被总结成稳定偏好，是画像劣化的主因。',
        concept: 'structured-memory',
      },
      {
        text: '结构化画像相对「检索聊天记录」的主要优势不包括？',
        options: ['可审阅', '可解释', '冲突可按规则解决', '覆盖面更广'],
        answer: 3,
        explain: '画像是窄覆盖：只装设计好的槽位。',
        concept: 'structured-memory',
      },
      {
        text: '判断一条信息该进画像还是情节记忆的标准是？',
        options: ['长度', '是否会影响未来 10 次以上交互', '是否含数字', '是否用户说的'],
        answer: 1,
        explain: '稳定且长期影响大的进画像，一次性的进情节。',
        concept: 'structured-memory',
      },
    ],
    [
      ['profile', '稳定属性槽位，单值覆盖并保留历史'],
      ['作用域', '偏好生效的范围：全局 / 项目 / 任务'],
      ['候选池', '推断出的记忆先待确认，不直接生效'],
      ['画像 diff', '记录画像变更的来源与时间，便于追溯'],
    ],
    [
      '每轮让模型静默改写画像，几周后画像全是推断噪声。',
      '把「这次简短点」总结成「用户偏好简短」并永久生效。',
      '画像存储敏感凭证类信息，带来合规风险。',
    ],
  ),
  'theory',
)
