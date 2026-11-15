import { EFFECT_COURSE } from './effect-course'
import { RXJS_COURSE } from './rxjs-course'
import { AGENT_COURSE } from './agent-course'
import { AGENT_HARNESS_COURSE } from './agent-harness-course'
import type { CourseEntry } from '~/types/course'

/**
 * 知识岛课程注册表。
 * 新增一门课：追加一项、提供 CourseData 与独立 storageKey，页面/侧栏/学情自动接入。
 */
export const COURSES: CourseEntry[] = [
  {
    slug: 'effect-ts',
    title: 'Effect 深度课',
    subtitle: 'effect@4.1.4 · TypeScript',
    tagline: '从「程序即值」到「运行时指令解释」',
    description:
      '从「程序即值」讲到 fiber runtime 的指令解释器：三通道类型、Cause、Layer、Scope、结构化并发与 Stream 背压。6 阶段 26 课，每课配原理演练与即时反馈测验。',
    icon: '🌀',
    color: '#4b6fe0',
    tags: ['TypeScript', '函数式', '运行时原理', '架构设计'],
    status: 'available',
    storageKey: 'knowisle:effect-ts:v1',
    data: EFFECT_COURSE,
  },
  {
    slug: 'rxjs',
    title: 'RxJS 深度课',
    subtitle: 'rxjs@7.8.2 · 响应式',
    tagline: '从「一段时间里的数据序列」到「把时间注入系统」',
    description:
      '从「一段时间里的数据序列」讲到调度器把时间注入系统：冷/热、观察者协议、map 流水线、concatMap/mergeMap/switchMap/exhaustMap 时序、catchError/retry、Subject 多播、share 引用计数、背压与虚拟时间测试。6 阶段 26 课，每课配可操作原理演练与即时反馈测验。',
    icon: '📡',
    color: '#3fb984',
    tags: ['JavaScript', '响应式', '时间模型', '异步组合'],
    status: 'available',
    storageKey: 'knowisle:rxjs:v1',
    data: RXJS_COURSE,
  },
  {
    slug: 'agent',
    title: 'AI Agent 工程课',
    subtitle: 'typescript@7.0.2 · node@24 LTS',
    tagline: '从「范式」到「生产」的完整工程化知识体系',
    description:
      '11 模块、28 阶段、142 课、142 概念：理论 + 无框架手写实战（TypeScript 7 / Node 24）+ 框架对照 + 两个从零 Capstone。从「模型如何决定下一步」讲到运行时、工具/MCP、记忆 RAG、推理规划、多 Agent、可观测/评测/安全/成本、六大框架选型与生产部署。',
    icon: '🤖',
    color: '#5b8def',
    tags: ['TypeScript', 'AI Agent', 'MCP', '多智能体', '工程化'],
    status: 'available',
    storageKey: 'knowisle:agent:v1',
    data: AGENT_COURSE,
  },
  {
    slug: 'agent-harness',
    title: 'Agent Harness 深度比较',
    subtitle: '15 系统 · 证据快照 2026-11-15',
    tagline: '每个 Agent 系统的机制、优缺点与适用领域，全部基于可证实资料',
    description:
      '17 阶段 27 课：方法论与基准读法 2 课，Claude Code / Codex CLI / DeepSeek Harness / Hermes / Pi / OpenCode 等主流系统各 2 课，mini-swe-agent / Kimi Code / Qwen Code / Cline / Kilo / Grok Build / Letta / OpenHands / OpenClaw 各 1 课，末章横向对比与场景化选型。每课夹带官方文档与基准原文链接，数字全部标注快照日期。',
    icon: '🔬',
    color: '#8b6cef',
    tags: ['AI Agent', 'Harness 对比', '证据方法论', '选型'],
    status: 'available',
    storageKey: 'knowisle:agent-harness:v1',
    data: AGENT_HARNESS_COURSE,
  },
  {
    slug: 'more',
    title: '更多课程在路上',
    subtitle: 'Coming soon',
    description: '知识岛按课程组织，新增课程只需在 data/courses.ts 注册即可接入统一的学习路径与学情模型。',
    icon: '🧭',
    color: '#94a1b5',
    tags: ['规划中'],
    status: 'soon',
    storageKey: 'knowisle:more:v1',
  },
]

export function getCourse(slug: string): CourseEntry | undefined {
  return COURSES.find((c) => c.slug === slug && c.status === 'available')
}

export function availableCourses(): CourseEntry[] {
  return COURSES.filter((c) => c.status === 'available' && !!c.data)
}

export function courseBase(slug: string): string {
  return `/courses/${slug}`
}
