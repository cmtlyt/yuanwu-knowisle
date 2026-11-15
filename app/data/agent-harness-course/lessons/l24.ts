import { L, withKind } from '../../course-builders.ts'

export const L24 = withKind(
  L(
    'L24',
    16,
    '横向对比（一）：15 系统全景对照表',
    2,
    ['L01'],
    ['h-x-landscape-table'],
    [
      '用形态/许可/模型接入/扩展机制/权限模型五个维度横向定位 15 个系统',
      '说出每个维度上的极端点与聚集区',
      '把全景表当作选型的索引而非结论——每格都能回溯到对应章节的证据',
    ],
    `### 一张表装下 15 个系统

前面 15 章（S1–S15）每章拆一个系统。本课把它们钉进同一坐标系。所有数字为**快照 2026-11-15**，每格都可回溯对应章节的证据链接；引用时注明快照日期。

| 系统 | 形态 | 许可 | 模型接入 | 扩展机制 | 权限模型 | 详见 |
|---|---|---|---|---|---|---|
| Claude Code | 终端 CLI | **专有** | Anthropic 绑定 | skills/hooks/subagents/plugins | 四层规则漏斗 + managed settings | L03/L04 |
| Codex CLI | 终端 CLI + headless | Apache-2.0 | Responses 协议绑定（ollama/lmstudio 内置） | AGENTS.md/rules/config | 沙箱三档 × 审批策略 | L05/L06 |
| DeepSeek Harness | Web UI + 桌面 | MIT | 插件适配器 | Cordis 插件树 + patch | gated execution pipeline | L07/L08 |
| Hermes | CLI + 网关 + ACP | MIT | 18+ providers（3 API 模式） | 插件/技能/MCP/cron | approval + DM pairing + 容器隔离 | L09/L10 |
| Pi | 终端 TUI | MIT | 15+ providers | 扩展原语（50+ 示例） | 无 popups，交还用户 | L11/L12 |
| OpenCode 2.0 | 常驻服务 + TUI/Web/桌面 | MIT | 75+ providers | 80+ 插件热重载 + Code Mode | allow/ask/deny 三态 | L13/L14 |
| mini-swe-agent | 终端 CLI | MIT | LiteLLM/OpenRouter/Portkey | 单 yaml 配置 | 全交外部（需沙箱） | L15 |
| Kimi Code | 终端 TUI（pi-tui） | MIT | Kimi OAuth/兼容厂商 | 插件市场（信任分级）+ hooks | 生命周期 hooks 拦截 | L16 |
| Qwen Code | CLI + 桌面 + Web（实验） | Apache-2.0 | 多协议 + 运行时切换 | SDK/插件（1.0 基座化中） | 集中管控（1.0） | L17 |
| Cline | VS Code/JetBrains/CLI/桌面/SDK | Apache-2.0（JetBrains 闭源） | 全主流 BYOK | SDK 拆包 + MCP | 审批优先 + checkpoint | L18 |
| Kilo Code | VS Code/JetBrains/CLI/Cloud | Apache-2.0 + source-available 网关 | 60+ provider/500+ 模型 | MCP 市场 + modes | 平台管控（企业档） | L19 |
| Grok Build | 全屏 TUI + headless + ACP | Apache-2.0 | xAI 生态绑定 | AGENTS.md/plugins/hooks/skills/MCP | plan mode + 逐段 allowlist | L20 |
| Letta Code | 终端 CLI | Apache-2.0 | 模型无关（4+ 家） | skills（.md）+ 分层记忆 | research preview | L21 |
| OpenHands | 浏览器平台 + automation | MIT + enterprise/ 另许可 | 100+ providers | ACP 跑第三方 agent + MCP | 平台治理 + 容器后端 | L22 |
| OpenClaw | Gateway + 20+ IM 通道 | MIT | 多模型 | 150+ 扩展 + 伴侣应用 | 宿主机执行（需自建基线） | L23 |

### 读表的三个视角

**视角一：许可聚集区。** 15 个系统里 14 个有开源许可（MIT × 7、Apache-2.0 × 6、混合 × 2），唯一专有是 Claude Code——而它恰好用 managed settings 补上了企业管控。聚集区说明「开源」已是行业默认，真正的差异化在**许可的例外条款**：Kilo 的网关 source-available（可读不可竞争性托管）、OpenHands 的 enterprise/ 目录、Cline 的 JetBrains 插件闭源。审计时读例外，不读标签。

**视角二：接入协议的派系。** 模型接入不是「支不支持」的问题，而是**协议派系**问题（F-B14）：OpenAI-compatible（Pi/OpenCode/Hermes/Kilo/Grok Build）、Anthropic-compatible（Claude Code/DSH）、Responses API（Codex CLI）、多协议运行时切换（Qwen/Hermes）。选 harness 之前先确认你的模型仓在哪个派系——协议不符，一切免谈。

**视角三：权限四象限。** 权限模型维度上是光谱不是排名：规则漏斗（Claude Code）→ 沙箱强制（Codex）→ 审批优先（Cline/Grok Build）→ 交还用户（Pi/mini-swe-agent）。四类答案各自对应一种团队风险偏好，没有「最安全」只有「最适合你团队纪律」。

### 表格背后的两个趋同信号

趋同一是 **AGENTS.md 标准的胜利**：Claude Code（兼容）、Codex（project_doc_* 键族）、DSH（供贡献者）、Grok Build（开箱兼容）、OpenHands、Cline（兼读）、Qwen、Kimi Code——各家都在向「仓库级指令文件」这个约定收敛，这与 CLAUDE.md/.cursorrules 的割裂时代相比是生态成熟的标志。趋同二是 **「模型写代码组合工具」**：Pi 的 Codemode 与 OpenCode 2.0 的 Code Mode 独立做出同一架构选择，把工具 schema 从上下文常驻改为按需脚本化——如果 2027 年再更新这张表，这一格大概率从「差异点」变成「聚集区」。

### 表格之外：三张更细的对照表

本课的全景表是索引。横向章接下来三课各展开一张更细的表：L25 交叉四套基准数据（分数/成本/噪声/伪影）；L26 归纳四大架构流派（把 15 个系统压成四个模式）；L27 按场景给选型决策表（每条候选与排除都挂证据）。三张表合起来才是完整的选型方法论——**单表必误导，交叉才可信**。

### 追问与辨析：AGENTS.md 趋同的键位差异

「趋同」不等于「同义」。同一份 AGENTS.md 在不同 harness 里的读法有键位级差异：Codex 提供 \`project_doc_max_bytes\`（读取上限）、\`project_doc_fallback_filenames\`（缺失备选名）、\`project_root_markers\`（项目根判定）与 \`model_instructions_file\`（整体替换入口，CX-5，A 级）；OpenCode 2.0 干脆移除了 CLAUDE.md 兼容、只读 AGENTS.md（O-3）；Claude Code 兼容读取但真正的指令体系是七载体（CC-1），CLAUDE.md 只是其中一档。因此「写一份 AGENTS.md 走天下」在 2026 年是近似成立的判断，但采购/审计文档必须注明各家的 fallback 行为与字节上限——这两处正是迁移时最容易踩的暗坑。

\`\`\`markdown
<!-- AGENTS.md：写仓库事实与命令，不写个人偏好（跨 harness 最大公约数） -->
# Repo conventions
- 包管理器: pnpm 10；Node >= 22
- 提交前必须通过: pnpm lint && pnpm typecheck
- 测试: pnpm verify（禁止跳过或部分执行）
\`\`\`

\`\`\`toml
# ~/.codex/config.toml —— Codex 侧对 AGENTS.md 的控制键（CX-5，官方 config-reference）
project_doc_max_bytes = 65536
project_doc_fallback_filenames = ["AGENTS.md", "README.md"]
project_root_markers = [".git"]
\`\`\`

\`\`\`toml
# 项目信任与压缩控制（CX-4/CX-6，官方 config-reference）
[projects."D:/code/your-repo"]
trust_level = "trusted"                    # trusted 才加载项目级 .codex/config.toml
# 项目级不可覆盖的键：model_provider / model_providers / notify / profile / otel 等（CX-4）

# 压缩参数（CX-6）
model_auto_compact_token_limit = 100000    # scope = total | body_after_prefix
model_post_turn_compact_threshold_percent = 80   # 回合末按窗口百分比触发
\`\`\`
`,
    null,
    [
      {
        text: '15 个系统里，许可为专有的有几个？',
        options: ['0 个', '1 个（Claude Code，© Anthropic PBC）', '5 个', '全部开源'],
        answer: 1,
        explain:
          'F-B13：Claude Code 是唯一专有；Codex CLI Apache-2.0；DSH/OpenCode/Hermes/Pi/mini-swe-agent/Kimi Code/OpenClaw MIT；Qwen Code Apache-2.0；Cline Apache-2.0；Letta Apache-2.0；Kilo Apache-2.0 + source-available；Grok Build Apache-2.0；OpenHands MIT + enterprise/ 另许可。',
        concept: 'h-x-landscape-table',
      },
      {
        text: '「内置 MCP 或 Codemode 组合工具调用」这一机制的采纳者包括？',
        options: [
          '只有 Pi',
          'Pi（Codemode）与 OpenCode 2.0（Code Mode 默认化）——两个独立项目在 2026 年做出相同架构选择，是「模型写代码组合工具」成为趋势的信号',
          '没有任何一家',
          '全部 15 家',
        ],
        answer: 1,
        explain:
          'pi.dev 官网（Now with MCP+Codemode）与 anoma.ly 2.0 发布说明（Code Mode 默认启用）相互印证。这是上下文控制面的趋同点：工具 schema 不再常驻上下文。',
        concept: 'h-x-landscape-table',
      },
      {
        text: '全景表中「权限模型」维度上，四种答案的代表性系统是？',
        options: [
          '全部一样',
          '规则漏斗（Claude Code）/ 沙箱优先（Codex）/ 审批优先（Cline、Grok Build plan mode）/ 交还用户（Pi、mini-swe-agent）',
          '只有沙箱一种',
          '只有弹窗一种',
        ],
        answer: 1,
        explain:
          '四类答案对应四种团队风险偏好（L03/L05/L18/L11 各章展开）。横表的价值是把这四类摆在一起，选型从「哪个好」变成「我们要哪类」。',
        concept: 'h-x-landscape-table',
      },
      {
        text: '使用这张全景表的正确姿势是？',
        options: [
          '直接按某列排序选第一名',
          '当索引用：每一格都可回溯到对应章节的证据链接；结论必须结合 L25 的基准数据与 L27 的场景决策',
          '只看 star 数列',
          '把表当永久事实',
        ],
        answer: 1,
        explain:
          '全景表是快照（2026-11-15）的索引：分数与排名在 L25 交叉读，最终决策在 L27 按场景。任何单列排序都会重复 L02 的口径错误。',
        concept: 'h-x-landscape-table',
      },
    ],
    [
      ['全景对照表', '15 系统 × 5 维度的快照索引表，每格可回溯章节证据'],
      [
        '聚集区',
        '多数系统选择的维度取值（如 MIT/Apache 双许可、AGENTS.md 兼容）——聚集说明这是行业默认，差异化才有信息量',
      ],
    ],
    [
      '把快照表当永久事实——版本、star、榜单都在漂移，每格数字带日期',
      '用 star 数列排序选型——F-A9：star 数相互矛盾且只反映热度',
      '漏读「许可注意点」列——source-available（Kilo 网关）与 enterprise/（OpenHands）不是标准开源',
    ],
  ),
  'theory',
)
