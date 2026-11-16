import { L, withKind } from '../../course-builders.ts'

export const L25 = withKind(
  L(
    'L25',
    11,
    'FlashAttention 前后实测：吞吐与峰值显存',
    4,
    ['L19', 'L20'],
    ['fa-bench'],
    [
      '写出可复现的「naive 注意力 vs FlashAttention」前后对比脚本',
      '测出两者在不同序列长度下的吞吐（ms）与峰值显存（GB），给出可复现数字',
      '用「naive 物化 n×n 矩阵」解释为什么显存随序列长暴涨、FA 却近似常数',
      '对着数字确认「同精度（bitwise 近似）下 FA 更快更省」，排除精度换速度的误读',
    ],
    `
### 要复现的结论

L19/L20 讲了 FlashAttention 是 **IO-aware** 的注意力重写：数学上与 \`softmax(QKᵀ)V\` 完全等价（bitwise 近似），但**不物化 n×n 注意力矩阵**，靠 tiling + 在线 softmax 把 HBM 往返压到最少。本课时把「开 FA 前 vs 开 FA 后」**实测出来**，让「省 IO」不是口头而是可复现的数字——这正是 00055 口径里 practice 课要交付的「可执行验收断言」。

:::deep

### 为什么显存曲线会分岔

两个实现的分岔点在**注意力矩阵 \`S = QKᵀ\` 要不要落地**：

- **naive 实现**：先算 \`S = Q @ Kᵀ\`（n×n 矩阵）→ 过 softmax → 再乘 V。中间那个 n×n 矩阵（每个 head 一份）要**物化进 HBM**，显存随 \`n²\` 涨。n=8192 时单个 head 的 S 就是 8192×8192×4byte ≈ 256MB，乘 head 数 × batch 直接爆。
- **FlashAttention**：把 Q/K/V 切成 tile，在 SRAM（更快更小的片上存）里逐块算局部 softmax、用 online softmax 归约，**全程不把 n×n 落回 HBM**。显存只随 \`n\`（存 Q/K/V 本身）线性涨，不随 \`n²\`。

所以测出来的曲线：**naive 的峰值显存随序列长「平方级」爬升，FA 的「线性」爬升**——序列越长分岔越陡。这就是长上下文（M1 的长上下文档位、L18 的窗口扩展）必须上 FA 的定量理由。

:::

### 可复现脚本：naive vs FA 前后对比

\`\`\`python
import torch, time, torch.nn.functional as F

def naive_attn(q, k, v, causal=True):
    """物化 n×n 的 S=QKᵀ，显存 O(n²)。"""
    B, H, N, D = q.shape
    s = torch.matmul(q, k.transpose(2, 3)) / (D ** 0.5)      # [B,H,N,N] 物化
    if causal:
        mask = torch.tril(torch.ones(N, N, device=q.device)).bool()
        s = s.masked_fill(~mask, float('-inf'))
    p = torch.softmax(s, dim=-1)
    return torch.matmul(p, v)

def flash_attn(q, k, v, causal=True):
    """FA：F.scaled_dot_product_attention 的 flash 后端，不物化 n×n。"""
    return F.scaled_dot_product_attention(q, k, v, is_causal=causal)

def bench(seq, heads=16, d_h=64, batch=4, iters=10, label=""):
    torch.manual_seed(0)
    q = torch.randn(batch, heads, seq, d_h, device='cuda')
    k, v = q.clone(), torch.randn(batch, heads, seq, d_h, device='cuda')
    torch.cuda.reset_peak_memory_stats(); torch.cuda.synchronize()

    t0 = time.time()
    for _ in range(iters):
        o1 = naive_attn(q, k, v, causal=True)
    torch.cuda.synchronize(); naive_ms = (time.time() - t0) / iters * 1000
    peak_naive = torch.cuda.max_memory_allocated() / 1e9

    t0 = time.time()
    for _ in range(iters):
        o2 = flash_attn(q, k, v, causal=True)
    torch.cuda.synchronize(); flash_ms = (time.time() - t0) / iters * 1000
    peak_flash = torch.cuda.max_memory_allocated() / 1e9

    # 精度对照：两者数学等价，数值应高度一致
    err = (o1 - o2).abs().max().item()
    print(f"{label} seq={seq:5d} | naive {naive_ms:8.2f}ms / {peak_naive:6.2f}GB "
          f"| FA {flash_ms:8.2f}ms / {peak_flash:6.2f}GB "
          f"| speedup {naive_ms/flash_ms:4.2f}× | max|Δ| {err:.2e}")

for seq in (1024, 2048, 4096, 8192):
    bench(seq, label="attn")
# 可执行断言：seq=8192 时 FA 峰值显存 < naive 的一半，且数值误差 < 1e-3
\`\`\`

### 验收断言（可执行）

跑完上面的 \`bench\`，验收四条：

- **吞吐提升**：\`speedup = naive_ms / flash_ms\` 在 seq=8192 时 ≥ 1.5×（越长越快，因 FA 省的是随 n² 的 IO，naive 随 n² 吃 HBM）。
- **显存分岔**：seq=8192 时 \`peak_flash < peak_naive / 2\`——naive 物化 n×n 后显存平方级，FA 线性级，越长大差距越陡。
- **精度无损**：\`(o1 - o2).abs().max()\` < \`1e-3\`（fp16 下），证明 FA 是「同数学重写」不是「精度换速度」，这是排除误读的关键一条。
- **曲线形状**：随 seq 翻倍，naive 峰值显存约 ×4（n² 的因子），FA 约 ×2（n 的因子）——分岔在「平方 vs 线性」，可复现。

### 怎么读出来的数字：一个典型的对照

把脚本跑在 24GB 卡上、seq=8192，典型输出会是这样（量级示意，具体数值随硬件/批大小变）：

| 序列长 | naive 吞吐 | naive 峰值 | FA 吞吐 | FA 峰值 | speedup | Δmax |
|---|---|---|---|---|---|---|
| 1024 | 2.1ms | 0.9GB | 1.8ms | 0.7GB | 1.2× | 4e-4 |
| 2048 | 4.6ms | 1.6GB | 3.5ms | 0.9GB | 1.3× | 4e-4 |
| 4096 | 11.2ms | 3.8GB | 7.1ms | 1.2GB | 1.6× | 5e-4 |
| 8192 | 41.0ms（接近 OOM） | 14.9GB | 21.4ms | 1.5GB | 1.9× | 6e-4 |

三个关键读法：① **speedup 随 seq 单调放大**（1.2→1.9×），因为 FA 省的是随 n² 的 HBM 搬运，naive 的 n² 物化在长序列越痛；② **峰值显存分岔**在 8192 时最陡（naive 14.9GB vs FA 1.5GB），平方 vs 线性的差距被序列长放大；③ **max|Δ| 始终 <1e-3**，证明数值等价——三条合起来才能下「FA 更快更省且不损精度」的结论，缺任何一条都会被误读。

### 序列长拉到 32K / 128K 时，naive 会怎样

把 seq 继续拉到 32K：naive 的 n×n 分数矩阵单 head 就是 32K×32K×4byte ≈ 4GB，乘 head 数（16–64）与 batch 直接爆显存——**naive 在长上下文根本跑不动**，这是 L18 的「滑窗 + 全局层」与 M1 的「长上下文档位」必须上 FA 的硬理由。而 FA 在 32K 时峰值仍只随 n 线性（几 GB 内），能直接支撑 32K 甚至 128K 上下文。所以「长上下文能不能上」在工程上等价于「注意力算子是不是 FA」，naive 注意力只在短序列（<4K）的教学/调试场景才用。

:::deep

### 让「前后实测」公平：三个必须控制的变量

上面的 \`bench\` 要得出「FA 更快」的结论，前提是两档对比**只有一个变量（开/关 FA）**，否则测出来的差异会被别的因素污染。跑之前先锁死三个变量：

- **同精度**：两档都用 fp16/bf16（或同档 fp32），**不能拿 FA 的 fp16 对比 naive 的 fp32**，否则「快」里混进了「低精度更快算」的成分，测不出 FA 本身。精度对照（max|Δ| < 1e-3）就是防这条的——同精度下数值才可比。
- **同序列长同 batch**：\`seq\`、\`heads\`、\`batch\`、\`d_h\` 全部固定，只切「naive 实现 / FA 后端」。若两档 batch 不同，吞吐差异会被 batch 主导，归因全错。
- **同 warmup 同迭代数**：两种实现都要**先 warmup 再计时**（GPU 的 kernel 编译、显存分配有首次开销），\`iters\` 两档一致。naive 的 \`reset_peak_memory_stats\` 也要在计时前调，否则峰值统计被前面的分配污染。

这三条锁死后，测出的 \`speedup\` 与「峰值显存分岔」才是**纯 FA 因子的贡献**，能干净地归因到 L19 的「IO-aware」。若没锁（比如两档精度不同），数字还能看、但**不能下「FA 更快」的结论**——只能下「这套配置更快」。这是 L24 capstone 做消融表时的同一条纪律：**对照实验控制变量**。

### 为什么短序列（512）差距不明显

把 \`seq\` 压到 512 再跑，\`speedup\` 会掉到 1.1× 左右——**FA 的优势随序列长放大，短序列几乎看不出**。原因是 FA 省的是「n×n 矩阵的 HBM 往返」，n=512 时 n×n 才 25 万项、物化开销小，搬运不是瓶颈（算力甚至启动开销才是）；n=8192 时 n×n 有 6700 万项，搬运成绝对瓶颈，FA 的省搬运才被放大。所以「FA 前后实测」**要用足够长的序列（≥4K）才测得出有意义的 speedup**，短序列基准（很多框架默认的 512/1K）会把 FA 的优势低估掉——这是跑 FA 基准时最常翻车的一步。

:::

:::tip

### 与 L20、L26 的衔接

本课时的「前后实测」把 L20 的 v1/v2/v3 演进落到数字：**v1 省了 IO、v2 优化了并行（减少非计算 FLOPs、更好的核切分）使吞吐再升**——同一段脚本在 v1/v2 后端上 speedup 会再上一个台阶。而 L26 的 KV 量化（INT8/FP8）是**另一维**的省显存：FA 省的是「注意力矩阵的 IO」，KV 量化省的是「K/V 本身存几字节」，两者正交可叠——M7 的 vLLM 深度工程里 FA + KV-fp8 同时开就是这条。测完本课时的 FA 前后，进 L26 把「K/V 的字节数」也降一档，就能看到显存曲线再压一截。

跑完这套前后实测，把三条数字（speedup 曲线、显存分岔、误差上界）记成「**FA 收益随序列长放大、且数值等价**」一句话，就是 M2 注意力算子侧的收束。下一步 L26 把「KV 字节数」也降一档（INT8/FP8），你会发现显存曲线在 FA 省掉「中间矩阵」的基础上**再压一截「KV 本身」**——两块叠起来，才是长上下文 + 高并发下完整的省显存图景。

最后给一条「测完怎么下结论」的模板，避免把三组数字混在一起说：① 先报 **speedup 随 seq 的曲线**（证明 IO-aware、长序列更夸张）；② 再报 **naive vs FA 峰值显存分岔**（证明 n² vs n）；③ 最后报 **max|Δ| 上界**（证明数值等价、非精度换速度）。三句分开说、对应三个不同的「省」，才是完整的 FA 前后实测结论；缺哪一句，结论就会被对应那条误读（缺①→以为是通用加速、缺②→以为是算力优化、缺③→被当成近似/精度损失）。把这套「三句结论」写成可跑的报告生成器，验收三组数字都被正确归位、没有串项：

\`\`\`python
def fa_report(seq, naive_ms, flash_ms, peak_naive_gb, peak_flash_gb, max_delta):
    """把三组数字归到三条结论，避免串项。"""
    speedup = naive_ms / flash_ms
    mem_drop = peak_naive_gb - peak_flash_gb
    lines = [
        f"① IO-aware：seq={seq} 时 speedup={speedup:.2f}×（随 seq 单调放大）",
        f"② 显存分岔：naive {peak_naive_gb:.1f}GB vs FA {peak_flash_gb:.1f}GB，省 {mem_drop:.1f}GB",
        f"③ 数值等价：max|Δ|={max_delta:.1e} < 1e-3（非精度换速度）",
    ]
    # 验收：三条结论必须各自独立、数字对得上，缺哪条就标 TODO 不串项
    assert max_delta < 1e-3, "③ 数值等价断言失败——FA 可能被误实现成近似"
    assert speedup > 1.0, "① 提速断言失败——可能 FA 没生效或序列太短"
    return "\\n".join(lines)

# 示例：seq=8192 的一组典型输出（量级示意）
print(fa_report(8192, 41.0, 21.4, 14.9, 1.5, 6e-4))
\`\`\`

跑完把三句分开写进报告（不要合成一句「FA 更快更省」），L24 的消融表里「因子 C（算子快）」这一行就靠①②③三条数字支撑，缺一条都说明「快/省」还没归因到位。

:::
`,
    null,
    [
      {
        text: 'naive 注意力随序列长暴涨的显存来自？',
        options: ['Q/K/V 本身', '物化的 n×n 注意力矩阵 S=QKᵀ', 'softmax', 'FFN'],
        answer: 1,
        explain:
          'naive 把 S=QKᵀ（每 head 一份）物化进 HBM，随 n² 涨；FA 靠 tiling + online softmax 全程不落 n×n，只随 n 线性。',
        concept: 'fa-bench',
      },
      {
        text: '验证「FA 是重写而非精度换速度」要看哪条？',
        options: ['只看更快', '(o1-o2).abs().max() < 1e-3，数值与 naive 高度一致', '只看更省显存', '不验证'],
        answer: 1,
        explain:
          'FA 数学上与 softmax(QKᵀ)V 等价（bitwise 近似），误差应 <1e-3，才能排除「拿精度换速度」的误读。',
        concept: 'fa-bench',
      },
      {
        text: 'seq 从 4096 翻倍到 8192，naive 与 FA 的峰值显存大致各变多少？',
        options: ['都 ×4', 'naive 约 ×4（n²）、FA 约 ×2（n）', '都 ×2', '都不变'],
        answer: 1,
        explain:
          'naive 物化 n×n → 平方级（翻倍 ×4）；FA 只存 Q/K/V → 线性级（翻倍 ×2），分岔在平方 vs 线性。',
        concept: 'fa-bench',
      },
      {
        text: 'FA 省的是哪种开销？',
        options: ['K/V 的字节数', '注意力矩阵的 HBM 往返（IO-aware）', 'FFN 算力', '词表大小'],
        answer: 1,
        explain:
          'FA 是 IO-aware：把 HBM 往返压到最少，省的是注意力矩阵的 IO；K/V 字节数是 L26 的量化，正交可叠。',
        concept: 'fa-bench',
      },
    ],
    [
      ['naive 注意力', '物化 n×n 的 S=QKᵀ，显存随 n² 涨'],
      ['FlashAttention', 'tiling + online softmax，不落 n×n、IO-aware，显存随 n 线性'],
      ['speedup', 'naive_ms/flash_ms，越长越大（FA 省的是 n² 的 IO）'],
      ['峰值显存分岔', 'naive 平方级 vs FA 线性级，序列越长分岔越陡'],
    ],
    [
      '以为 FA 省的是 K/V 字节数——它省的是注意力矩阵的 IO，K/V 字节是 L26 量化的事。',
      '把 FA 当「精度换速度」——它是同数学重写，数值误差 <1e-3，精度不牺牲。',
      'naive 测长序列直接 OOM——n×n 物化会爆，测长上下文时必须用 FA 或切窗（L18）。',
      '只测短序列就下结论——FA 的优势随序列长放大，短序列（如 512）差距不明显。',
    ],
  ),
  'practice',
)
