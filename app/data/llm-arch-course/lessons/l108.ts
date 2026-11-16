import { L, withKind } from '../../course-builders.ts'

export const L108 = withKind(
  L(
    'L108',
    49,
    'vLLM/SGLang/llama-server 服务化',
    4,
    ['L106', 'L107'],
    ['serving'],
    [
      '起一个 OpenAI 兼容端点',
      '对照 vLLM/SGLang/TensorRT-LLM/llama-server',
      '说明 KV cache/批量/多节点',
      '验证 API 冒烟',
    ],
    `### 场景：从导出文件到可被应用调用的端点

L106 的 GGUF 与 L107 的 ONNX/TRT engine 都是**文件**，要让应用真正用上，需要起一个**推理服务**：加载模型、监听端口、暴露标准 API、调度并发请求。本场景把「模型文件」变成「OpenAI 兼容端点」，并对照 vLLM、SGLang、TensorRT-LLM、llama-server 四种后端的定位，最后用一段客户端脚本做 API 冒烟。服务化是整条部署链路的「交付面」：前面所有量化、编译、合并工作都藏在端点背后，应用开发者只需知道一个 URL 与一个模型名。也正因如此，服务层的配置失误会浪费掉前面所有优化——比如 KV 预算没设对导致频繁换出，或最大序列长设太小导致长 prompt 被截断，都会让一个好模型表现得像坏的。本场景因此不只讲「怎么起服务」，更强调「怎么验证服务真的把模型能力交出来了」。

:::deep

### 为什么统一到 OpenAI 兼容协议

过去每个推理框架都有自己的 API 与 SDK，应用切后端就要改代码。OpenAI 兼容端点把接口统一成 \`/v1/chat/completions\`、\`/v1/completions\` 等约定，请求体与返回结构遵循同一套 schema。好处是：**应用只写一次**，后端可以从 vLLM 换成 SGLang、从本地换成云上，只需改 \`base_url\` 与 \`model\` 名，业务代码不动。vLLM、SGLang、llama-server 都内置这层兼容，TensorRT-LLM 也可通过 Triton/自身服务暴露类似接口。这层标准化是 M11 部署链路的「最后一公里」——它让前面的量化、编译成果能被统一消费。

:::

### vLLM：分页 KV + 连续批处理

vLLM（arXiv:2309.00081）的服务化能力建立在两张前课打下的地基上：L21 的 **PagedAttention** 把 KV 切成 block、用 block table 映射，消碎片、按需分配、支持前缀共享；L22 的 **continuous batching** 让序列一完成就释放槽位、立刻接入新请求，batch 始终满载。再加 chunked prefill 把长 prompt 拆块、避免饿死短 decode。结果就是同显存下能塞更多并发、吞吐成倍提升（L24 的四因子归因）。

起服务并冒烟的标准流程：

\`\`\`bash
# vLLM OpenAI 兼容端点
python -m vllm.entrypoints.openai.api_server \\
  --model ./merged-model \\
  --served-model-name my-llm \\
  --host 0.0.0.0 --port 8000 \\
  --gpu-memory-utilization 0.90 \\
  --max-model-len 8192 \\
  --enable-chunked-prefill
# 另开一个终端，用 curl 冒烟 /v1/chat/completions
curl http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"my-llm","messages":[{"role":"user","content":"你好"}],"max_tokens":32}'
\`\`\`

\`--gpu-memory-utilization\` 决定显存预算（L24 强调过两档对比必须固定它）；\`--max-model-len\` 设太大时 KV 预分配会 OOM，按真实上下文需求设。\`--enable-chunked-prefill\` 打开长 prompt 拆块，避免长请求造成延迟尖峰。服务进程启动后应先看日志里的关键行：模型加载是否成功、KV cache 块数按预算分配了多少、\`max_model_len\` 是否被自动下调。这些日志比「curl 通了」更能说明配置是否符合预期——例如 KV 块数远小于预期，说明大部分显存被权重或激活占了，后面并发上不去是必然的。把启动日志里的这些数字记进部署记录，L110 压测时就能直接对照，不必从头推测瓶颈在哪。

**API 冒烟：用 OpenAI SDK 验证**

端点起来后，用统一的 OpenAI 客户端做冒烟——这也是应用层实际调用的方式。

\`\`\`python
# OpenAI 兼容客户端冒烟：任何后端都用同一套 SDK
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="my-llm",
    messages=[{"role": "user", "content": "用一句话解释 KV cache"}],
    max_tokens=64, temperature=0.0,
)
text = resp.choices[0].message.content
print("模型回复:", text)
assert isinstance(text, str) and len(text) > 0, "应返回非空文本"
assert resp.usage.total_tokens > 0, "应返回 token 统计"
print("输入 token:", resp.usage.prompt_tokens, "输出 token:", resp.usage.completion_tokens)
\`\`\`

冒烟不只是「能返回 200」——要看**实际文本是否合理**。量化档位选错、分词器不匹配、dtype 解析错误都可能让服务正常返回但内容是乱码或重复 token。\`temperature=0.0\` 固定输出便于复现，\`usage\` 字段能顺带确认 token 计数正常。

### 四种后端对照

\`\`\`python
# 服务化四选一对照（量级示意，随版本/硬件变动，不担关键结论）
OPTIONS = {
    "vLLM":         {"强项": "PagedAttention + 高吞吐", "适合": "通用高并发服务"},
    "SGLang":       {"强项": "RadixAttention 前缀共享", "适合": "对话/Agent/RAG"},
    "TensorRT-LLM": {"强项": "编译级极致延迟", "适合": "固定硬件生产"},
    "llama-server": {"强项": "GGUF 轻量、单文件", "适合": "本地/边缘"},
}
for name, meta in OPTIONS.items():
    print(f"{name:14s} {meta['强项']:28s} {meta['适合']}")

# 固定显存预算下，KV 决定并发（沿用 L21/L24 的账）
def concurrency(gpu_gb, kv_bytes_per_req, util=0.9):
    return int(gpu_gb * 1e9 * util / kv_bytes_per_req)
gpu, kv = 24, 400_000_000     # 24GB 卡、单请求 KV 约 0.4GB（量级示意）
print("同显存可塞并发 ≈", concurrency(gpu, kv))
assert concurrency(gpu, kv) > 0
kv_gqa8 = kv * 8 / 32        # GQA-8 相对 MHA-32：KV 降 1/4（L15）
print("换 GQA-8 后并发 ≈", concurrency(gpu, kv_gqa8))
assert concurrency(gpu, kv_gqa8) >= 4 * concurrency(gpu, kv), "KV 降4倍应换来约4倍并发"
fp8_kv = kv // 2   # KV 量化到 FP8：字节数再砍一半（L109）
print("再开 KV-FP8 后并发 ≈", concurrency(gpu, fp8_kv))
assert concurrency(gpu, fp8_kv) >= 2 * concurrency(gpu, kv), "KV 减半应再翻倍并发"
\`\`\`

- **vLLM**：通用高并发首选，生态成熟、OpenAI 兼容完善，适合大多数线上服务。
- **SGLang**：RadixAttention 自动前缀共享，对「一个系统 prompt 服务上千并发」的对话/Agent/RAG 场景收益巨大，还内置结构化输出。
- **TensorRT-LLM**：编译级极致低延迟，但要同款 GPU 上 build engine（L107），适合硬件固定、追求极致的生产环境。
- **llama-server**：直接吃 L106 的 GGUF，单文件、零依赖、CPU 也能跑，适合本地与边缘。

对照时别把「后端」与「量化格式」混为一谈：GGUF 是文件格式，vLLM/SGLang 是服务框架，TensorRT-LLM 是编译栈，一个服务框架可以加载多种格式的模型。真正的选型顺序是先看部署环境（本地还是云端、什么卡），再定量化格式，最后选服务框架并确认它支持该格式。例如 llama-server 天然吃 GGUF，vLLM 直接吃 HF 目录；SGLang 与 vLLM 都支持 FP8 KV，能叠加 L109 的量化收益。把这条依赖顺序理清，才不会在「哪个框架最快」这种问题上绕圈——框架的快慢高度依赖你的硬件、形状与前缀共享模式，L110 的压测才是唯一裁判。

### KV cache、批量与多节点

服务化的三个核心旋钮：

**KV cache**——并发 ∝ 显存预算 / 单请求 KV。单请求 KV 又由 K/V 头数（GQA，L15）、序列长、dtype 决定；分页消碎片后能塞更多请求。监控 KV cache 使用率是判断「还能不能加并发」的第一指标。

**批量**——continuous batching 让 batch 动态满载；\`max_num_seqs\` 限制同时活跃序列数，调大吃满算力但单请求延迟上升，需按 L110 压测定。

**多节点**——模型放不下或要更高吞吐时，用张量并行（TP）把权重切到多卡，流水线并行（PP）按层切分（M7 的 3D 并行）。跨节点依赖 NCCL 与高速网络，通信带宽常成为瓶颈——加卡未必线性提速，必须先测节点间带宽，再决定并行策略。

三个旋钮不是孤立的：KV 决定并发上限，并发与 batch 共同决定算力利用率，而多节点并行会改变单卡持有的 KV 份额与通信开销。一个实用的容量规划顺序是：先按目标并发算出 KV 总量（L21 的账），看单卡剩余显存能否装下；装不下才考虑并行，且优先「节点内 TP、节点间 PP」（L110）；并行确定后再回头调 batch 与并发，把算力喂满。反过来先加卡再算账，往往会发现通信成本吃掉了并行收益，白忙一场。把这条顺序写进部署 checklist，能用最少的卡满足服务目标。服务的可观测性也要一并建起来：至少暴露 KV cache 使用率、活跃请求数、平均队列时间、token 吞吐四项指标。它们分别对应「还能不能加并发」「系统是否过载」「调度是否健康」「产能是否达标」四个问题。没有这些指标，压测就像蒙眼开车——出了问题只能猜是 KV 不够还是网络卡了，而有了指标，一眼就能定位瓶颈在存储、调度还是通信。四项指标最好做成时间序列看板，观察它在并发爬升过程中的拐点：KV 使用率先到顶说明显存是瓶颈，队列时间先飙升说明调度跟不上，吞吐先饱和则说明算力已用尽。

:::tip

### 服务化记忆口诀

先把模型变成 OpenAI 兼容端点（一套 SDK 走天下），再按场景选后端：通用高并发用 vLLM、共享前缀用 SGLang、固定硬件极致延迟用 TRT-LLM、本地边缘用 llama-server。吞吐的账要按「KV 决定并发、批量决定算力利用率、多节点通信决定扩展上限」来算，不能只看「起了服务」。冒烟必须看实际文本质量，不只是 HTTP 200。下一课 L109 回到量化本身，对照 GPTQ/AWQ/FP8 三条推理侧量化路线，看它们与服务化的关系。

:::
`,
    null,
    [
      {
        text: 'vLLM 高吞吐的两个核心机制是？',
        options: [
          '量化 + 蒸馏',
          'PagedAttention 分页 KV + continuous batching 连续批处理',
          '只用 CPU 推理',
          '把模型拆成多个文件',
        ],
        answer: 1,
        explain:
          'vLLM（2309.00081）用 PagedAttention 消 KV 碎片、按需分配与共享，配合 continuous batching 让 batch 始终满载，显著提升吞吐。',
        concept: 'serving',
      },
      {
        text: 'SGLang 的 RadixAttention 主要优化什么场景？',
        options: [
          '单请求低并发',
          '多请求共享前缀（系统 prompt、few-shot、RAG 文档），自动复用前缀 KV',
          '只优化权重加载',
          '只做量化',
        ],
        answer: 1,
        explain:
          'RadixAttention 用基数树组织前缀，多请求命中同一前缀时复用 KV、跳过 prefill，对对话/Agent/RAG 收益最大。',
        concept: 'serving',
      },
      {
        text: 'OpenAI 兼容端点的实际价值是？',
        options: [
          '让模型变小',
          '用统一的 /v1/chat/completions 协议与 SDK 对接任意后端，应用无需改代码',
          '替代 GPU',
          '自动量化',
        ],
        answer: 1,
        explain:
          'vLLM/SGLang/llama-server 都提供 OpenAI 兼容 API，应用层用同一套 SDK 与 endpoint 切换后端，降低迁移成本。',
        concept: 'serving',
      },
      {
        text: '固定 GPU 显存时，决定能塞多少并发的关键是？',
        options: [
          '模型文件名',
          '单请求 KV cache 占用（K/V 头数、序列长、dtype）与分页效率',
          '端口号码',
          'SDK 版本',
        ],
        answer: 1,
        explain:
          '并发 ∝ 显存预算 / 单请求 KV；KV 由 K/V 头数（GQA）、序列长、字节数决定，分页省碎片后能塞更多请求（L21/L24）。',
        concept: 'serving',
      },
    ],
    [
      ['OpenAI 兼容端点', '遵循 /v1/chat/completions 等约定的 HTTP API，应用可用统一 SDK 对接不同推理后端'],
      ['PagedAttention', 'vLLM 的 KV 分页机制，把 KV 切成 block 按需分配、消碎片、可共享（L21）'],
      ['continuous batching', '连续批处理，序列完成即释放槽位并接入新请求，让 batch 始终满载'],
      ['RadixAttention', 'SGLang 用基数树组织前缀、自动命中复用 KV、跳过重复 prefill'],
      ['KV cache', '生成时按位置累积的 K/V，内存 ∝ 层数 × K/V 头数 × 序列长 × 字节数'],
    ],
    [
      '以为开了服务就自动高吞吐——吞吐来自 KV 分页、批量与调度的合力，需按 L110 压测验证。',
      '把 max_model_len 设得远超显存能承受——KV 预分配会 OOM，启动即失败。',
      '多节点部署忽略 NCCL/网络带宽——跨节点通信成为瓶颈，加卡反而不提速。',
      '冒烟只测「能返回」不测内容质量——量化或量化档位错误可能输出乱码，必须看实际文本。',
    ],
  ),
  'scenario',
)
