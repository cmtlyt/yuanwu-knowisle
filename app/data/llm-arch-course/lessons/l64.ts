import { L, withKind } from '../../course-builders.ts'

export const L64 = withKind(
  L(
    'L64',
    30,
    '解耦 RoPE：K 拆未旋转内容 + 小旋转 k^R',
    4,
    ['L63'],
    ['decoupled-rope'],
    [
      '讲清标准 RoPE 与 KV 压缩的冲突',
      '解释解耦 RoPE 的 K 拆分',
      '说明如何保住 KV 压缩又保位置精度',
      '对照两种 RoPE 的实现',
    ],
    `### 标准 RoPE 做了什么

旋转位置编码（RoPE）的核心是给每个位置 m 配一个旋转矩阵 R_m，作用到 Q、K 向量上，使得两个位置 m、n 的注意力打分只依赖相对位移：R_m q 与 R_n k 的点积等于 q 与 R_{n−m} k 的点积。这个相对位置性质让模型能外推到更长序列，是现代 LLM 的默认位置方案。实现上，RoPE 把每头 d_h 维的向量两两配对（维度 i 与 i + d_h/2 组成一对），按位置角 m·θ_i 做二维旋转；它作用在**每个注意力头的完整子空间**上，这一点后面会成为与 KV 压缩冲突的根源。

### 冲突：低秩压缩装不下位置旋转

L63 的 MLA 把 K、V 压成共享的低秩潜向量 c_KV，推理只缓存 c_KV，用时再上投影 K = W^UK · c_KV。现在问：位置编码往哪放？两条直觉路线都走不通。

第一条路线是**先旋转再压缩**：对每个位置的 K 施加 RoPE 后再下投影进 c_KV。问题是注意力打分需要在还原出的各头 K 上体现相对位置，而还原用的是 W^UK 这个与位置无关的线性变换。旋转矩阵 R_n 与 W^UK 一般**不对易**，即 W^UK · R_n · c ≠ R_n · W^UK · c。把旋转塞进低秩空间，经过上投影后得不到干净的相对位置形式，位置信息被低秩骨架揉乱。

第二条路线是**先还原再旋转**：K = R_n · (W^UK · c_KV)，位置对了。但要缓存的是旋转后的完整 K（n_h 个头、每头 d_h 维），等于把 MLA 省下的 KV 又原样存回去，93.3% 的压缩直接作废。两条路线的矛盾是同一件事的两面：**位置需要作用在高维各头子空间，压缩却发生在共享低秩空间，二者不在同一个空间里**。

:::deep

### 不对易：用数字看两条路线为什么失败

把「旋转与线性变换不对易」写成可跑的数值实验。先实现 RoPE 的二维旋转，再对比「先旋转后线性变换」与「先线性变换后旋转」的结果差异——差异不为零，就说明在潜空间加旋转无法等价于在头空间加旋转。

\`\`\`python
import numpy as np

def rope_rotate(x, pos, dim, theta=10000.0):
    """对二维配对维度施加 RoPE 旋转，x 的最后一维是 dim。"""
    half = dim // 2
    x = x.reshape(-1, half, 2).copy()
    freq = 1.0 / (theta ** (np.arange(half) / half))
    ang = pos * freq
    cos, sin = np.cos(ang), np.sin(ang)
    x0, x1 = x[..., 0].copy(), x[..., 1].copy()
    x[..., 0] = x0 * cos - x1 * sin
    x[..., 1] = x0 * sin + x1 * cos
    return x.reshape(-1, dim)

rng = np.random.default_rng(0)
d_lat, d_head, pos = 16, 32, 7
c = rng.normal(size=d_lat)                       # 低秩潜向量
W = rng.normal(size=(d_head, d_lat)) / d_lat**0.5  # 上投影 W^UK
c_rot = rope_rotate(c, pos, d_lat)                  # 路线一：潜空间先旋转
route_a = W @ c_rot
route_b = rope_rotate(W @ c, pos, d_head)          # 路线二：头空间后旋转
gap = np.linalg.norm(route_a - route_b)
print(f"两条路线输出范数差 = {gap:.4f}（非零说明不对易）")
assert gap > 1e-3, "旋转与上投影不可交换，潜空间加旋转会丢位置性质"
\`\`\`

这个非零差值就是冲突的精确含义：你没法在低秩空间里「顺手」把位置转好，再指望上投影帮你还原出正确的相对位置。

:::

### 解法：把 K 拆成内容与旋转两块

解耦 RoPE 的做法是把一个完整的 K 拆成两部分，各走各的路：

- **内容部分 k^C**：从低秩 c_KV 经 W^UK 上投影得到，维度是每头 d_h，**不施加 RoPE**。它纯负责「内容匹配」，继续享受 MLA 的 KV 压缩——缓存里只有 c_KV。
- **旋转部分 k^R**：直接从当前隐藏状态 h_t 经一个小矩阵 W^KR 算出，维度 d_h^R（远小于 d_h），**施加 RoPE**，而且**跨所有头共享一份**。它纯负责「位置」。

每个头的完整 K 是二者的拼接：K_head = concat(k^C_head, k^R)。Q 也对称拆分：q^C 从低秩经 W^UQ 还原、不旋转；q^R 从 h_t 经 W^QR 算出、施加 RoPE、共享。于是缓存里每个 token 只需存 c_KV（内容骨架）加一份共享的 k^R（位置），总量 d_c + d_h^R，仍远小于 2·n_h·d_h——**KV 压缩保住了**。而 k^R 在自己的小旋转子空间里独立做 RoPE，相对位置性质原样成立——**位置精度也保住了**。这就是「解耦」二字的实指：把「内容」与「位置」两个职责拆到两个互不对易的子空间，各自用最合适的表示。

### 对照两种 RoPE 的实现

把「标准 RoPE」与「解耦 RoPE」放在同一段代码里对比打分与缓存，看清楚每头维度、共享维度与缓存量怎么变。

\`\`\`python
def mla_logits(q_c, k_c, q_r, k_r):
    """MLA 每头打分：内容点积 + 旋转点积，按总维度缩放。"""
    d_total = q_c.shape[-1] + q_r.shape[-1]
    content = np.sum(q_c * k_c, axis=-1)
    rotary = np.sum(q_r * k_r, axis=-1)
    return (content + rotary) / (d_total ** 0.5)

n_h, d_h, d_c, d_rope = 32, 128, 512, 64
# 内容：每头独立，来自低秩 c_KV 的上投影
q_c = rng.normal(size=(n_h, d_h))
k_c = rng.normal(size=(n_h, d_h))
# 旋转：跨头共享，只有一个 d_rope 维向量
q_r = rope_rotate(rng.normal(size=d_rope), 5, d_rope)
k_r = rope_rotate(rng.normal(size=d_rope), 3, d_rope)
scores = mla_logits(q_c, k_c, q_r, k_r)
print(f"打分形状 {scores.shape}，每头一个标量，共 {n_h} 个")
cache_full = 2 * n_h * d_h              # 标准 MHA 每 token KV 元素
cache_mla  = d_c + d_rope               # MLA 每 token：c_KV + 共享 k^R
print(f"标准 KV {cache_full} 元素；解耦 MLA 缓存 {cache_mla} 元素")
assert scores.shape == (n_h,)
assert cache_mla < cache_full / 10, "解耦后仍应保住 KV 压缩"
print(f"解耦 RoPE 保住压缩：缓存仅 {cache_mla/cache_full:.2%}")
\`\`\`

### 一个完整的数字走查：从隐藏态到缓存

把解耦 RoPE 的每一步落到具体数字上走一遍，避免只在符号层面理解。取一组小配置 n_h = 4、d_h = 8、d_c = 16、d_rope = 4：下投影把每 token 的隐藏态压成 16 维的 c_KV，上投影把它还原成 4 个头、每头 8 维的内容 K；旋转侧从同一隐藏态另算 4 维的 k^R，按位置角旋转后跨头共享。缓存里每 token 只有 16 + 4 = 20 个元素，而标准 MHA 要存 K、V 各 4 × 8 = 32 个、合计 64 个元素——压缩到 31%。小配置的比例不如论文配置夸张，因为 d_rope 在低维里占比高；把 d_h 放大到 128、d_c 放大到 512 后，旋转侧占比被稀释，才出现约 93% 的降幅。这说明一个常被忽略的事实：解耦 RoPE 的额外缓存随 d_rope 线性增长，但相对内容骨架的比例随模型变宽而下降，所以大模型上「解耦的代价」几乎可以忽略。打分时，内容项对每个头单独算 8 维点积，旋转项对共享的 4 维向量算一次再广播到 4 个头，两项相加后按平方根 d_h + d_rope 缩放。走完这一遍，每一步都对应一个具体张量形状，不再是一句「把 K 拆两块」的口号。

### 工程判据：什么时候必须解耦

只要注意力同时满足「用低秩压缩 KV」与「用 RoPE 类相对位置编码」，就必须解耦，否则二者必失其一。判据可以写成三个检查点：其一，缓存里如果存的是展开后的每头 K，说明位置部分没解耦、压缩被破坏；其二，如果对 c_KV 直接施加旋转，说明踩了不对易的坑；其三，打分里若只有内容项没有旋转项，位置信息根本没进注意力。正确实现应同时观察到：缓存量级是 d_c 加一个很小的共享旋转键；k^R 跨头共享（只有一份，不是 n_h 份）；打分是内容项与旋转项之和并按 d_h + d_h^R 缩放。这三条对上，就是合格的 MLA 加解耦 RoPE。下一课 L65 转向前馈侧，看 DeepSeekMoE 怎么把专家切细。

:::tip

### 一句话记住解耦 RoPE

标准 RoPE 要旋转「每头完整的 K」，MLA 却只缓存「共享低秩的 c_KV」，两者不在同一空间、又不对易。解耦 RoPE 把 K 拆成**不含位置的低秩内容部分**（继续压缩）与**带旋转的共享小向量 k^R**（单独存、单独转），打分时两项相加。结果是 KV 缓存仍是 d_c 加一个极小的 k^R、压缩不丢，位置精度又完整保留——这是 MLA 能从论文走落地的关键接口。

:::
`,
    null,
    [
      {
        text: '标准 RoPE 与 MLA 的 KV 低秩压缩直接冲突的根源是？',
        options: [
          'RoPE 只能在 FP32 下算',
          'RoPE 要对各头完整 K 旋转，而 c_KV 是共享低秩向量，旋转与上投影不对易',
          'RoPE 需要更多层',
          'RoPE 与注意力无关',
        ],
        answer: 1,
        explain:
          '旋转矩阵作用在各头子空间，低秩上投影是另一个线性变换，二者不对易；要么破坏低秩缓存，要么丢位置精度。',
        concept: 'decoupled-rope',
      },
      {
        text: '解耦 RoPE 把 K 拆成哪两块？',
        options: [
          'K 的实数部与虚数部',
          '未旋转的低秩内容部分 + 带旋转的小向量 k^R',
          'Q 块与 V 块',
          'FP8 块与 BF16 块',
        ],
        answer: 1,
        explain: '内容部分走 MLA 压缩、不含位置；k^R 维度很小且跨头共享、单独施加 RoPE，两者拼接成完整 K。',
        concept: 'decoupled-rope',
      },
      {
        text: '解耦 RoPE 为什么能同时保住 KV 压缩与位置精度？',
        options: [
          '它把 KV 全量化',
          '低秩内容部分继续只缓存 c_KV，位置交给共享的小旋转键 k^R，额外缓存极小',
          '它不用位置编码',
          '它增加头数',
        ],
        answer: 1,
        explain: '缓存仍是 d_c 维潜向量加 d_h^R 维共享旋转键，远小于 2·n_h·d_h；旋转独立性保住相对位置性质。',
        concept: 'decoupled-rope',
      },
      {
        text: 'MLA 注意力的打分（logit）由哪两项组成？',
        options: [
          '只有 q·k',
          '未旋转内容项 q^C·k^C 加旋转项 q^R·k^R，再按总维度缩放',
          '只有 v·k',
          'q·v 减 k^R',
        ],
        answer: 1,
        explain: '每个头的打分是内容点积与旋转点积之和，除以 sqrt(d_h + d_h^R) 缩放；两子空间各司其职。',
        concept: 'decoupled-rope',
      },
    ],
    [
      ['标准 RoPE', '旋转位置编码，对 Q、K 各头子空间按位置旋转，满足相对位置点积性质'],
      ['解耦 RoPE', 'DeepSeek-V2 的做法：把 K 拆成不含位置的低秩内容部分与带旋转的小向量 k^R'],
      ['k^R', '共享的小维度旋转键，单独施加 RoPE，维度 d_h^R，随缓存一起存'],
      ['不对易', '旋转变换与低秩上投影不可交换，导致在潜空间加旋转破坏位置性质'],
      ['内容项与旋转项', 'MLA 打分的两部分：q^C·k^C 负责内容匹配，q^R·k^R 负责位置'],
    ],
    [
      '直接对 c_KV 施加 RoPE 就想当然认为位置对了——旋转与上投影不对易。',
      '以为 k^R 是每个头各一份——它是跨头共享的小向量，额外缓存极小。',
      '以为解耦后会丢掉 KV 压缩——缓存仍是 c_KV 加一个小旋转键，仍远小于全维 K/V。',
      '打分时忘记把内容维度与旋转维度一起缩放。',
    ],
  ),
  'framework',
)
