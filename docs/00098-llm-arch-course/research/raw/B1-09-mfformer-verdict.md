# B1-09 · mFformer 定论（精确核实）

- 工具：WebSearch
- 查询：`"mFformer" OR "mTransformer" DeepSeek architecture`
- 核实日期：2026-11-16
- 可信级别提示：本条为**定论记录**，非事实来源

## 结论

**mFformer 在 DeepSeek 官方体系（V1/V2/V3/R1 论文、官方仓库）中不存在，判定为误记 / 混淆词，可信级别 C（仅作背景提及，不担关键结论）。**

- 即便精确引号搜索 `"mFformer"`，命中 5 条**无一条**出现该命名，且无一条指向 DeepSeek 官方论文或仓库。
- 各第三方文章反复把 DeepSeek 创新归为固定的四个真实概念：**MLA（多头潜在注意力）/ DeepSeekMoE / RoPE / MTP（多 Token 预测）**。

## 最可能的真实对应（课程 DeepSeek 模块应讲这些，不造 mFformer）

| 误记候选 | 真实概念 | 首次提出 | 一手来源 |
|---|---|---|---|
| mFformer → | MLA | DeepSeek-V2 | arXiv:2405.04434 |
| mFformer → | MTP（Multi-Token Prediction） | DeepSeek-V3 | arXiv:2412.19437 |
| mFformer → | DeepSeekMoE | V2/V3 | arXiv:2401.06066 / 2405.04434 |
| （Mamba 混淆） | Mamba-2 SSD | 非 DeepSeek | state-spaces/mamba |

## 附：B 级旁证（路由数字，最终以 V3 论文为准）

- haimagazine（C 级转述）称 DeepSeek-V3「58 个 MoE 层（前 3 层除外），每层选 9 专家 = 1 共享 + 8 专项；专家 7168→2048→7168」。与官方「256 routed + 1 shared、top-8」一致方向，但**数值以 arXiv:2412.19437 为准**，此条不单独承担结论。

## 课程处理建议

- 大纲 DeepSeek 模块**不列 mFformer**；在「其他创新核实」小节如实写：「mFformer 经检索无官方来源，疑为 MLA / MTP / DeepSeekMoE 之一的误记」，并挂本台账。
