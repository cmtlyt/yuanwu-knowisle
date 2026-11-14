# 00031 · 意图路由误判 + 提示词课程语境约束（修复方案）

> **状态：已完成（2026-11-14）—— D1① / D2 采纳，D3 / D4 不采纳，按 `fix-plan.md` A → B 实施并全链路回归通过。**
> 逐条动作、根因、落点文件与单项验证见 `fix-plan.md`；真实端点抽检见 `sampling.md`；实施结果与门禁数字见本文 §7。
> §1–§6 保留方案阶段原文（§4「待你决策」与 §6「未实施」是当时状态记录），最终结论以 §7 为准。
> 触发：`docs/00030-real-llm-e2e/results.md` 的两项非跨域发现 + 00029 遗留清单 #26。
> 上游：`docs/00028-tutor-agent/`、`docs/00029-tutor-audit-fix/`、`docs/00030-real-llm-e2e/`。

## 1. 目标

修掉两个已被实证的问题，且都不触碰架构边界：

1. **意图粗路由静默误判**：命中 `NAV_RE` 就直接出本地导航卡、**完全不发 LLM 请求**，不报错、不进日志，用户无法自助改走 AI；词表仍是硬编码正则（含贪婪 `按.*顺序学` 与裸词 `导航`），用例表只有 15 条。
2. **真实模型答错基础概念**：00030 实测「用一句话讲讲 flatMap 和 map 的区别」→「map …**返回扁平的一维数组**」，把 `Array.prototype.map` 与 Effect 的 `flatMap` 混淆。根因之一已定位：**该次会话在首页打开**，冻结快照里 `course: 'home'`、`lessonConcepts` 为空、`pageKind: 'dashboard'`，system prompt 中**没有任何课程语境**；`BASE_PERSONA` 只有「不要编造 API」，没有跨语境术语消歧规则。

**不改变的边界**（沿用 00029 §1）：纯客户端架构、三层解耦、`useState` 全局单例、**`feed` 作为 LLM 请求体唯一真实来源**、课程数据契约、`analytics.ts` 迁移内核、既有门禁链与 CI 流程；也不改 `history.ts` / `llm.ts` / `config.ts` / `types/tutor.ts`（除非采纳 D3）。

## 2. 方案摘要

| 组 | 动作 | 落点 |
|---|---|---|
| **A · 意图路由** | A1 把导航判定收成「强信号白名单 + 答疑护栏 + 默认交 LLM」，去掉贪婪与裸泛词；A2 给导航卡加「改用 AI 回答」一键兜底；A3 用例表 15 → ~35；A4 动态探针补 2 条断言 | `context.ts`、`use-tutor.ts`、`tutor-card.vue`、`tutor-drawer.vue`、`verify-tutor.mjs`、`tutor-probe.py` |
| **B · 提示词语境** | B1 `BASE_PERSONA` 增「语境优先 / 跨语境消歧 / 短答也要先对齐语境」原则；B2 `lesson` / `concept` 档位补「以本课时核心概念与常见误区为准」；B3 分层验证（文本断言进 CI、真实端点人工抽检不进 CI） | `context.ts`、`verify-tutor.mjs`、`tutor-probe.py` |

完整逐条清单见 `fix-plan.md`。

### 2.1 预计改动文件

**代码（6 个，均为修改）**

```
app/lib/tutor/context.ts              # A1 意图正则 / B1 BASE_PERSONA / B2 pageTone
app/composables/use-tutor.ts          # A2 新增 askAi() 并暴露（复用 lastPrompt，不动 feed 类型）
app/components/tutor/tutor-card.vue   # A2 加按钮 + canAskAi prop + emit
app/components/tutor/tutor-drawer.vue# A2 绑定事件、传 canAskAi
scripts/verify-tutor.mjs              # A3 用例表扩充 / B3 system prompt 文本断言
scripts/tutor-probe.py                # A4 动态断言
```

**文档（实施阶段）**：本目录 `overview.md` / `fix-plan.md`（本轮已产出）、`docs/README.md`（实施后登记）、`.workbuddy/memory/2026-11-14.md`、`pitfall-resolver` 回写。

**明确不动**：`app/data/**`、`app/lib/analytics.ts`、`app/lib/tutor/{history,llm,config,navigate,fingerprint}.ts`、`app/types/tutor.ts`（D3 不采纳时）、`app/pages/settings/llm.vue`、`scripts/smoke.py`、`nuxt.config.ts`、`.github/workflows/**`、`docs/00028-*`、`docs/00029-*`、`docs/00030-*`。

> 遵守项目约定「新任务必须新建目录、旧结论失效时在新目录说明」：不改写任何旧目录文件。本轮为方案阶段，参照 00029 先例**暂不登记 `docs/README.md` 索引**，审核通过并实施后再登记。

## 3. 验证方案

**分层原则**：能确定性断言的进 CI；模型输出质量**不作硬门禁**（不可复现、易 flaky），只做可追溯的人工抽检记录。

| 阶段 | 命令 / 动作 | 通过线 |
|---|---|---|
| 1 快门禁 | `pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` | 0 errors；warnings 不增（当前 lint 27 / typecheck 36） |
| 2 内容门禁 | `pnpm verify` | 课程两门全绿 + `verify-tutor.mjs` 扩充用例全绿；新增断言：`buildSystemPrompt()` 在各 `pageKind` 下都含消歧规则、且首页不含「学情摘要」（复用 00029 B1 边界） |
| 3 构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1 pnpm build` | `BUILD_EXIT=0`；绕过原因见 `pitfall-resolver/nuxt-build.md` |
| 4 SSR / 视口 | `wrangler --cwd .output dev --port 3199` + `python scripts/smoke.py --base http://127.0.0.1:3199` | 18 SSR + 6 客户端 + 22 视口无横向溢出 |
| 5 动态回归 | `tutor-mock.py`(3210) + `tutor-probe.py` | 原 60 条 0 FAIL；新增：① 弱导航信号触发 LLM 请求而非本地卡；②「改用 AI 回答」触发 LLM、移除导航卡、**用户气泡数不增**；③ mock `messages[0]`（system）含消歧规则与冻结上下文 |
| 6 真实端点抽检 | 按 `docs/00030-real-llm-e2e/results.md` §4 形态起一层只补 CORS 头的临时转发层 + 用户真实端点，人工判 6 道歧义概念题 | 记录「N 题中 M 题合格」与典型失败样本；**不进 CI、不作硬门禁**；至少不再出现「map 返回扁平一维数组」这一具体错误 |
| 7 收尾 | 停 3199 / 3210、删临时脚本、`git status` 核对、回写踩坑库 | 无残留服务 / 临时文件 |

**阶段 6 抽检题示例**（判分标准：是否先区分语境、是否出现事实错误、是否在课时页锚定本课时概念）：`flatMap 和 map 的区别`、`Effect 和 Promise 的区别`、`switchMap 与 mergeMap 何时用`、`map 会扁平数组吗`、`什么是 Semaphore`、`这段代码为什么报错（配一段 Effect 代码）`。

**回归纪律**（`pitfall-resolver/verification.md`）：任一阶段失败即停，先查库再修；修复后重跑**全部**阶段；`set -o pipefail` 避免管道吞退出码；临时服务跑完立即关闭，不复用用户 3100 预览与 15721 端点。

## 4. 待你决策的 4 项

| 编号 | 选项 | 推荐 | 理由 |
|---|---|---|---|
| **D1** | 弱导航信号（如「我该从哪开始」「帮我导航一下」）① 改走 LLM 由三姿态自决；② 继续判本地导航 | **① 走 LLM** | 误判代价是「用户问不到答案且无提示」，多一次请求的代价远低于此；本地零 LLM 导航只保留明确强信号。会略增 token 消耗 |
| **D2** | 导航卡是否加「改用 AI 回答」按钮 | **加** | 只动 3 个文件 + 1 个 composable 方法，复用已有 `lastPrompt` / `runLlm()`，不改 `FeedItem` 类型；是误判后唯一的用户自助出口 |
| **D3** | 首页/无课时上下文是否注入站点课程语境（Effect / RxJS 课程列表） | **先不注入** | 需给 `SnapshotInput` / `ContextSnapshot` 加字段，触碰 00029 D2 契约与快照断言；B1 的消歧规则已能让模型在歧义时主动追问而非编造，先用最小改动验证效果 |
| **D4** | 阶段 6 的真实端点抽检是否落 `scripts/` 成可复现资产 | **不落仓库** | 依赖用户自持 key 与临时 CORS 转发层，无法进 CI；只在本文档写清命令形态与判分标准，避免凭据与一次性脚本进仓库 |

> 若选 D1② / D3② / D4②，实施范围会扩大到类型契约与凭据管理，我会在实施前重新报一次变更清单。

## 5. 回写计划（实施并回归通过后）

按 `pitfall-resolver` 闭环：本轮两条问题（意图长尾误判、system prompt 缺课程语境导致概念性错误）均属库里未收录的全新症状，回归通过后：

- `references/browser-viewport.md` 新增/更新：①「正则粗路由静默误判 + 无用户自助出口」的处理（强信号白名单 + 兜底按钮）；②「首页会话无课程语境导致真实模型混淆同名 API」的处理（消歧规则 + 分层验证，模型输出不作硬门禁）；
- `SKILL.md` 速查表补关键词：`意图长尾误判`、`本地导航静默降级`、`术语消歧`、`system prompt 课程语境`、`模型输出 flaky 断言`；
- 若 A3/A4 改变了 `pnpm verify` 的断言数量或命令，同步更新 `AGENTS.md` §2/§3 与本文档 §3 数字。

## 6. 方案阶段收尾

- 本轮**只读探查 + 写方案文档**，未执行 `fmt` / `lint` / `build`，未起任何临时服务。
- 工作区仍保持 00028 / 00029 / 00030 的未提交状态；本目录新增 `overview.md`、`fix-plan.md` 两个文件。
- 等你审核通过后，按 `fix-plan.md` 的 A → B 顺序实施，并跑 §3 全链路回归。

---

## 7. 实施结果（2026-11-14）

### 7.1 决策落地

| 编号 | 结论 | 实际动作 |
|---|---|---|
| D1 | **采纳①** | 弱导航信号一律交 LLM，本地零 LLM 导航只留 `NAV_STRONG_RE` 强信号 |
| D2 | **采纳** | 导航卡加「改用 AI 回答」按钮，`askAi()` 复用 `runLlm()` |
| D3 | **不采纳** | 未给 `SnapshotInput` / `ContextSnapshot` 加字段，首页不注入站点课程列表 |
| D4 | **不采纳** | 抽检脚本与 CORS 转发层只在系统临时目录运行，验后删除；`scripts/` 无新增文件 |

### 7.2 改动文件（6 个产品/验证文件，全部为修改）

```
app/lib/tutor/context.ts              # A1 意图正则 / B1 BASE_PERSONA / B2 pageTone
app/composables/use-tutor.ts          # A2 askAi() 并暴露
app/components/tutor/tutor-card.vue   # A2 canAskAi prop + askAi emit + 按钮
app/components/tutor/tutor-drawer.vue# A2 绑定 can-ask-ai / @ask-ai
scripts/verify-tutor.mjs              # A3 用例表 / B3 L1 文本断言
scripts/tutor-probe.py                # A4 2 条 + B3 L2 首帧断言
```

文档：本目录新增 `sampling.md`、更新本文件；`docs/README.md` 补索引；踩坑库与工作记忆回写。
`app/types/tutor.ts`、`history.ts`、`llm.ts`、`config.ts`、`app/data/**`、`analytics.ts`、设置页、smoke、CI workflow、旧 docs 目录**均未改动**；`feed` 作为 LLM 请求体唯一真实来源的约定未破（`askAi()` 直接调 `runLlm()`，未用 `send(lastPrompt)`）。

### 7.3 与方案的两处实现偏差（不改变已审核行为）

1. **`askAi()` 对开场自动导航卡补了引导**：这类卡没有对应 `lastPrompt`，方案里是直接 `return`。为避免新按钮「点了没反应」这一同类静默失败，改为 push 一条 guide note「请先在输入框里提问，再点『改用 AI 回答』」；卡片仍保留。
2. **用例表实际 39 条**（方案写 ~35）：为覆盖贪婪反例、组合句与中英混排多补了 4 条。原 15 条中只有「帮我导航一下」按 D1① 改期望为 `llm`，其余判定全部不变，已由 `pnpm verify` 实证。

### 7.4 门禁数字

| 阶段 | 结果 |
|---|---|
| 1 快门禁 | `FMT=0`（`pnpm fmt` 写回后 `fmt:check` 通过）/ `LINT=0`（27 warnings 基线）/ `TC=0`（36 warnings 基线） |
| 2 内容门禁 | `VERIFY=0`：意图 39 条全绿、会话组键、学情边界、导出边界、语境约束 15 条全绿 |
| 3 构建 | `BUILD_EXIT=0`，14.1s（`CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1`） |
| 4 SSR / 视口 | `SMOKE_EXIT=0`，18 SSR + 6 客户端 + 22 视口无横向溢出 |
| 5 动态回归 | `PROBE_EXIT=0`，**63 PASS / 0 FAIL**（原 60 + A4 2 + B3 1） |
| 6 真实端点抽检 | 6 题：5 合格 / 1 部分合格，**关键概念错误 0 次**，通过线达成；详见 `sampling.md` |

> 阶段 5 首轮 `62 PASS / 1 FAIL` 是探针自身缺陷：A4② 的计数基线取在 `send()` 之前，导致「用户气泡不增」期望 off-by-one。查踩坑库未命中（既有条目是「会话未就绪」），修探针后 63/63。**修复仅改 `scripts/tutor-probe.py`（Python），产品代码与 `.output` 产物零改动**，故阶段 3 / 4 未重跑；重跑阶段 5 并在收尾再次执行阶段 1 / 2 全绿。

### 7.5 收尾与未覆盖

- 3199 / 3210 / 3212 三个服务已停，端口释放；4 个临时脚本与抽检结果 JSON 已删；**凭据未写入仓库任何文件**；`git status` 核对无残留临时资产。
- 工作区仍是 00028 / 00029 / 00030 / 00031 未提交状态；未经指示未执行 `git add` / `git commit`。
- **仍未覆盖**：真实模型「歧义先澄清」在缺少关键输入时未稳定生效（抽检 Q6）；课时页 / 概念页真实输出（本次刻意选首页做基线对照）；HTTPS 线上的 Mixed Content；慢模型 / 超长输出的 60s 整次超时。若后续抽检仍显示规则被忽略，再评估 D3 或把消歧规则在 `BASE_PERSONA` 中提前——属新一轮任务。
- 两条新问题已按 `pitfall-resolver` 闭环回写：`references/browser-viewport.md` 新增「探针计数基线 off-by-one」与「新建会话 async 未完成即发送，`rebuildFeed()` 抹掉气泡」，`SKILL.md` 速查表与 description 补关键词。
