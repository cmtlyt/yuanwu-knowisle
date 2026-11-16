# M11 spec（7 课）

## L105 · merge_and_unload 代数折回 + 规范保存
- stage=47 kind=theory difficulty=2 prereqs=[L89] concept=weight-merge
- source: S-SAFE/S-LoRA · A
- bodyGoal: merge_and_unload 代数折回 + save_pretrained 存 safetensors/config/tokenizer
- goals: 「推导 merge_and_unload 的 W₀+(α/r)BA 折回」 / 「讲清 save_pretrained 产物」 / 「说明 safetensors/config/tokenizer 三件套」 / 「解释合并的数值精度」

## L106 · GGUF 导出与量化档位
- stage=48 kind=practice difficulty=3 prereqs=[L105] concept=gguf-export
- source: S-GGUF · A（量化档位 B5 升 A：llama.cpp 官方）
- bodyGoal: GGUF：convert+quantize；Q4_K_M 甜点；各档位体积/质量表
- goals: 「写出 convert-hf-to-gguf.py + llama-quantize 流程」 / 「说明 Q4_K_M 甜点位」 / 「列出 F16→Q8_0→…→Q2_K 体积/质量表」 / 「验证导出模型可加载」

## L107 · ONNX / TensorRT-LLM 编译导出
- stage=48 kind=practice difficulty=4 prereqs=[L105] concept=onnx-trt
- source: S-OPTIM/S-TensorRT-LLM · A
- bodyGoal: ONNX（optimum export）→ TensorRT-LLM 编译 .engine；取舍
- goals: 「写出 optimum ORTModelForCausalLM(export=True) 流程」 / 「跑通 ONNX 导出」 / 「编译 TensorRT-LLM .engine」 / 「对照 ONNX 与 TRT 取舍」

## L108 · vLLM/SGLang/llama-server 服务化
- stage=49 kind=scenario difficulty=4 prereqs=[L106,L107] concept=serving
- source: S-vLLM · A
- bodyGoal: vLLM/SGLang/TensorRT-LLM/llama-server（OpenAI 兼容端点）；KV/批量/多节点
- goals: 「起一个 OpenAI 兼容端点」 / 「对照 vLLM/SGLang/TensorRT-LLM/llama-server」 / 「说明 KV cache/批量/多节点」 / 「验证 API 冒烟」

## L109 · 推理侧量化：GPTQ/AWQ/FP8
- stage=50 kind=framework difficulty=4 prereqs=[L106] concept=inference-quant
- source: S-GPTQ（2210.17323）/S-AWQ（2306.00978）· A；FP8 挂 S-FA3/S-DSV3
- bodyGoal: GPTQ/AWQ/FP8 对照；权重 vs 激活量化；吞吐/精度实测
- goals: 「区分权重量化 vs 激活量化」 / 「讲清 GPTQ 二阶一次性压 3–4bit」 / 「解释 AWQ 激活感知只保 1% 显著通道」 / 「对照 FP8 与吞吐/精度实测」

## L110 · 多节点/吞吐调优与压测
- stage=50 kind=practice difficulty=4 prereqs=[L108] concept=serving-tune
- source: S-vLLM · A；并行概念 S-DSV3 · A
- bodyGoal: batch/并发/流式三旋钮；P95/P99 吞吐压测；多节点
- goals: 「写出 batch/并发/流式三旋钮调优脚本」 / 「做固定并发 P95/P99 + 吞吐压测」 / 「挂 M7 3D 并行/跨节点」 / 「产出可复现压测脚本」

## L111 · 从 LoRA 到可服务模型端到端 capstone
- stage=50 kind=capstone difficulty=5 prereqs=[L108,L109,L110] concept=m11-capstone
- source: S-LoRA/vLLM/GGUF · A
- bodyGoal: 从 LoRA 到可服务模型端到端：merge→导出/量化→vLLM→API 冒烟；验收断言
- goals: 「搭建 merge→导出/量化双路→vLLM 起服务流程」 / 「跑通 OpenAI 兼容 API 冒烟」 / 「做吞吐/精度验收」 / 「给出端到端验收断言」

