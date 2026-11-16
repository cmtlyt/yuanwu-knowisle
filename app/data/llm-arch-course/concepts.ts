import type { Concept } from '~/types/course'

/* ---------------- 知识点图谱：每个课时承载一个主概念，全课连续（随模块分批追加） ---------------- */
export const CONCEPTS: Concept[] = [
  // —— 模块 1 · 架构原理深挖（stage 0..5） ——
  { id: 'block-arch', name: '2017 Transformer block 结构', stage: 0, weight: 4, prereqs: [] },
  {
    id: 'autoreg-paradigm',
    name: '自回归 next-token 目标',
    stage: 0,
    weight: 4,
    prereqs: ['block-arch'],
  },
  {
    id: 'next-token-loss',
    name: 'next-token 交叉熵损失',
    stage: 0,
    weight: 3,
    prereqs: ['autoreg-paradigm'],
  },
  {
    id: 'qkv-attention',
    name: 'QKV 注意力数学',
    stage: 1,
    weight: 5,
    prereqs: ['block-arch'],
  },
  { id: 'multi-head', name: 'MHA / MQA / GQA 谱系', stage: 1, weight: 4, prereqs: ['qkv-attention'] },
  {
    id: 'mha-impl',
    name: '手写多头注意力',
    stage: 1,
    weight: 3,
    prereqs: ['qkv-attention', 'multi-head'],
  },
  {
    id: 'ffn',
    name: 'FFN 与 SwiGLU',
    stage: 2,
    weight: 4,
    prereqs: ['block-arch'],
  },
  {
    id: 'norm-residual',
    name: '残差 + 归一化（Pre/Post / RMSNorm）',
    stage: 2,
    weight: 3,
    prereqs: ['ffn'],
  },
  {
    id: 'rmsnorm-impl',
    name: '手写 RMSNorm',
    stage: 2,
    weight: 3,
    prereqs: ['norm-residual'],
  },
  {
    id: 'positional-enc',
    name: '位置编码演进（RoPE / 外推）',
    stage: 3,
    weight: 4,
    prereqs: ['qkv-attention'],
  },
  {
    id: 'm1-capstone',
    name: '最小 decoder-only block 组装',
    stage: 4,
    weight: 5,
    prereqs: ['next-token-loss', 'mha-impl', 'rmsnorm-impl', 'positional-enc'],
  },
  {
    id: 'paradigm-compare',
    name: 'encoder / enc-dec / decoder-only 三范式',
    stage: 5,
    weight: 3,
    prereqs: ['autoreg-paradigm'],
  },
  {
    id: 'gen-kv-reuse',
    name: '逐 token 生成与 KV 缓存复用',
    stage: 5,
    weight: 3,
    prereqs: ['qkv-attention', 'paradigm-compare'],
  },
  {
    id: 'swiglu-ffn',
    name: 'SwiGLU 门控 FFN 细节',
    stage: 5,
    weight: 3,
    prereqs: ['ffn'],
  },
]
