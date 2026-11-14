import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L116 = withKind(
  L(
    'L116',
    23,
    '编码 Agent：读仓库 → 生成补丁 → 跑测试闭环',
    4,
    ['L42', 'L68'],
    ['coding-agent'],
    [
      '把编码 Agent 拆成「检索 / 补丁 / 验证 / 预算」四个可独立实现的模块',
      '实现基于 git worktree 的补丁沙箱：先 check 再 apply，失败不污染主仓库',
      '从测试输出中提取可回填给模型的失败栈，并做去噪',
      '为编码 Agent 设计最小评测切面（通过率 / 补丁规模 / 越界率）与安全边界',
    ],
    `
### 场景：为什么编码 Agent 的价值不在「会写」

把「生成代码」当成核心能力是最常见的误判。单次生成的正确率在真实仓库里很难超过五成——不是模型不会写，而是它不知道你的仓库里已有什么、命名怎么约定、测试怎么跑、哪条路径是被禁止的。真正的差距出现在生成之后：能不能跑起来、失败了能不能看到原因、能不能只改该改的地方。

所以编码 Agent 的骨架是四条闭环，缺一条就退化成「聊天框里输出代码」：

**检索**（找到相关文件与既有约定）→ **补丁**（生成最小 diff，先检查再落盘）→ **验证**（跑测试 / lint，把失败信息结构化回填）→ **预算**（控制读入上下文与迭代轮数）。

### 架构：四个模块与一条边界

\`\`\`title="编码 Agent 的模块边界" note="关键：工具层只暴露「读多写少」的能力，写操作必须经过沙箱层，模型看不到主仓库的可写路径。"
模型
 ├─ read_file / search_code      ← 只读，带预算
 ├─ propose_patch(diff)          ← 只产出 diff，不落盘
 └─ run_checks(suite)            ← 在隔离 worktree 中执行
          │
    沙箱层（git worktree + 只读主仓库）
          │
    主仓库（永不直接写入，合并需人工）
\`\`\`

这条边界是整个设计的地基：模型可以自由读、自由提议，但**没有任何工具能让它直接改主仓库**。所有写入都发生在 worktree 里，通过与否由 \`run_checks\` 的退出码决定，不由模型自我声称决定。

### 模块一：工具定义

工具集刻意做小。工具越多，模型选错的概率越高，且每个工具都要写自己的预算与超时。四个工具足以覆盖绝大多数改 bug / 加小功能的场景。

\`\`\`ts title="① 四个工具：读、搜、提议补丁、跑检查" note="schema 用 zod 定义，与 L42 的运行时共用；propose_patch 不落盘，只返回 diff 供沙箱校验。"
import { z } from 'zod'
import type { ToolDef } from './fc-runtime'

export const tools: ToolDef[] = [
  {
    name: 'read_file',
    description: '读取仓库内某个文件的指定行区间（1-based）',
    schema: z.object({ path: z.string(), start: z.number().int().min(1), end: z.number().int().min(1) }),
    run: async ({ path, start, end }) => readSlice(path, start, end),
  },
  {
    name: 'search_code',
    description: '全文检索，返回文件:行:内容，最多 40 条',
    schema: z.object({ pattern: z.string(), glob: z.string().optional() }),
    run: async ({ pattern, glob }) => grepRepo(pattern, glob, 40),
  },
  {
    name: 'propose_patch',
    description: '提交一个 unified diff 作为候选修改，不落盘',
    schema: z.object({ diff: z.string().min(1) }),
    run: async ({ diff }) => ({ accepted: diff.length < MAX_DIFF, diff }),
  },
  {
    name: 'run_checks',
    description: '在隔离 worktree 中应用候选补丁并跑测试与 lint',
    schema: z.object({ suites: z.array(z.string()).default(['unit', 'lint']) }),
    run: async ({ suites }) => sandboxVerify(pendingDiff, suites),
  },
]
\`\`\`

### 模块二：检索与上下文预算

读仓库的难点不是「读」，而是「读多少」。把整个仓库塞进上下文既贵又会让模型抓不住重点；只读一个文件又常常看不到调用方。可用的策略是「先搜后读」：用检索结果定位，再按相关度读少量区间，并给总字符数设硬上限。

\`\`\`ts title="② 预算裁剪：先搜后读，总字符封顶" note="超预算时截断而不是报错——报错会让模型反复重试同一个超大读取，反而更贵。"
const BUDGET = 60_000 // 单轮读入的字符上限

export async function readSlice(path: string, start: number, end: number) {
  if (!insideRepo(path)) return { error: 'OUT_OF_REPO', path }
  const lines = (await fs.readFile(path, 'utf8')).split('\\n').slice(start - 1, end)
  const text = lines.join('\\n').slice(0, BUDGET)
  return { path, start, end, text, truncated: text.length >= BUDGET }
}

export async function grepRepo(pattern: string, glob: string | undefined, limit: number) {
  const out = await exec('rg', ['-n', '--no-heading', '-m', String(limit), pattern, ...(glob ? ['-g', glob] : [])])
  return { hits: out.split('\\n').filter(Boolean).slice(0, limit) }
}
\`\`\`

### 模块三：补丁沙箱（本课的核心）

补丁落盘是编码 Agent 唯一有副作用的动作，也是事故的高发点。安全做法只有一条：**永远不要在可能被污染的工作树上直接 apply**。用 \`git worktree\` 为每次验证开一个独立目录，先 \`git apply --check\` 做静态校验，通过才真正 apply，跑完直接删除。这样即使补丁把文件改坏、把测试挂死，主仓库也毫发无损。

\`\`\`ts title="③ worktree 沙箱：check → apply → run → dispose" note="--check 是关键：它在不落盘的情况下校验补丁能否干净应用，把「补丁本身有问题」与「测试失败」区分开。"
export async function sandboxVerify(diff: string, suites: string[]) {
  const dir = '.sandbox/' + crypto.randomUUID()
  await exec('git', ['worktree', 'add', '--detach', dir, 'HEAD'])
  try {
    await fs.writeFile(path.join(dir, 'candidate.patch'), diff)

    // 1) 静态校验：能否干净应用（不落盘）
    const check = await exec('git', ['apply', '--check', 'candidate.patch'], { cwd: dir })
    if (check.code !== 0) return { phase: 'patch', ok: false, stderr: check.stderr }

    // 2) 真正应用
    await exec('git', ['apply', 'candidate.patch'], { cwd: dir })

    // 3) 跑检查，只回传结构化结果
    const results = []
    for (const s of suites) {
      const r = await exec('npm', ['run', '-s', s], { cwd: dir, timeout: 120_000 })
      results.push({ suite: s, ok: r.code === 0, failures: parseFailures(r.stdout + r.stderr) })
    }
    return { phase: 'checks', ok: results.every((r) => r.ok), results }
  } finally {
    await exec('git', ['worktree', 'remove', '--force', dir])
  }
}
\`\`\`

### 模块四：把失败信息变成可用输入

失败栈是模型下一轮最重要的输入，但原始输出往往有几千行、混杂进度条与无关告警。直接回填等于让模型在大海捞针；过度裁剪又会丢掉关键帧。折中的做法是只保留能被测试框架的结构化行，并且**每条都带上文件:行号**，让模型能立刻去读那一段。

\`\`\`ts title="④ 失败提取：只留「测试名 + 文件:行 + 断言消息」" note="去噪比截断更重要：保 40 行高信号，胜过 2000 行原始日志。"
const FAIL_RE = /(?:^|\\s)(?:✗|×|FAIL|AssertionError|Error:)\\s*(.+)/

export function parseFailures(raw: string) {
  const failures: Array<{ test: string; at?: string; message: string }> = []
  for (const line of raw.split('\\n')) {
    const m = line.match(FAIL_RE)
    if (!m) continue
    const at = line.match(/([\\w./-]+\\.(?:ts|tsx|js|vue)):(\\d+)(?::(\\d+))?/)
    failures.push({ test: m[1].trim(), at: at ? at[1] + ':' + at[2] : undefined, message: line.trim() })
    if (failures.length >= 40) break
  }
  return failures
}
\`\`\`

### 端到端：一轮完整闭环

把四个模块接起来，一轮就是：模型读/搜 → 提议补丁 → 沙箱验证 → 失败栈回填 → 再改。终止条件有三个，且都必须显式：检查全绿、补丁规模超阈值、迭代轮数超上限。

\`\`\`ts title="⑤ 主循环（节选自 runWithTools 的 system 约束）" note="prompt 里必须写死三件事：只改必要文件、不许新增依赖、失败必须读失败栈而不是猜。"
const SYSTEM = [
  '你是仓库维护者。只做最小必要修改。',
  '禁止新增依赖、禁止修改 CI 配置、禁止写入仓库外路径。',
  '每次失败后，先读取失败栈里指向的文件:行，再决定修改。',
  '补丁超过 200 行时，先说明为什么必须这么大。',
].join('\\n')

const result = await runWithTools(client, tools, task, { system: SYSTEM, maxSteps: 12 })
\`\`\`

### 评测切面：三个指标就够起步

编码 Agent 的评测不需要一上来就做大而全的 benchmark。三个指标能在半天内搭出来，且能立刻暴露问题：**任务通过率**（测试从红变绿的比例）、**补丁规模分布**（中位行数；远超预期说明在做大重写）、**越界率**（触碰禁止路径 / 新增依赖的比例，应为 0）。前两个反映能力，第三个反映安全性——安全性指标必须是硬零，不能「平均下来还凑合」。指标还要按任务类型分桶统计：重构类任务的通过率天然低于改错别字，混在一起看会掩盖真实退化。

:::warn

### 生产事故与处置

**事故一：补丁把测试改成永远通过**。现象是通过率突然 100%，diff 里出现测试文件的删除或 \`expect(true)\`。根因是模型走了捷径，而沙箱只检查「测试是否绿」。修复：把测试目录设为只读（校验 diff 不得触碰 \`test/\`），并把「修改测试」列为硬失败。

**事故二：沙箱跑飞**。现象是 worktree 里 \`npm install\` 或死循环脚本占满磁盘与 CPU。根因是 \`run_checks\` 没有超时、没有网络隔离。修复：给每条命令加 timeout，容器内断网，并把工作目录挂成限额。

**事故三：上下文里带了密钥**。现象是报错日志回填时把 \`.env\` 的内容带进了模型上下文，进而出现在 trace 里。根因是 \`read_file\` 没有路径黑名单。修复：路径 allowlist（只允许源码目录）+ 输出侧密钥扫描。

:::

:::deep

### 为什么「读多写少」不是风格问题而是安全问题

读操作的失败是可观察的（读到错的文件 → 改错地方 → 测试红），写操作的失败是不可逆的（已落盘、已推送、已被别的分支基于它开发）。把写操作压到低频、隔离、可回滚，本质是把「不可逆错误」转换成「可观察错误」。这也解释了为什么所有成熟编码 Agent 都把「生成 diff」与「应用 diff」分成两步——diff 只是文本，应用才是动作。

:::
`,
    null,
    [
      {
        text: '编码 Agent 与「代码补全」的核心差别在于？',
        options: ['模型更大', '有「跑测试 → 读失败栈 → 再改」的验证闭环', '支持更多语言', '输出更快'],
        answer: 1,
        explain: '验证闭环把不可控的生成变成可观察、可迭代的过程。',
        concept: 'coding-agent',
      },
      {
        text: '补丁应用前先执行 git apply --check 的目的是？',
        options: [
          '加快应用速度',
          '在不落盘的情况下校验补丁能否干净应用，区分「补丁有问题」与「测试失败」',
          '自动修复冲突',
          '生成提交信息',
        ],
        answer: 1,
        explain: '--check 把两类失败分开，避免把「补丁本身坏了」误报为「测试失败」。',
        concept: 'coding-agent',
      },
      {
        text: '测试输出有 2000 行时，回填给模型的合理做法是？',
        options: [
          '原文全部回填',
          '只回填最后 10 行',
          '提取「测试名 + 文件:行 + 断言消息」，上限数十条',
          '不回填，让模型自己猜',
        ],
        answer: 2,
        explain: '高信号结构化提取远优于原文截断：模型能直接定位文件:行。',
        concept: 'coding-agent',
      },
      {
        text: '以下沙箱实现有一个安全缺口，缺陷在哪？\\n\\nasync function verify(diff) { await exec("git", ["apply"], { cwd: repoRoot }); return runTests(repoRoot) }',
        options: [
          'git apply 不支持 unified diff',
          '直接在主仓库根目录应用补丁，失败会污染工作区且不可回滚',
          'runTests 应改为同步执行',
          '缺少 --check 就够了，其余无问题',
        ],
        answer: 1,
        explain: '必须用独立 worktree（或容器）隔离；主仓库应保持只读。',
        concept: 'coding-agent',
      },
      {
        text: '要给编码 Agent 设一条「安全性硬指标」，最合理的是？',
        options: [
          '平均补丁行数小于 100',
          '触碰禁止路径或新增依赖的比例必须为 0',
          '任务通过率大于 80%',
          '平均迭代轮数小于 5',
        ],
        answer: 1,
        explain: '能力指标可以有余量，越界率这类安全指标必须是硬零。',
        concept: 'coding-agent',
      },
    ],
    [
      ['worktree', 'git 的多工作树，用于隔离补丁验证'],
      ['git apply --check', '不落盘地校验补丁能否干净应用'],
      ['失败栈提取', '从测试输出中抽出「测试名 + 文件:行 + 断言」'],
      ['越界率', '触碰禁止路径 / 新增依赖的比例，应为 0'],
      ['上下文预算', '单轮读入字符数的硬上限'],
    ],
    [
      '生成补丁后直接在主仓库 apply，失败即污染工作区。',
      '把测试目录开放给模型修改，通过率被刷成 100%。',
      '回填 2000 行原始测试日志，模型抓不住关键失败帧。',
      '沙箱命令不设超时与断网，一次死循环拖垮机器。',
    ],
  ),
  'scenario',
)
