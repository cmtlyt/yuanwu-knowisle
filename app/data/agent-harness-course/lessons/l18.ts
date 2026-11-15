import { L, withKind } from '../../course-builders.ts'

export const L18 = withKind(
  L(
    'L18',
    10,
    'Cline：审批优先的 IDE agent 与 shadow checkpoint',
    2,
    ['L03'],
    ['h-cline-approval-first'],
    [
      '复述 Cline 的四条设计原则与「每次工具调用后 shadow Git checkpoint」机制',
      '区分 Plan Mode / Act Mode 的两段式工作流与 --auto-approve 的边界',
      '说明 Cline 截至快照无榜单分数这一事实的正确处理方式',
    ],
    `### 定位：把「人审」做成产品哲学

Cline（[cline.bot](https://cline.bot)，Apache-2.0）的官方定位是 *The collaborative coding agent for complex work*，自述 3.8M+ 安装、51.8k stars（易变快照）。它的设计原则四条全部围绕「信任」展开：**Open Source Everything**（agent loop 全部开源可审计）、**Not Profiting on Inference**（自带 API key、供应商原价、零加价）、**Universal Model Access**、**Your Infrastructure Only**（纯客户端，代码不出本机）。企业侧宣称 SOC 2 Type I / GDPR、SSO / RBAC / 集中策略。模型侧无固定默认：Claude / GPT / Gemini / Bedrock / Vertex / Mistral / DeepSeek / Cerebras / Grok / Qwen / LiteLLM / Ollama / LM Studio / 自定义 OpenAI 兼容 endpoint，且官方明确**不索引、不嵌入仓库内容**，按需读文件。

### 形态矩阵与七构件

同一 agent core 的多形态交付：VS Code 扩展（仍以 \`claude-dev\` 包名发布）、JetBrains 插件（**未开源**）、**CLI 2.0**（\`npm install -g cline\`）、桌面应用（Tauri + Bun sidecar + Next.js）、\`@cline/sdk\`（拆 core / agents / llms / shared / ui）。第三方 [innFactory 的 harness 拆解](https://innfactory.ai/en/ai-harness/cline)（B 级）把 Cline 的七个构件总结为一张表——它恰好是 L01 四控制面框架的现成对照物：

\`\`\`text
Cline 七构件 ↔ 四控制面（四控制面框架来自 L01）
① agent loop（CLI 可 headless）          → 主循环
② 工具（文件/bash/浏览器 + MCP）          → 主循环的执行端
③ 上下文（.clinerules/.cline/rules，
   兼读 AGENTS.md/.cursorrules）         → 上下文（指令载体兼容多家约定）
④ 状态（cline history / --team-name /
   cline schedule 跨重启定时）           → 上下文（跨会话状态）
⑤ 权限（--auto-approve false 逐调用确认，
   CLINE_SANDBOX 隔离）                  → 权限
⑥ 验证反馈（shadow checkpoint + /undo）  → 终止与人工介入
⑦ 编排（coordinator 拆任务给 specialists）→ 主循环（多代理扩展）
\`\`\`

### Plan/Act：审批优先的具象化

官方把人工审批做成两段式产品承诺：**Plan Mode** 先探索代码库并与人共同产出完整计划，*See every file read and every diff before it's applied*——每个读取与每个 diff 都在人眼前过一遍，然后才写第一行代码。这是本课程「权限控制面」谱系里的第三个答案：Claude Code 是规则漏斗（L03），Codex 是沙箱优先（L05），Cline 是**审批优先**——不建复杂规则引擎，而是把「人看 diff」本身做成默认工作流。三类答案没有高下，只有团队风险偏好的匹配：强治理选漏斗、高吞吐选沙箱、高风险变更选审批。

### 数据与「没有数据」的正确处理

Cline 截至快照（2026-11-15）**没有 Harness Leaderboard 分数**——官方 [changelog](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) 把它列为下一个待加入的 harness。本课程的处理方式就是这句原话：**暂无可复核实测**。3.8M 安装量与 51.8k star 说明的是流行度，与能力无关（L02 四问之外的第五问：这个数字测的是什么？）。作为参照，同属 IDE 路线的竞品里，Cline 的多形态交付（SDK 拆包 + ACP 接 Neovim/Emacs/Zed）与 checkpoint 回滚是文档可查的差异化。

### 适用与排除

**适合**：把「每一步都看得见」当硬需求的团队（合规、教学、高风险变更）；VS Code 主力且要 BYOK 零加价的个人与团队；需要 SDK 嵌入自家产品（\`@cline/agents\` 的 agent loop 可复用）。**排除**：需要榜单数据支撑的采购决策（等它进榜）；JetBrains 开源审计场景（该插件闭源）；无人值守高吞吐自动化（审批优先的吞吐上限天然低于沙箱路线）。

下一课的 Kilo Code 与 Cline 同属「IDE + 多模型」生态，但走了另一条开放路线：**把网关和云后端也 source-available 化**。

### 追问与辨析：审批优先的实操清单与企业承诺的核对面

Cline 的「审批优先」不是一句口号，落盘后是一张可执行的权限清单（对照 innFactory 拆解与官方文档形状）：

\`\`\`bash
# CLI 2.0 的审批旋钮（对照官方 docs.cline.bot 与第三方拆解）
cline auth                       # BYOK：供应商原价，平台零加价
cline --auto-approve false       # 交互/高风险场景：逐调用确认（默认 true 是 headless 友好值）
cline --json                     # headless 流式输出，CI 可解析
cline mcp                        # MCP 管理：第三方工具经统一入口
cline history / schedule         # 状态与定时：跨重启恢复、定时任务
CLINE_SANDBOX=1 cline            # 隔离到独立数据目录
cline hub                        # 本地 background hub：多客户端共享会话
\`\`\`

逐条对应审批优先的三个机制层：**事前**（Plan Mode：每个读取与 diff 在人眼前过一遍，批准后才写第一行代码——官方产品承诺原话 *See every file read and every diff before it's applied*）、**事中**（\`--auto-approve false\` 逐调用确认；\`CLINE_SANDBOX\` 数据隔离）、**事后**（shadow Git checkpoint：每次工具调用后快照，\`/undo\` 可还原文件/任务/两者——它是唯一把「反悔」做成一等操作的系统）。三层合起来，审批优先的完整含义是「**人在环上的每个位置都有一个挂钩点**」。

企业承诺的核对面要冷静处理。官方宣称的 SOC 2 Type I / GDPR / SSO / RBAC 是**企业版能力声明**（快照未附第三方审计链接），与开源核心（agent loop 全部可审计）是两条线：开源审计看 \`@cline/sdk\` 拆包（core/agents/llms/shared/ui）与 VS Code 扩展源码，企业合规看官方承诺文档并要求补充证明。两线不要混——这正是本课把「JetBrains 插件未开源」单独列进 pitfalls 的原因：**开源审计的边界要精确到产品形态**。

最后是数据边界的再次确认：Cline 无榜单分数（changelog 列为下一个加入），本课的候选理由全部来自机制文档而非跑分。把「机制可审计但能力待实测」作为它的选型标签，等进榜后用 L25 的交叉读法补数据——这也是本课程对任何「下一个加入」系统的标准处理流程。
`,
    null,
    [
      {
        text: 'Cline 四条设计原则中，「Not Profiting on Inference」指什么？',
        options: [
          '不赚模型的钱——自带 API key、按供应商原价付费、无加价',
          '不开放模型接口',
          '模型免费',
          '只支持开源模型',
        ],
        answer: 0,
        explain:
          '官方设计原则：Open Source Everything（agent loop 全部开源可审计）/ Not Profiting on Inference（BYOK、原价、无加价）/ Universal Model Access / Your Infrastructure Only（纯客户端，代码不出本机）。',
        concept: 'h-cline-approval-first',
      },
      {
        text: 'Cline 的 shadow Git checkpoint 机制是？',
        options: [
          '每次提交都推远端',
          '每次工具调用后创建 shadow Git checkpoint，/undo 可还原文件/任务/两者——把「回滚」从 git 操作变成 agent 工作流的一等操作',
          '只在会话结束时快照',
          '需要手动 git stash',
        ],
        answer: 1,
        explain:
          'innFactory 的 harness 拆解（B 级）：验证反馈构件 = 每次工具调用后 shadow Git checkpoint + /undo 还原文件/任务/两者。它与 Claude Code 的「变更 diff 审查」互补：一个管事前审批，一个管事后回滚。',
        concept: 'h-cline-approval-first',
      },
      {
        text: 'Cline CLI 2.0 的 --auto-approve 默认值与安全开关？',
        options: [
          '默认 false，不能改',
          'headless 默认 true（自动化友好）；--auto-approve false 切换为逐调用确认；CLINE_SANDBOX 隔离到独立数据目录',
          '默认 true 且不可关',
          '没有此参数',
        ],
        answer: 1,
        explain:
          'innFactory 拆解（B 级）：CLI headless 时 --auto-approve 默认 true、--json 流式输出；逐调用确认用 --auto-approve false；CLINE_SANDBOX 提供隔离。默认值偏向自动化，安全约束要显式打开——与 Codex 的沙箱默认哲学相反。',
        concept: 'h-cline-approval-first',
      },
      {
        text: '关于 Cline 在 Harness Leaderboard 的成绩，正确的说法是？',
        options: [
          '排名第一',
          '暂无分数——changelog 把 Cline 列为下一个待加入的 harness；横向对比表必须标「暂无可复核实测」，不能从 star 数或安装量推能力',
          '垫底',
          '官方拒绝参加',
        ],
        answer: 1,
        explain:
          'F-B28：changelog 列 Cline 为下一个加入。这是 L02 四问的边界案例：没有数据就写「没有数据」，绝不拿 3.8M 安装量/51.8k star 冒充能力证据。',
        concept: 'h-cline-approval-first',
      },
    ],
    [
      [
        'Plan/Act 两段式',
        '先 Plan（探索代码库、与人共同产出完整计划）再 Act（写代码），人工审批嵌在两段之间',
      ],
      ['shadow checkpoint', '每次工具调用后的隐藏 Git 快照，支持 /undo 粒度还原'],
      ['background hub', '多客户端会话共享的本地后台服务（cline hub）'],
    ],
    [
      '以为 JetBrains 插件也开源——官方只有 VS Code 扩展（以 claude-dev 包名发布）与 CLI 开源，JetBrains 插件未开源',
      '把 headless 默认 --auto-approve true 带进交互场景——交互使用应显式关闭',
      '用安装量推能力——Cline 是本课程「无榜单数据不写排名」原则的直接案例',
    ],
  ),
  'theory',
)
