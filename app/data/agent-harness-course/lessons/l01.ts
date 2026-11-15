import { L, withKind } from '../../course-builders.ts'

export const L01 = withKind(
  L(
    'L01',
    0,
    '什么是 Agent Harness：模型外面的那层运行时',
    1,
    [],
    ['h-harness-def'],
    [
      '用自己的话定义 harness，说清它与模型、与 agent 应用两层边界',
      '用四控制面（主循环 / 上下文 / 权限 / 终止）拆解任意一个 agent 系统',
      '举出至少两个例子说明「同一模型换 harness，结果天差地别」',
    ],
    `### 从一个反直觉的实验说起

2026 年 10 月，一项发表在 arXiv 的研究 [Finding the Right Fit: Model-Harness Interactions across Agent Tasks](https://arxiv.org/abs/2610.00917) 测了 66 组「模型 × harness」配置：4 个可配置 harness（OpenHands、DeepSeek Harness、PI、openJiuwen）各配 5 个模型，跑 TUA-Bench、ALE-CLI、Terminal-Bench 4 三个基准，外加 Codex-GPT、Claude Code-Claude 两个原生配对，共发布 6,204 条已评分轨迹（[代码](https://github.com/liyix/finding-the-right-fit)）。结果非常刺眼：**在 Terminal-Bench 4 上，Claude 在 OpenHands 下领先 GPT 7.94 分；同样的两个模型换成 Pi，Claude 反而落后 GPT 30.16 分。**

同一对模型，只换了「外壳」，差距从 +7.94 翻到 −30.16。这节课要回答的问题就是：这层被换掉的「外壳」到底是什么，它里面有哪些工程决策值得逐项比较。

### Harness 的定义：模型权重之外的全部

**Harness 是包裹模型的运行时外壳**：它决定模型能看到什么上下文、能用什么工具、哪些动作需要人批准、一轮任务何时结束。模型权重不变，harness 换掉，行为就换一套。开源评估项目 [Harness Lens](https://huggingface.co/spaces/harness-hub/harness-lens)（Hugging Face Space）正是按这个思路建的：它对收录的每个 harness 逐项记录系统提示词、工具清单、编辑格式、上下文压缩（compaction）策略、权限机制与终止条件等字段，并且要求每条结论附来源链接——这份字段清单本身就是「harness 由哪些工程决策组成」的最好回答。

一个容易混淆的边界是 harness 与「agent 应用」的区别。harness 是**运行时**：循环、工具、权限、上下文；agent 应用是在其上叠加的产品形态——IDE 插件（Cline、Kilo Code）、消息平台网关（Hermes、OpenClaw）、云端管控平台（OpenHands 的 Agent Canvas）。同一个 harness 内核可以被包成完全不同的产品：例如 [Kimi Code 官方 README](https://github.com/MoonshotAI/kimi-code) 明确自述「TUI 建立在 pi-tui 之上」，致谢 Pi 的 monorepo；pi.dev 官网也把 [OpenClaw](https://pi.dev/) 列为 RPC/SDK 模式的真实世界集成。本课程聚焦运行时层，产品形态只在影响架构时展开。

### 四控制面：拆解任意 harness 的框架

比较 15 个系统之前，先要有一把统一的尺子。社区文章 [《六大 Agent Harness 架构对比》](https://juejin.cn/post/7704502089116434432) 提炼过四个工程旋钮，本课程将其固定为**四控制面**框架，贯穿全部章节：

| 控制面 | 它决定什么 | 各系统的典型差异 |
|---|---|---|
| 主循环 | 单 agent 循环还是常驻服务？谁驱动下一步？ | mini-swe-agent 是 100 行的线性 while 循环；OpenCode 2.0 是本机常驻后台服务；Hermes 是状态化 AIAgent + 会话网关 |
| 上下文 | 压缩何时触发？指令以什么载体注入？跨会话记什么？ | Claude Code 有七种指令载体与 compaction 规则；Letta Code 干脆不压缩而是分层记忆；Codex 用 token 阈值与回合末百分比两档触发 |
| 权限 | 哪些动作要人批？越界怎么拦？ | Claude Code 是 permission modes + allow/ask/deny；Codex 是 sandbox_mode × approval_policy；Pi 明确拒绝 permission popups |
| 终止与介入 | 任务何时算完？人如何纠偏？ | Grok Build 有 plan mode 逐条审批；Cline 每次文件编辑前出 diff；Codex 靠沙箱让低风险动作免审批 |

这四个面不是并列的清单，而是互相牵制的：例如 OpenClaw 把 8,192-token 输出上限作为模型条目缺省时的 fallback，直接导致 Harness Leaderboard 上 333 次 Flint DeepSWE trial 中的 289 次被截断——一个终止面配置写出了末位分数（榜单已在解除上限后重跑，见 [Harness Leaderboard](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) 的披露）。所以比较 harness 时，永远要把四个面放在一起看。

### 主循环长什么样：一段伪代码

不同的主循环可以用同一段伪代码骨架表达，差异全部在标注的五个决策点上：

\`\`\`text
# 通用 agent 主循环骨架（五个决策点 = 四控制面的落点）
state = init(system_prompt, tools, permissions)      # ① 工具集与权限边界
while True:
    ctx = assemble_context(state)                    # ② 指令载体 + 历史如何组装
    if token_count(ctx) > BUDGET:                    # ③ 压缩/记忆策略
        ctx = compact_or_recall(ctx)                 #    Claude Code: 摘要压缩
                                                     #    Letta: 分层记忆改写
    action = model(ctx)                              # ④ 请求模型（api_mode 由 harness 决定）
    if action is tool_call:
        if not allowed(action, permissions):         # ⑤ 权限判定点
            action = ask_or_sandbox(action)
        result = execute(action)                     #    Codex: 沙箱内执行
                                                     #    Cline: 先出 diff 等人批
    if done(action) or interrupted():                # ⑥ 终止条件
        break
\`\`\`

同样的骨架，mini-swe-agent 把 ①压到只有一个 bash 工具、③压成线性追加历史；Claude Code 在 ② 塞进七种指令载体、在 ⑤ 建了完整的权限运行时；OpenCode 2.0 则把整个循环搬进常驻后台服务，让 TUI/桌面/脚本共享同一个进程。**架构流派不同，但决策点是同一批**——这正是横向章（L24–L27）可以做全景对照的原因。

### 为什么这层外壳值得专门开一门课

因为它是 2026 年 agent 工程竞争的主战场。第三方评测 [Composio 的 26 任务对比](https://code404zero.com/?p=502) 用同一个模型跑六个 harness，解出数与成本差异达到数倍量级；[Product Compass 的 Bug Hunt 复测](https://www.productcompass.pm/p/deepseek-harness-vs-claude-code) 用 89 次干净运行区分 harness 优劣，发现差距远小于营销话术的暗示。而 [Harness Lens](https://huggingface.co/spaces/harness-hub/harness-lens) 收录 30+ 套 harness 的事实说明：仅仅「给模型配个循环」这件事，社区已经进化出了几十种有名字的答案。

接下来两章（Claude Code 与 Codex CLI）会先拆解两个定义了行业原型的系统——权限运行时与沙箱审批分别是它们对「权限控制面」给出的代表性答案。但在那之前，下一课先补齐一件更重要的事：**这些对比分数本身该怎么读**。毕竟，如果不会读数据，15 个系统的比较就只是 15 份营销材料的转述。
`,
    null,
    [
      {
        text: '根据 arXiv 2610.00917 的实测，Claude 在 OpenHands 下比 GPT 高 7.94 分，但在 Pi 下反而落后 GPT 30.16 分。这说明什么？',
        options: [
          'Claude 模型在退化',
          '模型排名会随 harness 翻转，选型必须把 model 和 harness 当作整体评估',
          'Pi 的实现有 bug，分数不可信',
          'Terminal-Bench 4 的题目偏向 GPT',
        ],
        answer: 1,
        explain:
          '论文的核心结论正是 model×harness 交互：模型排名跨 harness 反转。这不是某个实现的 bug，而是 scaffold 是否把失败以模型可用的形式交回的系统差异。',
        concept: 'h-harness-def',
      },
      {
        text: '下列哪一项不属于「四控制面」框架的组成部分？',
        options: ['主循环形态', '上下文管理', '权限模型', '模型预训练数据配比'],
        answer: 3,
        explain:
          '四控制面指主循环、上下文管理、权限模型与终止/人工介入，全部是 harness 层的工程决策；预训练数据配比属于模型层，不随 harness 改变。',
        concept: 'h-harness-def',
      },
      {
        text: '为什么说「harness 差异是工程决策的差异，而不是模型能力的差异」？',
        options: [
          '因为 harness 决定工具集、上下文压缩、权限边界与失败交回方式，这些都不改变模型权重',
          '因为 harness 就是模型的另一个名字',
          '因为好 harness 能微调模型参数',
          '因为模型不参与 agent 循环',
        ],
        answer: 0,
        explain:
          'harness 全部工作都在模型权重之外：它决定模型看到什么上下文、能用什么工具、越界时是否被拦、失败如何交回。同一模型在这些不同约束下的行为差异，正是 66 组配置实验测量的对象。',
        concept: 'h-harness-def',
      },
    ],
    [
      [
        'Harness',
        '包裹模型的运行时外壳：工具集、系统提示、上下文管理、权限与主循环的统称，模型权重之外的全部工程决策',
      ],
      ['四控制面', '拆解 harness 的框架：主循环形态、上下文管理、权限模型、终止与人工介入'],
      ['model×harness 交互', '同一模型在不同 harness 下表现差异大到排名反转的现象，选型时必须整体评估'],
    ],
    [
      '把「Claude Code 分数高」归因为「Claude 模型强」——arXiv 2610.00917 证明换 harness 排名会翻转，单独夸任何一方都可能是错的',
      '以为 harness 只是个「聊天外壳」——压缩策略、权限边界、失败交回方式都是 harness 决定的，直接影响任务成败',
    ],
  ),
  'theory',
)
