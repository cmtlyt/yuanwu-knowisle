# 00038 错误诊断增强与文档失真修复

> 任务类型：产品代码增强（B1）+ 活文档校正（A1/A2）+ 可用性复评
> 日期：2026-11-14
> 关联任务：00037（遗留价值评估，本任务实施其 P0 批次）

## 0. 历史记录声明（按「历史记录不可矫正」约定）

本任务**不修改**任何已落盘任务记录（`docs/00032-*` ~ `docs/00037-*` 全部文件、`AGENTS.md` 既有行、`docs/README.md` 既有行）。
仅在**本文件**声明本次会修正的旧结论：

- 修正 `docs/00037-backlog-value-review/overview.md` §A 层中把 README `EffectCourseData` 列为「旧类型名」的误判（经核实 `app/types/course.ts` 该名仍为有效别名，原文正确，无需改）。
- 修正 00037 把「README『零额外运行时依赖』」与「courses.ts 写 24 课」分开列为两个独立失真项——二者确为两处失真，本任务分别修复（与 00037 评估一致，做/不做口径不变）。

## 1. 目标

实施 00037 的 P0 推荐批次（3 个文件、约 5 行、零逻辑风险）：

- **B1**：LLM 网络错误诊断——浏览器在 CORS 预检失败 / Mixed Content / 端点不可达时通常只抛 `TypeError: Failed to fetch`，原代码直接透传该裸字符串，用户无法判断根因。改为可读诊断，覆盖常见原因并保留原始 message 供排查。
- **A1**：`courses.ts` 两门课 description 的「24 课」改为真实课时数 **26**（每门课 `lessons/l??.ts` 实测 26 个）。
- **A2**：`README.md` 顶部「零额外运行时依赖」与 `package.json` 实际 27 个 dependencies 矛盾，改为「无后端服务 + 依赖见 package.json」的准确表述。

随后**实核查助学 AI 是否达到可用程度**：以 00030 已验证链路为基线，结合 P0 后代码与本地 15721 端点现状给出可用性结论。

## 2. 变更计划

### 2.1 `app/lib/tutor/llm.ts`（B1）

- 新增 `export function networkMessage(raw: string): string`：空 / `Failed to fetch` / `NetworkError` 等通用裸错 → 拼接可读诊断（端点未启动 / CORS 预检未放行 / Mixed Content / 网络断开）；其余原样透传。
- `classify()` 的网络分支改用 `networkMessage(err.message)`，保留 `network` 错误码。
- 函数体纯计算、无 DOM 依赖，`verify-tutor.mjs` 可经 strip-types 直接 import 断言。

### 2.2 `app/data/courses.ts`（A1）

- `effect-ts` 与 `rxjs` 的 `description` 中 `6 阶段 24 课` → `6 阶段 26 课`（两处）。

### 2.3 `README.md`（A2）

- 特性「纯前端」点：`零额外运行时依赖；` → `无后端服务，` 并在句末补「运行时依赖由 Nuxt 4 / Nuxt UI / Tiptap 等提供（见 package.json，共 27 个 dependencies）」。

### 2.4 测试补充

- `scripts/verify-tutor.mjs` 新增 §⑥ 网络错误诊断映射：对 `Failed to fetch` / 空 / `custom backend error` 断言 `networkMessage` 输出覆盖「无法连接模型服务 / CORS / 端点未启动 / Mixed Content」且非通用错误原样透传。

## 3. 验证方案

1. `pnpm fmt:check` → `pnpm lint`（期望 0e/3w，不变）→ `pnpm typecheck`（期望 0e/5w，不变）。
2. `pnpm verify`：含 §⑥ 新增断言，应全绿。
3. `pnpm build` → 启动 wrangler 3199 → `python scripts/smoke.py --base http://127.0.0.1:3199`。
4. 另跑 `scripts/tutor-probe.py`（mock 3210 + 3199）确认对话框 / 意图路由 / 流式渲染无回归。
5. **可用性复评**：`curl` 探测本地 `127.0.0.1:15721` 的 `OPTIONS` 与 `POST /chat/completions`，核对 CORS 头；结合 00030 已验证链路给出 verdict；必要时以临时 CORS 转发层 + 浏览器探针做端到端真实模型回放。

## 4. 实施结果

### 4.1 变更文件（5 个，零产品行为改动，仅增强诊断文案与校正数字）
- `app/lib/tutor/llm.ts`：新增 `export function networkMessage(raw)`；`classify()` 网络分支改用之，保留 `network` 码。
- `scripts/verify-tutor.mjs`：§⑥ 新增 6 条 `networkMessage` 断言（含 CORS / 端点未启动 / Mixed Content 关键词），全绿。
- `app/data/courses.ts`：两门课 `24 课` → `26 课`（实测每门 `lessons/l??.ts` = 26）。
- `README.md`：特性「纯前端」点去掉「零额外运行时依赖」，改为「无后端服务 + 依赖见 package.json（共 27 个 dependencies）」。

### 4.2 门禁（全部 exit 0）
| 命令 | 结果 |
|---|---|
| `fmt:check` | 147 文件全绿（B1 改动由 oxfmt 自动格式化） |
| `lint` | 0e / **3w**（基线不变：analytics 3 条 cfs） |
| `typecheck` | 0e / **5w**（基线不变：analytics 3 + use-learning 2 边界断言） |
| `verify` | 全绿，含 §⑥ 新增诊断断言 |
| `build` | 13.4s |
| `smoke` | 18 路由 + 6 客户端 + 21 视口，全绿 |

### 4.3 动态探针
- **mock 回归**：`tutor-probe.py`（mock 3210）**63/63 PASS**，确认 P0 未引入任何回归。
- **真实模型端到端**（临时 CORS 转发层 3210 → 15721，透传真实 key/model）：**62/63 PASS**。G3 渲染的是真实 `agnes-3.0-flash` 输出（"flatMap 的原理可以拆解成两步…"），证明连接测试 / SSE 流式 / Markdown 渲染 / 意图路由 / askAi 兜底 / 错误码 / OPFS / 指纹漂移 在真实模型下全链路可用。唯一 FAIL 为探针硬编码「答案含 `<a>` 链接」，而真实模型本次回答未附带链接 —— 属测试夹具产物，非代码缺陷（加粗 / 代码块 / 列表均已正确渲染）。

## 5. 助学 AI 可用性复评（结论）

### 5.1 当前端点现状（实测 2026-11-14 21:xx）
`curl` 探测本地 `127.0.0.1:15721`：
- `POST /chat/completions` → **HTTP 200**（真实 `agnes-3.0-flash` 正常响应，SSE 可用）。
- `OPTIONS`（带浏览器 `Origin`）→ **HTTP 405 + 无 CORS 头**。
即：端点**服务本身可用**，但**未放行 CORS 预检**，浏览器从网页发起的跨域 fetch 会被直接拦截（`TypeError: Failed to fetch`）。

### 5.2 代码层可达性结论
**助学 AI 的代码与产品链路已具备可用条件**，以临时 CORS 转发层补齐预检后，真实模型端到端 62/63 全通即为此证。可用充要条件是端点满足：
1. `OPTIONS` 预检返回 2xx 且含 `Access-Control-Allow-Origin`（等）头；
2. `POST /chat/completions` 返回 `Access-Control-Allow-Origin`（浏览器需读响应）；
3. 响应为 OpenAI `chat.completions` 格式（SSE `data:` 帧 + `[DONE]`）；
4. 站点为 https 时端点也须 https（规避 Mixed Content）；
5. 整次响应 ≤ 60s（产品内建超时，00030 实测 1374 字长答在阈值内）。

### 5.3 当前唯一 blocker（非代码问题）
**本地 15721 端点未配置 CORS 预检** → 从浏览器直连会被拦。这是端点 / 代理的运维配置项，不是产品代码缺陷。两种解法（均不在产品代码内）：
- 给 15721 的代理加 `OPTIONS` 204 + CORS 头（与本次临时转发层等价）；
- 或在项目内加一个同源 `/api/llm` 服务端代理把请求转发到 15721（架构决策，00030 已明确暂不引入服务端依赖）。

### 5.4 已知非阻断残留（与 00030/00037 一致，未做）
- 错误诊断已增强（B1），但「整次 60s 超时」「端点 Mixed Content 线上验证」「Q6 歧义澄清规则稳定性」「CI 未跑运行时冒烟」等仍属 P1，未在本任务处理。
- `analytics.ts` 目录化仍按 00034 决策不拆；剩余 5 条 warnings 为预期保留项。

## 6. 历史声明补充（不修改旧文件）

- 00037 §A 把 `EffectCourseData` 误判为旧类型名——本任务核实后**不改**该处（类型名仍有效，`app/types/course.ts` 仍有别名用途）。
- 00037 P0 评估的做/不做口径（B1+A1+A2 做；smoke.py 默认 3100、analytics 目录化等不做）与本次实施一致。
- 本任务**未改写** `docs/00032-*` ~ `docs/00037-*` 任一文件（`git` 显示的工作区差异为历次未提交改动累计；各历史记录 mtime 仍停留在 17:27–20:48，本次仅新增 00038）。
