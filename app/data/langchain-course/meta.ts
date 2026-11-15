import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ----------------
 * 本课程是「源码走读型」课程：版本字段记的是取证时的源码快照，不是永久事实。
 * 所有数字都有快照日期与来源（见 docs/00096-langchain-source-course/research/）。
 */
export const META: CourseMeta = {
  version: 'langchain-source@1.6.6+1.4.1+1.7.4',
  verifiedAt: '2026-11-15',
  lts: '1.0 GA 于 2025-10 发布，官方承诺 2.0 前无破坏性变更；取证快照 2026-11-15',
  docs: 'https://docs.langchain.com/oss/javascript/langchain/overview',
  release: 'https://github.com/langchain-ai/langchainjs/releases',
  playground: 'https://github.com/langchain-ai/langchainjs',
  source:
    'https://github.com/langchain-ai/langchainjs (commit 7704471) + https://github.com/langchain-ai/langgraphjs (commit fa426b2)',
  notes: [
    'TS 线版本与 Python 主线完全不同：langchain(JS)@1.6.6 / @langchain/core@1.4.1 / @langchain/langgraph@1.7.4，禁止把 Python 线的 1.5.0/1.8.0 套用到本课。',
    '真实导出是 createAgent（camelCase，14 个重载）；官方文档正文的 create_agent 是 Python 残留。',
    'Agent = 编译后的 LangGraph 图：createAgent() 实现体仅 return new ReactAgent(params)，invoke() 委托 #graph.invoke()。',
    '旧 Chain/Memory/AgentExecutor API 物理隔离在 langchain-classic@1.0.61 包，只在模块九出现。',
    '证据分级 A/B/C：A=官方仓库源码/npm registry 原文，B=官方文档叙述，C=搜索摘要；正文源码引用统一标注 文件:行 + commit。',
  ],
}
