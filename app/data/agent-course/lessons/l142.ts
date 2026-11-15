import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L142 = withKind(
  L(
    'L142',
    27,
    '课程总览与进阶路线：你已掌握的知识地图',
    4,
    ['L134', 'L141'],
    ['course-review'],
    [
      '实现 assertKnowledgeMap()，校验 142 课的概念前置、模块归属、课型护栏与引用完整性',
      '写出双 Capstone 分叉的结构断言，证明 A/B 两支互不串线且收束课同时连住两支',
      '把进阶路线写成可解析、可验收的 RoadmapItem[] 并实现 assertRoadmap()',
      '用六条含负例的验收断言完成整门课收束，而不是给一张手绘地图',
    ],
    `
### 一次改版，把学习路径生成器跑死了

课程改版时给 L142 补了前置 \`L134\`，同时把「进阶路线」文档里的推荐顺序手改了一遍。上线后学习路径页白屏：生成器按 \`prereqs\` 做拓扑排序，而文档里那张手绘图里有一条「学完 L94 再回来看 L42」的回边，被照抄进了数据，形成了环。排障最难受的地方是**每一课的内容都没问题**——正文、代码、测验全绿，坏的只是课与课之间的「顺序」。另一处更隐蔽：有一节课从 \`practice\` 改标 \`overview\` 但漏写 \`kindReason\`，页面照常渲染，直到体量闸门按整门课校验才拦下。

这两件事指向同一个缺口：**知识地图一直是给人看的散文，不是能被机器验证的数据**。手绘图、文档里的推荐顺序、课程数据里的 \`prereqs\` 是三份各自维护的真相，改一处忘两处是必然。L05 讲事件同源、L54 把 \`minutes\` 从字段里删掉改由正文现算、L141 用锚点差集抓编号漂移，说的都是同一条原则——**不要让第二份真相存在**。本课就把这条原则用在整门课上：不画新图，直接用课程数据本身当输入，写一组可失败的断言，再把「学完之后往哪走」也变成可解析、可验收的清单。

顺带说明本课为什么不标 \`overview\`：体量闸门明确禁止 Capstone 阶段的课标导览课，理由写得很直白——「复盘课也要有真实实现与验收断言」。标题叫「总览」不等于交付物是地图；本课交付的是一个能跑的自检器，身份就是 \`capstone\`。这条规则本身也会被本课的自检器复刻一遍，形成「课程内自检」与 CI 门禁的同口径闭环。

### 本课唯一要回答的问题

**怎么证明这 142 课的结构自洽，并把「学完之后往哪走」写成能被解析、能被验收的清单。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 逐课复述内容与知识点 | L01–L141 各课自己 | 复述会让「总览」变成 141 行流水账，且必然与正文漂移 |
| 报告锚点、渲染回喂闸门、交付自检 | L141 | B 分支的具体组件，本课不复用也不重写 |
| 装配顺序、灰度闸门、回滚演练 | L134 | A 分支的具体组件，只在分叉对照表里出现一次 |
| 六个框架的 API 与迁移步骤 | L96–L115 | 本课只校验它们的归属，不介绍用法 |
| 新的 Agent 实现技术 | 全课之前的所有课 | 收束课的职责是验证结构，不是再开一条技术线 |

### 第一件事：地图不另建一份，就用课程数据本身

\`CourseData\` 已经把地图需要的东西装齐了：\`MODULES\` 是顶层分组、\`STAGES\` 带 \`module\` 归属、\`LESSONS\` 带 \`stage / prereqs / concepts / kind / kindReason\`、\`CONCEPTS\` 带 \`prereqs\` 与 \`weight\`。所谓「知识地图」就是这四张表之间的边，再画一张 PNG 反而多一份要同步的数据。

当前快照（全部从数据现算，正文里写死的数字只是本次记录，断言不依赖它们）：**142 课 / 143 概念 / 28 阶段 / 11 模块**；课型分布为 61 节 \`theory\`、30 节 \`practice\`、22 节 \`framework\`、10 节 \`scenario\`、15 节 \`capstone\`、4 节 \`overview\`。四节导览课分别在模块 0、1、5、6，都写了 \`kindReason\`，占总量约 2.8%，没有落在 Capstone 阶段。

| 模块 | 阶段 | 课号 | 核心交付物 | 自检关注点 |
|---|---|---|---|---|
| 0 工程基线与环境 | 0 | L01–L05 | 环境契约、版本锁、四段骨架、六类事件 | 版本口径一致、事件同源 |
| 1 基础与范式理论 | 1–3 | L06–L30 | Agent 边界判据、12 种范式矩阵、选型函数 | 导览课位置与 \`kindReason\` |
| 2 运行时与工具 | 4–7 | L31–L53 | 核心循环、函数调用、手写 MCP、记忆与 RAG | 接口归属不越层 |
| 3 推理·规划·自我改进 | 8–10 | L54–L65 | ToT / GoT、动态重规划、反思纠错 | 重规划的约束继承 |
| 4 多智能体 | 11 | L66–L71 | 角色协议、编排模式、冲突消解、人在回路 | supervisor 不持工具 |
| 5 工程化可靠交付 | 12–15 | L72–L92 | 可观测、评测、安全、成本与吞吐 | 事实源唯一、评测含负例 |
| 6 框架专论与对照实战 | 16–22 | L93–L115 | 六框架逐项对照与迁移回退 | 业务契约不随框架变 |
| 7 专项 Agent 与生态 | 23–24 | L116–L122 | 五类场景、MCP 与模型生态准入 | 每个场景一条不可退让约束 |
| 8 生产部署与运维 | 25 | L123–L127 | 状态外置、降级、灰度、生命周期、上线演练 | live 与 ready 分离 |
| 9 Capstone A · 工具型 | 26 | L128–L134 | 运维助手：动作 → 权限 → 回滚 | 网关是唯一执行入口 |
| 10 Capstone B · 研究型 | 27 | L135–L142 | 研究报告：问题 → 证据 → 结论 | 收束课合法跨两支 |

这张表不是给读者背的，它是自检器的检查清单：每一行都对应「阶段存在且挂在有效模块」「课号连续」「课型护栏」中的一条。表里的课号区间同样从数据算——只要新增一节课忘了补 \`stage\`，区间就会断，断言立刻报 \`unknown stage\`。

\`\`\`ts title="map/model.ts：地图只做投影，不存第二份真相" note="关键：分叉由「阶段 → 模块」推导，不另维护一份课号白名单；模块 9/10 由 MODULES 的名称语义确定。"
import type { CourseData, Lesson } from '~/types/course'

export type MapIssue = { code: string; where: string; detail: string }
export type MapReport = { issues: MapIssue[]; stats: Record<string, number> }

export const BRANCH_A_MODULE = 9
export const BRANCH_B_MODULE = 10

export function moduleOf(course: CourseData, l: Lesson): number | null {
  const s = course.STAGES.find((x) => x.id === l.stage)
  return s && typeof s.module === 'number' ? s.module : null
}

export function branchOf(course: CourseData, l: Lesson): 'A' | 'B' | null {
  const m = moduleOf(course, l)
  if (m === BRANCH_A_MODULE) return 'A'
  if (m === BRANCH_B_MODULE) return 'B'
  return null
}

export function isClosingLesson(course: CourseData, l: Lesson): boolean {
  return l.id === course.LESSONS[course.LESSONS.length - 1]!.id
}

export function pushIssue(out: MapIssue[], code: string, where: string, detail: string): void {
  out.push({ code, where, detail })
}
\`\`\`

### 第二件事：六项结构断言，全部可失败

把「地图对不对」拆成六组能报错的检查，而不是一句「结构合理」。前四组是通用课程不变量，第五组是这门课特有的双 Capstone 分叉，第六组产出报表快照。

| 编号 | 检查 | 失败码 | 为什么必须查 |
|---|---|---|---|
| C1 | 概念 id 唯一、前置存在、不自指、无环 | \`concept cycle\` | 环会让学习路径生成器无限递归 |
| C2 | 每课的 stage 存在、stage 挂有效 module、kind 已标 | \`unknown stage\` / \`missing kind\` | 漏标 kind 会静默逃过体量闸门 |
| C3 | 导览课四道护栏与 CI 同口径 | \`overview without kindReason\` | 课程内自检要能复现门禁结论 |
| C4 | 课时前置、概念引用、题目标签不悬空且无环 | \`dangling lesson prereq\` / \`id sequence break\` | 悬空引用在页面上是死链 |
| C5 | A/B 两支互不串线，收束课同时连住两支末端 | \`branch crossing\` / \`closing lesson\` | 串线会让两条独立主线互相污染 |
| C6 | 从数据现算规模快照 | 无（只产报表） | 报表不参与判定，避免把数字当真相 |

\`\`\`ts title="map/graph.ts：三色 DFS 找环，概念图与课时图共用" note="关键：找到环就回溯出完整路径，报错里直接给出哪几个 id 成环，而不是只说「有环」。"
export type Graph = Map<string, string[]>   // node -> prereq ids

export function findCycle(g: Graph): string[] | null {
  const color = new Map<string, 'white' | 'gray' | 'black'>()
  for (const k of g.keys()) color.set(k, 'white')
  const stack: string[] = []
  let found: string[] | null = null

  const visit = (id: string): void => {
    if (found) return
    const c = color.get(id)
    if (c === 'black' || c === undefined) return
    if (c === 'gray') {
      found = stack.slice(stack.indexOf(id)).concat(id)
      return
    }
    color.set(id, 'gray')
    stack.push(id)
    for (const p of g.get(id) ?? []) visit(p)
    stack.pop()
    color.set(id, 'black')
  }

  for (const k of g.keys()) visit(k)
  return found
}
\`\`\`

这里刻意不用递归式「访问过就报错」的简化写法：\`gray\` 与 \`black\` 必须分开，否则会把「两条路径汇到同一个前置」误判成环。菱形依赖在课程里很常见（L142 同时依赖 L134 与 L141，两支又都依赖更早的公共课），共用节点不是环，只有回到当前递归栈里的节点才是。

\`\`\`ts title="map/assert-knowledge-map.ts：C1–C6 主检查器" note="关键：返回 MapReport 而不是抛异常，便于一次收集全部问题；测试层再包装成可失败断言。"
import type { CourseData } from '~/types/course'
import { findCycle, type Graph } from './graph.ts'
import { branchOf, moduleOf, isClosingLesson, pushIssue,
  type MapIssue, type MapReport } from './model.ts'

export function assertKnowledgeMap(course: CourseData): MapReport {
  const issues: MapIssue[] = []
  const L = course.LESSONS
  const K = course.CONCEPTS
  const byLesson = new Map(L.map((l) => [l.id, l]))
  const conceptIds = new Set(K.map((c) => c.id))
  const moduleIds = new Set((course.MODULES ?? []).map((m) => m.id))
  const stageById = new Map(course.STAGES.map((s) => [s.id, s]))

  // C1 —— 概念图
  if (conceptIds.size !== K.length) {
    pushIssue(issues, 'duplicate concept id', 'CONCEPTS', String(K.length - conceptIds.size))
  }
  const cGraph: Graph = new Map()
  for (const c of K) {
    for (const p of c.prereqs) {
      if (!conceptIds.has(p)) pushIssue(issues, 'concept.dangling', c.id, p)
      if (p === c.id) pushIssue(issues, 'concept.self', c.id, p)
    }
    cGraph.set(c.id, c.prereqs)
  }
  const cCycle = findCycle(cGraph)
  if (cCycle) pushIssue(issues, 'concept cycle', 'CONCEPTS', cCycle.join(' -> '))

  // C2 —— 每课归属有效模块，且课型已标
  for (const l of L) {
    const s = stageById.get(l.stage)
    if (!s) {
      pushIssue(issues, 'unknown stage', l.id, String(l.stage))
    } else if (typeof s.module !== 'number') {
      pushIssue(issues, 'stage without module', l.id, String(s.id))
    } else if (!moduleIds.has(s.module)) {
      pushIssue(issues, 'unknown module', l.id, String(s.module))
    }
    if (!l.kind) pushIssue(issues, 'missing kind', l.id, 'every lesson needs a kind')
  }

  // C3 —— 导览课四道护栏，与 content-gate 同口径
  const nav = L.filter((l) => l.kind === 'overview')
  const navByModule = new Map<number, number>()
  for (const l of nav) {
    if (!String(l.kindReason ?? '').trim()) {
      pushIssue(issues, 'overview without kindReason', l.id, '')
    }
    const s = stageById.get(l.stage)
    if (s && (s.name.includes('Capstone') || s.en.includes('Capstone'))) {
      pushIssue(issues, 'overview in capstone stage', l.id, String(l.stage))
    }
    const m = moduleOf(course, l)
    if (m !== null) navByModule.set(m, (navByModule.get(m) ?? 0) + 1)
  }
  for (const [m, n] of navByModule) {
    if (n > 1) pushIssue(issues, 'overview per module', 'module ' + m, String(n))
  }
  if (L.length > 0 && nav.length / L.length > 0.08) {
    pushIssue(issues, 'overview ratio', 'LESSONS', String(nav.length / L.length))
  }

  // C4 —— 引用完整性与课号连续
  const lGraph: Graph = new Map()
  for (let i = 0; i < L.length; i++) {
    const l = L[i]!
    const expected = 'L' + String(i + 1).padStart(2, '0')
    if (l.id !== expected) pushIssue(issues, 'id sequence break', l.id, expected)
    if (l.prereqs.includes(l.id)) pushIssue(issues, 'self prereq', l.id, l.id)
    for (const p of l.prereqs) {
      if (!byLesson.has(p)) pushIssue(issues, 'dangling lesson prereq', l.id, p)
    }
    lGraph.set(l.id, l.prereqs)
    for (const c of l.concepts) {
      if (!conceptIds.has(c)) pushIssue(issues, 'unknown concept', l.id, c)
    }
    for (const q of l.quiz) {
      if (!conceptIds.has(q.concept)) pushIssue(issues, 'unknown quiz concept', l.id, q.concept)
    }
  }
  const lCycle = findCycle(lGraph)
  if (lCycle) pushIssue(issues, 'lesson cycle', 'LESSONS', lCycle.join(' -> '))

  // C5 —— 双 Capstone 分叉：支内可依赖，跨支禁止；唯一例外是收束课
  for (const l of L) {
    const b = branchOf(course, l)
    if (!b || isClosingLesson(course, l)) continue
    for (const p of l.prereqs) {
      const t = byLesson.get(p)
      if (!t) continue
      const tb = branchOf(course, t)
      if (tb && tb !== b) {
        pushIssue(issues, 'branch crossing', l.id, b + ' -> ' + tb + ':' + p)
      }
    }
  }
  const closing = L[L.length - 1]!
  const tailA = L.filter((l) => branchOf(course, l) === 'A').at(-1)
  const tailB = L.filter((l) => branchOf(course, l) === 'B'
    && !isClosingLesson(course, l)).at(-1)
  if (tailA && tailB && !(closing.prereqs.includes(tailA.id)
    && closing.prereqs.includes(tailB.id))) {
    pushIssue(issues, 'closing lesson', closing.id,
      'must depend on ' + tailA.id + ' and ' + tailB.id)
  }

  // C6 —— 快照只用于报表，不参与判定
  const stats = {
    lessons: L.length, concepts: K.length,
    stages: course.STAGES.length, modules: (course.MODULES ?? []).length,
    overview: nav.length, capstone: L.filter((l) => l.kind === 'capstone').length,
  }
  return { issues, stats }
}
\`\`\`

C5 里那个例外值得单独说：实测全课时，**唯一一条跨分叉的引用就是 L142 自己**——它的 \`prereqs\` 是 \`L134\` 与 \`L141\`，分别接住 A、B 两支末端。这不是待修的违规，恰恰是收束课的定义。所以断言不能简单写「跨支一律禁止」，得写成「支内可依赖、跨支禁止、最后一课必须同时连住两支」。少写后半句，就会把本课自己判成错误；只写「最后一课可以跨支」，又会让任何一节 B 分支的课偷偷依赖 A 分支而不被发现。**规则的例外必须有自己的正向断言**，这和 L132「负例不加权」、L138「双向比对」是同一种严谨：判断一个例外是否合法，要检查它该有的东西有没有，而不只是放宽禁令。

:::deep

### 能被证伪的地图，才算地图

一张手绘知识地图看起来什么都对：箭头从左往右、模块排得整齐、颜色区分清楚。但它没有任何一种「错」的状态——加一节课忘了连线，图仍然好看；把两条 Capstone 分支接反，图仍然对称。它只能被欣赏，不能被检验，因此也就不承担任何责任。

自检器反过来：它不好看，输出是一串 \`MapIssue\`，但每一种「错」都有明确的名字与位置。\`concept cycle\` 告诉你哪几个 id 绕回来了，\`unknown stage\` 告诉你哪一课挂在不存在的阶段上，\`branch crossing\` 告诉你哪一课把另一支的前置拉了进来。这些名字让「地图错了」从一句主观抱怨变成一条可指派、可复现、可回归的缺陷——这正好是 L131 把运行事实做成事件流、L139 把证据来历做成三层树时反复用的手法：**先让错误有名字，再谈怎么防**。

更深一层，自检器检查的不是内容质量，而是内容之间的关系。142 课里任何一课的正文写得再好，也无法弥补「前置成环」或「课型漏标」；反过来，结构断言全绿也不能证明哪节课讲得清楚。**结构与内容是两个正交的维度，各自需要各自的验收**。整门课最后安排一节 \`capstone\` 而不是 \`overview\` 来收束，就是因为这个道理：收束本身也是一次工程交付，它要有实现、有断言、有能被推翻的地方。写一句「你已掌握完整能力闭环」不算交付，写出 \`assertKnowledgeMap()\` 并让它在被注入一个环时报错，才算。

:::

### 第三件事：进阶路线是可解析的清单，不是一句「多读论文」

课程结束时的建议最容易写成口号：「多读论文、关注社区、做真实项目」。口号没法验，也没法排序。把它改成结构化清单：每条有 \`kind\`（论文 / 社区 / 深耕 / 实践）、\`needs\`（依赖哪几课）、\`deliverable\`（可验收产物）、\`check\`（对应的可失败断言名）。于是「往哪走」变成能被 \`assertRoadmap()\` 检查的数据。

\`\`\`ts title="map/roadmap.ts：八条进阶路线与自检器" note="关键：deliverable 里出现「了解 / 熟悉 / 掌握」一律判不可验收；实践条目必须踩在两条 Capstone 分支的末端。"
import type { CourseData } from '~/types/course'
import { branchOf, isClosingLesson, pushIssue, type MapIssue } from './model.ts'

export type RoadmapKind = 'paper' | 'community' | 'deep' | 'practice'
export type RoadmapItem = {
  id: string
  kind: RoadmapKind
  topic: string
  needs: string[]
  deliverable: string
  check: string
}

export const ROADMAP: RoadmapItem[] = [
  { id: 'r-paper-1', kind: 'paper', topic: 'ReAct 与 ToT 原始论文',
    needs: ['L12', 'L19'],
    deliverable: '一份「论文设定 vs 课内实现」逐条对照表 + 可跑的最小复现脚本',
    check: 'assertPaperRepro()' },
  { id: 'r-paper-2', kind: 'paper', topic: 'Reflexion 与 LATS 的失败回放',
    needs: ['L17', 'L21'],
    deliverable: '失败轨迹回放脚本 + 三次迭代的收敛曲线',
    check: 'assertReflectionCurve()' },
  { id: 'r-comm-1', kind: 'community', topic: 'MCP 规范与 changelog',
    needs: ['L45', 'L121'],
    deliverable: '更新后的 ServerManifest 准入清单与漂移断言输出',
    check: 'assertManifestDrift()' },
  { id: 'r-comm-2', kind: 'community', topic: '主流框架 release note 跟踪',
    needs: ['L97', 'L100', 'L114'],
    deliverable: '同一 Agent 的四实现对照表 + 归因结论',
    check: 'assertFrameworkParity()' },
  { id: 'r-deep-1', kind: 'deep', topic: '多智能体冲突消解与共识',
    needs: ['L70', 'L138'],
    deliverable: '冲突消解协议 + 双向留痕的 contested 用例集',
    check: 'assertConflictsHandledV2()' },
  { id: 'r-deep-2', kind: 'deep', topic: '提示注入红队评估',
    needs: ['L84', 'L133'],
    deliverable: '五类载荷的拦截矩阵 + 绕过成本记录',
    check: 'assertRedTeamMatrix()' },
  { id: 'r-practice-a', kind: 'practice', topic: '把 A 分支移植到真实运维项目',
    needs: ['L134'],
    deliverable: '真实动作的网关接入 + 回滚演练记录',
    check: 'assertDeployDrill()' },
  { id: 'r-practice-b', kind: 'practice', topic: '把 B 分支移植到真实研究项目',
    needs: ['L141'],
    deliverable: '真实报告的可点开引用 + 20 条抽检基线',
    check: 'assertTraceQuality()' },
]

export function assertRoadmap(course: CourseData, items: RoadmapItem[]): MapIssue[] {
  const issues: MapIssue[] = []
  const known = new Set(course.LESSONS.map((l) => l.id))
  const ids = new Set<string>()
  const covered = new Set<RoadmapKind>()
  const practiceNeeds = new Set<string>()
  const vague = ['了解', '熟悉', '掌握', '学习', '理解']

  for (const it of items) {
    if (ids.has(it.id)) pushIssue(issues, 'duplicate roadmap id', it.id, '')
    ids.add(it.id)
    covered.add(it.kind)
    if (it.needs.length === 0) pushIssue(issues, 'empty needs', it.id, '')
    for (const n of it.needs) {
      if (!known.has(n)) pushIssue(issues, 'unknown lesson', it.id, n)
      if (it.kind === 'practice') practiceNeeds.add(n)
    }
    if (vague.some((v) => it.deliverable.includes(v))) {
      pushIssue(issues, 'unverifiable deliverable', it.id, it.deliverable)
    }
    if (!it.check.trim() || it.check.startsWith('void')) {
      pushIssue(issues, 'unverifiable check', it.id, it.check)
    }
    if (!it.topic.trim()) pushIssue(issues, 'empty topic', it.id, '')
  }

  const kinds: RoadmapKind[] = ['paper', 'community', 'deep', 'practice']
  for (const k of kinds) {
    if (!covered.has(k)) pushIssue(issues, 'roadmap kind missing', k, '')
  }
  const tailA = course.LESSONS.filter((l) => branchOf(course, l) === 'A').at(-1)?.id ?? ''
  const tailB = course.LESSONS.filter((l) => branchOf(course, l) === 'B'
    && !isClosingLesson(course, l)).at(-1)?.id ?? ''
  if (!practiceNeeds.has(tailA) || !practiceNeeds.has(tailB)) {
    pushIssue(issues, 'practice not anchored', 'practice', tailA + ' + ' + tailB)
  }
  return issues
}
\`\`\`

\`vague\` 那一组动词的判断看起来机械，却是整份清单里最有用的一条。把 \`deliverable\` 写成「了解 ReAct 原始论文」，无法回答「做到什么程度算完成」；写成「逐条对照表 + 可跑的最小复现脚本」，就能直接指定产物与断言名。同理 \`needs\` 必须是真实课号：写「学完范式部分」的人读得懂，机器读不懂，也没法在课程改版时提醒你这条路线已经指向了不存在的课。最后那条「实践条目必须踩在两条分支末端」则防止「去真实项目里做一次 Capstone」变成空话——它要求实践明确锚在 L134 与 L141 的交付物上，而不是任挑一节课当门面。

### 六条验收断言：正例只有一条，其余全是注入的缺陷

沿用 L132 定下的规矩：**评测以负例为主**。只证明「当前数据没问题」毫无价值，要证明的是「一旦有人改坏，检查真的会响」。

\`\`\`ts title="evals/l142-map.test.ts：真实课程做正例，克隆后注入缺陷做负例" note="关键：断言里的规模数字从数据现算，不抄 142/143，避免加课时测试自己先失效。"
import assert from 'node:assert/strict'
import type { CourseData } from '~/types/course'
import { AGENT_COURSE } from '../app/data/agent-course/index.ts'
import { assertKnowledgeMap } from '../map/assert-knowledge-map.ts'
import { assertRoadmap, ROADMAP, type RoadmapItem } from '../map/roadmap.ts'

function mutate(fn: (c: CourseData) => void): CourseData {
  const c = structuredClone(AGENT_COURSE)
  fn(c)
  return c
}

function expectFail(fn: () => void, needle: string): void {
  let msg = ''
  try { fn() } catch (e) { msg = String((e as Error).message) }
  assert.ok(msg.includes(needle), 'expected ' + needle + ' but got: ' + msg)
}

function noIssues(c: CourseData): void {
  const r = assertKnowledgeMap(c)
  if (r.issues.length) throw new Error(r.issues.map((x) => x.code).join(','))
}
function noRoadmapIssues(c: CourseData, items: RoadmapItem[]): void {
  const is = assertRoadmap(c, items)
  if (is.length) throw new Error(is.map((x) => x.code).join(','))
}

function t1_realCourseAndRoadmapPass() {
  const r = assertKnowledgeMap(AGENT_COURSE)
  assert.deepEqual(r.issues, [])
  assert.equal(r.stats.lessons, AGENT_COURSE.LESSONS.length)
  assert.equal(r.stats.concepts, AGENT_COURSE.CONCEPTS.length)
  assert.equal(r.stats.modules, (AGENT_COURSE.MODULES ?? []).length)
  noRoadmapIssues(AGENT_COURSE, ROADMAP)
}

function t2_conceptCycleIsCaught() {
  const c = mutate((x) => {
    const first = x.CONCEPTS[0]!
    const last = x.CONCEPTS.find((k) => k.id === 'course-review')!
    last.prereqs = [first.id].concat(last.prereqs)
    first.prereqs = ['course-review']
  })
  expectFail(() => noIssues(c), 'concept cycle')
}

function t3_deletedStageIsCaught() {
  const c = mutate((x) => { x.STAGES = x.STAGES.filter((s) => s.id !== 27) })
  expectFail(() => noIssues(c), 'unknown stage')
}

function t4_overviewWithoutReasonIsCaught() {
  const c = mutate((x) => {
    x.LESSONS.find((l) => l.kind === 'overview')!.kindReason = ''
  })
  expectFail(() => noIssues(c), 'overview without kindReason')
}

function t5_branchRulesAreCaughtFromBothSides() {
  const cross = mutate((x) => {
    const a = x.LESSONS.find((l) => l.id === 'L129')!
    a.prereqs = a.prereqs.concat('L136')
  })
  expectFail(() => noIssues(cross), 'branch crossing')
  const oneSided = mutate((x) => {
    x.LESSONS.find((l) => l.id === 'L142')!.prereqs = ['L141']
  })
  expectFail(() => noIssues(oneSided), 'closing lesson')
}

function t6_roadmapRejectsVagueAndDangling() {
  const vague = ROADMAP.map((it) => it.id === 'r-paper-1'
    ? { ...it, deliverable: '了解论文' } : it)
  expectFail(() => noRoadmapIssues(AGENT_COURSE, vague), 'unverifiable deliverable')
  const dangling = ROADMAP.map((it) => it.id === 'r-practice-a'
    ? { ...it, needs: ['L999'] } : it)
  expectFail(() => noRoadmapIssues(AGENT_COURSE, dangling), 'unknown lesson')
}

t1_realCourseAndRoadmapPass()
t2_conceptCycleIsCaught()
t3_deletedStageIsCaught()
t4_overviewWithoutReasonIsCaught()
t5_branchRulesAreCaughtFromBothSides()
t6_roadmapRejectsVagueAndDangling()
console.log('L142 knowledge map: 6/6 passed')
\`\`\`

\`t5\` 特意从两个方向测同一条分叉规则：一边把 L129 的前置塞进 B 分支，验证「跨支禁止」会响；另一边把收束课的前置砍成只剩 \`L141\`，验证「必须连住两支」的正向要求也会响。只测前者，放宽例外时不会有人发现；只测后者，跨支污染不会被拦。**一条规则若有例外，两侧都要有断言**——这是本课对 L132「负例为主」的一点补充。

:::warn

### 三个收束翻车点

**一、另画一张图。** 手绘图、文档里的推荐顺序、\`ROADMAP\`、课程数据各存一份，改一处忘三处。地图必须是同一份数据的读法，规模快照也只从数据现算，不抄数字。

**二、把「总览」当免责牌标成 \`overview\`。** 导览课免实现代码、免测验，是闸门里最容易被滥用的口子；Capstone 阶段更是明确禁用。收束课的交付物应该是自检器与断言，不是一段「你已掌握」的鼓励。

**三、检查只跑正例。** 对一份健康的数据跑 \`assertKnowledgeMap()\` 返回空数组，什么都没证明。必须注入环、删阶段、抹掉 \`kindReason\`、串分支、写「了解论文」，逐一确认每条检查真的会响；否则下次改版，第一个坏掉的仍然是学习路径页。

:::

### 两条 Capstone 分支的最终对照与全课收束

A、B 两支从 L128 / L135 各自开图纸，到 L134 / L141 各自交付，最后由 L142 接住。它们共用方法论但不共用组件——这正是 C5 要用断言守住的东西。

| 维度 | Capstone A（L128–L134） | Capstone B（L135–L141） |
|---|---|---|
| 主线 | 动作 → 权限 → 回滚 | 问题 → 证据 → 结论 |
| 被保护的不可退让项 | 不可逆副作用恰好执行一次 | 无出处句子写不进报告 |
| 事实源 | append-only 事件流 | \`questionId → sourceId → claim\` 三层证据树 |
| 硬约束落在哪 | \`ToolGateway.execute()\` 唯一入口 + 审批票据 | \`Claim / Citation\` 类型契约 + 渲染回喂闸门 |
| 评测形态 | 12 条轨迹用例（含 4 条负例）+ 静态调用图 | 20 条人工抽检基线 + 溯源质量校验 |
| 交付终点 | 可装配、可灰度、可回滚的服务 | 读者三秒内能点开原文的报告 |
| 共同方法 | 约束写进类型、事实源唯一、评测以负例为主、成本优化不改语义 | 同左 |

这四条共同方法，就是整门课真正要留下的东西。具体框架会换、模型会换、MCP 规范会出新版，但「把约束写成可失败断言」不会过期——L09 用 \`shouldUseAgent()\` 拦住不该交给模型的任务，L94 用 \`firstDivergence\` 定位对照实验的分叉点，L133 用 \`assertCallGraph()\` 把旁路变成 CI 门禁，L141 用 \`assertNoRenderBypass()\` 守住渲染自由度，到本课用 \`assertKnowledgeMap()\` 守住课程结构。**从第一节课到最后一节课，动作一直是同一个：把「应该如此」改成「不如此就报错」。**

与相邻课的边界：L141 交付的是一条具体系统的发布流水线（锚点渲染、报告服务、交付自检、演示脚本），本课不复用 \`delivery/\` 下任何组件，也不重述 B 分支的复盘表；L134 的装配与回滚同理只在对照表里出现一次。本课新增的只有 \`map/\` 下的图检查、主检查器、路线清单与 \`evals/\` 下的六条断言，输入是 \`AGENT_COURSE\` 本身。学完之后往哪走，也不再是一句鼓励，而是八条带 \`needs\`、带 \`deliverable\`、带 \`check\` 的清单。

一句话记住本课：**地图不是画出来给人看的，是写进数据里让机器能推翻的——142 课的结构、两条分支的边界、学完之后的路，都要有能被证伪的那一刻。**

:::tip

### 判断这份自检器是不是真的有用

故意把 \`CONCEPTS\` 里某个概念的 \`prereqs\` 指向 \`course-review\`，看 \`assertKnowledgeMap()\` 有没有报 \`concept cycle\`；把 \`ROADMAP\` 里一条 \`deliverable\` 改成「了解论文」，看 \`assertRoadmap()\` 有没有报 \`unverifiable deliverable\`。两个都响，说明地图承担了责任；只对当前数据返回空数组，说明它只是一张更整齐的贴图。课程到这里结束，但这套动作可以原样搬进你自己的项目：先问「什么算错」，再写让错误有名字的那几行代码。

:::
`,
    null,
    [
      {
        text: '为什么知识地图应该直接用 CourseData，而不是另画一张图？',
        options: [
          '画图更好看',
          '另存一份必然与课程数据漂移，改一处忘两处，且无法被机器验证',
          'PDF 里更好排版',
          '渲染性能更高',
        ],
        answer: 1,
        explain: 'L05 事件同源、L54 删 minutes、L141 锚点差集都是同一条原则：不让第二份真相存在。',
        concept: 'course-review',
      },
      {
        text: 'C5 分叉断言里，唯一允许跨分支引用的是哪一课？',
        options: [
          'L128 图纸课',
          'L135 图纸课',
          'L142 收束课，且必须同时依赖 A、B 两支末端',
          '随便哪一节 capstone',
        ],
        answer: 2,
        explain: '实测全课唯一跨支引用就是 L142 的 prereqs（L134 + L141），但例外必须有正向断言。',
        concept: 'course-review',
      },
      {
        text: 'assertRoadmap() 为什么把「了解 / 熟悉 / 掌握」判为不可验收？',
        options: [
          '用词不够正式',
          '这些词无法回答「做到什么程度算完成」，也没有对应产物与断言名',
          '字数太少',
          '论文里不用这些词',
        ],
        answer: 1,
        explain: 'deliverable 必须是能指定产物与 check 的具体交付物。',
        concept: 'course-review',
      },
      {
        text: '六条验收断言为什么只有一条正例？',
        options: [
          '节省运行时间',
          '证明「当前数据没问题」没有价值，要证明「一旦改坏检查真的会响」',
          '正例写不出来',
          '闸门不允许更多正例',
        ],
        answer: 1,
        explain: '沿用 L132「评测以负例为主」：注入环、删阶段、抹 reason、串分支、写口号，逐一验响应。',
        concept: 'course-review',
      },
    ],
    [
      ['知识地图', '课程数据本身（MODULES / STAGES / LESSONS / CONCEPTS）的另一种读法，不另存一份'],
      ['三色 DFS', 'white / gray / black 区分「未访问 / 在栈中 / 已完成」，菱形汇合不误判成环'],
      ['课型护栏', '导览课理由必填、每模块最多一节、总量不超过 8%、Capstone 阶段禁用'],
      ['分叉例外', '支内可依赖、跨支禁止，收束课必须同时连住两支末端'],
      ['可验收路线', 'RoadmapItem 带 kind / needs / deliverable / check，口号一律判失败'],
      ['负例为主', '正例只证当前健康，负例才证检查真的会响'],
    ],
    [
      '另画一张手绘知识地图，课程改版后漏改图，学习路径生成器按旧顺序跑成死循环。',
      '把「总览」课标成 overview 来免实现代码，忘了 Capstone 阶段明确禁用导览课。',
      '分叉断言只写「跨支禁止」，把合法跨两支的收束课自己判成错误。',
      '只写「收束课可以跨支」，结果 B 分支某课偷偷依赖 A 分支也没人发现。',
      '进阶路线写成「多读论文、关注社区」，没有 needs、没有产物、没有断言名，课程改版后指向不存在的课。',
    ],
  ),
  'capstone',
)
