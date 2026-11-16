import { L, withKind } from '../../course-builders.ts'

export const L90 = withKind(
  L(
    'L90',
    39,
    '一基座多适配器与零延迟切换',
    4,
    ['L89'],
    ['multi-adapter'],
    ['训练 2 个不同领域 LoRA', '实现服务端适配器切换', '对照零延迟 merge', '验证多任务隔离'],
    `### 场景设定：一个基座，两个领域

假设一个客服平台要同时服务「法律咨询」与「医疗问答」两个领域。若走全参微调的老路（L83），得为两个领域各存一份几十 GB 的全权重，显存与存储随领域数线性爆炸，且两份权重彼此灾难性遗忘。LoRA 给了更好的架构（L84/L85）：**共享一份冻结基座，为每个领域各训一份低秩适配器**。每份适配器只是几十 MB 的 BA，切换时换小文件即可。这一课把这套「一基座多适配器」方案从训练到服务完整跑一遍，并对照两种部署形态：训练态的 \`set_adapter\` 切换、与导出态的 merge 单模型。最后用输出分化与领域评测验证两个适配器确实隔离。

场景的三个问题对应三个交付：① 怎么在同一基座上训出两个领域适配器；② 服务端怎么零延迟切换；③ 怎么证明它们各管各的、没串味。

### 训练两个领域适配器

先在同一个冻结基座上依次训两份 LoRA。关键是让两个适配器**有不同名字**（\`peft\` 用名字区分），训练后各自保存，而不是把第一份覆盖掉。下面的代码给出可独立运行的多适配器管理逻辑：用字典模拟「基座 + 多份适配器」的状态，训完分别落盘。

\`\`\`python
import numpy as np, hashlib
rng = np.random.default_rng(7)
d, r = 64, 4
W0 = rng.normal(size=(d, d))                 # 共享冻结基座（示意单个线性层）

class LoRAAdapter:
    def __init__(self, name, A, B, alpha=2):
        self.name, self.A, self.B, self.alpha = name, A, B, alpha
    def delta(self):
        return (self.alpha / r) * (self.B @ self.A)  # L85：(α/r)BA

def train_adapter(name, seed, d, r):
    g = np.random.default_rng(seed)
    return LoRAAdapter(name, g.normal(size=(r, d)) * 0.05,
                            g.normal(size=(d, r)) * 0.05)

adapters = {
    "legal": train_adapter("legal", seed=11, d=d, r=r),
    "medical": train_adapter("medical", seed=23, d=d, r=r),
}
base_hash = hashlib.md5(W0.tobytes()).hexdigest()
for name, ad in adapters.items():
    delta = ad.delta()
    print(f"{name:8s} 增量范数 ||ΔW|| = {np.linalg.norm(delta):.3f}，"
          f"存储参数 = {ad.A.size + ad.B.size}")
assert hashlib.md5(W0.tobytes()).hexdigest() == base_hash, "基座必须全程未被改动"
print("两份领域适配器训完，共享同一份未改动的 W0，各存一份小 BA")
\`\`\`

真实 HF 训练时，第二份适配器用 \`model.add_adapter("medical", lora_config)\` 挂载，再用 \`model.set_adapter("medical")\` 指定训练哪个；两份各自 \`save_pretrained\`。要点是 \`target_modules\` 两份要一致，否则挂的层不同、无法公平切换与隔离。

### 服务端切换：set_adapter 原地激活

服务层把多个适配器加载进同一个 \`PeftModel\`，用 \`set_adapter(name)\` 原地切换当前激活者，不重新加载基座。下面用 Toy 演示切换的本质：激活哪个，就用哪个 BA 计算增量，基座始终那份。

\`\`\`python
class MultiAdapterService:
    """共享 W0 + 多适配器；set_adapter 切换激活者，forward 只用激活者的增量。"""
    def __init__(self, W0, adapters):
        self.W0, self.adapters, self.active = W0, adapters, next(iter(adapters))
    def set_adapter(self, name):
        assert name in self.adapters, f"未知适配器 {name}"
        self.active = name                       # 切换：只换一个引用，O(1)
    def forward(self, x):
        delta = self.adapters[self.active].delta()
        return (self.W0 + delta) @ x

svc = MultiAdapterService(W0, adapters)
x = rng.normal(size=d)
svc.set_adapter("legal");    y_legal = svc.forward(x)
svc.set_adapter("medical");  y_medical = svc.forward(x)
print("切换后激活者：", svc.active)
print("同一输入、不同适配器输出差异 ||Δy|| =", np.linalg.norm(y_legal - y_medical))
assert np.linalg.norm(y_legal - y_medical) > 1e-6, "不同适配器应产生不同输出"
print("结论：set_adapter 是 O(1) 引用切换，不重载基座、几乎无延迟")
\`\`\`

HF 里的对应写法是把两份 \`save_pretrained\` 的适配器分别 \`load_adapter\` 进同一个模型，然后 \`model.set_adapter("legal")\` 或 \`model.set_adapter("medical")\`。切换本身不涉及权重拷贝，延迟可忽略。

### 零延迟切换 vs merge 导出：两种部署形态

这里要分清两个常被混用的概念：

- **训练态切换（set_adapter）**：一份基座 + 多份 BA 常驻，切换几乎零延迟、存储最省；但未 merge 时推理是 W₀x + BAx，比单矩阵多两次小矩阵乘——严格说不是「零计算」，只是延迟极低。
- **导出态 merge（merge_and_unload）**：把某个 BA 加回 W₀ 得单矩阵，推理与裸基座完全一样，真正的**零额外延迟**；但每个要独立部署的领域都得合并导出一份完整模型，存储退回「任务数 × 全权重」。

两者的权衡是「存储 vs 极致延迟」：多租户、领域多、切换频繁 → set_adapter 省存储；单一领域、固定部署、追求极限延迟 → merge 导出单模型。下面的 Toy 把两条路径的输出一致性与计算量差异钉死。

\`\`\`python
# 路径 A：set_adapter 旁路；路径 B：merge 单矩阵。输出必须一致
ad = adapters["legal"]
y_switch = (W0 + ad.delta()) @ x             # 旁路：先加增量再乘（等价 W0x+BAx）
W_merged = W0 + ad.delta()                    # merge：物理合并
y_merge = W_merged @ x
assert np.allclose(y_switch, y_merge), "切换与 merge 两条路径输出必须一致"

# 存储对照：N 个领域各存多少
N_DOMAINS, full_size = 8, W0.size
store_full = N_DOMAINS * full_size                       # 每领域一份全权重
store_multi = full_size + N_DOMAINS * (r * d + d * r)    # 1 基座 + N 份 BA
print(f"全参方案存储 = {store_full}  多适配器存储 = {store_multi}  "
      f"省 {store_full/store_multi:.1f}×")
assert store_full > store_multi
print("结论：输出一致、延迟路径不同；多适配器在存储上省一个数量级")
\`\`\`

:::deep

### 为什么 merge 导出仍不可替代

既然 set_adapter 切换这么方便，为什么不都用旁路？三个现实原因：① **极致延迟场景**（高并发在线、端到端延迟敏感）容不下 BA 那点额外计算与显存访问，merge 成单矩阵才稳；② **部署生态兼容**——vLLM 等推理引擎原生吃普通权重，merge 后的模型不需要 peft 运行时，部署更简单；③ **服务隔离**——某些合规场景要求「一份部署就是一份确定模型」，旁路切换的动态性反而是负担。所以在生产里两种形态常并存：开发/多租户阶段用 set_adapter 灵活切换，定稿上线时把高频领域 merge 成独立模型。理解这点，才不会把「零延迟切换」误解为「旁路一定优于 merge」。

:::

### 验证多任务隔离：输出分化 + 领域评测

「隔离」不是口号，必须可验证。两个证据：① 同一条跨域输入经不同适配器，输出应显著分化（各往自己领域风格走）；② 每个适配器在**自己的领域评测集**上应显著优于另一个适配器。下面用 Toy 的领域评测矩阵演示第二个证据：构造两份「领域测试样本」，让每个适配器在自己领域得分更高。

\`\`\`python
def domain_score(adapter, domain_vec, W0):
    """Toy 领域得分：适配器增量与该领域方向的一致性越高，得分越高。"""
    return float((adapter.delta() * domain_vec).sum())

legal_dir = np.zeros((d, d)); legal_dir[0, 0] = 1.0     # 法律领域方向（示意）
medical_dir = np.zeros((d, d)); medical_dir[1, 1] = 1.0 # 医疗领域方向
# 让两个适配器的增量主成分分别对齐各自领域（构造式，便于验证）
adapters["legal"].B[0, :] += 0.8
adapters["medical"].B[1, :] += 0.8

score_table = {}
for a_name, ad in adapters.items():
    for d_name, dv in [("legal", legal_dir), ("medical", medical_dir)]:
        score_table[(a_name, d_name)] = domain_score(ad, dv, W0)
        print(f"适配器 {a_name:8s} 在 {d_name:8s} 领域得分 = {score_table[(a_name,d_name)]:.3f}")
for a_name in adapters:
    own = score_table[(a_name, a_name)]
    other = score_table[(a_name, "medical" if a_name == "legal" else "legal")]
    assert own > other, f"{a_name} 应在自己领域得分更高（隔离成立）"
print("隔离验证通过：每个适配器在自己领域最优，跨领域得分更低")
\`\`\`

真实场景把 \`domain_score\` 换成领域测试集上的准确率/人工评分。若两个适配器在各领域得分几乎一样，说明它们学到了近似相同的行为——多半是 \`target_modules\` 挂错、数据太相似或训练不足，回到对应节点排查。

### 服务化落地：路由、并发与版本管理

把多适配器从 Toy 搬到真实服务，还要多想三层工程问题。**路由层**：请求进来要先判定它属于哪个领域，再 \`set_adapter\` 到对应适配器。路由可以是显式的（请求头带 \`domain=legal\`），也可以是模型化的（一个小分类器判断领域）。判错领域的代价是「用错适配器」，输出会往错误领域风格走——所以路由准确率是这套架构的真实瓶颈之一，往往比适配器本身更值得投入。**并发层**：\`set_adapter\` 是全局状态切换，同一时刻一个模型实例只能激活一个适配器，这对并发提出了约束。两种解法：一是按领域把请求分组、同组批量处理（减少切换次数）；二是为每个热门领域各起一个模型实例、各自 merge 一个适配器（用显存换隔离与并发），这正是前面「零延迟切换 vs merge 导出」权衡在服务层的体现。**版本管理**：每个适配器是一份小文件，可以像代码一样打版本、灰度、回滚。新增一个领域只需训一份新 BA、不改基座；下线一个领域只需停用它。这种「基座稳定、适配器热插拔」的迭代节奏，是多适配器架构相对全参微调最大的运维优势——全参微调每改一个领域都要重训并重部署整份权重。

### 隔离失败的典型原因：看似训了两个，其实是一个

多适配器最常见的隐性问题不是切换慢，而是**隔离没成立**：两个适配器学出近乎相同的行为，切换了等于没切。根因有三类。第一类是**数据太相似**——两个领域的数据集其实是同一分布的不同采样，模型自然学不出区分；解法是检查两个数据集的关键词分布、嵌入聚类是否真的分开。第二类是**参数没挂全**——两份适配器的 \`target_modules\` 不一致，或其中一份根本没挂上，导致它退化成基座行为；解法是训练前各自 \`print_trainable_parameters()\` 核对可训量级一致。第三类是**训练不足或学习率过小**，两个增量都还很小、不足以产生领域分化；解法是看各自训练 loss 是否收敛、增量范数是否达到预期量级。L90 的隔离验证（输出分化 + 各自领域最优）就是为了在上线前把这类问题挡住——它不是一个可选的锦上添花，而是多适配器方案的**验收必选项**。

:::tip

### 一基座多适配器：省的是存储与切换，不是单次推理算力

这套架构的核心账：共享一份冻结基座，每领域只存一份几十 MB 的 BA，切换用 \`set_adapter\` 原地换引用、几乎零延迟；要极致延迟就把高频领域 merge 成单矩阵导出。验证隔离靠「输出分化 + 各自领域最优」两条证据。记住边界：**多适配器省的是「任务数 × 全权重」的存储与切换成本**，不是单次推理的算力——未 merge 的旁路仍有微弱 BA 计算。带着这套判据，L91 转向另一个问题：当数据很少时，是不是连适配器都不该训太多。

:::
`,
    null,
    [
      {
        text: '一基座多适配器方案的核心收益是？',
        options: [
          '每个任务都要存一份全权重',
          '共享一份基座，每任务只存一份小的 LoRA 增量，存储与切换成本大幅降低',
          '模型必须重新预训练',
          '推理必然更慢',
        ],
        answer: 1,
        explain:
          '同一份冻结基座 + 多个几十 MB 的 BA，切换只需换适配器，存储从「任务数×全权重」降为「1 份基座 + 任务数×小增量」。',
        concept: 'multi-adapter',
      },
      {
        text: 'peft 中在同一基座上切换已加载适配器的接口是？',
        options: [
          'merge_and_unload()',
          'set_adapter(name) / activate_adapter(name)',
          'from_pretrained()',
          'train()',
        ],
        answer: 1,
        explain:
          '把多个适配器加载进同一个 PeftModel 后，用 set_adapter/activate_adapter 指定当前激活哪个，无需重新加载基座。',
        concept: 'multi-adapter',
      },
      {
        text: '服务端「零延迟切换」与「merge 导出」的权衡是？',
        options: [
          '切换一定比 merge 慢',
          'set_adapter 切换几乎无延迟但训练态旁路有微弱计算；merge 导出零额外延迟但每部署形态要单独合并一份权重',
          'merge 不能用于推理',
          '两者完全等价',
        ],
        answer: 1,
        explain:
          '切换省存储、激活快；merge 把 BA 加回 W₀ 得单矩阵、零延迟，但每个要独立部署的适配器得各合并导出一份模型。',
        concept: 'multi-adapter',
      },
      {
        text: '验证「多任务隔离」最直接的观测是？',
        options: [
          '两个适配器的 loss 曲线完全重合',
          '同一条输入在不同适配器下输出风格/领域显著不同，且各自在自己领域评测最好',
          '基座被改动',
          '参数量翻倍',
        ],
        answer: 1,
        explain:
          '隔离意味着每个适配器只学到自己领域的分布：跨域输入经不同适配器产生领域分化输出，且各自在对应领域指标上最优。',
        concept: 'multi-adapter',
      },
    ],
    [
      ['多适配器', '在同一冻结基座上挂多个 LoRA，每个对应一个任务/领域'],
      ['set_adapter', 'peft 提供的接口，切换当前激活的适配器而不重载基座'],
      ['零延迟切换', '切换适配器几乎无额外延迟；merge 后推理与裸基座同为单矩阵乘'],
      ['任务隔离', '各适配器只影响自己领域的行为，互不串扰'],
      ['适配器存储', '每任务仅存一份小的 BA 增量（几十 MB），远小于一份全权重'],
    ],
    [
      '为每个领域各存一份全参微调模型——存储随任务数线性爆炸，失去共享基座的意义。',
      '切换适配器时重新加载整个基座——慢且浪费，应 set_adapter 原地切换。',
      '以为 set_adapter 旁路推理完全零计算——未 merge 时仍有 BA 的微弱额外计算，要零延迟得 merge 导出。',
      '多个适配器共用一个 target_modules 配置却用不同层名——部分适配器可能没挂上，隔离验证会失败。',
      '不做隔离验证就上线——可能两个适配器学出近乎相同的行为，等于白训一个。',
    ],
  ),
  'scenario',
)
