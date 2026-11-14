# 00032 · 未使用变量统计（本次按要求**不修复**）

> 数据来源：`pnpm exec oxlint --type-aware --type-check -f json`，规则 `eslint/no-unused-vars`，共 **7 条**。
> 行号为 00032 修订后的当前行号。成因结论均已用 `grep` / 上下文代码核实，不是推测。

| # | 位置 | 未使用项 | 它本来的功能 | 为什么会出现（成因） | 若以后要修 |
|---:|---|---|---|---|---|
| 1 | `app/lib/analytics.ts:68` | `catch (e)`（`load()`） | 捕获 `storage.getItem(KEY)` 抛错（隐私模式 / localStorage 被禁），把 `raw` 置 `null`，走 `memoryFallback` 内存兜底 | 机械迁移的 `@ts-nocheck` 内核保留 ES5 风格 `catch (e)`；这里只需要「吞掉异常并降级」，不读错误对象。ES2019 起支持 optional catch binding，迁移时未顺手改 | `catch (e)` → `catch {}`，零行为变化 |
| 2 | `app/lib/analytics.ts:75` | `catch (e)`（`load()`） | 捕获 `JSON.parse(raw)` 失败（学情档案损坏），`parsed = null` → 返回 `defaultState()` | 同上 | `catch {}` |
| 3 | `app/lib/analytics.ts:96` | `catch (e)`（`save()`） | 捕获 `storage.setItem` 抛错，注释已写明「隐私模式下退化为内存态」；`memoryFallback = state` 在 try 之前已赋值，catch 体什么都不用做 | 同上 | `catch {}` |
| 4 | `app/lib/analytics.ts:106` | `catch (e)`（`reset()`） | 捕获 `storage.removeItem` 抛错，注释 `/* noop */`；随后 `save(s)` 重新写入默认态 | 同上 | `catch {}` |
| 5 | `app/lib/widgets.ts:114` | 函数 `svg(parent, viewBox, content, cls)` | 通用绘图 helper：创建带内嵌 `<svg viewBox>` 的 `div.w-svg` 容器、挂到 parent 并返回节点 | **全文件仅定义、零调用**（`grep -nE '\bsvg\('` 只命中定义行）。从旧项目机械迁移时一并带进来的工具函数，后续 widget 改用 `div` / `line` 字符串拼接绘图后失去用途 → 真死代码 | 删除整个函数（约 7 行） |
| 6 | `app/lib/widgets.ts:423` | `running = false`（MixedScheduler 演练内） | 声明「调度是否在运行」的状态标志，与 `budget` / `mode` / `events` 一起在多变量 `let` 中初始化 | 同名 `running` 在**另一个 widget**（约 203–269 行）被完整使用（`if (running) return`、`running = true`、结束置 `false`）；MixedScheduler 这份是独立声明，最终实现改用 `budget` + `tick` 推进 fiber，没接上这个标志 → 实现演进后的残留 | 从多变量声明里去掉 `running = false` 一项 |
| 7 | `app/lib/widgets.ts:1186` | `const maxD = Math.max.apply(null, delays.concat([1]))` | 计算本轮 `delays` 的最大值，原本用于按最大延迟归一化泳道宽度 | 全文件仅此一处出现（`grep -nE '\bmaxD\b'` 只命中定义行）；后续绘图实际用 `20 + (acc / (total \|\| 1)) * 560` 按**总和**归一化，改成总和方案后忘了删 → 计算方案变更后的残留计算（纯函数、无副作用） | 删除该行 |

## 归类

| 成因类别 | 条数 | 位置 |
|---|---:|---|
| 降级链里的冗余 catch 参数（迁移风格残留） | 4 | `analytics.ts:68/75/96/106` |
| 通用 helper 失去调用方（死代码） | 1 | `widgets.ts:114` |
| 实现方案演进后未清理的状态 / 计算残留 | 2 | `widgets.ts:423`、`widgets.ts:1186` |

7 条全部位于两个带 `@ts-nocheck` 的**机械迁移内核**（`analytics.ts` 学情引擎、`widgets.ts` 演练内核），没有一条在 00028/00031 新增的 tutor 代码里。这也解释了为什么它们能长期共存：内核不做类型检查，只有 oxlint 的 `no-unused-vars` 以 warning 形式提示，而门禁通过线是 0 errors。

**本次不修的理由**：用户明确要求「变量未使用的先不修复」；且第 1–4 条修法（`catch {}`）虽零风险，但会一次性改动 4 处降级链，需要在同一轮里额外跑学情导入/导出回归，超出本任务范围。
