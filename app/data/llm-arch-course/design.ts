import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书（绑定到课程的数据，非独立 Markdown） ---------------- */

export const DESIGN: CourseDesign = {
  title: 'LLM 架构深度课 · 教学设计说明书',
  summary:
    '面向已具备基础编程与线性代数直觉的开发者，建立「大模型架构」的完整原理与工程知识体系。11 模块 / 51 阶段 / 111 课 / 10 capstone：先讲清 Transformer 本体（M1），再讲各家架构如何补短板（M2–M7），最后落到预训练/微调/对齐/部署工程闭环（M8–M11）。关键数字只认 A 级官方一手来源（arXiv abs 可达或官方仓库/博客），证据快照 2026-11-16。',
  sections: [
    {
      id: 'baseline',
      title: '0. 来源与证据纪律（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '课程代号', v: 'llm-arch-course · /courses/llm-arch' },
            { k: '课程结构', v: 'complex 4 层（Module → Stage → Lesson），renderMode: complex' },
            { k: '体量', v: '11 模块 / 51 阶段 / 111 课 / 10 capstone / 0 overview' },
            {
              k: '来源纪律',
              v: 'arXiv 号一律以官方 abs 页 WebFetch 核验为准；关键数字只认 A 级，B 级值（过训练 token/参数、商用 API 价、通用 KV 量化、多模态基准）显式标注第三方/随时间变动、不担关键结论',
            },
            {
              k: '证据台账',
              v: 'docs/00098-llm-arch-course/research/evidence/00-discipline.md（B1–B5 批次，含 9 处 arXiv 错号更正）',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '先原理、后架构、再实操',
          text: 'M1 把 Transformer 本体讲到原理层（注意力数学 → block → 归一化/位置 → 三范式）；M2–M7 讲各家如何补 Transformer 的某个短板（MoE→FFN 容量、SSM/线性→长序列内存、扩散→单向不可编辑、MLA/GQA→KV 存储）；M8–M11 落到预训练/微调/对齐/部署的工程闭环。',
        },
        {
          type: 'callout',
          tone: 'deep',
          title: '关键数字挂来源',
          text: 'MLA 的 KV 压缩比、DeepSeek-V3 专家数与路由、各家参数量/激活量，全部来自官方论文（A 级）。第三方复算值（如过训练 token/参数）只作背景、标注 B 级，不单独承担关键结论。',
        },
      ],
    },
    {
      id: 'goals',
      title: '1. 教学目标与受众',
      blocks: [
        {
          type: 'prose',
          text: '受众：熟悉 Python/PyTorch 基础、了解矩阵运算、对「大模型是怎么跑起来的」有工程直觉的开发者。不要求已掌握任何架构细节——M1 会从 2017 原文 block 讲起。',
        },
        {
          type: 'prose',
          text: '总目标：能从原理层讲清一个 decoder-only Transformer 的每一块；能解释各家架构（MoE/SSM/线性/扩散/MLA）在补哪个短板、省了什么；能跑通预训练/微调/对齐/部署的端到端工程闭环。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖范围'],
          rows: [
            ['L1 原理', 'Transformer 本体怎么工作？QKV/FFN/归一化/位置/范式', '模块一'],
            ['L2 架构演进', 'MoE/SSM/线性/扩散/MLA 各自补短板、省什么', '模块二 ~ 五'],
            ['L3 横评选型', '质量·成本·延迟·长上下文·可控性五维矩阵与可执行实验', '模块六'],
            ['L4 单模型深挖', 'DeepSeek 的 MLA/MoE/MTP/3D 并行/FP8/R1', '模块七'],
            ['L5 工程闭环', '预训练/微调/对齐/部署四个落地环节', '模块八 ~ 十一'],
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '2. 学习路径（11 模块 51 阶段 111 课）',
      intro: '下表由课程数据动态生成，新增课时会自动出现。',
      blocks: [{ type: 'lessons' }],
    },
    {
      id: 'capstone',
      title: '3. 十个 Capstone（工程验收锚点）',
      intro: 'capstone 按内容适配：可构建/可实测/可验证产出的模块才配，展示型 M5 不配。',
      blocks: [
        {
          type: 'list',
          items: [
            'M1 · 组装最小 decoder-only block（causal MHA + FFN + RMSNorm + RoPE + tokenizer），画架构谱系地图',
            'M2 · 实现 GQA attention block + 跑 vLLM 测 KV cache 与吞吐',
            'M3 · 手写 MoE 层（细粒度专家 + 共享专家 + top-k 路由 + 均衡）+ 跑 Mixtral 验证专家利用率',
            'M4 · 跑混合模型（Jamba/Mamba）+ 测 KV/吞吐 vs 纯 Transformer',
            'M6 · 固定 ~125M 跑四架构对比实验 + 写选型决策报告',
            'M7 · 复现 MLA 低秩 KV 压缩 + 解耦 RoPE，算 KV 缓存节省',
            'M8 · 从零 700M 预训练 + 多卡 ZeRO 冒烟',
            'M9 · 小数据集 LoRA 微调 + 过拟合曲线验收',
            'M10 · 偏好对数据集构建 + DPO 对齐端到端',
            'M11 · 从 LoRA 到可服务新模型端到端（merge→导出→起服务→压测）',
          ],
        },
      ],
    },
  ],
}
