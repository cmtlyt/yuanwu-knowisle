# 检索 001 · LangChain 版本基线（WebSearch）

- 日期：2026-11-15
- 检索词：`LangChain latest version release 2026 langchain-ai/langchain github`（freshness=m1）
- 用途：阶段 0 版本基线核实；所有数字均为搜索摘要，标记为 C 级，待官方一手源（GitHub releases / PyPI / npm）升级。

## 原始结果摘录

### 结果 1 · whatisthelatest.ai/latest/langchain（C 级 · 聚合站）
- `langchain-core==1.8.0` 为最新稳定版，发布于 2026-11-11（来源：langchain-ai/langchain GitHub releases）。
- 近期版本序列：
  - `langchain-openai==1.8.0` 2026-11-13
  - `langchain==1.5.0` 2026-11-11
  - `langchain-typesafe==0.1.0` 2026-11-11
  - `langchain-core==1.8.0` 2026-11-11
  - `langchain==1.4.10` 2026-11-10
  - `langchain-core==1.7.7` 2026-11-09
- 截至 2026-11-14 最新稳定版：`langchain-core==1.8.0`。不计 RC / beta / nightly。

### 结果 2 · agentgid.com/news/langchain-1-5-0-released（C 级 · 聚合站）
- `langchain 1.5.0` 发布于 2026-11-11 15:47 UTC。
- 丢弃 Python 3.10 支持，最低要求 Python 3.11；`langchain-core` 最低要求升至 1.8.0。
- 新增 model router 与 auto mode middleware；`ModelRouterMiddleware` 标记为 beta。
- 现有 Python 3.10 用户停留在 1.4.x。
- 框架提供 Python 与 JavaScript 两个版本。

### 结果 3 · github.com/langchain-ai/langchain/pull/41665（A 级 · 官方 PR）
- `release(core): 1.7.5`，2026-11-04 合入 master。
- 由 hunter (hntrl) 发起并合入，3 additions / 3 deletions，改动 `version.py`、`pyproject.toml`、`uv.lock`。
- 15 个 benchmark 未受影响，2 个跳过。

### 结果 4 · promptquorum.com/langchain-review（C 级 · 评测站）
- MIT 许可，Harrison Chase 创立，2022-10 首次以 Python 库发布。
- 核心仓库 `langchain-ai/langchain` GitHub star 超 140,000。
- **LangChain 1.0 与 LangGraph 1.0 均于 2025-10 正式 GA**，承诺 2.0 前不引入破坏性变更。
- 付费可观测层 LangSmith（Developer 免费 / Plus $39/席/月 / Enterprise 定制）。
- 快照：2026-10-29 时 `langchain-core 1.7.3`、`langgraph 1.2.19`。

### 结果 5 · gradually.ai/changelogs/langchain（C 级 · 聚合站，源自 GitHub Releases）
- 最新 `v1.5.0`，已加载 64 个 release；官方源核验日期 2026-11-14。
- v1.5.0（2026-11-11）：移除 EOL 的 Python 3.10；`ModelRouterMiddleware` 标 beta；新增 model router 与 auto mode middleware。
- v1.4.10（2026-11-10）：middleware 内部模型调用不再进入 messages stream；ModelRefusalMiddleware 省略 trace 输入。
- v1.4.9（2026-11-04）：`feat(core): standardize model refusal content blocks`。
- v1.4.8（2026-11-02）：警告 Python 3.10 将在 core 1.8.0 / langchain 1.5.0 移除。
- v1.4.6（2026-10-14）：`SummarizationMiddleware` 支持 opt-in per-call interrupts（HITL）。
- v1.4.5（2026-10-12）：`SummarizationMiddleware` 接受 summarizer。
- v1.4.4（2026-10-09）：上下文溢出时重试 summary 步骤；最低 FastMCP 升至 4.0.11。

## 待升级为 A 级的问题
1. `langchain` / `langchain-core` / `langgraph` 精确最新版本号（GitHub releases 官方页面 / PyPI JSON API）。
2. Python 与 JS/TS 两条源码线的仓库与版本是否一致（`langchain-ai/langchain` vs `langchain-ai/langchainjs`）。
3. 1.0 架构changes：`langchain` 包与 `langgraph` 的职责边界、middleware 体系、`create_agent` 等新入口。
4. 课程主线口径：Python 源码 vs TypeScript 源码（需用户确认）。
