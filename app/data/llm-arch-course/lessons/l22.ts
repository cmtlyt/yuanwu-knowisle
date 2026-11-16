import { L, withKind } from '../../course-builders.ts'

export const L22 = withKind(
  L(
    'L22',
    8,
    'chunked prefill 与 KV 分页调度实操',
    4,
    ['L21'],
    ['chunked-prefill'],
    [
      '说清 prefill（处理整个 prompt）与 decode（逐 token 生成）两阶段的不同特征',
      '解释 chunked prefill 把长 prompt 切片、与 decode 批次混跑的原理',
      '搭一个可跑的 chunked-prefill 开关对照脚本，量化长 prompt 对短请求 TTFT 的影响',
      '用「显存/吞吐」对照说明 chunked prefill 如何让长 prompt 不再饿死短请求',
      '对照 vLLM 的调度（continuous batching + chunked prefill）说明吞吐提升',
    ],
    `
### 两阶段：prefill 与 decode

推理分两个特征完全不同的阶段：

- **prefill（首 token）**：把整个 prompt（可能几千 token）**一次前向**算完，得到全部位置的 KV，再吐第 1 个 token。特征是**计算密集**（大矩阵乘、GPU 打满）。
- **decode（后续）**：逐 token 生成，每步只算 1 个新 token 的 Q/K/V、与全部已缓存 KV 做注意力。特征是**内存带宽密集**（每步要搬一次全部 KV，算力利用率低）。

两阶段混在一个批次里会互相拖累：一个长 prompt 的 prefill 要霸占 GPU 好几秒，期间其它短请求的 decode 被**饿死**（延迟尖峰）；反过来全是 decode 又吃不饱 GPU 的矩阵乘。

:::deep

### chunked prefill：把长 prompt 切片混跑

chunked prefill（vLLM 2501 起默认，源自 arXiv:2401.09679 一系）把长 prompt **切成固定 chunk**（如 512 token 一段），每步只算一个 chunk，**和同批次里的 decode 步骤混在一起调度**：

- **不饿死**：长 prompt 不再一次霸占，切成小块穿插，短请求的 decode 每步都有机会跑，延迟尖峰被抹平。
- **吃满 GPU**：把「大 prompt prefill 的矩阵乘」+「多路 decode 的矩阵乘」拼成一个**更大的矩阵**一次算，GPU 利用率比纯 decode 高得多（decode 单独跑矩阵太小、吃不饱）。
- **连续批处理（continuous batching）**：每步结束就腾出位置、立刻补进下一个请求，不等整批跑完——batch 始终满载。

三者合起来是 vLLM 高吞吐的调度核心：**分页 KV（L21）管存、chunked prefill 管算、continuous batching 管批**。

:::

\`\`\`python
# 概念：chunked prefill + continuous batching 的调度示意
# 每步调度器从「待办工作」里取一批，混着 prefill 切片与 decode
def schedule_step(pending_prefill_chunks, pending_decode, max_batch_tokens):
    # prefill 切片：每个长 prompt 拆成 512-token chunk，逐个占位
    # decode：每个活跃序列占 1 个 token
    slots = []
    used = 0
    for chunk in pending_prefill_chunks:
        if used + len(chunk) > max_batch_tokens:
            break
        slots.append(("prefill", chunk))
        used += len(chunk)
    for req in pending_decode:
        if used + 1 > max_batch_tokens:
            break
        slots.append(("decode", req))
        used += 1
    # 把这一批的矩阵乘拼成一个大 GEMM 一次算（prefill 切片 + decode 混跑）
    return slots   # 长 prompt 不再霸占整批，短 decode 每步都有机会

# 关键：max_batch_tokens 限制「每步总 token 数」，prefill 切片按此上限进批
# 效果：延迟尖峰（长 prefill）被摊到多步，吞吐（大矩阵乘）反升
\`\`\`

### 可跑对照：chunked 开 vs 关，短请求延迟尖峰差多少

把「无饿死」验收写成可执行对照——一个 4K prompt + 8 个短 decode 请求，分别跑「关 chunked（长 prefill 一次霸占）」与「开 chunked（切片混跑）」，看短请求的「首 decode 完成步数」：

\`\`\`python
def simulate(max_batch_tokens, long_prompt, short_decodes, chunk_size, use_chunked):
    """返回每个短 decode 请求「何时完成首步」（步号，小 = 不饿死）。"""
    done_at, step, pending_prefill, shorts = {}, 0, long_prompt, list(short_decodes)
    while pending_prefill > 0 or shorts:
        step += 1
        if not use_chunked:                       # 关：长 prefill 一次霸占，短 decode 全等
            if pending_prefill > 0:
                pending_prefill = 0
                continue
            for i in range(len(shorts)):
                done_at[shorts[i]] = step
            shorts = []
        else:                                       # 开：每步切一个 chunk，与 decode 混排
            budget = max_batch_tokens
            if pending_prefill > 0:
                take = min(chunk_size, pending_prefill)
                budget -= take
                pending_prefill -= take
            for sid in list(shorts):
                if budget <= 0:
                    break
                done_at[sid] = step
                budget -= 1
                shorts.remove(sid)
    return done_at

shorts = [f"d{i}" for i in range(8)]
m  = simulate(1024, 4096, shorts, 512, use_chunked=False)
m2 = simulate(1024, 4096, shorts, 512, use_chunked=True)
print(f"关 chunked：最晚短 decode 第 {max(m.values())} 步完成（等了 4K prefill 整段）")
print(f"开 chunked：最晚短 decode 第 {max(m2.values())} 步完成（切片混跑，每步有机会）")
assert max(m2.values()) < max(m.values()), "chunked 应让短 decode 不被长 prefill 整段饿死"
\`\`\`

对照的判读：**关 chunked 时**长 4K prefill 一次霸占，8 个短 decode 全要等它算完（最晚完成步数被长 prefill 卡死）；**开 chunked 后**长 prompt 被切成 8 个 512 块穿插，短 decode 每步都有位置进批，最晚完成步数显著提前——这就是「无延迟尖峰」的定量证据。\`chunk_size\`（512）与 \`max_batch_tokens\`（1024）是两个旋钮：chunk 太大仍会短暂饿死 decode、太小又拼不大矩阵乘，需按请求长度分布调。

### chunk_size 的取舍：两个方向的矛盾

上面把 \`chunk_size\` 和 \`max_batch_tokens\` 当成旋钮，但它们的「最优值」其实是两个方向互相拉扯的结果，理解这层矛盾才知道怎么调：

- **chunk 越大**：单个 chunk 的矩阵乘越大、GPU 越吃满（prefill 计算密集，大矩阵乘效率高）；但**一个 chunk 占住整步的时间越长**，期间同批的短 decode 被推迟越多，延迟尖峰反而变高。
- **chunk 越小**：短 decode 每步进批机会多、延迟尖峰抹得更平；但拼出来的矩阵乘变小，**纯 decode 的矩阵太小吃不饱 GPU**，吞吐（平均 tok/s）反而下降。

所以 \`chunk_size\` 是「**延迟尖峰高度 vs 平均吞吐**」的折中：在线服务要低延迟尖峰（用户感受）→ chunk 偏小；离线批处理要吞吐 → chunk 偏大。vLLM 默认 512 是折中档，自调时**同时盯 P99 延迟与平均吞吐**两条曲线，找到它们交叉的拐点，而不是只优化其中一条。\`max_batch_tokens\` 则约束「每步总 token 预算」：预算大 → 单步塞得更多、GPU 更满但单步更久；预算小 → 单步短、响应快但矩阵乘拼不大。两者配合调，不是各自独立。

### 为什么「纯 decode 也吃不饱」：矩阵乘太小

一个容易被忽略的细节：**全 batch 都是 decode 时，矩阵乘的 token 维 = batch 大小**，若 batch 只有 8，则矩阵乘是 8×d，远小于 GPU Tensor Core 的高效区间（通常要几百到几千行才吃满）。这就是为什么「全是 decode 时 GPU 算力利用率低」——不是算力不够，是**矩阵太小**。chunked prefill 的核心价值正在于此：把「大 prompt 的 prefill 切片」拼进 decode 批次，**矩阵乘的行数从 batch 大小涨到 batch + chunk 总长**，一次 GEMM 吃满算力。所以 chunked prefill 提升吞吐的机制不是「省计算」，而是「**把 prefill 和 decode 的矩阵拼大、提高算术强度**」——这与 L19 的「IO-bound」是同一类工程直觉：GPU 要的是「每次搬运触发足够多 FLOPs」。

:::deep

把上面两段收进一个结论：chunked prefill 调的不是「算多少」，而是「**每一步 GPU 喂多大多密的矩阵**」——大矩阵拼饱算力（吞吐）、小 chunk 抹平尖峰（延迟），两个旋钮各管一条曲线。这是 L24 调 \`--max-num-batched-tokens\` 与 \`--chunked-prefill-size\` 两个参数时的判据。

:::

### 验收断言（可执行）

- **无饿死**：一个 4K prompt + 8 个短 decode 请求，开 chunked prefill 后短请求每步都有 decode 机会（延迟不出现 4K prefill 的尖峰）；关 chunked 则短请求要等 4K prefill 算完。
- **吞吐不降反升**：因 prefill 切片与 decode 拼成大矩阵乘，GPU 利用率高于「纯 decode + 偶尔一次大 prefill」，同显存吞吐提升。
- **KV 仍分页**：prefill 算出的 KV 写入 L21 的 PagedKV block，decode 阶段复用——chunked 只管调度，不动 KV 存储组织。

:::tip

### 把「调度三件套」记牢

M2 推理系统课的三块拼起来是一套：**PagedAttention（L21，KV 怎么存）→ chunked prefill（本课，KV/计算怎么排）→ FlashAttention（L19/20，注意力怎么算）**。三者正交：分页是存储组织、chunked 是调度策略、FA 是算子。vLLM 全用上才有那个「同显存 2–4 倍吞吐」的数字。L24 capstone 跑 vLLM 时，看到的吞吐提升是这三块合力，不是单点。

把 chunked prefill 落到 vLLM 的两个可旋钮上，知道每个旋钮「管什么、往哪拧」：

- **\`--max-num-batched-tokens\`**（每步总 token 预算，对应上面 \`max_batch_tokens\`）：拧大 → 单步塞进更多 prefill 切片 + decode、矩阵乘更大更吃满 GPU（吞吐上），但单步时延变长、P99 拖高；拧小 → 响应快但矩阵拼不大。在线低延迟场景拧小、离线吞吐场景拧大，**默认值偏吞吐**，自调时盯 P99。
- **\`--enable-chunked-prefill\` + chunk 大小**：开关决定「长 prompt 切不切」，chunk 大小决定「切多长一块」。chunk 太小 → 切片多、每步调度开销大、矩阵拼不大（吞吐掉）；太大 → 一个 chunk 仍会短暂霸占（尖峰没抹平）。**默认 512 token 是延迟与吞吐的折中档**。

两个旋钮的配合关系：**预算（max-num-batched-tokens）定「单步能塞多少」、chunk 定「prefill 切多细」**。预算小但 chunk 大（矛盾配置）会让 prefill 切片塞不进单步、退化成「长 prefill 一次霸占」；预算大 + chunk 适中才是 chunked prefill 的正常工作态。L24 capstone 调吞吐时，**先固定 chunk=512、扫 \`max-num-batched-tokens\` 找 P99 拐点**，再回头微调 chunk，别两个同时拧（归因不清）。这也是「对照实验控制变量」在调参上的应用。

一句话收束本课：chunked prefill 的价值是「**把 prefill 的计算密集与 decode 的内存密集，在每一步拼成一个大而密的矩阵乘**」——它不减少任何 FLOPs，只是让 GPU 每一步都吃饱、让短请求不被长 prefill 饿死。理解了「算多少」不变、「每步喂多密」变了，就不会再把它误读成「省计算」。

:::
`,
    null,
    [
      {
        text: 'prefill 与 decode 两阶段的特征是？',
        options: ['都是计算密集', 'prefill 计算密集、decode 内存带宽密集', '都是内存密集', '完全相同'],
        answer: 1,
        explain:
          'prefill 一次算整 prompt（大矩阵乘、吃算力）；decode 逐 token、每步搬全部 KV（吃带宽、算力利用率低）。',
        concept: 'chunked-prefill',
      },
      {
        text: 'chunked prefill 把长 prompt 切片的目的是？',
        options: [
          '减少总计算量',
          '让长 prefill 不再饿死短 decode、并与 decode 混跑吃满 GPU',
          '去掉 decode',
          '省 KV 内存',
        ],
        answer: 1,
        explain:
          '切片后长 prefill 不再霸占整批，短 decode 每步有跑的机会（无延迟尖峰），且切片与 decode 拼成大矩阵乘吃满 GPU。',
        concept: 'chunked-prefill',
      },
      {
        text: 'continuous batching 的作用是？',
        options: [
          '等整批跑完再换请求',
          '每步结束腾位即补新请求，batch 始终满载',
          '只跑 prefill',
          '只用 decode',
        ],
        answer: 1,
        explain: '不等整批、逐请求动态进出 batch，让 GPU 始终有活干，吞吐高于固定 batch 的「等齐了再跑」。',
        concept: 'chunked-prefill',
      },
      {
        text: 'chunked prefill 改的是 KV 的哪一层？',
        options: ['KV 存储组织', 'KV 计算调度（prefill/decode 排布）', '注意力算子', 'KV 量化'],
        answer: 1,
        explain:
          'chunked prefill 管「怎么排」，不改 KV 怎么存（那是 PagedAttention）、不改怎么算（那是 FA）——三者正交叠用。',
        concept: 'chunked-prefill',
      },
    ],
    [
      ['prefill', '一次前向处理整个 prompt、产出全部 KV、吐首 token，计算密集'],
      ['decode', '逐 token 生成、每步搬全部 KV，内存带宽密集'],
      ['chunked prefill', '长 prompt 切成固定 chunk、与 decode 混排，不饿死短请求 + 吃满 GPU'],
      ['continuous batching', '每步动态进出 batch、始终满载的调度策略'],
    ],
    [
      '以为 chunked prefill 减少了计算量——它不减少 FLOPs，只改善调度、提升 GPU 利用率。',
      '以为 chunked prefill 动了 KV 存储——它只管调度，KV 存储仍由 PagedAttention 分页。',
      '长 prefill 一次跑完导致短请求延迟尖峰——正是 chunked 要解决的饿死问题。',
      'chunk 切得太大——单 chunk 仍会短暂饿死 decode，chunk_size 需按场景（通常 256–1024 token）调。',
    ],
  ),
  'practice',
)
