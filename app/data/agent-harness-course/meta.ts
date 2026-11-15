import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ----------------
 * 本课程是「比较型」课程：版本字段记的是证据快照，不是某个库的版本号。
 * 所有数字都有快照日期与来源链接（见 docs/00091-agent-harness-course/research/）。
 */
export const META: CourseMeta = {
  version: 'harness-survey@2026-11-15',
  verifiedAt: '2026-11-15',
  lts: '证据快照 2026-11-15；各系统版本号、star 数、榜单排名随时间变化，以正文链接为准',
  docs: 'https://huggingface.co/spaces/harness-hub/harness-lens',
  release: 'https://huggingface.co/spaces/joelniklaus/harness-leaderboard',
  playground: 'https://arxiv.org/abs/2610.00917',
  source: 'https://github.com/liyix/finding-the-right-fit',
  notes: [
    '比较型课程：正文数字一律带快照日期（2026-11-15）或来源标注，禁止写成永久事实。',
    '证据分级 A/B/C：A=官方页面/仓库原文，B=可信第三方实测，C=仅搜索摘要未读原文；引用前先看 research/evidence 台账。',
    '已知写作陷阱：Pi 的「拒绝 MCP」已演变为「内置 MCP + Codemode」；Pi 与 DSH 各有一套互不相干的「四种模式」；Hermes 工具数官方文档在 40/60+/70+ 间随页面快照漂移；成本指标至少四种口径不可混算。',
    'arXiv 2610.00917 的 harness×model 交互结论（秩相关 0.36）是本课程横向章的核心依据之一。',
    'FeatureBench 事故（2026-10-23 answer key 泄漏）作为「怎么读对比数据」的反面教材收录在 S0。',
  ],
}
