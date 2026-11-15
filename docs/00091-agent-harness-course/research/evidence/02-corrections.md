# 证据台账 02 · 对批次 01 的更正与降级（2026-11-15）

> 本文件是**新批次里的更正记录**，按「历史记录不可矫正 / 分片只新建不改写」约定，不回填 `evidence/00-*.md` ~ `04-*.md` 与 `raw/01-*.md`。
> 写课程正文时，凡本文件列出的条目一律以本文件为准。

## 1. 必须更正（批次 01 的 C 级资料已被官方推翻）

| # | 批次 01 的说法 | 出处 | 官方现行事实 | 处置 |
|---|---|---|---|---|
| C-1 | 「Pi 拒绝 MCP，用 CLI 工具 + Skills + TypeScript Extensions 替代」 | `raw/01-02` 的 CSDN 摘要、`raw/01-07` 掘金文章 | **pi.dev 官网上该条已改为 `No MCP Now with MCP+Codemode`**：MCP 已内置，Codemode 用 JavaScript sandbox 组合工具调用，MCP 扩展仍支持；官方另给「Why we changed our minds」链接。见 `02-official-facts.md` F-P3 | 课程里**不得**写「Pi 不支持 MCP」；应写成「从拒绝 MCP 到内置 MCP + Codemode 的立场转变」，并附官方链接 —— 这本身是说明生态快速迭代的好材料 |
| C-2 | 「Pi 有四种运行模式：标准 / 代码 / 极简 / 创造」 | `raw/01-12` 中文报道（讲的是 **DSH**） | Pi 官方的四种模式是 **Interactive / Print-JSON / RPC / SDK**（F-P4）；标准/PTC/极简/创造是 **DSH** 的四种模式（F-D3） | 两套「四种模式」必须分开写，不能混用；批次 01 台账 `03-architecture-facts.md` 的 F-A5 / F-A6 已各自写对，但正文写作时需显式点破这个同名陷阱 |
| C-3 | 「Pi 仅 4 个工具、系统提示 <1000 token、25 个 hook；Claude Code 窗口减 13K / Codex 窗口 90% / Pi 输入预算 50% 压缩；Claude Code 六层权限 + AST 分类器」 | `raw/01-07` 掘金二手文章（F-A1） | pi.dev 官方只写 `minimal system prompt`、跳过 sub-agents / plan mode，**没有给工具数量、token 数、hook 数量**；Claude Code 官方权限文档给的是 **6 种 permission modes + deny>ask>allow + 规则语法 + OS 沙箱 + PreToolUse**（F-C1~C8），不是「六层权限 + AST 分类器」 | 这些数字与术语全部**降级为 C 级二手描述**：正文若提及必须写「据某中文工程文章归纳」，且不能作为关键结论的唯一依据；压缩触发点数字若无 A 级来源，**不写进课程** |
| C-4 | Codex CLI 的 `approval_policy` / `sandbox` / `--full-auto` 细节 | `raw/01-10` 搜索结果，实际落在 3 个 **fork 镜像** README | 官方 `openai/codex` README 只给定位、安装、登录、文档入口与 Apache-2.0，**未列这些参数**（F-X1~F-X5） | 批次 02 已找到官方仓库；这些参数需从官方文档 `developers.openai.com/codex` 的配置页重新核实后才能升级到 A 级，否则正文只写「官方 README 未列、据镜像 README 为…」 |
| C-5 | 「Pi 仓库是 `github.com/badlogic/pi-mono`，npm 包名 `@earendil-works/pi-coding-agent`」 | `raw/01-02` 第三方百科 / 博客 | pi.dev 官方链接指向 **`github.com/earendil-works/pi`**（`packages/coding-agent/...`），安装用 `pi.dev/install.ps1`；官方还给出 `pi install npm:...` / `pi install git:...` | 组织名/仓库名以官网为准；`badlogic/pi-mono` 只作为历史沿革的背景，需标注「早期 monorepo，作者 Mario Zechner（badlogic）」 |
| C-6 | DSH「五个 profile：web / headless / sdk / sdk-minimal / acp」「turn/step 边界与工具三段管线 pre-execute/execute/post-execute」 | `raw/01-12` 微信公众号长文（C 级） | Chapter 16 只举 `web` / `headless` 作为 profile 例子，并只写 `core/tools` 有 **gated execution pipeline**；**没有**五种 profile 清单，也**没有** turn/step 与三段管线的展开（F-D2 / F-D6） | 保留为 C 级背景，需抓官方 `docs/architecture.md` / `docs/cordis-primer.md` 核实；未核实前不写进「架构机制」结论表 |

## 2. 升级为 A 级（批次 01 已有 B/C 级说法，现获官方确认）

| # | 事实 | 批次 01 来源 | 官方确认 |
|---|---|---|---|
| U-1 | Codex CLI = Apache-2.0 | F-B13（Product Compass 实测文） | F-X2（官方 README 逐字） |
| U-2 | Pi 支持 15+ providers、会话中 `/model` 换模型、树形会话 / `/tree` / `/export` / `/share`、AGENTS.md / SYSTEM.md / 可替换 compaction / skills 渐进披露 / steering 与 follow-up | F-A5（当时标 A，但依据只是搜索摘要） | `02-official-facts.md` F-P5~F-P8（pi.dev 官网全文） |
| U-3 | DSH 四层配置、`dsh --profile web --dump-config`、四种模式、append-only 日志、插件树 | F-A6（依据中文二手长文） | F-D1~F-D4（官方 Handbook Chapter 16） |
| U-4 | Claude Code 规则 `deny > ask > allow`、规则由 Claude Code 而非模型执行、managed settings 最高、`PreToolUse` 在提示前且不能绕过规则、沙箱是 OS 级补充层 | F-A2（只有 hooks 清单与七种指令载体） | F-C2 / F-C4 / F-C6 / F-C7（官方权限全文） |

## 3. 新增的可引用 A 级细节（可供课程加深度）

- **F-C5** 的规则语法边界：复合命令每个子命令都要 allow；`npx` / `docker exec` 不在 wrapper 剥离列表；`Write(path)` / `Glob(path)` 不按路径规则匹配；`Bash(curl *)` 不拦 `/usr/bin/curl` 或 `sh -c 'curl …'` → 官方明确建议用 **sandboxing** 而非 command-text 规则做 filesystem/network 强制。
- **F-C4** 的 workspace trust：项目级 `permissions.allow` 与 `additionalDirectories` 需信任对话框，`claude -p` / SDK 会话不显示对话框，会以 `Workspace not trusted` 退出或忽略规则 —— 这是「无人值守场景」的具体坑。
- **F-D5** 的 seam 三角色：换 execution world 的 provider 即可让 shell / terminal / language service 一起迁到远程沙箱，是 DSH 插件化最具体的一条架构论据。
- **F-P9** 的 `Primitives, not features`：官方把 sub-agents / plan mode / permission gates / sandboxing 都作为 **50+ 示例扩展**提供，说明「极简内核」并不等于「能力缺失」，但责任由使用者承担。

## 4. 工具链坑（已实测，收尾回写坑库）

- `WebFetch` 返回超过约 50 KB 时会被折叠成 `<persisted-output>`，会话记录只保留占位 + 首 2048 字节预览 + 末尾片段；**机械导出 transcript 会丢失全文**。
- 已实测解法：从占位文本里解析出 `Full output saved to: <绝对路径>`，读取 `.../tool-results/<callId>.txt` 得到完整原文（本次 55,105 字节），再按二级标题切分成 <20 KB 分片落盘。
- 外层代码围栏需 **5 个反引号**：部分官方原文自身以 4 反引号开头（本次 Codex README），用 4 反引号包裹会破坏 markdown 结构。
