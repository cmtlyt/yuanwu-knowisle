import { L, withKind } from '../../course-builders.ts'

export const L74 = withKind(
  L(
    'L74',
    34,
    '语料去重/去毒/去噪管线实操',
    3,
    ['L73'],
    ['data-cleaning'],
    ['写出可跑的 HF datasets 清洗脚本', '实现去重与正则黑名单', '产出干净 token 流', '验证清洗前后数据质量'],
    `### 为什么清洗是预训练的第一道闸门

L73 把配比讲清楚：模型会忠实拟合它看到的分布，配比决定各来源的权重。但配比有个隐含前提——每个来源里装的是「干净数据」。如果 Common Crawl 那 67% 里混着大量重复页面、模板垃圾、有害文本，提高它的权重只会把污染放大。LLaMA（A 级论文）之所以强调对 Common Crawl 做了**激进的去重与质量过滤**，正是因为网页语料的原始状态远不能直接训练。这一课把清洗做成一条可跑的管线：用 HF datasets 加载 → 精确去重 → 近重复检测 → 正则黑名单去毒 → 长度与乱码过滤 → 产出干净 token 流 → 用前后指标验证。

需要说明来源等级：本课的工具链（datasets、去重与正则过滤的具体实现）属 **B 级**——它是工程实践的经验做法，不是某篇 A 级论文定下的唯一标准。不同团队的阈值、黑名单词表、去重算法会随语料与合规要求变动，不要把这些参数当成不可动摇的常数。但管线结构与「先清洗后配比」的原则是稳的。

### 环境与第一份脏数据

先准备依赖和一份人造的脏语料，这样整条管线可以离线跑通、结果可复现。下面的代码构造若干条文本，故意混入：完全重复、近重复、含黑名单词、过短、含乱码字符的样本，作为清洗对象。

\`\`\`python
# pip install datasets regex
import re
from datasets import Dataset

raw_docs = [
    "The quick brown fox jumps over the lazy dog near the river bank.",
    "The quick brown fox jumps over the lazy dog near the river bank.",  # 精确重复
    "The quick brown fox jumps over the lazy dog near the river side.",  # 近重复
    "Buy cheap pills now, click this spammy link for a free miracle cure!",  # 垃圾广告
    "This product contains [BANNED_SUBSTANCE] and toxic废弃内容, avoid it.",  # 有毒/黑名单
    "ok",                                      # 过短
    "=======:::: garbage \\x00\\x01 less than 5",  # 乱码
    "Machine learning models learn patterns from large scale text corpora.",
    "Large language models are trained with next-token prediction objectives.",
]
ds = Dataset.from_dict({"text": raw_docs})
print("原始样本数:", len(ds))
assert len(ds) == 9
\`\`\`

### 第一刀：规范化与精确去重

精确去重的第一步是**规范化**：统一大小写、压缩空白、去掉首尾标点，让「看起来一样」的文本哈希一致。之后用集合判重，保留首次出现。注意规范化会改变文本，但只用于生成判重键，不改写存入的正文。

\`\`\`python
import hashlib

def normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\\s+", " ", s).strip()
    s = re.sub(r"^[\\W_]+|[\\W_]+$", "", s)
    return s

def exact_dedup(batch):
    seen = set()
    kept_texts = []
    for s in batch["text"]:
        key = hashlib.md5(normalize(s).encode("utf-8")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        kept_texts.append(s)
    return {"text": kept_texts}

deduped = ds.map(exact_dedup, batched=True)   # map 返回列，长度变化需由函数整体返回
# 上面这种「批量过滤后长度变化」的写法，更稳妥用 filter + 逐条判重：
seen = set()
def is_first(s):
    key = hashlib.md5(normalize(s).encode("utf-8")).hexdigest()
    if key in seen:
        return False
    seen.add(key)
    return True

deduped = ds.filter(lambda ex: is_first(ex["text"]))
print("精确去重后样本数:", len(deduped))
assert len(deduped) == 8, "应删去 1 条精确重复"
\`\`\`

这里踩过一个常见的坑：\`map\` 适合「一进一出」的列变换，而要去改变数据集长度应用 \`filter\`（或 \`map\` 配合正确的批量返回）。精确去重删掉 1 条完全相同的样本，从 9 条降到 8 条。但那条「near the river side」的近重复还在——它需要 MinHash。

:::deep

### 近重复：MinHash 如何抓住「几乎一样」

网页语料里大量重复不是逐字相同，而是模板替换（改几个词、换个链接）、镜像转发、轻微改写。精确哈希对这类无效，因为一个词之差哈希值天差地别。MinHash 的思路：把文档看成 shingle（连续词元组）集合，用 k 个哈希函数各取集合的最小哈希值组成签名；两个文档签名相同的比例，是其 Jaccard 相似度的无偏估计。签名相同比例超过阈值（如 0.8）就判为近重复。

工程上用 LSH（局部敏感哈希）把签名分桶，只在同桶内比较，避免 O(n²) 全对比。下面给一个不依赖第三方库、可跑的 MinHash 近似实现，用 5-gram 与多个哈希种子估计相似度：

:::

\`\`\`python
def shingles(s, k=5):
    toks = normalize(s).split()
    return set(tuple(toks[i:i+k]) for i in range(max(0, len(toks)-k+1)))

def minhash_sig(s, n_hash=64):
    sh = shingles(s)
    sig = []
    for seed in range(n_hash):
        h = hash(("seed"+str(seed),))
        # 用 Python 内置 hash 做演示；生产用 mmh3 等稳定哈希
        vals = [hash((seed, sh_item)) & 0xffffffff for sh_item in sh]
        sig.append(min(vals) if vals else 0xffffffff)
    return sig

def jaccard_est(a, b):
    sa, sb = minhash_sig(a), minhash_sig(b)
    return sum(x == y for x, y in zip(sa, sb)) / len(sa)

base = "The quick brown fox jumps over the lazy dog near the river bank."
near = "The quick brown fox jumps over the lazy dog near the river side."
unrel = "Large language models are trained with next-token prediction objectives."
print("精确重复估计 Jaccard ≈", round(jaccard_est(base, base), 3))
print("近重复估计 Jaccard   ≈", round(jaccard_est(base, near), 3))
print("无关文本估计 Jaccard ≈", round(jaccard_est(base, unrel), 3))
assert jaccard_est(base, near) > jaccard_est(base, unrel), "近重复相似度应显著高于无关文本"
\`\`\`

近重复（只差一个词）的 Jaccard 估计明显高于无关文本，这就是 MinHash 能抓住「换皮重复」的原因。生产环境用 \`datasketch\` 库的 MinHashLSH，把阈值设为 0.8 到 0.9，既去掉镜像/模板，又不过度误删。

### 第二刀：正则黑名单去毒

去毒和去噪用**预编译的正则黑名单**批量过滤。关键纪律：正则只 \`re.compile\` 一次，在 \`filter\` 里复用；模式要覆盖明确的有害/垃圾信号（违禁词、广告话术、联系方式诱导），但不要过宽以免误杀合法文本。本课的黑名单是演示用的 B 级工具链，实际要按合规要求维护。

\`\`\`python
# 预编译黑名单：一次编译，处处复用
BLACKLIST = re.compile(
    r"(BANNED_SUBSTANCE)|(click this spammy)|(free miracle cure)|(买.*便宜.*药)",
    flags=re.IGNORECASE,
)
GARBAGE = re.compile(r"[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]")   # 控制字符乱码

def clean_ok(s: str) -> bool:
    if len(s.strip()) < 20:                  # 过短文本信息量低
        return False
    if BLACKLIST.search(s):                  # 命中黑名单 -> 丢弃
        return False
    if len(GARBAGE.findall(s)) >= 2:         # 乱码控制字符过多 -> 丢弃
        return False
    return True

clean_ds = deduped.filter(lambda ex: clean_ok(ex["text"]))
print("去毒去噪后样本数:", len(clean_ds))
for t in clean_ds["text"]:
    print("  保留:", t[:60])
assert all(clean_ok(t) for t in clean_ds["text"]), "保留样本应全部通过清洗规则"
assert len(clean_ds) < len(deduped), "清洗应确实删掉脏样本"
\`\`\`

这一步把过短的「ok」、含黑名单词的有毒样本、含乱码控制字符的样本全部滤掉。断言 \`all(clean_ok(...))\` 保证留下的每条都合规，\`len\` 变小保证清洗确实生效——这两条是验证「清洗前后数据质量」的硬指标。

### 产出干净 token 流并做前后质量对照

清洗的终点是「干净 token 流」。用一个轻量分词（按空白与标点切分，演示用；生产换 L78 的 BPE tokenizer）把保留文本切成 token，并统计清洗前后的质量指标：样本数、重复率、黑名单命中数、平均长度、乱码比例。

\`\`\`python
import statistics

def tokenize(s):
    return re.findall(r"\\w+|[^\\w\\s]", s, flags=re.UNICODE)

def quality_report(name, texts):
    n = len(texts)
    dup_rate = 1 - len(set(normalize(s) for s in texts)) / max(n, 1)
    hit = sum(bool(BLACKLIST.search(s)) for s in texts)
    avg_len = statistics.mean(len(s.split()) for s in texts) if n else 0
    garb = sum(len(GARBAGE.findall(s)) for s in texts)
    print(f"[{name}] 样本={n} 重复率={dup_rate:.2f} 黑名单命中={hit} "
          f"平均词数={avg_len:.1f} 乱码字符={garb}")
    return n, dup_rate, hit

before = quality_report("清洗前", raw_docs)
after = quality_report("清洗后", clean_ds["text"])
assert after[1] <= before[1], "清洗后重复率应下降"
assert after[2] == 0, "清洗后黑名单命中应归零"

tokens = []
for s in clean_ds["text"]:
    tokens.extend(tokenize(s))
print("干净 token 流长度:", len(tokens))
print("前 20 个 token:", tokens[:20])
assert len(tokens) > 0
\`\`\`

报告显示清洗后重复率下降、黑名单命中归零、乱码消失，平均长度回到合理区间——这就是「验证清洗前后数据质量」的可量化证据。产出的 \`tokens\` 列表就是可以直接喂给 L78 分词器/训练循环的干净 token 流。

### 把管线串成生产级脚本

把上面各步串成一条端到端管线，并给出工程判据清单。生产级清洗的取舍：过采样与小源（L73）要保留足够多样性，去重阈值不能高到把合法重复全删；去毒黑名单要随合规更新、避免误杀；长度过滤下限按语言调（中文短句信息密度高，别用英文的 20 词硬卡）。

\`\`\`python
def full_pipeline(texts, dedup_thresh=0.85, min_words=20):
    # 1) 精确去重
    seen, out = set(), []
    for s in texts:
        k = hashlib.md5(normalize(s).encode("utf-8")).hexdigest()
        if k not in seen:
            seen.add(k); out.append(s)
    # 2) 近重复去重（简化：用 jaccard_est 阈值；生产换 MinHashLSH）
    kept = []
    for s in out:
        if all(jaccard_est(s, p) < dedup_thresh for p in kept):
            kept.append(s)
    # 3) 去毒去噪 + 长度过滤
    final = [s for s in kept
             if len(s.split()) >= min_words
             and not BLACKLIST.search(s)
             and len(GARBAGE.findall(s)) < 2]
    return final

final_docs = full_pipeline(raw_docs)
print("端到端管线后样本数:", len(final_docs))
assert len(final_docs) < len(raw_docs)
assert all(not BLACKLIST.search(s) for s in final_docs)
print("管线自检通过：重复/有毒/乱码/过短样本均已清除")
\`\`\`

工程判据清单：① 每步都打印样本数与丢弃数，能定位是哪一刀删多了；② 去重阈值从保守值起调，抽样看误删；③ 黑名单命中率清洗后应接近零、但保留样本数不能塌缩（否则阈值过宽）；④ 产出的 token 流要做长度分布与字符集检查，别把合法语言字符当乱码删掉。

### 三个最常翻车的地方

第一，**去重顺序反了**。必须先规范化再算哈希，否则「Hello  World」和「hello world」会被当成两条；但规范化只用于生成判重键，正文要保留原样，否则模型学不到真实的标点与大小写分布。把两件事分开——判重用规范化串、存储用原始串——是很多团队踩坑后才加的规矩。

第二，**黑名单误杀合法内容**。正则越写越宽，最后把正常的技术讨论也删了，结果语料多样性塌缩、模型对我们的领域一问三不知。正确做法是维护「命中样本队列」：每隔一段时间抽样人工复核被删的文本，统计误杀率；超过阈值就收紧模式。去毒从来不是一次性写完正则就完事，而是持续迭代的过滤器。

第三，**把清洗当成一次性离线任务**。真实语料是持续抓取的，新抓取的网页同样带重复与垃圾。清洗管线要能增量运行，且判重集合（seen 哈希、MinHash 签名库）要持久化——否则新旧批次之间重复，模型仍会反复见到同一内容。把这三点做到，才算把「脏数据 → 干净 token 流」真正变成可长期运转的产线，而不是跑一次的脚本。

:::tip

### 一句话收束语料清洗管线

清洗是预训练第一道闸门，必须先于配比（L73）：先规范化做精确去重，再用 MinHash/SimHash 抓近重复（网页镜像/模板），再用预编译正则黑名单去毒去噪、过滤过短与乱码，最后产出干净 token 流。验证靠前后对照——重复率下降、黑名单命中归零、长度与字符集合理。本课工具链是 B 级工程实践，阈值与词表随语料和合规要求变动，不作关键结论；结构（先净化再配比）才是稳的。下一课 L75 转去回答「有了干净数据，该训多大模型、喂多少 token」。

:::
`,
    null,
    [
      {
        text: '预训练语料清洗里，「去重」主要针对哪两类重复？',
        options: [
          '只针对完全相同文件',
          '文档级精确重复与近重复（近似重复），后者常用 MinHash 或 SimHash 检测',
          '只针对标点错误',
          '只针对非英文文本',
        ],
        answer: 1,
        explain:
          '精确重复可用哈希/MinHash 的近重复检测；网页语料大量镜像与模板化文本属于近重复，需 MinHash/SimHash 近似去重，否则模型会反复见到同一内容。',
        concept: 'data-cleaning',
      },
      {
        text: '在 HF datasets 管线里做正则黑名单去毒，正确做法是？',
        options: [
          '训练完再从输出里删',
          '在 map 阶段用编译后的正则匹配并过滤含黑名单词/模式的样本',
          '只过滤长度',
          '只做去重不做去毒',
        ],
        answer: 1,
        explain:
          '去毒应在数据进入训练前完成：用 re.compile 预编译黑名单模式，在 dataset.map 里批量过滤，既命中率高又避免逐条重复编译正则的开销。',
        concept: 'data-cleaning',
      },
      {
        text: '清洗后「产出干净 token 流」的关键验证指标不包括？',
        options: [
          '重复率是否下降',
          '黑名单命中率是否接近零',
          '平均文档长度与乱码比例是否合理',
          '模型参数量是否变多',
        ],
        answer: 3,
        explain:
          '清洗质量看重复率、命中率、长度分布、乱码/非文本比例等数据侧指标；模型参数量由配置决定，与语料清洗无关。',
        concept: 'data-cleaning',
      },
      {
        text: '为什么语料清洗必须在配比（L73）之前做？',
        options: [
          '因为清洗能增加 token 数',
          '因为配比给各来源设定权重，若来源里混着重复/有毒数据，高权重只会放大污染',
          '因为配比不需要来源标签',
          '因为清洗会改变模型架构',
        ],
        answer: 1,
        explain:
          '配比决定各来源占比，若源数据不干净，过采样高质量源反而会放大其中的重复与有毒内容；先净化再配比，权重才有意义（本模块来源为 B 级工具链）。',
        concept: 'data-cleaning',
      },
    ],
    [
      ['精确去重', '用规范化文本哈希或集合判重，删除完全相同的文档'],
      ['近重复', '内容高度相似但不完全相同的文档，需在 MinHash/SimHash 的指纹空间中判重'],
      ['MinHash', '用多个哈希函数的最小哈希值估计集合 Jaccard 相似度，常用于近重复检测'],
      ['正则黑名单', '一组预编译的正则模式，匹配到即判定为需过滤的有毒/低质文本'],
      ['数据集 map/filter', 'HF datasets 的批量转换接口，把清洗函数向量化套用到每条样本'],
    ],
    [
      '只做精确去重、不做近重复——网页语料的镜像与模板文本是近重复，不去重会让模型反复见到同一内容。',
      '在训练完成后再过滤有害输出——去毒必须在进入训练前做，事后删输出治标不治本。',
      '在 map 里反复 re.compile 正则——应预编译一次复用，否则逐条编译会拖垮数据管线。',
      '把去重阈值设得过激——过度去重会误删合法重复（如代码、对话模板），需在质量与多样性间取平衡。',
    ],
  ),
  'practice',
)
