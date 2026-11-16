# M1–M7 课程体量规划（可落 `app/data` 草稿）

> 交付物（00098）续：把 M1–M7（架构「是什么」）细化到**课时粒度**，字段口径与 `app/types/course.ts` + `app/data/course-builders.ts` 对齐，可直接映射 `stages.ts` 的 `Stage[]` 与 `lessons/lNN.ts` 的 `L(...)`。
> **本文件只规划体量与结构，不落地 `app/data`、不写正文**（定稿后另开任务用 course-builder 草稿管线生成）。
> 体量下限引自 `scripts/content-gate.mjs`（00055 口径）：theory 1200/400、framework 1500/1000、practice·scenario 1800/1500、capstone 3000/2500、overview 400/0。

## 用户拍板（2026-11-16，本轮）

1. **先补 M1–M7 体量规划**（此前只有 M8–M11）。
2. **预训练可以实操**：M8 不再只做「继续预训练」，加一节**从零小规模预训练**实操（125M–700M，多卡/ZeRO）。M8 部分见 `m8-m11-volume-plan.md` 更新。
3. **不加每模块导览**：全课 overview 课数 = **0**（不触发 8% 护栏）。
4. **capstone 按内容适配**：只有「能做综合交付 + 可执行验收断言」的模块才配 capstone；展示型不配。
   - 配 capstone：**M1 / M2 / M3 / M4 / M6 / M7**（均有可构建、可实测或可验证产出；M6 升级为综合交付后配 capstone）。
   - 不配：**M5（扩散，展示型）**。
   - M8–M11（`m8-m11-volume-plan.md`）：M9 微调 / M11 打包为天然综合交付，保留 capstone；M8 预训练可实操后也配 capstone；M10 对齐配 capstone。
5. **M1 重写为「架构原理深挖」**（用户 2026-11-16）：把 Transformer 本体讲到**原理层**（2017 原文 block / QKV 注意力数学 / 多头 / FFN / 残差 / 归一化 / 位置编码 / 三范式 / 现代配方），末节加「架构谱系地图」（其他架构 = 解决 Transformer 某弱点，指向 M2–M5）。M1 由 4 阶段/9 课 → **5 阶段/11 课**，引入 A 级来源 `S-Transformer17`（arXiv:1706.03762）。
6. **M6 升级为综合交付模块**（用户 2026-11-16）：在原 五维矩阵/选型/成本建模 之上加 **Stage 6.4 可执行对比实验**（同规模 ~125M 实测四架构 吞吐·KV·困惑度）+ **选型报告 capstone**。M6 由 3 阶段/3 课/0 capstone → **5 阶段/5 课/1 capstone**。
7. **暂定 id 按模块内序号**（用户 2026-11-16）：每模块 `M<mod>-L<nn>` 从 L01 起（M1 11 / M2 10 / M3 8 / M4 7 / M5 3 / M6 5 / M7 8 / M8 10 / M9 10 / M10 7 / M11 5），与 M8–M11 同口径；落地时再重编全课连续 `L01…`（≈84）。
8. **补全 33 缺口（用户 2026-11-16「全部都补全」+ B5 来源核验批次）**：在 84 课基础上**追加 27 节新课**（各模块「未成课/点到名/缺实操」类缺口成课；「待补 A 级/仅背景/误记」类只做来源升级或交叉引用，不新增课），并**把 Mamba/RWKV/RetNet/Hyena/GLA/DeltaNet/Performer 讲到原理层**（M4 S2 状态数学 + 谱系）。追加课时**按模块尾部顺延 id**（M1-L12… 等），不重排既有 id，落地时随全课一起重编。全课 84 → **111 课 / 43 阶段 / 10 capstone / 0 overview**。新增课来源全部挂 B5 批次已核验的 A 级 `S-*`（见 `course-outline.md`「已升级 A 级来源 B5 批次」）。

## 体量总账（M1–M7）

| 模块 | 阶段数 | 课时数 | capstone | 定位 |
|---|---|---|---|---|
| M1 架构原理深挖（Transformer 本体） | 5 | 11 (+3) | 1 | 原理层：注意力数学/block/FFN/归一化/位置/范式 + 架构谱系地图（指向 M2–M5） |
| M2 注意力演进 | 4 | 10 (+2) | 1 | MHA→GQA + 高效注意力 + 推理系统 + KV 量化 + 线性谱系 A 级 |
| M3 混合专家 MoE | 4 | 8 (+3) | 1 | 稀疏门控 / 路由均衡 / 并行 / 坍缩诊断 / 共享专家 / 训练实操 |
| M4 SSM 与混合 | 3 | 7 (+4) | 1 | Mamba（含训练实操）/ 线性注意力**原理深挖**（Performer/GLA/DeltaNet/RWKV/RetNet/Hyena）/ 混合（含 Hymba、Granite 4.0） |
| M5 扩散 LLM | 2 | 3 (+3) | 0 | 第三条生成范式（展示型）+ SEDD 理论 + Dream + 局部编辑 |
| M6 横向对比与选型（综合交付） | 5 | 5 (+2) | 1 | 五维矩阵 + 可执行对比实验 + 选型报告 capstone + 商用成本 + 多模态/长上下文基准 |
| M7 DeepSeek 专讲 | 6 | 8 (+2) | 1 | 单一模型架构创新深挖 + DualPipe 细节 + R1 推理链（RL 强化推理） |
| **合计** | **29** | **52 (+19)** | 6 | 「架构是什么」前半段 |

> **缺口补全后全课（M1–M11）**：M1–M7 = 71 课时 / 29 阶段 / 6 capstone（在原 52 课基础上追加 19 节，见下方「追加课」清单）；M8–M11 = 40 课时 / 14 阶段 / 4 capstone（原 32 课追加 8 节，见 `m8-m11-volume-plan.md`）。**全课 ≈ 111 课 / 43 阶段 / 10 capstone / 0 overview**。
> **口径说明**：追加课**按模块尾部顺延 id**（M1-L12… 等），不重排既有 id；落地时随全课一起重编连续 `L01…`。「+n」为该模块因补 33 缺口新增的课时数；「待补 A 级/仅背景/误记」类缺口（M2-a、M4 部分、M5-d、M7-b、M8-a/b、M11-a）只做来源升级或交叉引用，不新增课。
> **id 口径**：M1–M7 采用 `M<mod>-L<nn>` 模块内序号作**暂定 id**，`prereqs` 填暂定 id；落地时与 M8–M11 一起重编为全课连续 `L01…`，`prereqs` 同步改写。
> **来源**：每课时挂 `S-*`（见 `../research/evidence/00-discipline.md`），关键数字只认 A 级。

---

## M1 架构原理深挖（Transformer 本体）（module = 1）

> 本模块把「Transformer 本身怎么工作」讲到**原理层**；末节 `M1-L11` capstone 收口画「架构谱系地图」（其他架构 = 解决 Transformer 某弱点，指向 M2–M5）。来源 `S-Transformer17`（arXiv:1706.03762）· A。

### Stage 1.1 2017 Transformer 原文与自回归目标
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L01 | theory | 2 | [] | block-arch | 4 | S-Transformer17 · A | 2017 Transformer 原文 block 结构（自注意力+FFN+残差+LN）；「注意力即基础」思想；encoder/decoder 子层差异 |
| M1-L02 | theory | 2 | [M1-L01] | autoreg-paradigm | 4 | S-Llama2/S-Llama3 · A | 自回归 next-token 目标；三范式定位（encoder BERT / enc-dec T5 / decoder-only LLM）；为何 LLM 选 decoder-only |
| M1-L03 | practice | 2 | [M1-L02] | next-token-loss | 4 | S-Llama2 · A | 手写 next-token cross-entropy loss + 小语料冒烟，验证 loss 下降 |

### Stage 1.2 注意力机制原理（QKV → 多头）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L04 | theory | 3 | [M1-L01] | qkv-attention | 4 | S-Transformer17 · A | QKV 数学 `softmax(QKᵀ/√d_k)V`；缩放因子防饱和；因果掩码保证自回归；单 token FLOPs ≈ `4d²+2n_hd_hN²` |
| M1-L05 | framework | 3 | [M1-L04] | multi-head | 4 | S-GQA/MQA · A | MHA→MQA（全共享 KV，省内存伤质量）→GQA（分组折中）谱系；`n_h×d_h=d_model`；KV cache 内存量对照 |
| M1-L06 | practice | 3 | [M1-L04,M1-L05] | mha-impl | 4 | S-Transformer17 · A | 手写 MHA（QKV 投影+缩放+因果 mask）验证注意力权重相对感知/保范；与 M2 衔接 |

### Stage 1.3 现代 LLM 的 Block 结构（FFN + 归一化 + 残差）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L07 | theory | 3 | [M1-L01] | ffn | 4 | S-Transformer17/S-Llama3 · A | FFN 是 block 大头：SwiGLU/中间维度 8/3·d_model；参数占比常 2/3+（M3 MoE 的改造目标） |
| M1-L08 | framework | 3 | [M1-L07] | norm-residual | 4 | S-RMSNorm · A | 残差连接 + Pre/Post-Norm；RMSNorm 去 re-centering 只 re-scaling（省 7–64% 计算，Llama 标配） |
| M1-L09 | practice | 3 | [M1-L08] | rmsnorm-impl | 4 | S-RMSNorm · A | 手写 RMSNorm + 与 LayerNorm 数值/稳定性对照 |

### Stage 1.4 位置编码演进
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L10 | framework | 3 | [M1-L04] | positional-enc | 4 | S-RoPE/S-YaRN/S-ALiBi · A | 谱系 绝对/正弦→可学习相对→RoPE（相对感知/保范/无查表）；NTK/YaRN/LongRoPE 外推；ALiBi（logit 线性距离惩罚）对照；手写 RoPE 冒烟 |

### Stage 1.5 Tokenizer/词表 + 架构谱系地图（收口）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L11 | capstone | 4 | [M1-L03,M1-L06,M1-L09,M1-L10] | capstone | 4 | S-Transformer17/S-Llama3 · A | 组装最小 decoder-only block（causal MHA+FFN+RMSNorm+RoPE+tokenizer）+ 画「架构谱系地图」（其他架构=解决 Transformer 某弱点，指向 M2–M5）；可执行验收断言（next-token loss 收敛、单步前向正确） |

### Stage 1.6 缺口补全课（M1-a/b/c，B5 批次追加）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M1-L12 | theory | 2 | [M1-L02] | paradigm-compare | 4 | S-BERT（1810.04805）/S-T5（**1910.10683**，非 1910.13461=BART）· A | 三范式对照（encoder BERT 双向 / enc-dec T5 text-to-text / decoder-only LLM）：双向性·生成目标·适用任务·代表模型；为何 LLM 弃 enc/enc-dec（补 M1-a） |
| M1-L13 | theory | 3 | [M1-L04,M1-L12] | gen-kv-reuse | 4 | S-Transformer17 · A | 训练并行 vs 推理逐 token 自回归；为何已生成 token 的 K/V 缓存复用（免每 token O(N) 重算）——M2 高效注意力/PagedAttention 的动机（补 M1-b） |
| M1-L14 | theory | 3 | [M1-L07] | swiglu-ffn | 4 | S-Llama3 · A | SwiGLU 门控 FFN：`down(Swish(xW_gate)⊙(xW_up))` vs 单路 GELU；参数量 +1 路但同参更低的困惑度、门控选择性放大/抑制（补 M1-c） |

---

## M2 注意力机制演进（module = 2）

### Stage 2.1 多头到分组
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L01 | theory | 2 | [M1-L11] | mha-mqa | 4 | S-GQA · A；MQA Shazeer 2019 · A | MHA→MQA（全共享 KV，内存降 n_h 倍伤质量）→GQA（分组折中）谱系 |
| M2-L02 | framework | 3 | [M2-L01] | gqa-kv | 4 | S-GQA · A | MQA/GQA/MHA 的 KV cache 内存量对照 + 手写 GQA |
| M2-L03 | practice | 3 | [M2-L02] | gqa-uptrain | 4 | S-GQA · A | GQA uptrain（已有 MHA 模型 5% 算力 uptrain 成 GQA）冒烟 |

### Stage 2.2 窗口与长上下文
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L04 | practice | 3 | [M2-L01] | sliding-window | 4 | S-YaRN · A | sliding window / 局部注意力 + 上下文扩展手法（RoPE 缩放/YaRN） |

### Stage 2.3 高效注意力与推理系统
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L05 | theory | 3 | [M2-L01] | flash-attention | 4 | S-FA · A | FlashAttention（IO-aware，N×N 分数留 SRAM）；解 O(N²) 计算内存，不解 O(N) KV 存储 |
| M2-L06 | framework | 4 | [M2-L05] | fa-v1v2v3 | 4 | S-FA/S-FA3 · A | FA v1/v2/v3 演进对照（warp 级并行、FP8 等） |
| M2-L07 | scenario | 4 | [M2-L05] | paged-attn | 4 | S-vLLM/S-SGL · A | PagedAttention/vLLM（KV 当 OS 分页）+ SGLang RadixAttention 前缀共享 + chunked prefill 冒烟 |
| M2-L08 | practice | 4 | [M2-L07] | chunked-prefill | 4 | S-vLLM · A | chunked prefill 与 KV cache 分页调度实操 |

### Stage 2.4 线性与替代注意力
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L09 | framework | 4 | [M2-L05] | linear-attn | 4 | S-Hedgehog/S-xLSTM · A（细节 M4） | 线性注意力谱系（Hedgehog/Transformer Linear）与 SSM 边界；与 M4 衔接 |

### Stage 2.5 模块综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L10 | capstone | 4 | [M2-L02,M2-L07] | capstone | 4 | S-GQA/S-vLLM · A | 实现 GQA attention block + 跑 vLLM 测 KV cache 与吞吐，可执行验收断言（KV 内存随 GQA 组数下降、吞吐提升） |

### Stage 2.6 缺口补全课（M2-b/c，M2-a/d 为来源升级+交叉引用）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M2-L11 | practice | 4 | [M2-L05,M2-L06] | fa-bench | 4 | S-FA/S-FA3 · A + HF 生态 · A | FlashAttention 前后实测冒烟：同模型开/关 FA 的吞吐（token/s）+ 峰值显存（4K/16K）；验证 IO-aware 收益，可复现脚本（与 M6 Stage 6.4 复用）（补 M2-c） |
| M2-L12 | theory | 4 | [M2-L08,M2-L11] | kv-quant | 4 | S-FA3（2407.08608，FP8）· A；通用 KV 量化 B 级（待官方章节） | KV cache INT8/FP8 量化：权重/激活/KV 三类区分、长上下文显存↓吞吐↑、精度代价实测（挂 M11 量化主题）（补 M2-b） |

> **M2-a（线性注意力 A 级）** 与 **M2-d（与 M4 分工）**：Stage 2.4 的 M2-L09 已挂 A 级来源并**升级**——把「Hedgehog/Transformer Linear 待补官方」替换为 `S-Performer（arXiv:2009.14794）· A`，并明确「M2 讲谱系+为什么线性化，M4 S2 讲状态数学落地」的分工（不新增课，改 M2-L09 来源口径即可）。

---

## M3 混合专家 MoE（module = 3）

### Stage 3.1 原理与由来
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L01 | theory | 3 | [M1-L11] | spmoe | 4 | S-SGMoE · A | 稀疏门控源头 Shazeer 2017（FFN→专家库+门控，容量随内存非 FLOPs）；GShard/Switch/GLaM 谱系 |
| M3-L02 | framework | 3 | [M3-L01] | expert-parallel | 4 | S-GShard · A | 总参/激活参分离（GLaM「身份证号」）+ 专家并行概念对照 |

### Stage 3.2 路由与负载均衡
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L03 | theory | 3 | [M3-L01] | routing | 4 | S-SGMoE · A | top-k 门控流程（线性打分→top-k→门控加权和） |
| M3-L04 | framework | 4 | [M3-L03] | load-balance | 4 | S-GShard/S-Switch；expert-choice 2202.09368；S-DSV3 · A | aux-loss → expert-choice → aux-loss-free（router 偏置梯度调节）三法对照；Mixtral 专家按 token 类型分化反直觉点 |
| M3-L05 | practice | 4 | [M3-L03] | routing-impl | 4 | S-SGMoE · A | 手写 top-k 路由 + 负载均衡（辅助损失项）小模型冒烟 |

### Stage 3.3 并行与通信
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L06 | theory | 4 | [M3-L02] | ep-all2all | 4 | S-GShard；S-DSV3 · A | 专家并行（all-to-all 分发/回收）；EP×TP×PP×DP 组合成 3D/4D；容量因子 |

### Stage 3.4 代表模型与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L07 | framework | 4 | [M3-L01,M3-L06] | mixtral | 4 | S-Mixtral · A | Mixtral 8x7B（46.7B/12.9B，8 选 2，Apache-2.0）vs DeepSeek-V3 稀疏 MoE 对照 |
| M3-L08 | capstone | 4 | [M3-L05,M3-L07] | capstone | 4 | S-Mixtral · A | 手写 MoE 层（细粒度专家+共享专家+top-k 路由+均衡）+ 跑 Mixtral 验证专家利用率，可执行验收断言（专家负载均衡度、激活参数占比） |

### Stage 3.5 缺口补全课（M3-a/b/c，B5 批次追加）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M3-L09 | framework | 4 | [M3-L04] | expert-collapse | 4 | S-SGMoE/S-GShard（容量/溢出）；S-DSV3（aux-loss-free）· A | 专家坍缩/路由失败模式：利用率尖锐、路由熵塌缩、aux-loss 抬升等诊断信号 + 旋钮（容量因子 / expert-choice / aux-loss-free）（补 M3-a） |
| M3-L10 | theory | 3 | [M3-L01,M3-L07] | shared-expert | 4 | S-Mixtral/S-DSM/S-DSV3 · A | 共享专家机制：top-k 路由外 1 个所有 token 必过的共享专家（承接通用/高频特征，卸压路由）；Mixtral/DSV3 的共享专家设计（补 M3-b） |
| M3-L11 | practice | 4 | [M3-L05,M3-L09] | moe-train | 4 | S-Mixtral · A + HF 生态 · A | 小 MoE 完整训练冒烟（非仅手写路由）：观测专家利用率均衡直方图、激活参占比核对、推理速度 vs 同激活 dense（可复现脚本，与 M6 复用）（补 M3-c） |

---

## M4 状态空间与混合架构（module = 4）

### Stage 4.1 SSM 与 Mamba
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L01 | theory | 3 | [M1-L11] | ssm | 4 | S-Mamba（2312.00752）· A | 经典 SSM（S4）→ Mamba 选择性 SSM（Δ/B/C 随输入，线性复杂度、恒定推理内存） |
| M4-L02 | framework | 4 | [M4-L01] | mamba2-ssd | 4 | S-Mamba2 · A | Mamba-2 SSD（统一 SSM 与注意力，状态维 16→256，比 M1 快 2–8×）对照 |
| M4-L03 | practice | 4 | [M4-L01] | mamba-infer | 4 | S-Mamba · A | 跑 Mamba 推理 + 测恒等推理内存/吞吐 vs 同规模 Transformer |

### Stage 4.2 线性 Transformer 谱系
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L04 | framework | 4 | [M4-L01] | linear-ssm | 4 | S-Hedgehog（2402.04347）/S-xLSTM（2405.04517）· A | Hedgehog（可学习线性注意力）/ xLSTM（指数门控+矩阵记忆）/ RWKV 谱系对照 |

### Stage 4.3 混合架构与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L05 | theory | 4 | [M4-L01] | hybrid-arch | 4 | S-Jamba/S-Zamba/S-FalconH1 · A | 串行 vs 并行混合；「SSM + ~10% 全注意力」共识（少量注意力补远距离召回） |
| M4-L06 | framework | 4 | [M4-L05] | hybrid-compare | 4 | S-Jamba（2403.19887）/S-Zamba（2405.16712）/S-FalconH1（2507.22448）· A | Jamba（1:8 注意力）/ Zamba（单共享注意力）/ Falcon-H1（并行混合）架构对照 |
| M4-L07 | capstone | 4 | [M4-L03,M4-L06] | capstone | 4 | S-Jamba/S-Mamba · A | 跑一个混合模型（Jamba/Mamba）+ 测 KV cache/吞吐 vs 纯 Transformer，可执行验收断言（内存数量级、长上下文吞吐倍数） |

### Stage 4.4 缺口补全 + 架构原理深挖（M4-a/b/c，B5 批次追加）
> 用户特别要求：**Mamba/RWKV/RetNet/Hyena 等架构要讲到原理层**。L09/L10 把「状态怎么更新、为什么线性、能省什么」逐家讲透，不止点名。
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M4-L08 | practice | 4 | [M4-L01,M4-L03] | mamba-train | 4 | S-Mamba · A + 官方仓库 · A | 小 Mamba **训练**冒烟（非仅推理）：吞吐 + KV/显存曲线 vs 同规模 Transformer，验证「O(1) 推理内存 / O(L) 并行扫描」在训练/推理两侧的差异（补 M4-c） |
| M4-L09 | framework | 4 | [M4-L01,M4-L04] | linear-rnn-principle | 4 | S-RWKV（**2305.13048**，非 2309.05465）/S-RetNet（2307.08621）/S-Performer（**2009.14794**，非 2009.13529）· A | **原理深挖**：RWKV（channel-directed 线性注意力、时间衰减数据无关→并行训练+恒定推理）/ RetNet（retention 三范式：并行/循环 O(1) 推理/分块）/ Performer（FAVOR+ 随机特征核化 `Y≈Φ(Q)(Φ(K)ᵀV)` 免 N×N）——逐家「状态更新公式 + 为什么线性」（补 M4-b） |
| M4-L10 | framework | 4 | [M4-L09] | gated-conv-principle | 4 | S-GLA（2312.06635）/S-DeltaNet（**2406.06484**，非 2406.07271）/S-Hyena（**2302.10866**，非 2402.06416）· A | **原理深挖**：GLA（数据门控 ᾱ_t 线性注意力 + FlashLinearAttention 分块）/ DeltaNet（delta rule 读-比-写纠正 + Householder/WY 并行）/ Hyena（隐式长卷积 FFN(位置)+数据门控、FFT O(N·L·log L)、参数与序列长解耦）——「门控/delta/卷积」三类状态数学对照（补 M4-b） |
| M4-L11 | framework | 4 | [M4-L05,M4-L06] | hybrid-hymba-granite | 4 | S-Hymba（**2411.13676**，非 2404.08801）/S-Granite4（IBM 官方）· A | **并行 vs 串联混合**：Hymba（同层 注意力头‖Mamba-2 头 + meta tokens + 跨层 KV 共享）vs Granite 4.0（Mamba-2:注意力≈9:1 串联 + 共享专家）；「~10% 注意力层最优、放中部最佳」共识（补 M4-a） |

---

## M5 扩散 LLM（module = 5，展示型，不配 capstone）

### Stage 5.1 扩散式生成
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M5-L01 | theory | 3 | [M1-L11] | diffusion-llm | 4 | S-LLaDA · A | 离散/掩码扩散（吸收态≈随机比例掩码广义 MLM）；前向掩码+反向去噪；去因果双向 Transformer |
| M5-L02 | scenario | 4 | [M5-L01] | llada-run | 4 | S-LLaDA · A | 跑 LLaDA-8B（2.3T token）+ 对照 reversal curse 缓解、与 LLaMA3 8B ICL 对比 |

### Stage 5.2 代表模型
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M5-L03 | framework | 3 | [M5-L01] | llada-lineage | 4 | S-LLaDA · A；Mercury C 级仅背景 | LLaDA 谱系（1.5/LLaDA-V/LLaDA-MoE/2.0）+ 商用对照（C 级，只作背景） |

### Stage 5.3 缺口补全课（M5-a/b/c，B5 批次追加；展示型仍不配 capstone）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M5-L04 | theory | 4 | [M5-L01] | sedd-theory | 4 | S-SEDD（arXiv:2310.16834，ICML 2024 Oral）· A | SEDD：score entropy 损失把 score matching 推广到离散；同规模 ppl 降 25–75%；trade-off 计算换质量（32× 更少评估）+ 可控 infilling（补 M5-a） |
| M5-L05 | framework | 4 | [M5-L01] | dream-llm | 4 | S-Dream（arXiv:2508.15487）· A | Dream 7B：AR-初始化 + 上下文自适应 token 级噪声重调度（CART）；MMLU 与 Qwen2.5-7B 打平、Countdown 规划反超；任意顺序生成/infilling/质量-速度可调（补 M5-b） |
| M5-L06 | scenario | 4 | [M5-L04,M5-L01] | diffusion-edit | 4 | S-LLaDA/S-SEDD · A | 扩散 LLM 局部编辑/可控生成：inpainting/填中段（fill-in-the-middle）、约束生成、任意顺序生成 vs 自回归单向不可编辑；冒烟对比（补 M5-c） |

---

## M6 横向对比与选型（综合交付）（module = 6）

> 本模块是 M2–M5 的**收口实操**：静态对比（矩阵/选型/成本建模）→ **可执行对比实验** → 选型报告 capstone。与 M11 部署衔接。

### Stage 6.1 能力/成本/延迟矩阵
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L01 | framework | 3 | [M2-L10,M3-L08,M4-L07] | compare-matrix | 4 | 各模块 A 级；成本挂 S-DSV3（2.788M H800 时）· A | 自回归/MoE/SSM/扩散在质量·训练成本·推理延迟·长上下文·可控性五维矩阵 |

### Stage 6.2 选型判据
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L02 | scenario | 3 | [M6-L01] | selection | 4 | 综合各模块 A 级 | 给定预算/延迟/上下文约束做架构选型决策（MoE/SSM/扩散判据） |

### Stage 6.3 推理成本建模
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L03 | framework | 4 | [M6-L01] | cost-model | 4 | S-DSV3（671B/37B）· A | 总参 vs 激活参（FLOPs 由激活参数决定）；长上下文 KV 成本线性增长；与 M11 部署衔接 |

### Stage 6.4 可执行对比实验（同规模实测）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L04 | practice | 4 | [M6-L01,M6-L03] | arch-compare-exp | 4 | 架构复用 M2–M4 A 级；工具链 S-OPTIM 同族 HF 生态 · A | 固定 ~125M 跑 Transformer/MoE/SSM/线性注意力四模型，实测吞吐·峰值 KV/显存·同语料 loss/困惑度·4K/16K 长上下文退化曲线；可复现脚本 + 数据表 |
| M6-L05 | capstone | 5 | [M6-L02,M6-L04] | capstone | 4 | S-DSV3/S-LoRA 同族 · A | 给「真实需求」场景（预算+延迟+上下文+是否需编辑/双向）写架构选型决策报告：推荐架构 + 量化依据（引 Stage 6.4 实测）+ 反例；可执行验收断言（结论可由实测数据复现、关键数字挂 A 级来源） |

### Stage 6.5 缺口补全课（M6-a/b，B5 批次追加）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M6-L06 | scenario | 3 | [M6-L03] | api-cost | 4 | 各厂官方定价页 · B（随时间变动，标注检索日） | 商用/API 成本维度：$/1K input·output、长上下文阶梯价；把「自建 125M 吞吐/显存成本」与「API 调用价」放同一成本模型，判「自建回本 vs 直用 API」（补 M6-a） |
| M6-L07 | framework | 3 | [M6-L01] | mm-bench | 4 | 各 benchmark 官方页 · A（待逐一复核） | 多模态/长上下文 benchmark 选型：五维矩阵补「多模态」「长上下文」两维；按任务选官方基准口径（needle-in-haystack/PG19），避免短文本基准误评（补 M6-b） |

---

## M7 DeepSeek 专讲（module = 7）

### Stage 7.1 谱系与开源生态
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L01 | theory | 3 | [M3-L01] | ds-lineage | 4 | S-DSV2/S-DSV3 · A；deepseek-ai/* 仓库 | DeepSeek 67B→V2(MLA)→V3(MTP+无辅助均衡)→R1(RL 推理)；开放权重与许可证 |

### Stage 7.2 Multi-head Latent Attention
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L02 | theory | 4 | [M7-L01,M2-L01] | mla | 4 | S-DSV2 · A | MLA：KV 联合低秩压缩到 c_KV（d_c≪2·n_h·d_h），生成再上投影；减 KV 93.3%、吞吐 5.76× |
| M7-L03 | framework | 4 | [M7-L02] | decoupled-rope | 4 | S-RoPE+S-DSV2 · A | 解耦 RoPE（K 拆未旋转内容+小旋转 k^R）vs 标准 RoPE；保住 KV 压缩又保相对位置精度 |

### Stage 7.3 稀疏 MoE（DeepSeekMoE）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L04 | framework | 4 | [M7-L01,M3-L04] | deepseekmoe | 4 | S-DSM/S-DSV3 · A | 细粒度专家细分 + 共享专家隔离；aux-loss-free（router 偏置梯度调节） |

### Stage 7.4 MTP / 3D 并行 / FP8
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L05 | theory | 4 | [M7-L01] | mtp | 4 | S-DSV3 · A | MTP（预测 k 个未来 token 需 k−1 个 MTP 模块）+ 推理时推测解码 |
| M7-L06 | framework | 4 | [M7-L05,M3-L06] | ds-parallel-fp8 | 4 | S-DSV3 · A | 3D 并行（DP+TP+PP）+ DualPipe 计算-通信重叠 + 跨节点 all-to-all + FP8 混合精度训练对照 |

### Stage 7.5 其他创新核实与综合
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M7-L07 | framework | 3 | [M7-L01] | mfformer-verdict | 4 | `B1-09`（C 级定论） | mFformer 定论（无官方来源，疑似混淆 MLA/MTP/DeepSeekMoE）+ 真实 vs 误记逐项核实表（M7-b 维持「核实表」，不新增课） |
| M7-L08 | theory | 4 | [M7-L01,M10-L04] | r1-reasoning | 4 | S-R1（arXiv:2501.12948，Nature 收录）· A | **R1 推理链**：纯 RL 激励推理（免人工标注推理轨迹）；rule-based reward（可验证任务确定性判分）；涌现 self-reflection/verification/动态策略；推理蒸馏给小模型；与 M10 GRPO 呼应（补 M7-a） |
| M7-L09 | framework | 4 | [M7-L05,M7-L06] | dualpipe | 4 | S-DSV3（3D 并行章节）· A | DualPipe 通信重叠细节：PP 流水线气泡怎么产生 + forward/reverse 双向流水填平（用 TP all-reduce 盖 PP 空等）+ 1F1B 调度 + 跨节点 all-to-all 错峰（补 M7-c） |
| M7-L10 | capstone | 5 | [M7-L02,M7-L04,M7-L05,M7-L08] | capstone | 4 | S-DSV2/DSV3 · A | 复现 MLA 低秩 KV 压缩 + 解耦 RoPE + 算 KV 缓存节省，可执行验收断言（压缩比≈93.3%、KV 字节数下降核算） |

---

## 映射到数据模型的字段约定（落地时照此写 `L(...)`，与 M8–M11 一致）

- 每课时一文件 `lessons/lNN.ts`：`export const LNN = withKind(L('LNN', <stageId>, '<title>', <difficulty>, <prereqs>, <concepts>, <goals4条>, \`<md>\`, <widget|null>, <quiz4>, <terms>, <pitfalls>), '<kind>', [reason?])`。
- 渲染模式 **complex**（多模块 4 层结构）：课程数据提供 `MODULES: Module[]`（M1…M11）+ 每 Stage `module` 字段 + `renderMode: 'complex'`（见 `app/types/course.ts`）。
- `goals` 恒 4 条；`quiz` 恒 4 题；`terms` ≥4 组；`pitfalls` ≥3 条；`md` 按「正文目标」+ 体量下限扩写。
- **全课无 overview 课**（用户拍板），故不触发 8% 导览护栏；M1–M7 的 6 个 capstone 落在 M1/M2/M3/M4/**M6**/M7 末节（M6 已升级为综合交付，配 capstone；M5 展示型不配）。
- 关键数字（参数量、激活量、KV 压缩比、top-k、专家数、token/参数）**只认 A 级来源**（挂 S-*）；「过训练 token/参数」「QLoRA 数据集比较」「量化档位」等 B 级值须标注「第三方复算/待官方核实」，不单独承担关键结论（沿 `00-discipline.md` 纪律）。
- 暂定 id 口径（用户拍板 2026-11-16）：**按模块内序号** `M<mod>-L<nn>`，每模块从 `M<mod>-L01` 起（M1 11 / M2 10 / M3 8 / M4 7 / M5 3 / M6 5 / M7 8），与 `m8-m11-volume-plan.md`（M8-L01…）同口径；`prereqs` 填模块内 id，跨模块引用写 `M<其他mod>-L<nn>`。
- 注册：新课程在 `app/data/courses.ts` 追加一项（独立 `storageKey` + `data`）。

## 落地前待确认（剩余，非阻塞）

- 全课连续编号 `L01…`：**缺口补全后** M1–M7（71，原 52+19）+ M8–M11（40，原 32+8）= **111 课时**，落地时按模块顺序重编为全课连续 `L01…` 并把 `prereqs` 从模块内 id 改写为全课 id（当前草稿阶段一律用模块内序号，追加课按模块尾部顺延 id 不重排既有课）。
- M5 无 capstone（展示型，判定不配）是否与「完整覆盖」冲突：如需补齐可把 M5 末节升 framework（现 M5-L03）；M6 已升综合交付并配 capstone（M6-L05）。
- 正文生成方式**已拍板**（2026-11-16）：用 course-builder 草稿管线 `gen-course.mjs` 批量生成后 `pnpm fmt`，不逐课手写。
