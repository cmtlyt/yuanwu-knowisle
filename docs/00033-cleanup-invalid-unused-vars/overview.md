# 00033 · 清理未使用变量中真正无效的内容

> **状态：已完成（2026-11-14）。** 先建本文件再动代码，遵循 `AGENTS.md` §11；§1–§6 保留计划阶段原文，最终结论以 §7 为准。
> 关联：00032（TS target 固化与 warnings 修订，产出 `unused-vars.md` 7 条统计表）。上一任务已提交为 `1191467` 之外的未提交工作区改动。

## 1. 目标

只清理 00032 `unused-vars.md` 统计出的 7 条 `no-unused-vars` 中**真正无效**的 6 条；**有效但暂时没用上的 1 条保留**，并明确接受它继续贡献 1 条 warning。不改变任何运行时行为、不触碰异常降级路径。

## 2. 分类依据（只读核查结论，2026-11-14 复核）

| # | 位置 | 分类 | 判定依据 |
|---:|---|---|---|
| 1 | `app/lib/analytics.ts:68` `catch (e)`（load / getItem） | **清理** | catch 体只做 `raw = null`，完全不读错误对象；参数绑定零信息量，属纯语法冗余 |
| 2 | `app/lib/analytics.ts:75` `catch (e)`（load / JSON.parse） | **清理** | catch 体只做 `parsed = null`，同上 |
| 3 | `app/lib/analytics.ts:96` `catch (e)`（save / setItem） | **清理** | `memoryFallback` 在 try 之前已赋值，catch 体只有注释，同上 |
| 4 | `app/lib/analytics.ts:106` `catch (e)`（reset / removeItem） | **清理** | catch 体只有 `/* noop */`，同上 |
| 5 | `app/lib/widgets.ts:114` 函数 `svg(parent, viewBox, content, cls)` | **保留** | 完整可用的通用 helper：创建带 `viewBox` 的 `<svg>` 容器并挂载。全仓仅定义、零调用，且未挂在 `W` 上、未导出；当前 20+ 处绘图各自内联拼 SVG 没复用它。不是残留也不是错误实现，属「有效但暂时没用上」的公共工具，保留供后续 widget 复用 |
| 6 | `app/lib/widgets.ts:423` `running = false`（MixedScheduler 多变量声明） | **清理** | 该 widget 最终靠 `budget` + `tick` 推进 fiber，`running` 从未被读；203–269 行的同名 `running` 是**另一个 widget 的独立变量**，有完整读写。此处为实现演进残留，无任何功能 |
| 7 | `app/lib/widgets.ts:1186` `const maxD = Math.max.apply(null, delays.concat([1]))` | **清理** | 绘图实际用 `acc / (total \|\| 1) * 560` 按**总和**归一化；`maxD` 全文件仅出现这一次，`concat` 无副作用，是改归一化方案后忘了删的残留计算 |

判定标准：**「实现是否完整且可复用」**。`svg()` 是可直接调用的完整实现，只是暂无调用点；其余 6 项要么是不承载信息的语法占位，要么是被最终实现抛弃的残留声明/计算，删掉不改变程序语义。

## 3. 变更计划

| 文件 | 动作 | 等价性保证 |
|---|---|---|
| `app/lib/analytics.ts` | 4 处 `catch (e)` → `catch {}`（ES2019 optional catch binding） | 不捕获错误对象、不新增逻辑；`raw`/`parsed`/`memoryFallback` 的降级路径逐字不变 |
| `app/lib/widgets.ts` | `let budget = 3, mode = 'async', events = [], running = false` → 去掉末项 `running = false`；删除 `const maxD = ...` 整行 | 两者均无读取点、无副作用；`budget` / `mode` / `events` / `delays` / `total` 全部保留并继续使用 |

**明确不动**：`svg()` 函数体、`app/data/**`、`app/types/**`、`app/lib/tutor/**`、`app/components/**`、CI workflow、`nuxt.config.ts`、依赖版本、`docs/00028–00032` 旧目录；未经指示不执行 `git add` / `git commit` / `git push`。

## 4. 验证方案

1. **静态复核**：`grep -nE "catch \(|\\brunning\\b|\\bmaxD\\b|\\bsvg\\b"` 确认只剩预期位置；`pnpm fmt:check` / `pnpm lint` / `pnpm typecheck` 0 errors。
2. **warnings 口径**：预期 `lint 16 → 10`、`typecheck 18 → 12`，消失的 6 条逐一对上 §3；唯一剩余 `no-unused-vars` 必须是 `widgets.ts:114 svg`，用 `oxlint -f json` 结构化核对，不能只看总数。
3. **内容门禁**：`pnpm verify`（课程两门 + 助学 Agent 纯计算自检，含 00031 语境约束断言）。
4. **构建与 SSR**：`pnpm build`（Workers 产物）→ `wrangler dev --port 3199` → `python scripts/smoke.py`（18 SSR + 6 客户端 + 22 视口）。`analytics.ts` 的 load/save/reset 与 `widgets.ts` 的 MixedScheduler、delays 绘图都会在 SSR / 客户端路径被实际执行。
5. **动态回归**：`python scripts/tutor-mock.py --port 3210` + `python scripts/tutor-probe.py`，63 PASS / 0 FAIL。
6. **收尾**：停 3199 / 3210、清临时资产；更新本文件 §7、`docs/README.md`、`AGENTS.md` §3 warnings 基线、踩坑库与工作记忆。

任一阶段失败先加载 `pitfall-resolver` 查速查表，修正后重跑全部阶段。

## 5. 通过线

`FMT=0 / LINT=0 / TC=0 / VERIFY=0 / BUILD=0 / SMOKE=0 / PROBE=63 PASS 0 FAIL`；且 `svg()` 仍在、`no-unused-vars` 恰好剩 1 条。

## 6. 不改动边界与风险

- 两个文件都是带 `@ts-nocheck` 的机械迁移演练内核，`catch {}` 是标准语法（TS target 已由 00032 固化为 ESNext），不存在降级/转译风险。
- 本次不做「为归零 warning 而删除可复用 helper」；用户明确要求保留该类内容，因此 warnings 不会归零，这是预期结果。
- 00032 的改动**尚未提交**，本任务在同一工作区上叠加；最终 `git status` 会同时包含两批改动，提交与否由用户另行指示。

## 7. 实施结果（2026-11-14）

### 7.1 实际改动（2 个文件，共 6 处）

| 文件 | 动作 | 结果 |
|---|---|---|
| `app/lib/analytics.ts` | 4 处 `catch (e)` → `catch {}` | `raw = null` / `parsed = null` / 内联注释的降级路径逐字不变；`widgets.ts:2208` 的 `catch (err)` 因读取 `err.message` **未动** |
| `app/lib/widgets.ts` | 多变量声明去掉 `running = false`；删除 `const maxD = ...` 整行 | `budget` / `mode` / `events` / `delays` / `total` 全部保留并继续使用 |
| `app/lib/widgets.ts:114` `svg()` | **保留**（未改一个字符） | 完整可复用 helper，按用户指令保留；它仍贡献唯一 1 条 `no-unused-vars` warning |

无新增文件、无删除文件；`app/data/**`、`app/types/**`、`app/lib/tutor/**`、`app/components/**`、CI workflow、`nuxt.config.ts`、依赖版本、`docs/00028–00032` 旧目录均未改动。

### 7.2 warnings 前后对比（结构化核对，非只看总数）

| 口径 | 00032 基线 | 本次 | 变化 |
|---|---:|---:|---|
| `pnpm lint` 输出 | 16 | **10** | −6 |
| `pnpm typecheck` 输出 | 18 | **12** | −6 |
| 按「规则+文件+行+列」去重唯一条目 | 14 | **8** | −6 |
| `eslint/no-unused-vars` | 7 | **1** | −6 |

用 `oxlint -f json` 逐条核对：消失的 6 条正好是 §3 清理范围；剩余 8 条唯一条目 = `consistent-function-scoping` 5 + `no-unsafe-type-assertion` 2（`use-learning.ts` 内核边界断言）+ `no-unused-vars` 1（`app/lib/widgets.ts:114 svg`）。输出数大于唯一数仍是 `consistent-function-scoping` 两处各重复报 3 次所致。

> **warnings 不归零是预期结果**：用户明确要求保留「有效但暂时没用上」的内容，因此 `svg()` 的 1 条 warning 是有意保留，不是漏修。

### 7.3 门禁数字（全部实测）

| 阶段 | 结果 |
|---|---|
| 快门禁 | `FMT=0` / `LINT=0`（10 warnings）/ `TC=0`（12 warnings） |
| 内容门禁 | `VERIFY=0`（课程两门 + 助学 Agent 纯计算自检，含 00031 语境约束断言） |
| 构建 | `BUILD_EXIT=0`，14.0s（`CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1`） |
| SSR / 视口 | `SMOKE_EXIT=0`，18 SSR + 6 客户端 + 22 视口无横向溢出（`analytics.ts` 的 load/save/reset 与 `widgets.ts` 的 MixedScheduler、delays 绘图在渲染路径被实际执行） |
| 动态回归 | `PROBE_EXIT=0`，**63 PASS / 0 FAIL**（含 OPFS 降级、清除全部对话、SSE 解析、意图路由） |

全程 0 error，无回退、无计划偏差；按 `pitfall-resolver` 约定，本次未遇到需排查的问题，但把「no-unused-vars 分类原则」作为已实测解法新增到 `references/toolchain.md`，避免后续 agent 顺手删掉 `svg()`。

### 7.4 收尾与状态

- 3199 / 3210 服务已停、端口释放；结构化核对用的临时 JSON 已删。
- `docs/README.md` 登记 00033；`AGENTS.md` §3 warnings 基线由 `16/18` 更新为 `10/12`（去重 8），并注明唯一剩余 `no-unused-vars` 是有意保留；踩坑库与工作记忆已回写。
- **未提交**：00032 与 00033 两批改动叠加在同一工作区，HEAD 仍是 `1191467`；未经指示未执行 `git add` / `git commit` / `git push`。
- **未覆盖**：`svg()` 仍无调用点，将来若新增 widget 应优先复用它而不是再内联拼 `<svg>`；若确认永远不用，需用户另行指示才能删除。真实 LLM 端点仍受 00030 的 CORS 预检限制，与本次改动无关。
