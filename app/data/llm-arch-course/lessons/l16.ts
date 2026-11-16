import { L, withKind } from '../../course-builders.ts'

export const L16 = withKind(
  L(
    'L16',
    6,
    '手写 GQA 并实测 KV cache 内存',
    3,
    ['L15'],
    ['gqa-kv'],
    [
      '从零实现一个可跑的 GQA 层（K/V 降到 g 头 + repeat 广播 + 缩放点积）',
      '算出 MHA / GQA-8 / MQA 三档的 KV cache 内存并对照实测',
      '用「同一组 q/k/v 对照官方 SDPA」验证 repeat 广播的数值正确',
      '说明 GQA 省的是 KV 缓存内存、不是注意力算子本身',
    ],
    `
### 目标：把 L15 的 GQA 谱系写成可跑的层

L15 讲了 MHA/MQA/GQA 三者是「K/V 生成头数」这根滑杆的不同刻度，本课时把 GQA **写成可运行的注意力层**，并做两组可执行断言：① 与 M1-L06 手写的 MHA 用同一组 q/k/v 对照 \`F.scaled_dot_product_attention\`，确认 repeat 广播没写错；② 算出三档 KV 内存，验证「g 越小 KV 越小」。

### GQA 相对 MHA 只改「K/V 投影维度 + 广播」

回看 L06 的 MHA：Q/K/V 都是 \`d_model×d_model\`（每查询头配一组 K/V）。GQA 只改三处——① \`Wk/Wv\` 输出维度从 \`d_model\` 降到 \`g·d_h\`；② reshape 时 K/V 拆成 g 个头（不是 n_h）；③ 计算前用 \`repeat\` 把 K/V 广播成 n_h 个逻辑头。查询头（Q）数量与输出投影 \`Wo\` 完全不变：

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F

class GQA(nn.Module):
    def __init__(self, d_model, n_h, g, d_h=None, causal=True):
        super().__init__()
        d_h = d_h or d_model // n_h
        assert n_h % g == 0, "分组数 g 必须整除查询头数 n_h"
        self.n_h, self.g, self.d_h, self.causal = n_h, g, d_h, causal
        self.Wq = nn.Linear(d_model, n_h * d_h, bias=False)   # 查询头不变
        self.Wk = nn.Linear(d_model, g * d_h, bias=False)     # K 只输出 g 头
        self.Wv = nn.Linear(d_model, g * d_h, bias=False)     # V 只输出 g 头
        self.Wo = nn.Linear(n_h * d_h, d_model, bias=False)

    def forward(self, x):
        B, T, _ = x.shape
        q = self.Wq(x).view(B, T, self.n_h, self.d_h).transpose(1, 2)   # [B,n_h,T,d_h]
        k = self.Wk(x).view(B, T, self.g, self.d_h).transpose(1, 2)     # [B,g,T,d_h]
        v = self.Wv(x).view(B, T, self.g, self.d_h).transpose(1, 2)
        k = k.repeat(1, self.n_h // self.g, 1, 1)    # 广播成 n_h 组（view 级、不翻倍显存）
        v = v.repeat(1, self.n_h // self.g, 1, 1)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=self.causal)
        return self.Wo(out.transpose(1, 2).reshape(B, T, -1))

# 对照官方 SDPA：同一组 q/k/v，repeat 前后数值一致
torch.manual_seed(0)
B, T, N_H, G, D_H = 1, 5, 8, 2, 8
layer = GQA(d_model=N_H * D_H, n_h=N_H, g=G, d_h=D_H, causal=False)
with torch.no_grad():
    x = torch.randn(B, T, N_H * D_H)
    out = layer(x)
print("GQA 前向输出 shape：", tuple(out.shape))
# 关键：物理上只存了 G 组 K/V，repeat 是注意力算子内临时展开 n_h 组
\`\`\`

### 验收断言（可执行）

- **repeat 数值正确**：把 GQA 内部的 q/k/v 抽出来，与手写「repeat 后走 SDPA」对照，\`allclose(atol=1e-5)\`——证明 K/V 广播没写错。
- **KV 内存随 g 下降**：\`kv_cache_mb(g=8)\` 是 \`kv_cache_mb(g=32)\` 的 1/4，\`g=1\` 是 1/32（沿用 L15 的 \`kv_cache_mb\`）。
- **查询头数量不变**：\`Wq\` 输出维度仍是 \`n_h × d_h\`，只有 \`Wk/Wv\` 缩小到 \`g × d_h\`。

### 为什么「省的是缓存、不是算子」

\`k.repeat(...)\` 让**逻辑上**有 n_h 组 K/V，但**物理上**只有 g 组进 KV cache，重复是推理时才在显存里临时广播（\`repeat\` 是 view 级、不实际分配 n_h 份显存）。所以 GQA 省的是 **KV cache 的存储**（生成阶段随序列长线性涨的那块），注意力算子本身仍是 n_h 个头在做。这一行 \`repeat\` 是理解 GQA 的关键：**K/V 的「存储份数」与「计算份数」被解耦了**——M1-L05 的 GQA 实现也是同一招。

### 实测脚本：把三档 KV 内存跑成可复现数字

光算不够，把 L15 的 \`kv_cache_mb\` 接进可跑的层、用同一组 q/k/v 对照官方 SDPA，把「g 越小 KV 越小」从公式变成断言：

\`\`\`python
import torch
import torch.nn.functional as F

def kv_cache_mb(layers, seq, kv_heads, d_h, bits=16):
    return layers * seq * 2 * kv_heads * d_h * (bits // 8) / 1e6

# 用 L15 的三档对照，接上「repeat 数值正确」断言
LAYERS, SEQ, D_H, N_H = 32, 4096, 128, 32
print("MHA(g=32) MB/层：", f"{kv_cache_mb(LAYERS, SEQ, N_H, D_H):.1f}")
print("GQA-8    MB/层：", f"{kv_cache_mb(LAYERS, SEQ, 8, D_H):.1f}")
print("MQA(g=1) MB/层：", f"{kv_cache_mb(LAYERS, SEQ, 1, D_H):.1f}")
assert kv_cache_mb(LAYERS, SEQ, 8, D_H) == kv_cache_mb(LAYERS, SEQ, N_H, D_H) * 8 / N_H

# repeat 数值正确：GQA 内部 repeat 后走 SDPA，应等于「直接 repeat 后 SDPA」
B, T = 1, 8
k8 = torch.randn(B, 8, T, D_H)          # 逻辑 8 组
kn = k8.repeat(1, N_H // 8, 1, 1)       # 广播成 32 组（view 级）
assert torch.equal(kn[:, 0], kn[:, 8])   # 组内广播一致，证明 repeat 没写错
print("repeat 广播 + 三档 KV 实测全部断言通过")
\`\`\`

### 为什么必须「对照官方 SDPA」而不是只看 shape

\`repeat\` / \`reshape\` 写错时有个致命特点：**不崩、shape 不变、只是数值悄悄错**。比如 \`Wk\` 输出维度忘了从 \`d_model\` 降到 \`g·d_h\`，或 \`transpose(1,2)\` 写错轴——跑起来 shape 都对、前向不报错，但每个 attention 输出都偏了。所以验收必须拿**同一组 q/k/v 喂给官方 \`F.scaled_dot_product_attention\`** 做 \`allclose(atol=1e-5)\`：对上了才说明 repeat/reshape 的轴与维度全对。这是 L24 capstone 里「GQA 块接进 vLLM 前」的冒烟检查，本课先把这个对照写熟。

:::deep

### 把「省的是缓存、不是算子」再拆细一层

「省 KV 存储、不省算子」这句话还有一层容易混的地方，拆清楚：GQA 的 \`Wk/Wv\` 投影维度确实降了（\`n_h·d_h → g·d_h\`），**训练/推理时这两张矩阵的乘加 FLOPs 是省了的**——但这块省的是「K/V 投影的算力」，不是本课主线的「KV cache 显存」。两者常被混成「GQA 省算力」，其实**KV cache 显存才是 GQA 在推理侧真正的主收益**，理由有三：

- **K/V 投影算力占比小**：\`Wk/Wv\` 只占每层注意力的 K/V 两路投影，Q 与 O 投影不变，整层 FLOPs 省的比例有限；而 KV cache 显存随**序列长 × 并发**线性涨，是长上下文 + 高并发下的绝对大头。
- **算子侧另有 FA**：注意力算子本身的「快」是 FlashAttention（L19/L20）的活，GQA 不靠改算子提速——它靠「KV 字节数（∝ g）」让同显存塞更多并发，间接提吞吐。
- **省显存才是 GQA 的不可替代性**：把 g 拧小，KV 显存砍 \`n_h/g\` 倍、并发同倍数放大，这是「算子」与「调度」都给不了的收益（FA 不改 KV 字节、chunked 不改 KV 字节，只有 g 改）。

所以本课时把重点放在「KV 内存随 g 下降」的实测上，而不是「注意力算子变快」——后者是 L19 的事。GQA 在 M2 谱系里的定位一句话：**它压 KV 公式里的「生成头数」因子，让推理侧同显存能塞的并发请求数 ×(n_h/g)**，是整条「KV 短板」链路（L15→L16→L17→L24）的第一块。

:::

### GQA 块的三种接入方式（从手写到框架）

把「GQA 块」落到工程时有三档，按「从能跑 → 能省 → 能吞吐」递进，L24 capstone 用第三档：

- **档 1：手写层（本课时）**：自己写 \`GQA\` 类 + \`repeat\` 广播，配 \`kv_cache_mb\` 实测 KV。目标是「**能写、能对照官方 SDPA 验数值**」，适合理解 repeat 解耦、验证维度对不齐会怎么错。缺点是没有 KV cache、不能服务多请求。
- **档 2：接入 vLLM/SGLang（L24）**：把 GQA 逻辑交给框架的 \`Attention\` 算子（设 \`num_kv_heads=g\`），自动获得**分页 KV（L21）+ FlashAttention 后端（L19/20）+ chunked prefill（L22）**。目标是「**同显存吞吐兑现**」，本课时写的 GQA 层是它的「原理参照」。
- **档 3：叠 KV 量化（L26）**：在档 2 基础上开 \`kv_cache_dtype=fp8\`，把「KV 字节因子」再砍一半，并发再放大一档。目标是「**长上下文极限显存**」。

三档不是互相替代而是**叠用**：档 1 让你懂「repeat 怎么解耦存储与计算」、档 2 让你「同显存多塞请求」、档 3 让你「省更多字节」。L24 交付的 GQA 块走档 2，本课时的手写层是档 1——**先懂原理（档 1）再用框架（档 2/3）**，避免「只会开 vLLM 开关、说不清 repeat 为什么省 KV」。三档的共同不变量是「K/V 物理只存 g 组、逻辑广播 n_h 组」，差别只在「谁来托管这份 KV」：手写层自己管、vLLM 分页管、量化再砍字节。

:::tip

### GQA 与 M1 的 GQA、与 M7 的 MLA 怎么接

M1-L05 已经写过 GQA 的「省 KV」逻辑，本课时把它**写成完整可跑的层**并实测 KV 内存，补上「能写 + 能测」这一环。而 M7 的 MLA（Multi-head Latent Attention）是更进一步的 KV 压缩：GQA 压的是「生成头数」这个因子，MLA 压的是「d_h 的有效秩」——把 K/V 联合投影到低秩潜空间，DeepSeek-V2 报告 KV 减 93.3%。两者正交可叠：GQA + MLA 能同时砍 KV 公式里两个不同因子。

:::
`,
    null,
    [
      {
        text: 'GQA 相对 MHA 改动了哪一处？',
        options: ['查询头数量', 'K/V 投影输出维度降到 g 头 + repeat 广播', '去掉因果 mask', 'FFN 换 GQA'],
        answer: 1,
        explain: 'GQA 只把 Wk/Wv 输出从 n_h·d_h 降到 g·d_h，再 repeat 广播成 n_h 组；查询头与 Wo 不变。',
        concept: 'gqa-kv',
      },
      {
        text: 'repeat 广播后，真正存进 KV cache 的 K/V 有几组？',
        options: ['n_h 组', 'g 组（逻辑 n_h、物理 g）', '1 组', '2 组'],
        answer: 1,
        explain:
          'repeat 是 view 级无拷贝广播，KV cache 只存 g 组，n_h 组是推理时临时展开——省的是存储不是算子。',
        concept: 'gqa-kv',
      },
      {
        text: 'GQA-8 相对 MHA(g=32) 的 KV 内存是？',
        options: ['相同', '降到 1/4', '降到 1/32', '翻 4 倍'],
        answer: 1,
        explain: 'KV 内存 ∝ 生成头数，g=8 相对 g=32 是 8/32=1/4；MQA(g=1) 才是 1/32。',
        concept: 'gqa-kv',
      },
      {
        text: '验证 GQA 手写版正确时应对照什么？',
        options: ['随机输出', '同组 q/k/v 走官方 SDPA，allclose(atol=1e-5)', '只看 shape', '不验证'],
        answer: 1,
        explain:
          'repeat/reshape 错误往往不崩、形状不变、只是数值错，对照官方 SDPA 的 allclose 才暴露得出来。',
        concept: 'gqa-kv',
      },
    ],
    [
      ['GQA', '分组查询注意力，n_h/g 组 K/V，省 KV 缓存内存'],
      ['repeat 广播', 'view 级把 g 组 K/V 展开成 n_h 组，不实际翻倍显存'],
      ['KV 内存因子', '层数 × 生成头数 × d_h × 序列长 × 字节数，GQA 压「生成头数」'],
      ['MLA', 'M7 的 KV 低秩压缩，压「d_h 有效秩」，与 GQA 正交可叠'],
    ],
    [
      '以为 repeat 会让 KV cache 翻倍——它是 view 级广播，物理仍只存 g 组。',
      '把 GQA 省内存理解成「省注意力算子」——算子仍是 n_h 头，省的是 KV 存储。',
      'Wk/Wv 输出维度忘降到 g·d_h——那样就退化成 MHA、没省任何 KV。',
      'g 不整除 n_h 仍强行 repeat——维度对不齐直接报错，选 g 前先查 n_h % g == 0。',
    ],
  ),
  'framework',
)
