# 00029 · 助学 Agent 审计缺陷修复

> **状态：已实施、全链路回归通过（2026-11-14，用户审核通过方案后执行）。**
> 方案原文保留在下方供追溯；实际交付、门禁数字与差异见 §7 实施结果。
> 上游：`docs/00028-tutor-agent/`（需求 / 技术方案 / 实施结果）。
> 触发：2026-11-14 对 00028 做「方案 ↔ 实现一致性 + 可行性」全量审计。审计采用静态逐条核对 + 真实浏览器动态验证（本地 OpenAI 兼容 mock 端点 + Workers 预览 + Chrome CDP），**26/28 断言通过，2 个 FAIL 为真实缺陷**。

## 1. 目标

把审计发现的问题全部收敛，使「需求 → 技术方案 → 实现 → 可复现验证」四者一致：

1. 修掉 2 个 P0 运行时缺陷（数据清除不完整、降级链断裂）；
2. 修掉 2 个 P1 需求偏差（学情上下文注入范围、意图正则误判）；
3. 修掉 3 个 P2 体验 / 健壮性问题；
4. 修掉审计列出的其余代码健壮性项（`httpError` 归类、外部取消误报、SSE 空响应、`main` 标记、惰性快照、路由监听、类型与依赖锁定等）；
5. 对 00028 文档中已失真的契约表述，按项目约定**在新目录声明校正**（不追加、不改写旧目录文件）；
6. 把本轮一次性探针转成可复现的回归资产，并按项目约定回写 `pitfall-resolver`。

**不改变的边界**：纯客户端架构、三层解耦、`useState` 全局单例、`feed` 作为 LLM 请求体唯一真实来源（00028 已验证的关键约定）、课程数据契约、`analytics.ts` 迁移内核、既有门禁链与 CI 流程。

## 2. 审计结论摘要（修复对象）

| 级别 | 问题 | 实证 |
|---|---|---|
| P0-1 | 「清除全部对话记录」只删 `home.json` | OPFS 文件 `["home.json","effect-ts.json"]` → 清除后 `["effect-ts.json"]` |
| P0-2 | OPFS 抛错时降级失效 | 覆写 `getDirectory` 抛错 → `unhandledrejection`，抽屉 `feed=0` 空白 |
| P1-3 | 学情上下文注入范围错误 | 首页开场插学情导航卡、system 提示词含「学情摘要」；违反「仅学情页注入」 |
| P1-4 | 意图正则过宽 | 「这两个操作符哪个先执行？」被截到本地导航（nav 1→2、LLM 请求 0 新增） |
| P2-5 | FAB 角标状态滞后 | 已配置仍显示「配」，因 `configStatus` 仅在打开抽屉时刷新 |
| P2-6 | `body.tutor-open` 无 CSS | 实测 `overflow: visible`，移动端背景滚动穿透 |
| P2-7 | 底部 sheet「可拖拽到 90vh」未实现 | 只有 `max-height: 90vh`，无拖拽交互 |
| 契约 | 8 类方案 ↔ 实现偏差 | 详见 `fix-plan.md` D 组 |

实证通过的链路（保持不动）：AES-GCM 密文落盘与指纹漂移提示、`POST {baseUrl}/chat/completions` + Bearer + `stream:true`、冻结上下文首帧、SSE 逐帧、Markdown 加粗 / 代码块 `tok-*` / 链接渲染且无 `<script>` 注入、401 与网络不可达的系统气泡、「重试」不重复追加用户气泡。

## 3. 变更计划

逐条动作、根因、落点文件、单项验证方式见 **`fix-plan.md`**（A 组 P0 / B 组 P1 / C 组 P2 / D 组文档契约校正 / E 组健壮性 / F 组验证资产）。

### 3.1 预计改动文件

**代码（修改，14 个）**

```
app/lib/tutor/history.ts       # A1 枚举删除、A2 OPFS 兜底、main 复位、惰性快照工厂
app/lib/tutor/config.ts        # A2 指纹计算异常兜底、E10 损坏 blob 归 stale
app/lib/tutor/fingerprint.ts   # E9 清理无用语句
app/lib/tutor/context.ts       # B2 收紧意图、E 组清理无用代码
app/lib/tutor/llm.ts           # E 组 httpError / 外部取消 / SSE 空响应 / \r 行分隔
app/lib/tutor/navigate.ts      # E 组 base 必传，杜绝 /lessons/<id> 错误路径
app/types/tutor.ts             # E 组 LlmErrorCode 扩展（待决策 D4）
app/composables/use-tutor.ts   # B1 学情页判定、C1 配置预探测、A2 异常兜底、E 组路由监听
app/components/tutor/tutor-fab.vue        # C1 角标
app/components/tutor/tutor-drawer.vue     # C2 / C3（C3 待决策）
app/components/tutor/tutor-system-note.vue # E 组新增错误码文案
app/pages/settings/llm.vue     # A2 refresh 异常兜底
app/assets/css/main.css        # C2 body 滚动锁
package.json                   # D7 精确版本 + verify 脚本挂接（若采用 F1）
```

**新增（待决策项确认后定稿）**

```
docs/00029-tutor-audit-fix/fix-plan.md    # 本方案清单（已产出）
scripts/verify-tutor.mjs                  # 意图用例表 + 导出边界断言（推荐，F1）
scripts/tutor-mock.py                     # OpenAI 兼容 mock 端点（推荐，F2）
scripts/tutor-probe.py                    # CDP 回归探针（推荐，F2）
```

**文档**

```
docs/00029-tutor-audit-fix/corrections.md # 对 00028 的校正声明（D 组，实施阶段产出）
docs/README.md                            # 登记 00029（实施阶段）
```

> **重要约定遵守**：项目约定「新任务必须新建目录，不要追加到旧文件或旧目录；旧结论失效时在新目录说明」。因此 00028 的 `overview.md` / `tech-design.md` **一律不改**，其失真表述在 `corrections.md` 中逐条声明「以 00029 为准」，并在 `docs/README.md` 索引中让 00029 可被检索到。本轮方案阶段不登记索引，避免审核前产生额外改动。

**明确不动**：`app/data/**`、`app/lib/analytics.ts`、`scripts/smoke.py`（本轮不改）、`scripts/verify-course.mjs`、`nuxt.config.ts`、`.github/workflows/**`、`AGENTS.md`、`README.md`。

### 3.2 实施顺序（审核通过后）

1. A 组 P0：先修存储与降级，保证「清除 / 异常」两条链路不破坏数据；
2. B 组 P1：修注入范围与意图路由；
3. C / E 组：体验与健壮性，逐项对应 `fix-plan.md` 编号；
4. D 组文档校正：只写 `corrections.md` + 索引，不碰旧目录；
5. F 组验证资产落地 → 跑 §4 全链路回归；
6. 回归通过后按 `pitfall-resolver` 约定回写新症状（2 个 P0 属库里未收录的全新症状，速查表第 56 行规则），再更新本目录 `overview.md` 的「实施结果」。

## 4. 验证方案

**通过线：0 errors，且审计清单里 2 个 P0 / 2 个 P1 全部由 FAIL 转 PASS。**

| 阶段 | 命令 / 动作 | 断言 |
|---|---|---|
| 1 快门禁 | `pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` | 0 errors；不新增 warning 基数（当前 lint 27 / typecheck 41） |
| 2 内容门禁 | `pnpm verify` | 课程完整性 + 学情全轨迹全绿；若采用 F1，额外跑意图用例表与导出边界断言 |
| 3 构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1 pnpm build` | `BUILD_EXIT=0`；tutor 组件进 Workers bundle（该绕过已收录于 `pitfall-resolver/nuxt-build.md`） |
| 4 SSR / 视口 | `wrangler --cwd .output dev --port 3199` + `python scripts/smoke.py --base http://127.0.0.1:3199` | 18 条 SSR 路由（含 `/settings/llm`）、6 条客户端渲染、22 组视口无横向溢出 |
| 5 动态回归 | `tutor-mock.py`(3210) + `tutor-probe.py` | 本轮 28 条断言全绿；额外断言：① 清除后 OPFS `tutor/` 无课程文件；② 覆写 `getDirectory` 抛错时无 `unhandledrejection` 且 `feed>0`；③ 首页无学情导航卡 / system 无「学情摘要」；④ 学情页有导航卡 / system 有「学情摘要」；⑤「哪个」类问题走 LLM 而非本地导航 |
| 6 收尾 | 停 3199 / 3210、删临时文件、`git status` 核对 | 服务关闭、无残留临时脚本、改动清单与 §3.1 一致 |

**回归纪律**（`pitfall-resolver/verification.md`）：任一门禁失败即停，先查库再修；修复后重跑**全部**阶段，不只重跑失败项；用 `set -o pipefail` 避免管道吞掉退出码；临时服务跑完立即关闭，不复用用户 3100 预览。

## 5. 待你决策的 4 项

| 编号 | 选项 | 推荐 | 理由 |
|---|---|---|---|
| **D4** | 是否扩展 `LlmErrorCode` 新增 `'http'` / `'aborted'`，以正确归类 5xx 与外部取消 | **扩展** | 当前 500/404 被归为 `parse`、外部取消被误报 `timeout`，文案会误导用户；改动仅 1 类型 + 1 映射表 |
| **D5** | 导航层：① 改文档声明「只用 `recommend` + `reviewQueue`，`diagnose` 已用于学情摘要；概念卡统一跳课时页」；② 补实现（`diagnose` 归因 + 概念锚点跳转） | **① 改文档** | 需求结论表未要求 `diagnose` 进卡片；概念锚点需给课时页加稳定 id，会触碰课程数据契约，违反 §1 边界 |
| **C3** | 底部 sheet 拖拽：① 改文档为「固定 75vh / 最大 90vh」；② 实现拖拽把手 | **① 改文档** | 需求表只写「移动底部抽屉」；拖拽易与消息区滚动产生触控冲突，收益低于风险 |
| **F2** | mock 端点 + CDP 探针是否落仓库 `scripts/` | **落仓库** | 让 5 号回归可复现；不挂进 CI（依赖 Chrome + wrangler），仅人工按需执行 |

> 若你选择 D5② / C3②，实施范围会扩大到课时页模板与 Pointer Events，我会在实施前重新报一次变更清单。

## 6. 回写计划（实施并回归通过后）

`pitfall-resolver` 查库结果：本次 2 个 P0 均**未收录**（库里只有上一轮回写的 `TS2339 getDirectoryHandle` 类型条目），命中速查表第 56 行「全新问题」规则。回归通过后：

- 在 `references/nuxt-build.md` 或 `browser-viewport.md` 新增两条：①「OPFS API 在无安全上下文 / webview 抛错，带 try/catch 的内存兜底才是真降级」；②「枚举式清除只删硬编码文件名会漏删分组文件」；
- 同步补 `SKILL.md` 速查表关键词（`OPFS 降级`、`unhandledrejection`、`clearAll 漏删`、`意图正则误判`）；
- 若 F1/F2 改变了命令链，同步更新 `AGENTS.md` 第 2 节命令速查。

---

## 7. 实施结果（2026-11-14）

### 7.1 决策结果

用户回复「按照你的建议修复」，4 项决策**全部采用推荐选项**：

| 编号 | 结果 |
|---|---|
| D4（fix-plan E1 决策） | **扩展** `LlmErrorCode` 加 `'http'` / `'aborted'`，500/404 显示真实状态码、外部取消不再误报 timeout |
| D5 | **① 改文档**：`corrections.md` 声明导航层只用 `recommend` + `reviewQueue`，不触碰课程数据契约 |
| C3 | **① 改文档**：底部 sheet 校正为「固定 75vh / 最大 90vh」，不实现拖拽把手 |
| F2 | **落仓库**：mock 端点 + CDP 探针进 `scripts/`，不挂 CI，`AGENTS.md` §2 登记人工命令 |

> 注：`fix-plan.md` 里的 D4 是「XSS 处理顺序」校正，与 E1 的「错误码扩展」决策编号同名，已在 `corrections.md` 末尾说明。

### 7.2 实际改动清单

**代码修改（13 个）**：`app/lib/tutor/{history,config,context,llm,navigate,fingerprint}.ts`、`app/types/tutor.ts`、`app/composables/use-tutor.ts`、`app/components/tutor/tutor-system-note.vue`、`app/pages/settings/llm.vue`、`app/assets/css/main.css`、`package.json`、`pnpm-lock.yaml`。

**新增（5 个）**：`scripts/verify-tutor.mjs`、`scripts/tutor-mock.py`、`scripts/tutor-probe.py`、`docs/00029-tutor-audit-fix/{fix-plan,corrections}.md`。

**文档修改**：`AGENTS.md` §2、`docs/README.md`（登记 00029）、`.workbuddy/skills/pitfall-resolver/{SKILL.md,references/toolchain.md,references/browser-viewport.md}`（闭环回写）。

**与 §3.1 预计清单的偏差（3 处，均为收缩）**：
- `tutor-fab.vue` / `tutor-drawer.vue` **未改**：C1 只需数据源及时（角标条件不变）、C3 采用选项①只改文档，因此两个组件文件无需动。
- 额外改了 `pnpm-lock.yaml`：精确锁定版本后必须同步 lock 的 importer specifier，否则 CI `--frozen-lockfile` 会失败（实测补 87 行，上一轮 `pnpm add` 只写了 packages/snapshots）。
- 额外改了 `AGENTS.md` §2 与 `docs/README.md`：F2 / 索引登记所需，方案 §3.1 已列为「文档」。

**明确未动**：`docs/00028-tutor-agent/` 全部文件、`app/data/**`、`app/lib/analytics.ts`、`scripts/smoke.py`（本轮未改）、`scripts/verify-course.mjs`、`nuxt.config.ts`、CI workflow。

### 7.3 门禁与回归（实测）

按 §4 六阶段执行，逐条核对退出码（`;` 分隔单独记录，避免管道吞掉失败码）：

| 阶段 | 结果 |
|---|---|
| 1 快门禁 | `FMT=0 LINT=0 TC=0`：fmt:check「All matched files use the correct format」；lint **27 warnings / 0 errors**（与基线一致）；typecheck **36 warnings / 0 errors**（比基线 41 少 5，因清理了冗余断言） |
| 2 内容门禁 | `VERIFY=0`：课程两门全轨迹 + 新增 `verify-tutor.mjs` **24 项断言**（意图 15 / 组键 6 / 快照 2 / 导出边界 4，含 D6 固化断言） |
| 3 构建 | `BUILD_EXIT=0`，15.1s（一次性 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 绕过已收录的 shim 守卫），5 个 tutor 组件进 Workers bundle |
| 4 SSR / 视口 | `SMOKE_EXIT=0`：18 条 SSR（含 `/settings/llm`）+ 6 条客户端 + 22 组真实视口无横向溢出 |
| 5 动态回归 | `PROBE_EXIT=0`：**60 PASS / 0 FAIL**（mock 3210 + 预览 3199 + Chrome CDP，视口 390×844） |
| 6 收尾 | 3199 / 3210 已停，无临时脚本残留（探针已转正式资产） |

**P0 / P1 由 FAIL 转 PASS 的实证**：

- P0-1：清除前 OPFS `["home.json","effect-ts.json"]` → 清除后 `[]`，课程文件不再残留。
- P0-2：覆写 `navigator.storage.getDirectory` 抛错 → `unhandledrejection=[]`、`feed=1`、有「本机存储不可用」内联提示、本地导航仍可用。
- P1-3：首页无 `.tutor-navcard` 且 system 不含「学情摘要」；学情页有导航卡且 system 含完整「学情摘要」文本。
- P1-4：「这两个操作符哪个先执行？」→ mock 请求 1→2、导航卡 0→0，答疑不再被截走。

同时实证通过：AES-GCM 密文 blob / 指纹漂移 / 连接测试 / Bearer + stream:true 契约 / SSE 打字机 / Markdown 加粗·`tok-*` 代码块·链接 / 无 `<script>` 注入 / 401 与 500 与网络不可达文案 / 空流 parse / `\r` 分隔 / 重试不重复追加用户气泡 / C1 角标 / C2 滚动锁 / 会话切换与新建。

### 7.4 实施中的额外发现与处理

1. **`pageTone('dashboard')` 文案含「学情摘要」四字**：B1 解耦 `isLearningPage()` 后首页 system 仍会命中该关键字，导致动态断言失败。已把档位文案改为「结合下方提供的学情信息」，真正注入的摘要只由 `contextBlock` 输出；`pageTone()` 的 switch 结构与 `PageKind` 类型均未改。
2. **`ensureMain` 惰性快照工厂**：第二参改为 `() => ContextSnapshot`，已有主会话时不再求值 `buildSnapshot()`，真正落实方案「打开不重组」。
3. **`historyIsVolatile()`**：新增导出，让 OPFS 不可用时（不只是 catch 兜底路径）也能给出内联提示；`tutorDir()` 成功时自动复位。
4. **配置探测不缓存结果**：`configProbe` 只复用「进行中」的 Promise、完成后清空，并新增 `refreshConfig()` 供设置页保存/清除后调用——避免「保存配置后 FAB 角标与抽屉能力仍读旧值」这一回归。
5. **`clearAll()` 先收集再删**：避免边遍历 `dir.entries()` 边 `removeEntry` 的异步迭代器不确定性。
6. **CDP 探针时序伪失败**：首轮 40 PASS / 11 FAIL，根因是抽屉 DOM 出现但 `loadConversation()` 异步未就绪导致 `send()` 被 early-return；修正探针（等会话就绪 / 确认用户气泡入流 / 等 mock 收到请求 / 只看最后一个 assistant 气泡）后 60/60 通过，**未改动任何产品代码来迁就探针**。

### 7.5 回写（闭环）

按速查表第 56 行「全新问题」规则，在 `browser-viewport.md` 新增 5 条（2 个 P0、学情文案关键字、意图正则、CDP 假阴性），`toolchain.md` 新增 3 条（元组数组类型推断、Python `compile()` 校验、lockfile specifier 缺失），并同步 `SKILL.md` 的速查表与 description 关键词。

### 7.6 仍未覆盖

- 真实 OpenAI 兼容端点 + 真实 key 下的长回答（>60s 整次超时）、多标签页配置同步、Safari/Firefox 的 OPFS `createWritable` 兼容性。
- 三姿态（答疑 / 追问 / 导航）的**实际模型输出质量**依赖真实模型，mock 无法验证。
- 动态探针不进 CI（依赖本机 Chrome + wrangler），需人工按需执行；命令见 `AGENTS.md` §2。
- 改动尚未提交（工作区包含 00028 未提交内容 + 00029 全部改动）。
