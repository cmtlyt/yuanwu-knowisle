import { L, withKind } from '../../course-builders.ts'

export const L24 = withKind(
  L(
    'L24',
    10,
    '模块综合：GQA 注意力块 + vLLM 实测 KV 与吞吐',
    4,
    ['L16', 'L21', 'L22'],
    ['m2-capstone'],
    [
      '把 M2 三块（GQA 省 KV / PagedAttention 省碎片 / chunked prefill 管调度）拼成一条可跑的链路',
      '实现一个 GQA 注意力块并接入 vLLM，跑出一个「可执行验收断言」',
      '实测 GQA-8 相对 MHA 的 KV cache 内存与同显存吞吐，给出可复现数字',
      '能对着数字解释「吞吐提升是 三块合力」而非单点功劳',
    ],
    `
### 综合交付要做什么

这是 M2 的收束课。前面 7 课各自打碎「KV 存储随头数 × 序列长膨胀」这条短板的一个因子：L15/L16/L17 用 GQA 压「生成头数」、L19/L20 用 FlashAttention 压「注意力 IO」、L21 用 PagedAttention 压「KV 碎片」、L22 用 chunked prefill 压「调度饿死」。本课时把**这四件事拼成一条可复现的链路**：实现 GQA 块 → 接入 vLLM（自带分页 KV + chunked prefill + FlashAttention 后端）→ 测出「GQA-8 vs MHA」的 KV 内存与同显存吞吐 → 对着可执行断言验收。

:::deep

### 一条链路上每块负责什么

把 M2 的推理系统拆成「存、算、排」三个正交层，交付物正好各占一层：

- **存（GQA + PagedAttention）**：GQA 决定「每 token 存几组 K/V」（压生成头数因子），PagedAttention 决定「这些 K/V 怎么在显存里摆」（分页、省碎片、可共享前缀）。两者相乘才是 KV 的实际显存占用。
- **算（FlashAttention）**：注意力算子本身走 FA 后端（L19/L20），不物化 n×n 矩阵、IO-aware，是「同样的数学、更快的跑法」。
- **排（chunked prefill + continuous batching）**：调度层决定每一步 GPU 喂什么（L22），让长 prompt 不饿死短 decode、且把矩阵乘拼大吃满算力。

关键认知：**吞吐提升 = 三块合力**。单独看任何一块都解释不了 vLLM 那个「同显存 2–4 倍」——它来自「省了 KV 碎片（能塞更多请求）× 算子快（FA）× 调度不饿死（chunked）× 生成头少（GQA 省显存，显存省下来又能塞更多请求）」四件事相乘。本课时最后会拆出每个因子各贡献了多少，避免「记成一个开关」的错误心智。

:::

### 实现：GQA 注意力块（可跑）

先把 L16 的 GQA 层接成 vLLM 能吃的注意力块。vLLM 的模型定义里注意力是 \`Attention\` 算子，只要把 \`num_kv_heads\` 设成 g、其余照 GQA 逻辑，它就会自动走分页 KV + （后端若为 flash-attn）FlashAttention：

\`\`\`python
import torch, torch.nn as nn, torch.nn.functional as F

class GQAAttnBlock(nn.Module):
    """M2 综合：GQA 注意力块。num_kv_heads=g 触发 vLLM 分页 KV。"""
    def __init__(self, d_model, n_h, g, d_h=None, causal=True, enable_kv_cache=False):
        super().__init__()
        d_h = d_h or d_model // n_h
        assert n_h % g == 0, "g 必须整除 n_h"
        self.n_h, self.g, self.d_h = n_h, g, d_h
        self.causal, self.enable_kv_cache = causal, enable_kv_cache
        self.Wq = nn.Linear(d_model, n_h * d_h, bias=False)
        self.Wk = nn.Linear(d_model, g * d_h, bias=False)   # GQA 关键：K 只 g 组
        self.Wv = nn.Linear(d_model, g * d_h, bias=False)   # V 只 g 组
        self.Wo = nn.Linear(n_h * d_h, d_model, bias=False)
        self.kv_cache = {}                                   # 若 vLLM 分页则外部托管

    def forward(self, x, kv_cache=None):
        B, T, _ = x.shape
        q = self.Wq(x).view(B, T, self.n_h, self.d_h).transpose(1, 2)  # [B,n_h,T,d_h]
        k = self.Wk(x).view(B, T, self.g, self.d_h).transpose(1, 2)    # [B,g,T,d_h]
        v = self.Wv(x).view(B, T, self.g, self.d_h).transpose(1, 2)
        k = k.repeat(1, self.n_h // self.g, 1, 1)            # 逻辑广播到 n_h
        v = v.repeat(1, self.n_h // self.g, 1, 1)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=self.causal)
        return self.Wo(out.transpose(1, 2).reshape(B, T, -1)), (k, v)

# 冒烟：跑 32 头 MHA 与 8 组 GQA，输出形状一致、数值不同但都合理
torch.manual_seed(0)
blk_mha = GQAAttnBlock(d_model=4096, n_h=32, g=32)   # g=n_h → MHA
blk_gqa = GQAAttnBlock(d_model=4096, n_h=32, g=8)    # g=8 → GQA-8
x = torch.randn(1, 64, 4096)
out_mha, _ = blk_mha(x)
out_gqa, _ = blk_gqa(x)
assert out_mha.shape == out_gqa.shape == (1, 64, 4096)
print("GQA 块冒烟通过，两档输出 shape 一致")
\`\`\`

### 验收断言一：KV 内存实测

可执行断言（沿用 L15 的 \`kv_cache_mb\`，对照 L16 的 GQA 块）：

\`\`\`python
def kv_cache_mb(layers, seq, kv_heads, d_h, bits=16):
    bytes_per_token = 2 * kv_heads * d_h * (bits // 8)
    return layers * seq * bytes_per_token / 1e6

LAYERS, SEQ, D_H, N_H = 32, 4096, 128, 32
mha = kv_cache_mb(LAYERS, SEQ, N_H, D_H)
gqa8 = kv_cache_mb(LAYERS, SEQ, 8, D_H)
# 断言：GQA-8 的 KV 是 MHA 的 1/4
assert abs(gqa8 / mha - 8 / N_H) < 1e-6, "KV 内存应随生成头数线性下降"
print(f"MHA KV ≈ {mha:.1f} MB/层 × {LAYERS} 层；GQA-8 ≈ {gqa8:.1f} MB/层，降 {N_H/8:.1f} 倍")
# 工程含义：省下的 KV 显存能塞 (N_H/8) 倍并发请求，这就是吞吐提升的第一个因子
\`\`\`

### 验收断言二：vLLM 同显存吞吐（可复现脚本）

把 GQA 模型（\`num_kv_heads=8\`）与 MHA 模型（\`num_kv_heads=32\`）分别塞进 vLLM，**固定 GPU 显存预算**、跑同一组基准 prompt，测吞吐。核心命令与判读：

\`\`\`python
# 伪代码骨架：实际用 vllm SGLang / 官方 benchmark 脚本
from vllm import LLM, SamplingParams
import time

def bench(model_tag, n_kv_heads, gpu_memory_util=0.90, max_seq=8192):
    llm = LLM(model=model_tag, enforce_eager=False,
              gpu_memory_utilization=gpu_memory_util,
              max_model_len=max_seq,
              enable_chunked_prefill=True,     # L22 的调度
              kv_cache_dtype="auto")           # L26 的量化可在此开 fp8
    prompts = [load_prompt(i) for i in range(256)]   # 固定语料、含长短混合
    sp = SamplingParams(temperature=0.0, max_tokens=512)
    t0 = time.time()
    _ = llm.generate(prompts, sp)              # vLLM 内部分页 KV + continuous batching
    elapsed = time.time() - t0
    total = 256 * 512
    return total / elapsed                     # tokens/s

throughput_mha = bench("my-mha-32kv", n_kv_heads=32)
throughput_gqa = bench("my-gqa-8kv", n_kv_heads=8)
# 断言：同显存预算下 GQA-8 吞吐 ≥ MHA（KV 省了 → 能塞更多请求 → 吞吐不降反升）
assert throughput_gqa >= throughput_mha * 0.95, "GQA-8 同显存吞吐应不劣于 MHA"
print(f"MHA {throughput_mha:.0f} tok/s vs GQA-8 {throughput_gqa:.0f} tok/s")
\`\`\`

判读要点：① \`gpu_memory_utilization\` 必须**两档固定成同一个值**，否则「GQA 省显存」会被「预算更大」掩盖，测不出纯 KV 因子；② \`enable_chunked_prefill=True\` 保证长短请求不互相饿死（L22），否则长 prompt 会造成延迟尖峰、拉低平均吞吐；③ 若再开 \`kv_cache_dtype="fp8"\`（L26），KV 再降一档、能塞的并发更多，吞吐进一步上去——这是「三块合力」的现场演示。

:::deep

### 跑出来的数字怎么读（一个典型的对照）

把两档基准跑在同一张 24GB 卡上、固定 \`gpu_memory_utilization=0.90\`，典型输出会是这样（量级示意，具体随硬件与语料变）：

| 档位 | 单请求 KV | 同显存并发 | 平均吞吐 | P50 延迟 |
|---|---|---|---|---|
| MHA-32 | ~1.0 GB（seq 8K） | ~18 | 4.2k tok/s | 110ms |
| GQA-8 | ~0.25 GB（seq 8K） | ~72 | 9.8k tok/s | 61ms |

三个关键读法：① **KV 砍 4 倍 → 并发 4 倍**（1.0/0.25），并发从 18 翻到 72，这就是因子 A 的现场；② **吞吐近 2.3 倍**（4.2k→9.8k），比并发的 4 倍小，是因为「并发越多、每请求分到的注意力算力越少」存在边际递减——四因子相乘不是简单相加；③ **延迟 P50 下降**（110→61ms），来自 chunked prefill 把长 prompt 尖峰抹平 + 并发更满让 batch 利用率更高。三条合起来才能下「同显存 2–4 倍吞吐」的结论，缺任何一条都会被误读成「GQA 一个开关更快」。

### 为什么「GQA-8」而不是「GQA-1」

把并发推到最大应该选 g 越小越好（MQA，g=1，KV 砍 32 倍），为什么不直接上 MQA？因为 **g 越小、池化丢的组内检索越多、质量掉越大**（L17 讲过）。GQA-8 是「KV 砍 4 倍（并发 4 倍）」与「几乎无损质量」的平衡点：KV 因子砍得足够多（吞吐翻倍），质量掉点可忽略。若你的场景**显存极度紧张且任务对质量不敏感**（如高并发分类/路由），可上 GQA-4 甚至 MQA 换更多并发；若**质量优先**（如长文生成），用 GQA-16（更接近 MHA）换一点 KV 也够。g 是「并发 vs 质量」的旋钮，L24 跑基准时**至少抽测一个质量基准**确认掉点可接受，而不是只看吞吐。

:::

### 对着数字拆「三块合力」

跑完两档基准，把吞吐比 \`throughput_gqa / throughput_mha\` 拆成可归因的因子，避免笼统记成「GQA 更快」：

- **因子 A（省 KV 头数）**：GQA-8 把 KV 显存降 1/4 → 同显存预算能塞的并发请求数 ×4。这是**直接来自 L15/L16** 的因子。
- **因子 B（省碎片）**：PagedAttention（L21）让 KV 不浪费在预留对齐上，碎片率从「整块预留」的 30%+ 降到个位数，进一步放大因子 A 能塞的请求数。
- **因子 C（算子快）**：FlashAttention 后端（L19/L20）让每步注意力算子本身更快，prefill 尤其受益。
- **因子 D（不饿死）**：chunked prefill + continuous batching（L22）把「长 prompt 霸占」的延迟尖峰抹平，让 batch 始终满载，提高 GPU 有效利用率。

四个因子**相乘**才是总吞吐提升。本课时要交付的不只是「GQA 更快」，而是能对每个因子指出「它是哪一课的、各占多少」。这也是 M2 与后续 M7（DeepSeek 的 MLA + vLLM 深度工程）的分界：M2 做到「GQA 级 KV 压缩 + 标准推理系统」，M7 再上「低秩潜空间 MLA + 更激进的显存工程」。

:::deep

### 因子怎么「各占多少」：一个可归因的拆法

四个因子相乘后，想知道**每个各贡献多少**，做法是「逐一关、看吞吐掉多少」的消融：

- **关 GQA（用 MHA 跑）**：拿到 \`throughput_mha\`，这是「只靠推理系统、不省 KV 头数」的基线。
- **开 GQA（同推理系统）**：拿到 \`throughput_gqa\`，\`throughput_gqa / throughput_mha\` 就是「GQA 省 KV 头数」这一因子的贡献倍数。
- **关分页（连续 KV）**：把 vLLM 的分页关掉（或换连续分配框架）跑 GQA，吞吐会掉一块——掉的那块是「省碎片」因子 B。
- **关 FA（走 naive 注意力）**：把注意力后端切到非 Flash 实现，吞吐再掉一块——是因子 C。
- **关 chunked prefill**：吞吐掉最后一块——是因子 D。

把四块「掉下去的幅度」加起来，应当能**重合成**开全的总吞吐。这套消融是验收「三块合力不是单点」的核心手段：若你只记「GQA 更快」，做不出「关分页掉 X、关 FA 掉 Y」的分层数字，说明没真把 M2 拆透。

### 为什么「同显存」是这个实验的硬约束

整条验收里最容易被做废的一步是**两档显存预算不一致**：若 GQA 档用了更大的 \`gpu_memory_utilization\`，省下来的 KV 没被「塞更多请求」吃掉，反而被「更大的预算」白送，测出来的吞吐提升就**不是 KV 因子、而是预算因子**——归因全错。所以 \`gpu_memory_utilization\` 必须**两档写成同一个值**（如都 0.90），让唯一变量是 \`num_kv_heads\`。这是 L24 最容易翻车的地方，也是「对照实验要控制变量」在推理工程里的具体化。

### 把「KV 显存 → 并发请求数」落到一个公式

省 KV 显存之所以能换吞吐，中间隔着「同显存能塞多少并发请求」。把它写成可算的链路，归因才有抓手：

\`\`\`python
def concurrency_from_kv_budget(gpu_mem_gb, kv_bytes_per_req, num_kv_heads):
    """同显存预算下能塞的并发请求数 ∝ 1 / 单请求 KV 字节。
    KV 字节 ∝ num_kv_heads，所以 GQA-8 相对 MHA-32 并发 ×4。"""
    base = kv_bytes_per_req * num_kv_heads          # 单请求 KV 字节
    return gpu_mem_gb * 1e9 // base                 # 能塞的并发数

# 同一显存预算、同一目标序列长下，比较 MHA(32) 与 GQA(8) 的并发
budget = 20e9   # 20 GB 留给 KV（示意）
for label, heads in [("MHA-32", 32), ("GQA-8", 8)]:
    conc = concurrency_from_kv_budget(budget, 1000, heads)   # 单头每 token 1000B（示意）
    print(f"{label}: 单请求 KV ∝ {heads} → 并发 ≈ {conc}")
# GQA-8 的并发 ≈ MHA-32 的 4 倍（KV 字节降 1/4）——这就是因子 A 的定量来源
\`\`\`

这段把「GQA 省 KV → 同显存塞更多请求 → 吞吐上去」拆成两个可算的量：**单请求 KV 字节 ∝ 生成头数**、**并发 ∝ 1/KV 字节**。GQA-8 相对 MHA-32 并发 ×4，是因子 A 的精确量级（因子 B/C/D 再各自往上叠）。L25 前后实测、L26 KV 量化都挂在这条链上。

### 把「KV → 并发 → 吞吐」的边际递减讲清

上面的公式给的是「并发 ∝ 1/KV 字节」，但**吞吐不会跟着并发线性放大**，中间隔着「边际递减」，理解这层才能正确读 L24 的基准数字：

- **并发 ↑，但每请求算力 ↓**：同显存塞更多请求 = 同卡服务更多并发，但每张卡的 Tensor Core 算力是常数，并发越多、每个请求分到的注意力/FFN 算力越少，**单请求吞吐（tok/s/req）下降**。
- **总吞吐 = 并发 × 单请求吞吐**：并发 ×4 时，单请求吞吐若掉到 1/2，总吞吐才 ×2（不是 ×4）。这就是「KV 砍 4 倍、吞吐只到 2.3 倍」的来源——**因子 A 的收益被「算力守恒」打了折**。
- **何时递减变陡**：并发越高、decode 阶段越多（KV 搬得越多、矩阵乘越碎），边际递减越快；prefill 阶段（计算密集、大矩阵乘）递减慢。所以「同显存吞吐提升」在 **prefill 重的场景（长 prompt）兑现得比 decode 重的场景（纯长生成）多**。

把这条写进验收：跑 L24 基准时**同时记录「总吞吐」与「单请求吞吐」**，两者相乘应当守恒（总吞吐 = 并发 × 单请求吞吐 × 系数）。若总吞吐没涨，多半是并发没真正拉满（显存被权重/激活占了、KV 预算没释放给并发），回到「两档 gpu_memory_utilization 是否一致」排查——这是把「省 KV」真正兑现成「吞吐」的最后一环。

### 一个常见误读：「GQA 省 KV 就一定更快」

L24 的验收断言是「GQA-8 同显存吞吐 ≥ MHA ×0.95」，**不是「一定 ×4」**。原因正是上面的边际递减 + 场景相关：若你的负载**并发本来就低**（单用户长文生成，KV 不是瓶颈），GQA 省下的 KV 没被「塞更多请求」吃掉，吞吐几乎不涨（甚至因 GQA 池化丢一点质量需更保守解码而略降）。**GQA 的吞吐收益只在「高并发 + 长上下文、KV 是显存瓶颈」时兑现**；低并发短上下文场景，GQA 的价值是「能跑起来」（不 OOM），不是「跑得快」。这条判据决定「该不该上 GQA」：先看你的 KV 是不是瓶颈（显存占用大头是不是 KV cache），是才值得，否则省的是没在用的显存。

### 交付物清单（本课时验收看这几样）

把「综合交付」落成一份可勾选的清单，M2 出口就对着它验收：

- [ ] 一段可跑的 GQA 注意力块（上面 §实现），\`num_kv_heads=g\` 能触发 vLLM 分页。
- [ ] 两档 vLLM 基准（MHA-32 vs GQA-8）脚本，\`gpu_memory_utilization\` 两档一致、\`enable_chunked_prefill\` 都开。
- [ ] KV 内存实测断言（GQA-8 = MHA 的 1/4）。
- [ ] 同显存吞吐断言（GQA-8 ≥ MHA ×0.95）。
- [ ] 四因子消融表（关 GQA / 关分页 / 关 FA / 关 chunked 各掉多少，能重合成总提升）。

五条全勾，M2 综合交付完成，可进 M3。缺任何一条（尤其是「消融表」与「两档同显存」），说明吞吐提升还没归因到因子、只是「跑通了」，按 §验收断言二 的三条判读补。

:::

:::tip

### 收束与出口

M2 的出口判据：能用一段可跑代码实现 GQA 块、能跑通 vLLM 两档基准、能对着数字把吞吐提升归因到「KV 头数 / 碎片 / 算子 / 调度」四个因子。达成即完成模块综合，进入 M3（MoE：换掉 FFN 的「全激活」）。若数字对不上（如 GQA 吞吐反降），按 §验收断言二 的三条判读逐条排查：先查 \`gpu_memory_utilization\` 是否两档一致、再查 chunked prefill 是否开、最后查 FA 后端是否真的生效（vLLM 日志里看 \`flash_attn\`）。

三个最常翻车的点，交付前自查一遍：① **两档显存预算不一致**——最常见，会让「KV 因子」被「预算因子」污染，整张消融表作废；② **FA 没生效**（退到 xformers/naive）——因子 C 没兑现，吞吐比预期低却误以为是 GQA 的锅，先查 L20 的后端探针；③ **只看了总吞吐、没看单请求吞吐**——边际递减会让「并发 ×4」只兑现成「总吞吐 ×2.3」，把「总吞吐 = 并发 × 单请求吞吐」守恒式写进报告，才说明真把数字读透了。

:::
`,
    null,
    [
      {
        text: 'vLLM「同显存 2–4 倍吞吐」的提升主要来自？',
        options: [
          '单个开关',
          'GQA 省 KV + 分页省碎片 + FA 算子快 + chunked 不饿死 四因子相乘',
          '只靠 FlashAttention',
          '只靠 GQA',
        ],
        answer: 1,
        explain:
          '四件事正交叠用：省 KV 显存→塞更多请求、省碎片→再放大、FA→算子快、chunked→不饿死满载，相乘才到 2–4 倍。',
        concept: 'm2-capstone',
      },
      {
        text: '实测 GQA-8 吞吐时，必须固定哪个变量才能测出纯 KV 因子？',
        options: ['prompt 长度', 'gpu_memory_utilization 两档一致', '层数', '词表'],
        answer: 1,
        explain:
          '若两档显存预算不同，「GQA 省显存」会被「预算更大」掩盖，必须固定同一 gpu_memory_utilization 才归因到 KV 因子。',
        concept: 'm2-capstone',
      },
      {
        text: 'PagedAttention 在这条链路里负责的是？',
        options: ['压生成头数', '决定 KV 怎么在显存摆（分页省碎片、可共享前缀）', '压注意力算子', '压 FFN'],
        answer: 1,
        explain:
          'GQA 管「存几组 K/V」、PagedAttention 管「怎么摆」，两者相乘才是实际 KV 显存占用；FA 管「怎么算」、chunked 管「怎么排」。',
        concept: 'm2-capstone',
      },
      {
        text: 'GQA 吞吐反降时第一步排查的是？',
        options: ['换更大的模型', 'gpu_memory_utilization 是否两档一致', '删掉 GQA', '调大温度'],
        answer: 1,
        explain:
          '先确认显存预算两档一致（否则归因错），再查 chunked prefill 是否开、最后查 FA 后端是否真生效（vLLM 日志看 flash_attn）。',
        concept: 'm2-capstone',
      },
    ],
    [
      ['GQA 注意力块', 'num_kv_heads=g 的注意力层，接入 vLLM 即自动走分页 KV + FA 后端'],
      ['四因子归因', 'KV 头数 / 碎片 / 算子 / 调度 相乘 = 总吞吐提升，避免记成单开关'],
      ['gpu_memory_utilization', '同显存对比必须两档固定同一值，才能测出纯 KV 因子'],
      ['enable_chunked_prefill', 'vLLM 开关，长短请求不互相饿死（L22），抹平延迟尖峰'],
    ],
    [
      '把吞吐提升记成「GQA 一个开关」——它是四因子相乘，单块都解释不了 2–4 倍。',
      '同显存对比时两档 gpu_memory_utilization 不一致——会被预算差异掩盖、测不出 KV 因子。',
      '忘了开 chunked prefill——长 prompt 造成延迟尖峰、拉低平均吞吐。',
      '以为开了 GQA 就一定更快——要查 FA 后端是否真生效（vLLM 日志看 flash_attn），否则算子没提速。',
    ],
  ),
  'capstone',
)
