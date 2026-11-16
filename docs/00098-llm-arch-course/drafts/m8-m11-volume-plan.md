# M8–M11 课程体量规划（可落 `app/data` 草稿）

> 交付物（00098）续：把 M8 预训练 / M9 微调 / M10 后训练 / M11 打包部署细化到**课时粒度**，字段口径与 `app/types/course.ts` + `app/data/course-builders.ts` 对齐，可直接映射 `stages.ts` 的 `Stage[]` 与 `lessons/lNN.ts` 的 `L(...)` 调用。
> **本文件只规划体量与结构，不落地 `app/data`、不写正文**（定稿后另开任务用 course-builder 草稿管线生成）。
> 课型与体量下限引自 `scripts/content-gate.mjs`（00055 口径）：

| kind | 正文字数下限 | 代码字符下限 | 说明 |
|---|---|---|---|
| theory | 1200 | 400 | 讲机制与边界，代码只印证 |
| framework | 1500 | 1000 | 手写版↔框架版对照 |
| practice | 1800 | 1500 | 完整可跑实现 + 递进代码 |
| scenario | 1800 | 1500 | 单一场景端到端落地 |
| capstone | 3000 | 2500 | 端到端交付 + 可执行验收断言 |
| overview | 400 | 0 | 导览/收束，**受全局护栏：每模块 ≤1 节 + 总量 ≤ 总课时 8% + kindReason 必填** |

> **id 口径**：M8–M11 采用 `M<mod>-L<nn>` 模块内序号，作**暂定 id**；`prereqs` 一律填暂定 id。待 M1–M7 也出体量后，统一重编为全课连续 `L01…`，届时 `prereqs` 同步改写。
> **来源**：每课时挂 `S-*`（见 `../research/evidence/00-discipline.md`），关键数字只认 A 级。

---

## 体量总账（M8–M11）

| 模块 | 阶段数 | 课时数 | capstone | 模块占比定位 |
|---|---|---|---|---|
| M8 预训练 | 3 | 9 | 1 | 概念为主，实操以「继续预训练」落地（全量预训练超单卡，不实操） |
| M9 微调 | 4 | 10 | 1 | 全课重心，PEFT 可单卡复现 |
| M10 后训练 | 4 | 7 | 1 | 对齐三范式 + trl 实操 |
| M11 打包部署 | 3 | 5 | 1 | 改参 → 合并 → 导出 → 服务化的工程闭环 |
| **合计** | **14** | **31** | 4 | 占全课（含 M1–M7）的实操后半段 |

- overview 课：本规划 **M8–M11 不安排 overview 课**（可选，且受全局 8% 护栏约束）；如需要模块导览，最多每模块 1 节且要写 `kindReason`。默认 0 节最稳妥。
- capstone 4 个（每模块 1 个收尾），体量最大（3000/2500），是全课工程验收锚点。

---

## M8 预训练（module = 8）

### Stage 8.1 预训练目标与数据
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M8-L01 | theory | 2 | [] | next-token | 4 | S-GPT3 · A | 自回归 next-token 损失；decoder-only 为何统一；训练目标与「预测下一 token」的数学 |
| M8-L02 | framework | 2 | [M8-L01] | data-mixing | 4 | S-GPT3 · A；LLaMA 配比 B 级（待回官方 A） | GPT-3（Wikipedia 轮数≫Common Crawl）vs LLaMA 配比（CC 67%/C4 15%/…）对照；采样权重为何 |
| M8-L03 | practice | 3 | [M8-L02] | data-cleaning | 4 | B 级（工具链） | 语料去重/去毒/去噪管线实操（HF `datasets` + `deduplicate` + 正则黑名单）；产出干净 token 流 |

### Stage 8.2 Scaling Law 与算力取舍
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M8-L04 | theory | 2 | [M8-L01] | scaling-law | 4 | S-Chinchilla · A | Chinchilla：固定 FLOPs 下 N 与 D 等比扩展（≈20 token/参数）；推导 + 70B@1.4T 胜 GPT-3 |
| M8-L05 | theory | 3 | [M8-L04] | over-train | 4 | B 级（唐杰/Epoch 复算） | 训练最优≠推理最优：过训练（Llama2 7B≈290、Llama3 70B≈215 token/参数）换低推理成本 |
| M8-L06 | practice | 3 | [M8-L04,M8-L05] | compute-budget | 4 | S-Chinchilla · A | 给定算力预算规划 N/D 实操（FLOPs≈6ND 估算 + Chinchilla 边界表 + 过训练系数） |

### Stage 8.3 实操：继续预训练 / 领域预训练
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M8-L07 | scenario | 4 | [M8-L06] | cpt | 4 | S-OPTIM 同族 HF 生态 · A | 领域继续预训练端到端：HF Trainer `--resume` + 领域语料 + loss 曲线 + 早停 |
| M8-L08 | framework | 4 | [M8-L07] | dist-parallel | 4 | S-DSV3 · A（3D 并行） | TP/PP/ZeRO 概念对照 + 多卡冒烟（`torchrun` 起 2 卡跑 125M）；何时用哪种并行 |
| M8-L09 | capstone | 5 | [M8-L07,M8-L08] | capstone | 4 | S-Chinchilla/S-GPT3 · A | 在 1B 基座跑通一段领域继续预训练；可执行验收断言（loss 降、困惑度、token/参数核算） |

---

## M9 微调（module = 9）

### Stage 9.1 全参微调 vs 参数高效微调
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M9-L01 | theory | 2 | [M8-L01] | full-finetune | 4 | S-PEFT · A | 全参微调成本 / 过拟合 / 灾难性遗忘；何时才该全参 |
| M9-L02 | framework | 3 | [M9-L01] | peft-lineage | 4 | S-PEFT · A | PEFT 谱系：Adapters→Prefix/Prompt→(IA)³→LoRA 逐项对照（可训参数量级表） |

### Stage 9.2 LoRA / QLoRA / DoRA
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M9-L03 | theory | 3 | [M9-L02] | lora | 4 | S-LoRA · A | LoRA 机制：冻结基座 + 低秩 B×A（秩 r）；W=W₀+(α/r)BA；为何省 10⁴× |
| M9-L04 | framework | 3 | [M9-L03] | qlora | 4 | S-QLoRA · A | QLoRA：4-bit NF4 基座 + 双重量化 + bf16 LoRA；单 48GB GPU 微调 65B 的机制 |
| M9-L05 | theory | 3 | [M9-L03] | dora | 4 | S-DoRA · A | DoRA：权重拆幅度+方向、方向做 LoRA；为何稳超 LoRA 且零推理开销 |
| M9-L06 | framework | 4 | [M9-L04,M9-L05] | peft-select | 4 | S-LoRA/QLoRA/DoRA/GaLore · A | 四法对比与选型判据（显存/质量/多任务）；GaLore 备选 |

### Stage 9.3 实操（HF 三件套）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M9-L07 | practice | 4 | [M9-L03] | lora-sft | 4 | S-OPTIM 同族 HF 生态 · A | LoRA SFT 端到端：`LoraConfig`+`bitsandbytes`4bit+指令—响应数据；`merge_and_unload` 导出 |
| M9-L08 | scenario | 4 | [M9-L07] | multi-adapter | 4 | S-LoRA · A | 一基座多适配器：训 2 个不同领域 LoRA + 服务切换 + 零延迟 merge 对照 |

### Stage 9.4 过拟合与数据量
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M9-L09 | theory | 3 | [M9-L07] | data-size | 4 | S-QLoRA · A | 数据量<模型容量时小数据常更优（QLoRA 9k>450k 指令子集）；过拟合识别 |
| M9-L10 | capstone | 5 | [M9-L07,M9-L09] | capstone | 4 | S-LoRA/QLoRA · A | 小数据集 LoRA 微调 + 过拟合曲线验收（train/val loss 分离 + merge 后推理冒烟） |

---

## M10 后训练 / 对齐（module = 10）

### Stage 10.1 RLHF（InstructGPT）
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M10-L01 | theory | 3 | [M9-L07] | rlhf | 4 | S-InstructGPT（2203.02155）· A | RLHF 三阶段：SFT→奖励模型 RM→PPO（KL 惩罚约束漂移）；1.3B 胜 175B |
| M10-L02 | theory | 3 | [M10-L01] | alignment-tax | 4 | S-InstructGPT · A | 对齐税（掉通用基准）与 PPO-ptx 缓解机制 |

### Stage 10.2 DPO
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M10-L03 | theory | 3 | [M10-L01] | dpo | 4 | S-DPO（2305.18290）· A | DPO：免显式 RM、免在线 PPO，偏好对直接监督式损失；为何成开源默认 |

### Stage 10.3 GRPO + RLAIF
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M10-L04 | theory | 4 | [M10-L03] | grpo | 4 | S-GRPO（2402.03300）· A | GRPO：去 critic，同 prompt 一组 rollout 组内相对奖励；DeepSeekMath 7B MATH 51.7% |
| M10-L05 | framework | 3 | [M10-L01] | rlaif | 4 | S-ConstAI（2212.08073）· A | RLAIF / Constitutional AI：模型自评替代人标；与 RLHF 谱系对照 |

### Stage 10.4 实操
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M10-L06 | scenario | 4 | [M10-L03,M10-L04] | trl-align | 4 | S-OPTIM 同族 HF 生态 · A | trl：SFTTrainer/DPOTrainer/GRPOTrainer + `peft_config=LoraConfig()`；偏好对数据流 |
| M10-L07 | capstone | 5 | [M10-L06] | capstone | 4 | S-DPO · A | 偏好对数据集构建 + DPO 对齐端到端；可执行验收（偏好胜率、KL 漂移、通用基准不掉） |

---

## M11 参数打包与部署（module = 11）

### Stage 11.1 合并与权重保存
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M11-L01 | theory | 2 | [M9-L07] | weight-merge | 4 | S-SAFE/S-LoRA · A | `merge_and_unload()` 代数折回（W₀+(α/r)BA）+ `save_pretrained()` 存 safetensors+config+tokenizer |

### Stage 11.2 导出格式
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M11-L02 | practice | 3 | [M11-L01] | gguf-export | 4 | S-GGUF · A（量化档位 B 级） | GGUF：llama.cpp `convert-hf-to-gguf.py`+`llama-quantize`；Q4_K_M 甜点 + 各档位体积/质量表 |
| M11-L03 | practice | 4 | [M11-L01] | onnx-trt | 4 | S-OPTIM/S-TensorRT-LLM · A | ONNX/TensorRT：`optimum ORTModelForCausalLM(export=True)`→ONNX；TensorRT-LLM 编译 `.engine` |

### Stage 11.3 服务化
| id | 课型 | 难度 | prereqs | concepts | quiz | 来源 | 正文目标 |
|---|---|---|---|---|---|---|---|
| M11-L04 | scenario | 4 | [M11-L02,M11-L03] | serving | 4 | S-vLLM · A | vLLM/SGLang/TensorRT-LLM/llama-server（OpenAI 兼容端点）；KV cache、批量、多节点 |
| M11-L05 | capstone | 5 | [M11-L04] | capstone | 4 | S-LoRA/vLLM/GGUF · A | 从 LoRA 到可服务新模型端到端：merge→GGUF/ONNX 双路→vLLM 起服务→OpenAI 兼容 API 冒烟；可执行验收断言 |

---

## 映射到数据模型的字段约定（落地时照此写 `L(...)`）

- 每课时一文件 `lessons/lNN.ts`：`export const LNN = withKind(L('LNN', <stageId>, '<title>', <difficulty>, <prereqs>, <concepts>, <goals4条>, \`<md>\`, <widget|null>, <quiz4>, <terms>, <pitfalls>), '<kind>', [reason?])`。
- `stage` 填全课连续 stage id（M8=stage 0/1/2、M9=3/4/5/6 …，待全课统一编号）；本表 Stage 8.x 等只是**模块内**逻辑分组，落地时按 4 层结构（MODULES→Stage.module→subStage）映射。
- `goals` 恒 4 条；`quiz` 恒 4 题（capstone 也 4 题）；`terms` ≥4 组；`pitfalls` ≥3 条；`md` 按上表「正文目标」+ 体量下限扩写（theory 1200 / framework 1500 / practice·scenario 1800 / capstone 3000 正文字，代码 400/1000/1500/2500）。
- 关键数字（参数量、激活量、KV 压缩比、top-k、专家数、token/参数）**只认 A 级来源**（挂 S-*）；「过训练 token/参数」「QLoRA 数据集比较」等 B 级值须标注「第三方复算/待官方核实」，不单独承担关键结论（沿 `00-discipline.md` 纪律）。
- 渲染模式：M1–M11 = **complex**（多模块 4 层结构）；落地时课程数据提供 `MODULES: Module[]`（M1…M11）+ 每 Stage `module` 字段 + `renderMode: 'complex'`（见 `app/types/course.ts`）。
- 注册：新课程在 `app/data/courses.ts` 追加一项（独立 `storageKey` + `data`）。

## 待确认（写正文前需拍板）

1. M8「全量预训练」是否只做概念（本规划已按「不实操、只做继续预训练实操」处理，因全量超单卡）——如需给「分布式 3D 并行」单独一节，M8-L08 已覆盖。
2. M8–M11 是否要**每模块 1 节 overview 导览**（受全局 8% 护栏）；默认 0 节。
3. 全课 capstone 是否只在 M8/M9/M10/M11 各 1（本规划 4 个），还是 M1–M7 也各配（那是 M1–M7 体量规划的范畴，本文件不含）。
4. 正文是否用 course-builder 草稿管线（`gen-course.mjs`）批量生成后 `pnpm fmt`，还是逐课手写。
