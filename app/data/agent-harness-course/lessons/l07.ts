import { L, withKind } from '../../course-builders.ts'

export const L07 = withKind(
  L(
    'L07',
    3,
    'DeepSeek Harness（上）：Everything is a Plugin 的插件树内核',
    2,
    [],
    ['h-dsh-plugin-kernel'],
    [
      '解释「产品 = 运行起来的插件树」的含义与 Cordis 可逆副作用机制',
      '复述启动四层配置的优先级与 --dump-config 自省能力',
      '区分 DSH 官方的四种运行模式（Standard/PTC/Minimal/Creative）各自的适用场景',
    ],
    `### 定位：DeepSeek 官方的「操作系统级」答案

DeepSeek Harness（命令名 \`dsh\`）是 DeepSeek AI 官方开源的 agent harness，仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 README 第一句就是 **Everything is a Plugin**，底层由 **Cordis** 插件内核驱动（设计出自论文《A Programming Paradigm for Spatiotemporal Composability》）。MIT 许可、TypeScript 实现、developer preview 状态（README 大写警告 *THERE WILL BE COMPATIBILITY-BREAKING CHANGES.*，截至快照 2026-11-15 最新版本线为 0.2.2-rc）。安装一句话：\`npx @deepseek-ai/dsh web\`，Web UI 默认起在 \`127.0.0.1:3080\`；运行前官方要求先读 \`SAFETY.md\`。

本课事实来源分层标注：架构机制全部来自官方 Handbook Chapter 16（[官方文档站](https://deepseekharness.github.io/deepseek-harness/)，批次 02 抓取存档）；生态与版本信息来自官方仓库 README；唯一需要警惕的是网上流传的中文长文里「五种 profile」「turn/step 三段管线」等展开——官方文档未写这些，本课不引用（台账 C-6）。

### 产品即插件树：一条 startup 叙事

官方 Handbook 用一句话概括架构：*At startup it hangs plugins onto a tree one by one, and the product is what that tree looks like when it runs.*（启动时把插件一个个挂到树上，产品就是这棵树运行起来的样子。）模型、工具、会话、沙箱、存储、界面全部是树上的节点；modding 不是改源码或打补丁，而是「挂一个插件」——*Mount it and it takes effect; take it off and things go back*（挂上生效，摘掉还原）。这依赖 Cordis 的**可逆副作用**：插件注册的能力在卸载时自动回收，所以不存在「需要打补丁的特权内核」。官方还专门辟谣了三个常见误解：插件树 ≠ 微服务（单进程内 services/events 协作，不走网络）；一切皆插件 ≠ 什么都要自己装（发行版自带完整 assemblies）；modding ≠ 改源码（挂插件 + 写 patch，源码一行不改）。

### 四层配置叠加与自省

配置系统是插件树的「接线图」，四层按优先级从低到高叠加：

\`\`\`yaml
# DSH 配置叠加（官方 Handbook Chapter 16，形状示意）
# 优先级从低到高：
# 1. profile 里的 bundles        —— 命名组合，列出用哪些 bundle（如 web / headless）
# 2. profile 自己的 patch        —— 只写「要改哪一项」的增量
# 3. 主目录（home-level）patch   —— 跨 profile 的个人改动
# 4. 命令行 --patch              —— 临时覆盖，优先级最高

# 自省整棵插件树（打印出的每一项都能被自己的 patch 覆盖）：
#   dsh --profile web --dump-config
\`\`\`

\`--dump-config\` 是这套设计的工程亮点：任何时刻都能打印当前生效的完整配置树，而打印出的每一项都可以被 patch 覆盖——配置、运行态与自省三方一致。seam（可替换能力）则是插件化的最小单元：**Definition**（接口）/ **Provider**（实现，如本地文件系统或远程沙箱）/ **Consumer**（使用方，如 shell 与文件编辑）。官方给的例子是把 execution world 的 provider 从本地换成远程沙箱——shell、terminal、language service 一起迁移，无需为每件工具单独写远程版本。

### 四种运行模式（官方表）

| 模式 | 内容 | 官方用途 |
|---|---|---|
| Standard | 全套工具 | 日常默认 |
| PTC（Programmatic Tool Calling） | 模型写一段代码把多轮工具调用组合起来 | 「多工具调用且步骤固定」的批量任务；官方建议觉得「步骤太多太慢」时再试 |
| Minimal | 只留 1 个 shell + 1 个文件编辑工具 | 比较模型底色 / 最小环境基准 |
| Creative / Creator | 在内存里试插件并组合新模式 | 开发插件与实验 |

**同名警告**：这四张模式与 Pi 的四种运行模式（Interactive / Print-JSON / RPC / SDK）毫无关系——两套「四种模式」是本课程（L11）点名的头号混淆陷阱，中文社区文章经常张冠李戴。

### 会话日志：一条事件流撑起四个功能

\`core/session\` 维护 **append-only 事件流**：写入模型看到的全部内容——system prompt、thinking process、tool calls and results、sub-agent dispatch、every context injection；*write forward only, never rewrite history*。工程收益是功能复用：**resume / fork / retrieval / replay 共用同一事件流**，不是四套数据；界面的 trajectory view 按来源浏览。核心包职责表（官方）佐证了分层：\`core/session\`（日志与存储）、\`core/system-prompt\`（prompt 分段与工具描述组装）、\`core/tools\`（工具注册表 + **gated execution pipeline**）、\`core/agent\` / \`core/agent-loop\`（默认循环驱动）、\`llm/llm\`（模型适配器）。

下一课我们看这棵插件树在真实基准上的表现——包括一个让它与榜首失之交臂的「后台进程清理」缺陷，以及 preview 状态带来的现实风险。

### 追问与辨析：patch 的增量语义与一份可读的形状

四层配置叠加（bundles → profile patch → home patch → \`--patch\`）的关键词是**增量**：patch 只写「要改哪一项」，而不是整份配置的副本——这与 Claude Code 的 settings 层叠（L03）形似，但 DSH 的 patch 直接作用于插件树节点，粒度是「插件能力」而不是「键值对」。一个可以落盘的形状示意：

\`\`\`yaml
# profile patch 形状示意（对照官方 Handbook Chapter 16 的概念，字段名以 --dump-config 输出为准）
# 用途：把 web profile 的默认模型换掉 + 关掉一个内置工具 + 挂一个私有 bundle
profile: web
patches:
  - target: llm/provider            # seam 的 Definition 位置（L07 正文的三角色）
    set:
      provider: deepseek
      model: deepseek-flash
  - target: core/tools/browser      # 摘掉一个内置工具：插件可逆副作用的直接应用
    remove: true
  - target: core/system-prompt
    append: |
      团队约定：commit message 使用 conventional commits；
      任何破坏性 git 操作必须先询问。
bundles:
  - my-team-tools                   # 自研 bundle：随仓库分发
\`\`\`

配合自省命令 \`dsh --profile web --dump-config\`（打印出的每一项都能被 patch 覆盖），这套「打印什么就能改什么」的一致性是 DSH 配置系统最值得学的设计。写团队规范时可以直接利用它：**把本团队的 patch 文件进 git、把 dump-config 输出进 CI 快照**——配置漂移在合并前就能被发现。

再点一次本课最重要的同名陷阱：这张 patch 里的 \`profile: web\` 与「四种模式」无关——profile 是命名组合（web/headless/sdk/sdk-minimal/acp 是官方举过的例子），模式是 Standard/PTC/Minimal/Creative 四档运行姿态。中文社区经常把两者搅在一起；在 DSH 的语境里，**profile 回答「挂哪些插件」，模式回答「以什么姿态跑」**。
`,
    null,
    [
      {
        text: 'DSH 的「可逆副作用」机制解决什么问题？',
        options: [
          '让插件跑得更快',
          '插件注册的能力在卸载时自动回收，因此插件可以热插拔，「不存在需要打补丁的特权内核」——换模型/沙箱/整套界面不用动其余部分',
          '自动修复插件 bug',
          '把插件编译成机器码',
        ],
        answer: 1,
        explain:
          '官方 Handbook 的核心设计：模型适配器、工具注册表、会话日志、沙箱、审批策略、子代理、调度器乃至 agent loop 与 UI 都是插件；mount 上去生效、卸下即还原，没有特权内核。',
        concept: 'h-dsh-plugin-kernel',
      },
      {
        text: 'DSH 启动时的四层配置，优先级从低到高正确的是？',
        options: [
          '命令行 --patch → home patch → profile patch → bundles',
          'profile 的 bundles → profile 自己的 patch → 主目录 patch → 命令行 --patch',
          '全部平级随机叠加',
          '只有一层 config.toml',
        ],
        answer: 1,
        explain:
          '官方 Handbook Chapter 16：四层按优先级叠加为 bundles（profile 里）→ profile patch → home-level patch → 命令行 --patch 临时覆盖。patch 只写「要改哪一项」，不是整份配置。',
        concept: 'h-dsh-plugin-kernel',
      },
      {
        text: 'DSH 的 Minimal 模式是干什么的？',
        options: [
          '最小化内存占用',
          '只留 1 个 shell + 1 个文件编辑工具，用来比较模型底色 / 做最小环境基准',
          '关闭所有网络',
          '单用户模式',
        ],
        answer: 1,
        explain:
          '官方四模式表：Minimal 只保留 1 个 shell + 1 个文件编辑工具，用途是比较模型能力或做最小环境测试。注意别与 Pi 的「四种模式」混淆（L11 会专门点破这个同名陷阱）。',
        concept: 'h-dsh-plugin-kernel',
      },
      {
        text: '关于 DSH 的 append-only 会话日志，下列说法符合官方描述的是？',
        options: [
          '只记录工具调用结果',
          '写入模型看到的全部内容（system prompt、thinking、tool calls 及结果、子代理派发、每次上下文注入），write forward only；resume / fork / retrieval / replay 共用同一事件流',
          '定期轮转删除旧记录',
          '只存在于云端',
        ],
        answer: 1,
        explain:
          '官方描述：日志记录模型看到的全部内容，只向前写、永不重写历史；界面 trajectory view 按来源浏览，resume/fork/retrieval/replay 四个功能共用同一事件流而非四套数据。',
        concept: 'h-dsh-plugin-kernel',
      },
    ],
    [
      [
        'Cordis',
        'DSH 的插件内核，源自论文《A Programming Paradigm for Spatiotemporal Composability》；可逆副作用使其支持热插拔',
      ],
      [
        'seam（可替换能力）',
        '三角色结构：Definition（接口）/ Provider（实现）/ Consumer（使用方）；换 execution world 的 provider 即可整体迁移到远程沙箱',
      ],
      ['bundle', '可分发的配置 + 挂载代码单元；profile 是命名组合，patch 只写增量改动'],
      ['gated execution pipeline', 'core/tools 的门控执行管线，位于官方核心包职责表'],
    ],
    [
      '把 DSH 的四种模式（Standard/PTC/Minimal/Creative）当成 Pi 的四种模式（Interactive/Print-JSON/RPC/SDK）——两套同名概念完全不同，是本课程点名的头号混淆陷阱',
      '以为「一切皆插件」意味着什么都要自己装——官方辟谣：发行版自带完整 assemblies 开箱即用',
      '把插件树当成微服务——官方明确是单进程内 services/events 协作，不走网络',
      '引用「turn/step 三段管线」「五种 profile 清单」——这些来自中文二手文章，官方 Chapter 16 未展开（台账 C-6），正文不作为架构结论',
    ],
  ),
  'theory',
)
