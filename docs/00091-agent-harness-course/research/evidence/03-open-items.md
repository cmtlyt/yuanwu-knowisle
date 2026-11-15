# 证据台账 03 · 待补检索清单（批次 04+）

> 批次 01 的 `04-open-items.md` 里 12 项，已完成/部分完成：#1 pi.dev（✅ A）、#2 Claude Code permissions（✅ A）、#3 Codex 官方 README（✅ A，但参数仍未核）、#5 DSH 架构 Chapter 16（✅ A）、#7 aitecharchive 全文（✅ B）、#8 Composio 文章全文（✅ C，原始 thread 仍缺）、#4 Hermes 官方 README（✅ A）。
> 以下为**仍未完成**与**新增**的待补项。

## 抓取失败 / 需换入口

1. **Harness Lens 字段字典**：`https://huggingface.co/spaces/harness-hub/harness-lens` 是动态 SPA，`WebFetch` 只拿到 632 字符外壳（标题、Like 98、Running、App/Files/Community、Fetching metadata…），**没有正文**（见 `../raw/03-01-harness-lens-space.md`）。待抓：
   - `https://huggingface.co/spaces/harness-hub/harness-lens/raw/main/README.md`
   - `https://huggingface.co/spaces/harness-hub/harness-lens/tree/main`（文件列表）
   - 或 Niklaus 公告 / pasqualepillitteri / badinfluence 里对「34 个 harness、每条结论带来源链接」的描述（已有 B 级摘要，见 `01-sources.md` S05/S06）
2. **FeatureBench 事故文档全文**：`https://huggingface.co/spaces/joelniklaus/harness-leaderboard/resolve/main/docs/incidents/2026-10-23-featurebench-answer-keys.md?download=true`，当前 F-B7 只有搜索摘要；需要全文核实 15 倍、秩相关 0.36、18–38% 首次 fetch 等数字。
3. **Harness Leaderboard Space / CHANGELOG 原文**：F-B1~F-B6 与 F-B18 都经由 bokonon / pasqualepillitteri / badinfluence / aitecharchive 转述，尚未直接读榜单页与 `CHANGELOG.md`。

## 官方一手资料缺口（影响章节关键结论）

4. **Codex CLI 现行权限/沙箱参数**：官方 README 未列；需抓 `developers.openai.com/codex` 的配置/安全页（`config`、`config-reference`、`sandbox` 等），把 F-A3 从「fork 镜像 README」升级到 A 级。同时核实 `AGENTS.md` 在官方文档中的角色。
5. **Claude Code 七种指令载体完整表**：`https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more` 全文（当前只有搜索摘要）；另抓 `https://code.claude.com/docs/en/hooks-guide` 确认 `PermissionRequest` 等 hook 事件的触发时机（permissions 页未定义该事件）。
6. **DSH 官方仓库**：`github.com/deepseek-ai/deepseek-harness` 的 README / `SAFETY.md` / `docs/architecture.md` / `docs/capability-seams.md` / `docs/cordis-primer.md` / providers guide，用以核实 C-6（五种 profile、turn/step 三段管线）与「可逆副作用」。
7. **Hermes 官方文档**：`hermes-agent.nousresearch.com/docs/architecture`（核实「TAOR + 状态机」是否成立）、`/security`（command approval / DM pairing / container isolation）、`/tools`（40+ tools 清单）。
8. **OpenCode 官方架构**：「状态机 + Runner」目前只有掘金二手文章（F-A1），需找 opencode.ai/docs 或仓库源码说明；权限三态已有官方文档（F-A4）。
9. **Pi 极简内核的数字**：「4 个工具 / 系统提示 <1000 token / 25 hooks / 压缩触发在输入预算 50%」均来自二手文章，需查 `docs.pi.dev` 或 `packages/coding-agent/src/core/system-prompt.ts`；若查不到，正文一律不写这些数字。

## 第三方基准的溯源

10. **Composio 原始 X thread / 数据集**：把 F-B25~F-B27 从 C 升到 B；当前 `code404zero.com` 只说「published via an X thread」却不给 URL。
11. **[arXiv 2610.00917](https://arxiv.org/abs/2610.00917) 原文**：核实 66 组 model×harness 配置、Terminal-Bench 4 上 +7.94 / −30.16 的反转数字，以及「36% 失败源于 schema / output-contract」到底出自哪篇研究（F-B28 把它与另一项 106 任务研究混在一起了）。
12. **Harness Leaderboard 加入 DSH 后的原始公告**：`https://x.com/joelniklaus/status/2120540528886603949`（aitecharchive 逐条引用），核实 2/36 vs 36/36、1.5–1.7 分、20 次 pass 被推翻等数字。
13. **Super-agent 原型 README**：`github.com/deepseek-ai/dsh-superagent-prototype`，确认「研究原型不是产品」与中位 12.4 min / P95 15.7 min 的实验条件。

## 仅在用户要求扩章时才需要

14. mini-swe-agent（榜单第一、bash-only）、Kimi Code / Qwen Code（分模型最优）、OpenClaw（8,192-token 输出上限反例）、Cline（changelog 列下一个加入）的官方仓库与文档。当前方案只在 S0 / S7 作对照与反例，不单独成章。

## 已发现的写作陷阱（供课程方法论章使用）

- **同名「四种模式」**：Pi 的 Interactive/Print-JSON/RPC/SDK 与 DSH 的 Standard/PTC/Minimal/Creative 完全不是一回事（`02-corrections.md` C-2）。
- **同名成本指标**：`cost per run` / `cost per solved task`（两种聚合口径）/ `cost per solved trial` / `cost per task` 至少四种，数值不可混算（F-B4、F-B20、F-B26）。
- **过时结论**：Pi 的「拒绝 MCP」已被官网改写（`02-corrections.md` C-1）；Hermes 的终端后端清单与工具数已与站点自述冲突（`03-official-facts.md` H-C1~C-3）。
- **易变数字**：star 数、版本、榜单排名都有快照日期；课程统一声明「证据快照 2026-11-15，以正文链接为准」。
