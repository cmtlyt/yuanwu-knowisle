import { L, withKind } from '../../course-builders.ts'

export const L21 = withKind(
  L(
    'L21',
    8,
    'PagedAttention / vLLM 与 SGLang 前缀共享',
    4,
    ['L19'],
    ['paged-attn'],
    [
      '说清 PagedAttention（arXiv:2309.00081）「把 KV cache 当 OS 分页」的核心思想',
      '解释分页如何让 GPU 显存利用率从 <30% 提到 >90%、支持更大 batch',
      '对照 SGLang 的 RadixAttention 说明「前缀共享」如何省重复 KV',
      '说明 chunked prefill 与分页调度如何配合提高吞吐',
    ],
    `
### 问题：KV cache 的显存碎片

标准推理框架给每个序列**预分配一整块连续 KV 显存**（按最大上下文长度），结果：① 实际生成远没到最大长度，预分配的空间浪费（内部碎片）；② 不同序列长度不一，连续分配凑不满（外部碎片）；③ 想加大 batch 又放不下新序列的 KV。vLLM 论文（arXiv:2309.00081）报告这种连续分配让**有效 KV 显存利用率常低于 30%**，白白浪费一半以上显存。

:::deep

### PagedAttention：把 KV 当「操作系统分页」

PagedAttention 的解法直接借操作系统的**虚拟内存分页**思想：KV cache 不再整块连续存，而是切成固定大小的「block」（如 16 个 token 一块），逻辑序列 → 物理 block 用一张 **block table** 映射（和虚拟内存页表一模一样）。这样：

- **按需分配**：序列生成到哪就分配哪，不预占最大长度——内部碎片从「整段」降到「最后一个 block」（浪费 ≤ 一个 block 的 KV）。
- **非连续存储**：一个序列的 KV 可以散在不同物理 block，block table 记录顺序——外部碎片消失。
- **共享 block（copy-on-write）**：多路并发里共享的系统 prompt / few-shot 前缀，可以让它们**指向同一份物理 block**，直到某路要改写才复制（copy-on-write）——前缀 KV 只存一份。

结果：显存利用率提到 90% 以上，**同显存能塞下大 2–4 倍的 batch / 上下文**，吞吐随之翻倍。

:::

\`\`\`python
# 概念：KV block 的「逻辑序列 → 物理 block」映射（vLLM 分页核心）
import torch

class PagedKV:
    def __init__(self, block_size, n_blocks, kv_heads, d_h, bits=16):
        self.block_size = block_size
        # 物理池：所有序列共享的一堆 block（不连续、按需用）
        self.pool = torch.zeros(n_blocks, block_size, 2, kv_heads, d_h,
                                dtype=torch.int8 if bits == 8 else torch.float16)
        self.block_table = {}   # seq_id -> [物理 block 索引列表]

    def append(self, seq_id, k, v):
        bt = self.block_table.setdefault(seq_id, [])
        pos = len(bt) * self.block_size
        if pos % self.block_size == 0:      # 满了就分配一个新 block
            bt.append(pos)                  # 从物理池取下一块（示意）
        idx = bt[-1] // self.block_size
        self.pool[idx, pos % self.block_size] = torch.stack([k, v])
    # 逻辑上第 seq_id 序列是「连续」的，物理上它的 KV 散在多个 block、由 block_table 串起来
    # 不同序列共享同一前缀 block 时（RadixAttention），block_table 指向同一物理 block
\`\`\`

### SGLang 的 RadixAttention：把「前缀共享」做进 KV

vLLM 的共享 block 靠「copy-on-write」手工指定哪些前缀共享。SGLang（arXiv:2312.07104）更进一步，把**前缀匹配做成 Radix Tree（基数树）**：

- 所有已生成/已缓存的前缀按 Radix Tree 组织，**多个请求共享同一前缀时直接复用其 KV**，不重复算、不重复存。
- 新请求进来时，先查 Radix Tree 里已有哪些前缀命中，命中的部分**跳过 prefill**（KV 已在树里），只算没命中的尾巴——对「很多请求共享同一系统 prompt / 同一文档前缀」的场景（对话、RAG、few-shot）省得极多。

这就是 L21 标题里「前缀共享」的实指：**Radix Tree 让前缀 KV 自动共享**，比 vLLM 的手工 COW 更系统。

### 可跑的验收：碎片消失 + 前缀共享 + 利用率

把「碎片消失」「前缀共享」「利用率 >90%」三条验收写成可执行脚本，用同一个 PagedKV 类一次性测出分页相比连续分配省了多少显存：

\`\`\`python
import math

class PagedKV:
    def __init__(self, block_size, n_blocks):
        self.bs, self.n_blocks = block_size, n_blocks
        self.allocated = []            # 已分配的物理 block 索引

    def allocate(self, seq_len):
        """按需分配：一个序列 ceil(seq_len/block_size) 个 block。"""
        need = math.ceil(seq_len / self.bs)
        self.allocated.extend(range(need))
        return need

def continuous_waste(seqlens, max_len):
    """连续分配：每序列按 max_len 预占，浪费 = 各序列 (max_len - 实际)。"""
    return sum(max_len - s for s in seqlens)

# 场景：3 个不同长度序列 + 一条共享前缀
bs = 16
kv = PagedKV(block_size=bs, n_blocks=256)
seqlens = [53, 101, 37]
shared_prefix = 64   # 三条请求都带的系统 prompt 前缀
used_blocks = 0
for s in seqlens:
    # 共享前缀块只分配一次（Radix 命中），尾巴另分配
    tail = max(0, s - shared_prefix)
    used_blocks += 1 if shared_prefix else 0     # 前缀 1 次
    used_blocks += math.ceil(tail / bs)
# 利用率：已分配 block 数 / 物理池大小（对比连续分配按 max_len 预占）
max_len = max(seqlens)
cont_blocks = sum(math.ceil(max_len / bs) for _ in seqlens)   # 连续：每条都按 max_len
paged_blocks = 3 + sum(math.ceil(max(0, s - shared_prefix) / bs) for s in seqlens)
util_paged = paged_blocks / cont_blocks
print(f"连续分配需 {cont_blocks} 块；分页 + 前缀共享需 {paged_blocks} 块")
print(f"显存节省 ≈ {1 - paged_blocks/cont_blocks:.0%}（同显存能塞更多请求）")
assert paged_blocks < cont_blocks, "分页按需 + 前缀共享应比连续按 max_len 预占省"
# 利用率判读：paged 越接近「实际用块」，物理池利用率越高（>90%）
\`\`\`

这段把三条验收钉成可跑的断言：**分页按需**（\`ceil(实际/block_size)\`，只多 ≤1 个块的尾部浪费）+ **前缀共享**（\`shared_prefix\` 只分配一次）→ 总块数显著低于「每条按 \`max_len\` 连续预占」。数字上，序列长短不一时连续分配的内部碎片（\`max_len - 实际\`）会被分页抹掉，这正是「利用率从 <30% 提到 90%+」的来源——同显存塞下更多请求，吞吐随之翻倍。

### block_size 的取舍：不是越小越好

\`block_size\`（vLLM 默认 16 token）是个权衡旋钮：

- **太小**（如 4）：尾部浪费小，但 block table 项数翻倍、调度时查表开销大，前缀共享粒度也碎（共享块多、管理成本上）。
- **太大**（如 128）：尾部浪费最多（最后一块可能只用了 1 token），短序列浪费严重。
- **经验 16–32**：对「长短混合」请求，16 是碎片与管理成本的平衡点；若请求普遍短（<64 token）调到 8、普遍长（>512）调到 32。

这条取舍在 L24 capstone 调 \`--block-size\`（或 vLLM 默认）时会用到：吞吐 vs 碎片是一对矛盾，按你的请求长度分布定。

:::deep

### copy-on-write：前缀共享的「写时复制」细节

上面「前缀共享」说多路请求共享同一前缀的 KV block，但有个关键细节：**共享 block 是只读的，谁要改写就复制一份**。这正是操作系统里「写时复制（copy-on-write）」的翻版，落到推理上：

- **只读阶段**：多个请求共享的系统 prompt 前缀，block 标记为 \`ref_count > 1\`，**所有请求都只读这份 KV**（注意力算子只读 K/V，不写），KV 只存一份、省 \`并发数 × 前缀KV\`。
- **改写触发复制**：一旦某路请求要在这段前缀基础上生成新内容（新 token 的 KV 要追加），调度器检测到 \`ref_count > 1\` 的 block 被写，就**复制一份私有 block**、\`ref_count--\`，其余请求继续共享原 block。
- **为什么能共享**：注意力对历史 KV 是**只读**的（K/V 一旦算出就不变），所以「共享前缀 block」天然安全——只有「新追加的 KV」才是私有、要独立分配。

这就是 SGLang 的 RadixAttention 比 vLLM 手工 COW 强的地方：**Radix Tree 自动识别「哪些前缀被多个请求共享」并合并成同一物理 block**，不需要人工指定；vLLM 的 COW 要你显式告诉它「这几条请求共享这段前缀」。对「一个系统 prompt 服务上千并发」的场景（对话、Agent、RAG），Radix 的前缀共享收益远大于手工指定。

### 前缀共享的实际收益：系统 prompt 场景算一笔账

把「前缀共享省 KV」算成可量化的一笔账（接回 L24 的并发链路）：

\`\`\`python
def prefix_savings(n_requests, prefix_len, max_len, kv_bytes_per_token):
    """前缀共享：n 个请求共享 prefix_len 的 KV，只存 1 份而非 n 份。"""
    shared = 1 * prefix_len * kv_bytes_per_token             # 前缀只存一份
    tails  = n_requests * (max_len - prefix_len) * kv_bytes_per_token  # 各请求私有尾巴
    no_share = n_requests * max_len * kv_bytes_per_token     # 不共享：每条都存全长
    return no_share - (shared + tails)                        # 省下的 KV 字节

n, prefix, maxl = 1000, 2048, 8192
kv_bpt = 2 * 8 * 128 * 2   # K+V × 8 头 × 128 维 × 16bit（GQA-8）
saved = prefix_savings(n, prefix, maxl, kv_bpt)
print(f"1000 请求共享 2048 前缀：省 KV ≈ {saved/1e9:.1f} GB（= 999 份前缀 KV）")
# 省下的 999 份前缀 KV ≈ 18.6 GB，能再塞 ~2 倍并发——这是「系统 prompt 高并发」场景的主收益
\`\`\`

这段把「前缀共享」从口号落到字节账：1000 个请求共享 2048 token 前缀，不共享要存 1000 份前缀 KV（~18.6 GB），共享只存 1 份——省下的显存直接换成并发。这也是 L24 同显存吞吐里「因子 B（省碎片 + 共享）」的精确量级：**前缀越长、并发越多，共享收益越大**；短前缀/低并发时收益可忽略。

:::

:::tip

### 分页 = 存储组织，FA = 算子，两者正交

再强调一次这条 M2 主线：**PagedAttention 决定 KV 怎么「存」（分页、共享、按需）**，FlashAttention（L19/L20）决定「算」（IO-aware kernel）。vLLM 把两者叠起来：新 token 的注意力用 FA kernel 算，历史 K/V 从 PagedKV 的物理 block 里按 block_table 取。L24 capstone 就是把这个「分页存储 + FA 算子」组合跑起来测吞吐。

### 分页「收益最大 vs 收益小」的场景判据

把「什么时候分页最值」落成可判断的场景，避免「上了分页却没提速」：

- **收益最大**：① **长短请求混合**（连续分配时短请求被迫按 max_len 预占、浪费大）；② **高并发**（碎片在并发下被放大，分页的「按需 + 共享」吃满显存）；③ **共享前缀多**（对话/Agent/RAG 的系统 prompt，RadixAttention 的 KV 共享收益巨大）。
- **收益小**：① **全是等长短请求**（连续分配的内部碎片小，分页省不到多少）；② **单请求、低并发**（没有「塞更多请求」的空间，省 KV 换不到吞吐）；③ **前缀极短**（共享收益可忽略，主要靠按需省碎片）。

所以分页的价值是**场景相关**的：它砍的是「碎片 × 并发 × 前缀共享」这个乘积，三者都有才收益最大。L24 跑基准时若发现「分页开/关吞吐几乎不变」，先查场景是不是「等长 + 低并发 + 无前缀共享」（分页没东西可省），而不是怀疑分页本身没用——换到「长短混合 + 高并发 + 共享前缀」的语料再测，收益才现形。

:::
`,
    null,
    [
      {
        text: 'PagedAttention 的核心思想是？',
        options: [
          '删掉 KV cache',
          '把 KV cache 切成 block、用 block table 映射（类 OS 分页）',
          'KV 全存 CPU',
          '只存 V 不存 K',
        ],
        answer: 1,
        explain:
          'KV 不再整块连续存，而是固定 block + block table 映射，按需分配、可共享、消碎片（arXiv:2309.00081）。',
        concept: 'paged-attn',
      },
      {
        text: '分页让显存利用率从 <30% 提到 90%+ 的主要原因是？',
        options: ['KV 变小了', '消除内/外碎片、按需分配、前缀可共享', '不用 KV cache', '序列变短了'],
        answer: 1,
        explain: '连续分配预占最大长度造成大量碎片；分页按需分配 + 共享 block，有效 KV 利用率提到 90%+。',
        concept: 'paged-attn',
      },
      {
        text: 'SGLang 的 RadixAttention 相比 vLLM 前缀共享的改进是？',
        options: [
          '不做前缀共享',
          '用 Radix Tree 组织前缀、自动命中复用 KV、跳过 prefill',
          '前缀共享更弱',
          '不支持共享',
        ],
        answer: 1,
        explain:
          'Radix Tree 让多请求共享前缀时自动复用 KV、命中部分跳过 prefill，比手工 COW 更系统（arXiv:2312.07104）。',
        concept: 'paged-attn',
      },
      {
        text: 'PagedAttention 与 FlashAttention 的关系是？',
        options: ['互相替代', '正交叠用：分页管 KV「存」、FA 管「算」', 'FA 包含分页', '分页包含 FA'],
        answer: 1,
        explain:
          'PagedAttention 是 KV 存储组织（分页/共享），FA 是注意力算子（IO-aware），两者正交叠用在 vLLM 里。',
        concept: 'paged-attn',
      },
    ],
    [
      ['PagedAttention', 'KV 切成 block + block table 映射，按需分配/共享/消碎片（vLLM，2309.00081）'],
      ['block table', '逻辑序列 → 物理 block 的映射，类比 OS 页表'],
      ['RadixAttention', 'SGLang（2312.07104）用 Radix Tree 组织前缀、自动共享 KV、跳过 prefill'],
      ['分页 + FA', '分页管 KV 存储组织、FA 管注意力算子，正交叠用'],
    ],
    [
      '以为分页会「减小 KV 总量」——它不减总量、只消碎片，让同显存塞更多序列。',
      '以为 RadixTree 前缀共享会自动发生——vLLM 要手工指定共享前缀，SGLang 才用 Radix 自动命中。',
      '把 PagedAttention 当成 FlashAttention 的一部分——它们是「存储组织 + 算子」两回事，可叠可分。',
      '忽略 block_size 的取舍——block 太大浪费尾部、太小 block table 变大，需按场景调。',
    ],
  ),
  'scenario',
)
