import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ---------------- */
export const META: CourseMeta = {
  version: '架构深度课 · 证据快照 2026-11-16',
  verifiedAt: '2026-11-16',
  lts: '本课为架构原理课，不锁运行环境；实操课默认 PyTorch + Hugging Face 生态（Python 3.10+），部署用 vLLM/llama.cpp。',
  docs: 'https://arxiv.org/abs/1706.03762（Transformer 原文 "Attention Is All You Need"）',
  release: 'https://github.com/deepseek-ai/DeepSeek-V3',
  playground: 'https://huggingface.co/spaces',
  source: 'https://github.com/deepseek-ai（V2/V3/R1 官方仓库与论文）',
  notes: [
    '全课 11 模块 / 51 阶段 / 111 课 / 10 capstone / 0 overview，renderMode: complex；关键数字只认 A 级官方一手来源。',
    '来源台账见 docs/00098-llm-arch-course/research/evidence/00-discipline.md：arXiv 号一律以官方 abs 页核验为准（B5 批次已更正 T5/IPO/KTO/Hyena/RWKV/Hymba/Performer/DeltaNet/Dream 共 9 处错号）。',
    'B 级值（过训练 token/参数、商用 API 成本、通用 KV 量化、多模态基准）显式标注「第三方/随时间变动，不担关键结论」。',
    '「先原理、后架构、再实操」：M1 讲清 Transformer 本体 → M2–M7 讲清各家如何补短板 → M8–M11 落地预训练/微调/对齐/部署工程闭环。',
  ],
}
