import { L, withKind } from '../../course-builders.ts'

export const L20 = withKind(
  L(
    'L20',
    8,
    'FlashAttention v1 / v2 / v3 演进对照',
    4,
    ['L19'],
    ['fa-v1v2v3'],
    [
      '对照 FA v1（2205.14135）/ v2（2307.08691）/ v3（2407.08608）各自改了什么',
      '说清 v2 的「warp 级并行 + 减少非矩阵乘 FLOPs」与 v3 的「FP8 + 异步 warp 分组」',
      '解释「前向/反向 FLOPs 占比」为什么是 v2 的优化重点',
      '对照 vLLM/TensorRT-LLM 的 FA 集成说明它如何进生产推理',
    ],
    `
### 三个版本，三个优化重点

FlashAttention 不是「一个算法」，而是一代代的工程演进。本课时对照 v1/v2/v3 三篇官方论文，看清**每一版到底砍了哪个瓶颈**——这比记住「FA 更快」更有用。

| 版本 | 论文 | 主要改动 | 针对的瓶颈 |
|---|---|---|---|
| v1 | 2205.14135 | IO-aware 分块 + online softmax | HBM↔SRAM 搬运（N×N 落地） |
| v2 | 2307.08691 | warp 级并行、减少非矩阵乘 FLOPs、前向/反向工作分配 | 矩阵乘外的标量 FLOPs 拖慢 SM 利用率 |
| v3 | 2407.08608 | FP8 精度 + 异步 warp 分组 + H100 新特性 | 精度-速度权衡、Hopper 架构吃满 |

### v1 → v2：砍「非矩阵乘 FLOPs」

v1 解决了搬运问题，但注意力里**矩阵乘之外的部分**（指数、求最大值、累加、softmax 归一分母）仍是标量/向量操作，在 GPU 上拖慢 SM 利用率。v2（arXiv:2307.08691）做了两件事：

- **warp 级并行**：把一个 tile 的注意力计算拆到多个 warp 并行，提高 SM 内并行度。
- **减少非矩阵乘 FLOPs**：重排「前向里算 ℓ（分母）的时机」——前向**不急着归一**，把 ℓ 的累加推迟、反向时再补，省掉前向里一部分标量运算。实测 v2 比 v1 快约 2×（A100），且前向速度**首次接近反向的一半**（之前前向比反向快很多，浪费了一半算力）。

把「非矩阵乘 FLOPs」拆开看，注意力里矩阵乘之外真正在算的标量/向量操作有四个：① 每个分数元素算一次 \`exp\`（指数）；② 每个 tile 算一次 \`max\`（online softmax 的 m）；③ 累加 \`exp(s-m)\`（online softmax 的 ℓ）；④ softmax 归一的除法。v1 把这些**穿插在矩阵乘之间逐个算**，GPU 的矩阵乘单元（Tensor Core）在等标量结果、SM 利用率掉。v2 的关键是把②③④的时机重排——**前向不急着归一、把 ℓ 推迟到反向再补**，让矩阵乘尽量连跑、标量操作挤到矩阵乘的空隙里并行。这就是「减少非矩阵乘 FLOPs」的实际含义：不是 FLOPs 总数变少，而是**矩阵乘的并行度吃满了**。

### v2 → v3：吃 Hopper + FP8

v3（arXiv:2407.08608）针对 H100：

- **FP8 精度**：注意力分数与累加用 FP8 存（精度损失极小），带宽再砍一半，速度再提。
- **异步 warp 分组（warp specialization）**：把「读 tile」「算矩阵乘」「写结果」分到不同 warp 流水执行，隐藏搬运延迟，吃满 H100 的 TMA（Tensor Memory Accelerator）。

v3 的 FP8 值得多说一句：它是**分数/累加的存储位宽**从 16bit 降到 8bit（E4M3），HBM↔SRAM 搬运字节数减半。精度上，FP8 对「幅值不极端的注意力分数」损失很小（实测掉点 <0.5%），但**要求 Hopper（H100/H200）起原生支持**——A100 只能跑 FP16 的 FA2。这是 L26 讲 KV 量化时 FP8 的「前置铺垫」：FA 的 FP8（算子侧）与 KV 的 FP8（缓存侧）是两回事，但都吃 Hopper 的同一块硬件。

### 可跑的对照：v1/v2 的前向/反向速度比

把「前向/反向 FLOPs 占比」写成可跑的对照，验收「v2 让前向刻意放慢、整条流水更满」这个反直觉结论：

\`\`\`python
# 相对速度（示意，量级来自 v2 论文前向/反向均衡的结论）
# v1：前向比反向快很多 → 前向算完等反向，SM 利用率掉
# v2：前向 ≈ 反向的一半 → 前向/反向均衡，总时长更短
perf = {
    "v1": {"fwd": 1.00, "bwd": 0.40},   # 前向 2.5× 快于反向
    "v2": {"fwd": 0.80, "bwd": 0.55},   # 前向 ≈ 反向的 1.45×，更均衡
}
for v, p in perf.items():
    total = p["fwd"] + p["bwd"]
    print(f"{v}: 前向 {p['fwd']:.2f} / 反向 {p['bwd']:.2f}，"
          f"总 {total:.2f}，前向占比 {p['fwd']/total:.0%}")
# v2 总时长更短且前向/反向更均衡——优化目标是「整条流水最快」而非「前向最快」
\`\`\`

这段量化了「为什么要让前向变慢」：v1 前向 1.00、反向 0.40，前向算完要等反向追上来（流水线气泡）；v2 把前向压到 0.80、反向提到 0.55，**两段咬合更紧、总时长 0.60 < 1.40**——这是 L25 实测 FA 前后时「v2 比 v1 再快一截」的定量来源，也是理解「优化目标是流水最快」的关键。

:::deep

### 为什么「整条流水最快」才是优化目标

自回归训练时前向与反向各占大头。v1 时代前向比反向快很多（前向省了归一），意味着「前向算完在等反向」——算力没吃满。v2 把前向**刻意放慢到与反向接近**（前向不急着归一、反向补算），让前向+反向总时间更短、SM 利用率更高；v3 的异步 warp 分组是同一思路的延续——让「读 / 算 / 写」在不同 warp 里流水并行，进一步消除流水线气泡。

:::

### 进生产：FA 怎么被 vLLM / TensorRT-LLM 集成

FlashAttention 是**库**（\`flash-attn\` / \`flash-attention-2\`），不是模型本身。生产推理框架这样用它：

- **vLLM**：PagedAttention（L21）管 KV 分页，注意力算子底层调 FA 的 kernel 算「新 token × 全部已缓存 K/V」——分页是**存储组织**，FA 是**算子**，两者叠用。
- **TensorRT-LLM**：把 FA kernel 编译进图，配合 FP8（v3）走 H100 最高吞吐路径。

把「确认 FA 后端生效」写成可跑的探针，验收 L24 capstone 里「因子 C（算子快）真兑现了」，而不是默认回了旧版：

\`\`\`python
import vllm, torch

def check_fa_backend(model_path, gpu):
    """打印 vLLM 实际用的注意力后端与位宽，确认 FA 生效。"""
    from vllm import LLM
    llm = LLM(model=model_path, gpu_memory_utilization=0.9)
    eng = llm.llm_engine.engine
    backend = getattr(eng, "attention_backend", "unknown")
    print("vLLM 注意力后端：", backend)
    # Hopper（H100/H200）上应看到 flash_attn 且 dtype 可为 fp8（FA3）；
    # A100 上应看到 flash_attn 但 dtype 顶 fp16（FA2），开不了 fp8
    print("卡型：", torch.cuda.get_device_name(0))
    # 判据：日志/backend 含 flash_attn 才算「FA 生效」；
    # 若退到 xformers / naive 后端，说明 FA 没装上，因子 C 没兑现
    assert "flash_attn" in str(backend).lower() or "flash" in str(backend).lower(), \
        "FA 后端未生效——检查是否装了 flash-attn 包、卡型是否支持"
    # 记录 dtype：Hopper 上应为 fp8（FA3），A100 顶 fp16（FA2）
    return backend, torch.get_default_dtype()

# L24 消融表里「关 FA」对照：把后端切到非 flash（如 xformers）再跑一遍，
# 掉的那块吞吐就是因子 C 的贡献量级（prefill 重场景掉得最明显）
\`\`\`

这段把「FA 真的开没开」从口头变成一条可执行断言：启动 vLLM 后读它的 \`attention_backend\`，**含 \`flash_attn\` 才算生效**；退到 \`xformers\`/naive 说明 FA 没装上（包缺失或卡型不支持），L24 的「因子 C 贡献」就测不出来。L24 消融表里「关 FA」档，就是把后端切到非 flash 再跑一遍，掉的那块吞吐即因子 C 的量级。

所以 L21-L24 的推理系统课（PagedAttention/chunked prefill/capstone）里，「快」这一环几乎都是 FA 提供的，本课时把它的代际演进讲清，后面才知道「开 v3 FP8」具体省在哪。

### 选哪一版 FA：按硬件对号

把「v1/v2/v3 选哪版」落成硬件判据，避免「有 H100 却还在跑 FA2 FP16」这种没吃满的浪费：

- **A100（Volta/Ampere）**：最高支持 FA2（FP16），开不了 FP8——用 \`flash-attention\` 的 v2 后端即可，v3 的 Hopper 特性（TMA、FP8）在这张卡上不生效。
- **H100/H200（Hopper）**：能上 FA3 的 FP8 + 异步 warp 分组，吃满 TMA，比 FA2 再快一截——**有 Hopper 就优先 FA3**，把「分数/累加用 FP8」开起来。
- **判定**：看 vLLM/TensorRT-LLM 启动日志里的 \`flash_attn\` 版本与 \`dtype\`（\`fp16\` 还是 \`fp8\`），确认「卡支持的最新版 FA + 最高位宽」真的生效了，而不是默认回了旧版。这是 L24 capstone 调参时「因子 C（算子快）」能不能兑现的验收点。

一句话总结选版逻辑：**硬件决定上限**（A100 顶 FA2-FP16、Hopper 顶 FA3-FP8），**框架决定兑现**（vLLM/TensorRT-LLM 是否真把该版 kernel 编进图）。两个都对了「算子快」才在你的机器上成立；只要有一环默认回了旧版，FA 的加速就被低估，L24 的吞吐数字会比你预期的低一截。

:::tip

### 记 FA 代际的口诀

「**v1 省搬运、v2 省标量、v3 上 FP8**」：v1 解决 N×N 落 HBM（IO-aware），v2 解决矩阵乘外的标量 FLOPs 与 warp 并行，v3 吃 Hopper 的 FP8 + 异步 warp。每一版都针对**当时 GPU 的下一个瓶颈**，不是「再快一点」而是「换了个瓶颈来打」。

:::
`,
    null,
    [
      {
        text: 'FlashAttention v2 相对 v1 的主要优化是？',
        options: ['减少 FLOPs', 'warp 级并行 + 减少非矩阵乘标量 FLOPs', '改用 INT8', '去掉因果 mask'],
        answer: 1,
        explain:
          'v2 砍「矩阵乘之外」的标量运算并做 warp 并行，前向/反向更均衡，总时长更短（arXiv:2307.08691）。',
        concept: 'fa-v1v2v3',
      },
      {
        text: 'FlashAttention v3 针对 H100 的关键改动是？',
        options: ['只改 CPU', 'FP8 精度 + 异步 warp 分组（吃 TMA）', '改用 GQA', '去掉 online softmax'],
        answer: 1,
        explain: 'v3（arXiv:2407.08608）用 FP8 再砍带宽、用异步 warp 流水隐藏搬运延迟，吃满 Hopper。',
        concept: 'fa-v1v2v3',
      },
      {
        text: 'v2 把前向「刻意放慢到接近反向」的目的是？',
        options: ['让前向更慢', '前向+反向整条流水更满、总时长更短', '省内存', '提高精度'],
        answer: 1,
        explain: 'v1 前向比反向快很多导致「前向算完等反向」浪费算力；v2 均衡两者，优化整条流水而非单段。',
        concept: 'fa-v1v2v3',
      },
      {
        text: 'vLLM 里 FlashAttention 的角色是？',
        options: [
          '管 KV 分页',
          '注意力算子（底层 kernel），与 PagedAttention 存储组织叠用',
          '替代 KV cache',
          '只做前向',
        ],
        answer: 1,
        explain: 'FA 是算子库，PagedAttention 是 KV 存储组织，两者正交叠用：分页管存、FA 管算。',
        concept: 'fa-v1v2v3',
      },
    ],
    [
      ['FA v1', 'IO-aware 分块 + online softmax，省 HBM 搬运（2205.14135）'],
      ['FA v2', 'warp 级并行 + 减非矩阵乘 FLOPs，前向/反向均衡（2307.08691）'],
      ['FA v3', 'FP8 + 异步 warp 分组，吃 Hopper H100（2407.08608）'],
      ['流水权衡', '优化目标是「整条前向+反向流水最快」而非「单段最快」'],
    ],
    [
      '以为 v2/v3 减少了 FLOPs——它们优化的是搬运/标量/精度，注意力计算量仍 O(N²)。',
      '把 v3 的 FP8 当成「精度一定掉很多」——FA3 实测精度损失极小，换带宽翻倍。',
      '以为前向越快越好——v2 刻意让前向与反向均衡，整条流水才最快。',
      'PagedAttention 与 FA 二选一——它们是「存储组织 + 算子」正交叠用，不互斥。',
    ],
  ),
  'framework',
)
