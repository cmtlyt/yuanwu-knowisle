# B2-04 · 参数打包 / 导出 / 部署（检索原始返回）

- 工具：WebSearch
- 查询：`llama.cpp GGUF quantization arXiv; TensorRT-LLM inference arXiv; Optimum ONNX export; Hugging Face safetensors export model`
- 核实日期：2026-11-16
- 可信级别提示：工具/格式多为**官方仓库或官方文档（A 级）**，非 arXiv；第三方教程为 B 级。

## 一手来源（官方仓库 / 官方文档）

| 源 ID | 主题 | 一手来源 | 级别 |
|---|---|---|---|
| S-GGUF | GGUF 格式 + llama.cpp | GitHub: `ggml-org/llama.cpp`（C/C++ 推理框架 + `convert-hf-to-gguf.py` + `quantize` 工具） | A |
| S-TensorRT-LLM | NVIDIA 推理引擎 | GitHub: `NVIDIA/TensorRT-LLM` + 官方文档（engine 构建 + C++ 运行时 + Triton 后端） | A |
| S-OPTIM | Optimum ONNX / ORT 导出 | HF 文档 `huggingface.co/docs/optimum`（`ORTModelForCausalLM(..., export=True)`） | A |
| S-SAFE | safetensors 格式 | `huggingface/safetensors`（`.safetensors` 权重存储，HF 默认） | A |
| S-vLLM | 服务化推理（PagedAttention） | arXiv:2309.06180（已在 B1 登记 S-vLLM · A） | A |

## 关键事实（打包链路）

修改/微调参数后「打包成新模型」的标准路径（挂 A 级工具）：

1. **合并/保存基座**：`model.merge_and_unload()`（LoRA/QLoRA 折回，零延迟）→ `save_pretrained()` 存 `*.safetensors`（S-SAFE · A）+ `config.json` + tokenizer。
2. **导出 GGUF**：llama.cpp `python convert-hf-to-gguf.py <merged> --outfile model.gguf`，再 `llama-quantize` 降到 4/5/8-bit（Q4_K_M 为 CPU 甜点档）；产物可在 Ollama / LM Studio / 纯 CPU 运行（S-GGUF · A；量化档位 B 级教程）。
3. **导出 ONNX / TensorRT**：`optimum` `ORTModelForCausalLM(export=True)` → ONNX；TensorRT-LLM 编译成 `.engine` + Triton 服务（S-OPTIM / S-TensorRT-LLM · A）。
4. **服务化**：vLLM / SGLang / TensorRT-LLM / llama-server（OpenAI 兼容端点）（S-vLLM · A）。

## 量化档位经验（B 级，标注「第三方教程」，不入正文关键结论）

| 档位 | 相对体积 | 质量损失 | 场景 |
|---|---|---|---|
| Q8_0 | 近无损 | 极小 | 显存够、要质量 |
| Q6_K / Q5_K_M | 中 | 小 | 质量优先折中 |
| Q4_K_M | 中小 | 可接受 | **最常用甜点**（7B ≈ 4GB 出头） |
| Q3_K / Q2_K | 小 | 明显 | 内存逼到极限才用 |
