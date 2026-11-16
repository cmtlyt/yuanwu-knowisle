import type { Module } from '~/types/course'

/* ---------------- 模块（复杂模式顶层分组）：M1–M11 ---------------- */
export const MODULES: Module[] = [
  {
    id: 1,
    name: '架构原理深挖（Transformer 本体）',
    en: 'Architecture Principles',
    summary:
      '把「Transformer 本身怎么工作」讲到原理层：2017 原文 block、QKV 注意力数学、多头、FFN、归一化、位置编码、三范式与现代配方，末节画「架构谱系地图」指向 M2–M5。',
    color: '#4b6fe0',
    goal: '能从原理层讲清一个 decoder-only Transformer 的每一块，并画出其他架构在补哪个短板',
  },
  {
    id: 2,
    name: '注意力机制演进',
    en: 'Attention Evolution',
    summary:
      'MHA→MQA→GQA、窗口与长上下文、FlashAttention/PagedAttention 高效注意力与推理系统、KV 量化、线性与替代注意力谱系。',
    color: '#3fb984',
    goal: '能按吞吐/内存/上下文在 GQA、FlashAttention、PagedAttention、线性注意力间做有依据的取舍',
  },
  {
    id: 3,
    name: '混合专家 MoE',
    en: 'Mixture of Experts',
    summary:
      '稀疏门控由来、路由与负载均衡（aux-loss / expert-choice / aux-loss-free）、专家并行与 all-to-all、代表模型 Mixtral/DSV3、坍缩诊断、共享专家、训练实操。',
    color: '#e8a33d',
    goal: '能讲清「总参 vs 激活参」，写出可跑 MoE 层并诊断专家坍缩',
  },
  {
    id: 4,
    name: '状态空间与混合架构',
    en: 'SSM & Hybrid',
    summary:
      'Mamba 选择性 SSM（含训练实操）、线性注意力原理深挖（Performer/GLA/DeltaNet/RWKV/RetNet/Hyena 状态数学）、混合架构（Jamba/Zamba/Falcon-H1/Hymba/Granite 4.0 并行 vs 串联）。',
    color: '#a878e6',
    goal: '能讲透各家「状态怎么更新、为什么线性、省了什么」，并对照并行/串联混合',
  },
  {
    id: 5,
    name: '扩散 LLM',
    en: 'Diffusion LLM',
    summary:
      '第三条生成范式：离散/掩码扩散 vs 自回归、LLaDA 代表、SEDD 离散扩散理论、Dream 7B、局部编辑/可控生成（展示型，不配 capstone）。',
    color: '#e46a70',
    goal: '能对比扩散式生成与自回归的取舍，并理解可控性优势',
  },
  {
    id: 6,
    name: '横向对比与选型（综合交付）',
    en: 'Comparison & Selection',
    summary:
      '五维矩阵 + 选型判据 + 推理成本建模 + 可执行对比实验（同规模 ~125M 四架构实测吞吐·KV·困惑度）+ 选型报告 capstone + 商用成本 + 多模态/长上下文基准。',
    color: '#38a9c4',
    goal: '能对真实需求给出量化依据的架构选型决策报告',
  },
  {
    id: 7,
    name: 'DeepSeek 专讲',
    en: 'DeepSeek',
    summary:
      '单一模型架构创新深挖：谱系与开源生态、MLA 低秩 KV 压缩、解耦 RoPE、DeepSeekMoE 细粒度专家、MTP、3D 并行/FP8/DualPipe、R1 推理链、mFformer 真实性核实。',
    color: '#c0392b',
    goal: '能逐项讲清 DeepSeek 的架构创新并算出 KV 压缩收益',
  },
  {
    id: 8,
    name: '预训练',
    en: 'Pre-training',
    summary:
      'next-token 目标与数据配比、语料清洗管线、Scaling Law 与算力取舍、从零小规模预训练实操（125M 单卡冒烟 + 700M 多卡 ZeRO capstone）、继续/领域预训练、能力探针与涌现。',
    color: '#1abc9c',
    goal: '能跑通一个最小可跑的预训练闭环并按 Chinchilla 边界规划算力',
  },
  {
    id: 9,
    name: '微调',
    en: 'Fine-tuning',
    summary:
      '全参 vs 参数高效微调、PEFT 谱系、LoRA/QLoRA/DoRA/GaLore 机制与选型、HF 三件套实操、多适配器、过拟合与数据量、指令数据构造、全参 SFT 对照。',
    color: '#2ecc71',
    goal: '能在单卡做 LoRA SFT 端到端并做显存/质量/数据量对照',
  },
  {
    id: 10,
    name: '后训练 / 对齐',
    en: 'Alignment',
    summary:
      'RLHF（InstructGPT 三阶段 + 对齐税）、DPO、GRPO + RLAIF、DPO 变体 IPO/KTO、安全对齐/越狱/红队、trl 实操 + DPO capstone。',
    color: '#f39c12',
    goal: '能用 trl 完成偏好对齐端到端并守住安全边界',
  },
  {
    id: 11,
    name: '参数打包与部署',
    en: 'Packaging & Deployment',
    summary:
      '权重合并与保存、GGUF/ONNX/TensorRT 导出、推理侧量化（GPTQ/AWQ/FP8）、vLLM/SGLang 服务化、多节点吞吐调优、从 LoRA 到可服务模型端到端 capstone。',
    color: '#8e44ad',
    goal: '能把模型打包、量化并起服务，做可复现的吞吐压测',
  },
]
