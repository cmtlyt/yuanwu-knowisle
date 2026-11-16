# M1–M7 课程体量规划（可落 `app/data` 草稿）

> 交付物（00098）续：把 M1–M7（架构「是什么」）细化到**课时粒度**，字段口径与 `app/types/course.ts` + `app/data/course-builders.ts` 对齐，可直接映射 `stages.ts` 的 `Stage[]` 与 `lessons/lNN.ts` 的 `L(...)`。
> **本文件只规划体量与结构，不落地 `app/data`、不写正文**（定稿后另开任务用 course-builder 草稿管线生成）。
> 体量下限引自 `scripts/content-gate.mjs`（00055 口径）：theory 1200/400、framework 1500/1000、practice·scenario 1800/1500、capstone 3000/2500、overview 400/0。

## 用户拍板（2026-11-16，本轮）

1. **先补 M1–M7 体量规划**（此前只有 M8–M11）。
2. **预训练可以实操**：M8 不再只做「继续预训练」，加一节**从零小规模预训练**实操（125M–700M，多卡/ZeRO）。M8 部分见 `m8-m11-volume-plan.md` 更新。
3. **不加每模块导览**：全课 overview 课数 = **0**（不触发 8% 护栏）。
4. **capstone 按内容适配**：只有「能做综合交付 + 可执行验收断言」的模块才配 capstone；展示型/分析型不配。
   - 配 capstone：**M1 / M2 / M3 / M4 / M7**（均有可构建或可验证产出）。
   - 不配：**M5（扩散，展示型）**、**M6（选型，分析型，与 M11 衔接）**。
   - M8–M11（`m8-m11-volume-plan.md`）：M9 微调 / M11 打包为天然综合交付，保留 capstone；M8 预训练可实操后也配 capstone；M10 对齐配 capstone。

## 体量总账（M1–M7）

| 模块 | 阶段数 | 课时数 | capstone | 定位 |
|---|---|---|---|---|
| M1 自回归基线 | 4 | 9 | 1 | 地基：next-token / 位置 / 归一化 / 词表 |
| M2 注意力演进 | 4 | 10 | 1 | MHA→GQA + 高效注意力 + 推理系统 |
| M3 混合专家 MoE | 4 | 8 | 1 | 稀疏门控 / 路由均衡 / 并行 |
| M4 SSM 与混合 | 3 | 7 | 1 | Mamba / 线性注意力 / 混合架构 |
| M5 扩散 LLM | 2 | 3 | 0 | 第三条生成范式（展示型） |
| M6 横向对比与选型 | 3 | 3 | 0 | 能力/成本/延迟矩阵 + 成本建模（分析型） |
| M7 DeepSeek 专讲 | 5 | 8 | 1 | 单一模型架构创新深挖 |
| **合计** | **25** | **48** | 5 | 「架构是什么」前半段 |

> 全课（M1–M11）= 25 + 14 阶段；M1–M7 48 课时 + M8–M11 32 课时 ≈ **80 课时**（未落地前的规划口径；M8 因「预训练可实操」由 9 节扩至 10 节，见 `m8-m11-volume-plan.md`）。
> **id 口径**：M1–M7 采用 `M<mod>-L<nn>` 模块内序号作**暂定 id**，`prereqs` 填暂定 id；落地时与 M8–M11 一起重编为全课连续 `L01…`，`prereqs` 同步改写。
> **来源**：每课时挂 `S-*`（见 `../research/evidence/00-discipline.md`），关键数字只认 A 级。

---

## M1 自回归 Transformer 基线（module = 1）

### Stage 1.1 自回归范式与 decoder-only
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L01 | theory | 1 | [] | next-token | 4 | S-Llama2/Llama3 · A；Transformer arXiv:1706.03762 · A | 自回归「预测下一 token」目标；decoder-only vs encoder/enc-dec 取舍；现代 LLM 范式（RMSNorm+RoPE+大词表） |
| M1-L02 | practice | 2 | [M1-L01] | next-token-loss | 4 | S-Llama2 · A | 手写 next-token cross-entropy loss + 小语料冒烟，验证 loss 下降 |

### Stage 1.2 位置编码演进
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L03 | theory | 2 | [M1-L01] | rope | 4 | S-RoPE · A | 谱系绝对/正弦→可学习相对→RoPE 旋转；三大特性（相对感知/保范/无查表） |
| M1-L04 | practice | 3 | [M1-L03] | rope-impl | 4 | S-RoPE/S-YaRN · A | 手写 RoPE + 频率分带外推（NTK/YaRN/LongRoPE）冒烟，测长上下文 |
| M1-L05 | framework | 3 | [M1-L03] | alibi | 4 | S-ALiBi · A | ALiBi（logit 线性距离惩罚）vs RoPE 路线对照；免重训外推差异 |

### Stage 1.3 归一化与残差
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L06 | theory | 2 | [M1-L01] | rmsnorm | 4 | S-RMSNorm（1910.07467）· A | Pre/Post-Norm；RMSNorm 去 re-centering 只 re-scaling（省 7–64% 计算） |
| M1-L07 | practice | 3 | [M1-L06] | rmsnorm-impl | 4 | S-RMSNorm · A | 手写 RMSNorm + 与 LayerNorm 数值/稳定性对照 |

### Stage 1.4 Tokenizer 与词表
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L08 | framework | 3 | [M1-L01] | tokenizer | 4 | S-Llama3 · A（128K 词表） | BPE / byte-level；词表规模权衡（Llama2 32K→Llama3 128K）；多语言与 OOV |
| M1-L09 | capstone | 4 | [M1-L02,M1-L04,M1-L06,M1-L08] | capstone | 4 | S-Llama2/Llama3 · A | 从零组装一个最小 decoder-only 块（RMSNorm+RoPE+causal attention+FFN+tokenizer），可执行验收断言（next-token loss 收敛、单步前向正确） |

---

## M2 注意力机制演进（module = 2）

### Stage 2.1 多头到分组
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L10 | theory | 2 | [M1-L09] | mha-mqa | 4 | S-GQA · A；MQA Shazeer 2019 · A | MHA→MQA（全共享 KV，内存降 n_h 倍伤质量）→GQA（分组折中）谱系 |
| M2-L11 | framework | 3 | [M2-L10] | gqa-kv | 4 | S-GQA · A | MQA/GQA/MHA 的 KV cache 内存量对照 + 手写 GQA |
| M2-L12 | practice | 3 | [M2-L11] | gqa-uptrain | 4 | S-GQA · A | GQA uptrain（已有 MHA 模型 5% 算力 uptrain 成 GQA）冒烟 |

### Stage 2.2 窗口与长上下文
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L13 | practice | 3 | [M2-L10] | sliding-window | 4 | S-YaRN · A | sliding window / 局部注意力 + 上下文扩展手法（RoPE 缩放/YaRN） |

### Stage 2.3 高效注意力与推理系统
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L14 | theory | 3 | [M2-L10] | flash-attention | 4 | S-FA · A | FlashAttention（IO-aware，N×N 分数留 SRAM）；解 O(N²) 计算内存，不解 O(N) KV 存储 |
| M2-L15 | framework | 4 | [M2-L14] | fa-v1v2v3 | 4 | S-FA/S-FA3 · A | FA v1/v2/v3 演进对照（warp 级并行、FP8 等） |
| M2-L16 | scenario | 4 | [M2-L14] | paged-attn | 4 | S-vLLM/S-SGL · A | PagedAttention/vLLM（KV 当 OS 分页）+ SGLang RadixAttention 前缀共享 + chunked prefill 冒烟 |
| M2-L17 | practice | 4 | [M2-L16] | chunked-prefill | 4 | S-vLLM · A | chunked prefill 与 KV cache 分页调度实操 |

### Stage 2.4 线性与替代注意力
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L18 | framework | 4 | [M2-L14] | linear-attn | 4 | S-Hedgehog/S-xLSTM · A（细节 M4） | 线性注意力谱系（Hedgehog/Transformer Linear）与 SSM 边界；与 M4 衔接 |

### Stage 2.5 模块综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L19 | capstone | 4 | [M2-L11,M2-L16] | capstone | 4 | S-GQA/S-vLLM · A | 实现 GQA attention block + 跑 vLLM 测 KV cache 与吞吐，可执行验收断言（KV 内存随 GQA 组数下降、吞吐提升） |

---

## M3 混合专家 MoE（module = 3）

### Stage 3.1 原理与由来
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L20 | theory | 3 | [M1-L09] | spmoe | 4 | S-SGMoE · A | 稀疏门控源头 Shazeer 2017（FFN→专家库+门控，容量随内存非 FLOPs）；GShard/Switch/GLaM 谱系 |
| M3-L21 | framework | 3 | [M3-L20] | expert-parallel | 4 | S-GShard · A | 总参/激活参分离（GLaM「身份证号」）+ 专家并行概念对照 |

### Stage 3.2 路由与负载均衡
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L22 | theory | 3 | [M3-L20] | routing | 4 | S-SGMoE · A | top-k 门控流程（线性打分→top-k→门控加权和） |
| M3-L23 | framework | 4 | [M3-L22] | load-balance | 4 | S-GShard/S-Switch；expert-choice 2202.09368；S-DSV3 · A | aux-loss → expert-choice → aux-loss-free（router 偏置梯度调节）三法对照；Mixtral 专家按 token 类型分化反直觉点 |
| M3-L24 | practice | 4 | [M3-L22] | routing-impl | 4 | S-SGMoE · A | 手写 top-k 路由 + 负载均衡（辅助损失项）小模型冒烟 |

### Stage 3.3 并行与通信
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L25 | theory | 4 | [M3-L21] | ep-all2all | 4 | S-GShard；S-DSV3 · A | 专家并行（all-to-all 分发/回收）；EP×TP×PP×DP 组合成 3D/4D；容量因子 |

### Stage 3.4 代表模型与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L26 | framework | 4 | [M3-L20,M3-L25] | mixtral | 4 | S-Mixtral · A | Mixtral 8x7B（46.7B/12.9B，8 选 2，Apache-2.0）vs DeepSeek-V3 稀疏 MoE 对照 |
| M3-L27 | capstone | 4 | [M3-L24,M3-L26] | capstone | 4 | S-Mixtral · A | 手写 MoE 层（细粒度专家+共享专家+top-k 路由+均衡）+ 跑 Mixtral 验证专家利用率，可执行验收断言（专家负载均衡度、激活参数占比） |

---

## M4 状态空间与混合架构（module = 4）

### Stage 4.1 SSM 与 Mamba
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L28 | theory | 3 | [M1-L09] | ssm | 4 | S-Mamba（2312.00752）· A | 经典 SSM（S4）→ Mamba 选择性 SSM（Δ/B/C 随输入，线性复杂度、恒定推理内存） |
| M4-L29 | framework | 4 | [M4-L28] | mamba2-ssd | 4 | S-Mamba2 · A | Mamba-2 SSD（统一 SSM 与注意力，状态维 16→256，比 M1 快 2–8×）对照 |
| M4-L30 | practice | 4 | [M4-L28] | mamba-infer | 4 | S-Mamba · A | 跑 Mamba 推理 + 测恒等推理内存/吞吐 vs 同规模 Transformer |

### Stage 4.2 线性 Transformer 谱系
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L31 | framework | 4 | [M4-L28] | linear-ssm | 4 | S-Hedgehog（2402.04347）/S-xLSTM（2405.04517）· A | Hedgehog（可学习线性注意力）/ xLSTM（指数门控+矩阵记忆）/ RWKV 谱系对照 |

### Stage 4.3 混合架构与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L32 | theory | 4 | [M4-L28] | hybrid-arch | 4 | S-Jamba/S-Zamba/S-FalconH1 · A | 串行 vs 并行混合；「SSM + ~10% 全注意力」共识（少量注意力补远距离召回） |
| M4-L33 | framework | 4 | [M4-L32] | hybrid-compare | 4 | S-Jamba（2403.19887）/S-Zamba（2405.16712）/S-FalconH1（2507.22448）· A | Jamba（1:8 注意力）/ Zamba（单共享注意力）/ Falcon-H1（并行混合）架构对照 |
| M4-L34 | capstone | 4 | [M4-L30,M4-L33] | capstone | 4 | S-Jamba/S-Mamba · A | 跑一个混合模型（Jamba/Mamba）+ 测 KV cache/吞吐 vs 纯 Transformer，可执行验收断言（内存数量级、长上下文吞吐倍数） |

---

## M5 扩散 LLM（module = 5，展示型，不配 capstone）

### Stage 5.1 扩散式生成
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M5-L35 | theory | 3 | [M1-L09] | diffusion-llm | 4 | S-LLaDA · A | 离散/掩码扩散（吸收态≈随机比例掩码广义 MLM）；前向掩码+反向去噪；去因果双向 Transformer |
| M5-L36 | scenario | 4 | [M5-L35] | llada-run | 4 | S-LLaDA · A | 跑 LLaDA-8B（2.3T token）+ 对照 reversal curse 缓解、与 LLaMA3 8B ICL 对比 |

### Stage 5.2 代表模型
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M5-L37 | framework | 3 | [M5-L35] | llada-lineage | 4 | S-LLaDA · A；Mercury C 级仅背景 | LLaDA 谱系（1.5/LLaDA-V/LLaDA-MoE/2.0）+ 商用对照（C 级，只作背景） |

---

## M6 横向对比与选型（module = 6，分析型，不配 capstone，与 M11 衔接）

### Stage 6.1 能力/成本/延迟矩阵
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L38 | framework | 3 | [M2-L19,M3-L27,M4-L34] | compare-matrix | 4 | 各模块 A 级；成本挂 S-DSV3（2.788M H800 时）· A | 自回归/MoE/SSM/扩散在质量·训练成本·推理延迟·长上下文·可控性五维矩阵 |

### Stage 6.2 选型判据
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L39 | scenario | 3 | [M6-L38] | selection | 4 | 综合各模块 A 级 | 给定预算/延迟/上下文约束做架构选型决策（MoE/SSM/扩散判据） |

### Stage 6.3 推理成本建模
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L40 | framework | 4 | [M6-L38] | cost-model | 4 | S-DSV3（671B/37B）· A | 总参 vs 激活参（FLOPs 由激活参数决定）；长上下文 KV 成本线性增长；与 M11 部署衔接 |

---

## M7 DeepSeek 专讲（module = 7）

### Stage 7.1 谱系与开源生态
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L41 | theory | 3 | [M3-L20] | ds-lineage | 4 | S-DSV2/S-DSV3 · A；deepseek-ai/* 仓库 | DeepSeek 67B→V2(MLA)→V3(MTP+无辅助均衡)→R1(RL 推理)；开放权重与许可证 |

### Stage 7.2 Multi-head Latent Attention
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L42 | theory | 4 | [M7-L41,M2-L10] | mla | 4 | S-DSV2 · A | MLA：KV 联合低秩压缩到 c_KV（d_c≪2·n_h·d_h），生成再上投影；减 KV 93.3%、吞吐 5.76× |
| M7-L43 | framework | 4 | [M7-L42] | decoupled-rope | 4 | S-RoPE+S-DSV2 · A | 解耦 RoPE（K 拆未旋转内容+小旋转 k^R）vs 标准 RoPE；保住 KV 压缩又保相对位置精度 |

### Stage 7.3 稀疏 MoE（DeepSeekMoE）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L44 | framework | 4 | [M7-L41,M3-L23] | deepseekmoe | 4 | S-DSM/S-DSV3 · A | 细粒度专家细分 + 共享专家隔离；aux-loss-free（router 偏置梯度调节） |

### Stage 7.4 MTP / 3D 并行 / FP8
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L45 | theory | 4 | [M7-L41] | mtp | 4 | S-DSV3 · A | MTP（预测 k 个未来 token 需 k−1 个 MTP 模块）+ 推理时推测解码 |
| M7-L46 | framework | 4 | [M7-L45,M3-L25] | ds-parallel-fp8 | 4 | S-DSV3 · A | 3D 并行（DP+TP+PP）+ DualPipe 计算-通信重叠 + 跨节点 all-to-all + FP8 混合精度训练对照 |

### Stage 7.5 其他创新核实与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L47 | framework | 3 | [M7-L41] | mfformer-verdict | 4 | `B1-09`（C 级定论） | mFformer 定论（无官方来源，疑似混淆 MLA/MTP/DeepSeekMoE）+ 真实 vs 误记逐项核实表 |
| M7-L48 | capstone | 5 | [M7-L42,M7-L44,M7-L45] | capstone | 4 | S-DSV2/DSV3 · A | 复现 MLA 低秩 KV 压缩 + 解耦 RoPE + 算 KV 缓存节省，可执行验收断言（压缩比≈93.3%、KV 字节数下降核算） |

---

## 映射到数据模型的字段约定（落地时照此写 `L(...)`，与 M8–M11 一致）

- 每课时一文件 `lessons/lNN.ts`：`export const LNN = withKind(L('LNN', <stageId>, '<title>', <difficulty>, <prereqs>, <concepts>, <goals4条>, \`<md>\`, <widget|null>, <quiz4>, <terms>, <pitfalls>), '<kind>', [reason?])`。
- 渲染模式 **complex**（多模块 4 层结构）：课程数据提供 `MODULES: Module[]`（M1…M11）+ 每 Stage `module` 字段 + `renderMode: 'complex'`（见 `app/types/course.ts`）。
- `goals` 恒 4 条；`quiz` 恒 4 题；`terms` ≥4 组；`pitfalls` ≥3 条；`md` 按「正文目标」+ 体量下限扩写。
- **全课无 overview 课**（用户拍板），故不触发 8% 导览护栏；M1–M7 的 5 个 capstone 落在 M1/M2/M3/M4/M7 末节。
- 关键数字（参数量、激活量、KV 压缩比、top-k、专家数、token/参数）**只认 A 级来源**（挂 S-*）；「过训练 token/参数」「QLoRA 数据集比较」「量化档位」等 B 级值须标注「第三方复算/待官方核实」，不单独承担关键结论（沿 `00-discipline.md` 纪律）。
- 注册：新课程在 `app/data/courses.ts` 追加一项（独立 `storageKey` + `data`）。

## 落地前待确认（剩余，非阻塞）

- 全课连续编号 `L01…`：M1–M7（48）+ M8–M11（32）= 80 课时，需按模块顺序重排并统一 `prereqs`。
- M5/M6 无 capstone 是否与「完整覆盖」冲突：已按内容适配判定（展示/分析型不配），如需补齐可把 M5 末节升 scenario、M6 末节升 framework（已是）。
- 正文生成方式**已拍板**（2026-11-16）：用 course-builder 草稿管线 `gen-course.mjs` 批量生成后 `pnpm fmt`，不逐课手写。
