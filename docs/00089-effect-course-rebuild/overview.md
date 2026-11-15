# 00089 · Effect 深度课内容质量重构（26 课全量）

## 状态

**方案已获用户批准（2026-11-15「按建议执行，并自行推进所有课程重建」），实施中**。
分支 `feat/effect-course-rebuild`，基点 `main@b421813`。方案审批前课程内容零改动。

## 用户决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 体量阈值 | **沿用 `content-gate.mjs` 现有 6 档绝对下限**，不给 effect 单独降档，闸门阈值表不动 |
| 2 | 课型集合 | **只用 overview / theory / practice**，不硬套 framework / scenario / capstone |
| 3 | overview 名额 | 只给 L01 标 1 节（实施期复核后改为 **0 节**，见下方口径修正） |
| 4 | 推进节奏 | **6 批按阶段**（3 / 4 / 5 / 5 / 5 / 4 课），每批独立闭环；用户另行要求连续推进、中途不询问 |
| 5 | 提交边界 | 不擅自 commit / push / 合并，提交前先向用户确认 |

## 目标

把 `app/data/effect-course/` 的 26 课，从「概念介绍骨架」重构为 00052 定义的「理论 + 代码 + 经验」三元精品课；给每课标注正确 `Lesson.kind`，使这门课**首次纳入体量闸门**，最终 `baseline.effect` 豁免清零、全量闸门 168/168（agent 142 + effect 26）。

## 现状诊断（实测）

| 维度 | 实测 |
|---|---|
| 规模 | 26 课 / 6 阶段 / 27 概念 / 59 道题 / 25 课绑定 widget 演练（11 种） |
| 正文 | 104–425 字（中位约 160），代码 193–834 字符 |
| 结构 | 26 课全部 0 张表格、H2 为 0；2 callout + 2 代码块的同构骨架 |
| 门禁 | 未标 `Lesson.kind` → `content-gate` 整门跳过，当前零门禁 |
| 课型线索 | L12 / L17 标题含「实战」；24/26 课 goals 全是理解类动词 |
| 渲染模式 | `renderMode` 缺省 simple，`STAGES` 无 `module` 字段 |

## 硬边界（不做什么）

- 不改 26 个课时 id / 27 个概念 id / `prereqs` / 6 个 STAGES / 11 种 widget 绑定 / `courses.ts` 注册 / META 锁定的 `effect@4.1.4`。
- 不动渲染层、学情引擎、`lesson-time.ts`、`content-gate.mjs` 阈值表；不把 simple 改 complex、不加 MODULES、不重做 DESIGN。
- `quiz / terms / pitfalls` 可增强，但 `quiz[].concept` 必须沿用已注册概念 id。

## 变更计划

### Step 0 · 闸门接入（先做，关键）

一次性给 26 课加 `withKind(...)` 并把 `goals` 换成含实现类动词的版本，同时**必须**在 `scripts/content-gate-baseline.json` 写入 `"effect": ["L01"…"L26"]` 全量豁免。否则标注瞬间 26 课全部不达标，`pnpm verify` 立刻变红。这是 00057–00088 Agent Wave 1 用过的棘轮做法。

课型按「交付物是理解还是可运行物」逐课判定（00058 强制约束），复核结果 **12 theory + 14 practice + 0 overview**：

| 课型 | 课号 |
|---|---|
| theory (12) | L02 L03 L06 L08 L09 L14 L15 L16 L18 L19 L20 L24 |
| practice (14) | L01 L04 L05 L07 L10 L11 L12 L13 L17 L21 L22 L23 L25 L26 |

L12 / L17 标题含「实战」，按 H1 判为 practice；所有 practice 的 goals 均含实现 / 写出 / 搭 / 跑通 / 产出 等动词，满足 H2。

### Step 1 · 逐批重写

每课 `md` 给到「机制 / 为什么 / 边界 + 对比表 + ≥2 个独立 `:::deep` / `:::warn` + 递进可跑代码 + 真实踩坑 + 验收断言」；正文不擦线，余量 >50 字。Effect 代码示例一律沿用 META 锁定的 `effect@4.1.4` 写法，不自造 API、不混用旧版本 API。

### Step 2 · 每批闭环

`oxfmt` → `content-gate --only=LNN,... --verbose` **手看 raw 与余量**（gate 绿不等于达标，豁免名单里的课不报红）→ `--update-baseline` → `pnpm verify` / `lint` / `typecheck` → 渲染抽查（table / callout / code / leftover / fenceLeak）→ 双扫描（裸反引号 / 反斜杠转义）→ 回填批次记录 + `docs/README.md` 索引 + memory 日志。

### Step 3 · 收官

`baseline.effect` 清空、全量闸门 168/168、`pnpm build` + SSR 抽查、坑库回写、清理全部临时脚本与草稿。**不提交**，等用户明确指令。

## 实施期口径修正（本任务声明）

1. **L01 由 overview 改判 practice**：复核发现 L01 的交付物是「搭好最小工程 + 跑通第一次运行」，且现有正文已含 649 字符代码；按 00058「课型是身份、看交付物」的强制约束，标 overview（免实现代码）不成立。因此 effect 最终 **0 节 overview**，顺带彻底避开「simple 课程无 `module`、overview 护栏按 module 分组」的误判路径，闸门零改动。分布由方案的 1/11/14 调整为 0/12/14。
2. **纯 Markdown 草稿 → 生成 TS**：本次不再手写 TS 模板串。每课先写纯 `.md` 草稿，由一次性生成脚本统一做反引号 / 反斜杠 / `${` 转义并序列化 `quiz / terms / pitfalls`，再写出 `lNN.ts`。00057–00088 记录过的四类模板串转义坑（`\'` 被吞、正则里的 `\.` / `\(` / `\s`、`\[` 漏网、`\n` 变真换行）从根因上消除；抽查改为验证「生成结果 + 渲染结果」，不再靠人眼扫源码。临时脚本与草稿在收尾清理。

## 验证方案

| 检查 | 判据 |
|---|---|
| `content-gate --only=... --verbose` | 每课正文字数 / 代码字符数双达标，余量 >50 |
| `content-gate`（全量） | 168/168 达标、0 豁免 |
| `pnpm verify` / `lint` / `typecheck` | 四段全绿 / 0 error（沿用既有 warning 基线） |
| `renderMarkdown(md)` 抽查 | 含 `<table>`、`class="callout`、`class="code-block"`，无 leftover / fenceLeak |
| `check-course.mjs app/data/effect-course app/lib/widgets` | 引用完整性、widget 绑定仍可解析 |
| `pnpm build` + SSR 抽查 | 收官一次，核对 1–2 课正文与推导时长 |

## 注意事项

- Step 0 的「全量豁免」是让闸门接入不破坏 CI 的临时手段，不是放宽标准；每批重写后由 `--update-baseline` 自动收缩，收官必须清零。
- 正文变长会让 `lessonTime()` 推导时长上升，这是 00052 既有口径的预期结果，不改 `lesson-time.ts`。
- 历史任务记录（`docs/00057`–`00088`）一律不改写、不追加；本任务只在新建目录里说明口径变化。

## 实测（实施后回填）

<section id="result">

**状态：已完成（2026-11-15），未提交**。分支 `feat/effect-course-rebuild`，26 课全量重写完毕，`baseline.effect` 清零，全量闸门 168/168。

### 交付规模

| 项 | 结果 |
|---|---|
| 课时 | 26 课全部重写（6 阶段 S0–S5，分 6 批 3 / 4 / 5 / 5 / 5 / 4 课） |
| 课型 | **12 theory + 14 practice + 0 overview**（方案 1/11/14 的口径修正见上文） |
| 正文 | 合计 46,344 字，单课 1350–2189，均值 1782（原 104–425 字） |
| 代码 | 合计 49,358 字符，单课 1320–2740，均值 1898（原 193–834） |
| 结构 | 每课 4–8 张表格、2–3 个独立 callout、1–4 个递进代码块（原 0 表格 / 0 H2） |
| 改动 | 27 文件、`+5097 / −1584` 行 |

逐课实测（`contentStats(md)` 的 `proseWords` / `codeChars`，括号内为超出下限的余量）：

| 课 | kind | 正文 | 代码 | 课 | kind | 正文 | 代码 |
|---|---|---|---|---|---|---|---|
| L01 | practice | 2189 (+389) | 2278 (+778) | L14 | theory | 1479 (+279) | 1537 (+1137) |
| L02 | theory | 1869 (+669) | 1513 (+1113) | L15 | theory | 1350 (+150) | 2220 (+1820) |
| L03 | theory | 1689 (+489) | 1755 (+1355) | L16 | theory | 1433 (+233) | 1517 (+1117) |
| L04 | practice | 2176 (+376) | 1871 (+371) | L17 | practice | 1987 (+187) | 2467 (+967) |
| L05 | practice | 2073 (+273) | 2329 (+829) | L18 | theory | 1523 (+323) | 1507 (+1107) |
| L06 | theory | 1682 (+482) | 1411 (+1011) | L19 | theory | 1409 (+209) | 1433 (+1033) |
| L07 | practice | 2021 (+221) | 2136 (+636) | L20 | theory | 1547 (+347) | 1498 (+1098) |
| L08 | theory | 1357 (+157) | 1320 (+920) | L21 | practice | 1944 (+144) | 2740 (+1240) |
| L09 | theory | 1389 (+189) | 1637 (+1237) | L22 | practice | 1876 (+76) | 1964 (+464) |
| L10 | practice | 2036 (+236) | 2510 (+1010) | L23 | practice | 1976 (+176) | 1795 (+295) |
| L11 | practice | 1887 (+87) | 1666 (+166) | L24 | theory | 1465 (+265) | 1440 (+1040) |
| L12 | practice | 1928 (+128) | 2194 (+694) | L25 | practice | 2057 (+257) | 2637 (+1137) |
| L13 | practice | 2023 (+223) | 1594 (+94) | L26 | practice | 1979 (+179) | 2389 (+889) |

最小正文余量 L22 `+76` 字、最小代码余量 L13 `+94` 字符，全部 >50，无擦线；26 课渲染抽查 `leftover=0 / fenceLeak=0`。

### 闸门与回归（真实退出码）

| 命令 | 退出码 | 关键数字 |
|---|---|---|
| `pnpm fmt` | 0 | 308 文件 / 13ms |
| `content-gate --update-baseline` | 0 | 回写为 `{"agent":[],"effect":[]}` |
| `content-gate`（全量） | 0 | **168/168 达标、0 课豁免**、✅ 通过 |
| `pnpm verify` | 0 | 四段全绿；`contentStats` 边界 10 断言 + 真实课程抽样 194 课 + 容器内块级 5 断言 |
| `pnpm lint` | 0 | 4 warnings / **0 errors**（既有基线） |
| `pnpm typecheck` | 0 | 9 warnings / **0 errors**（既有基线） |
| `check-course.mjs app/data/effect-course app/lib/widgets` | 0 | 引用 / 答案索引 / DAG / 11 种 widget 映射 / DESIGN 全通过 |
| `pnpm build` | 0 | 55.3s，产出 `.output` + wrangler 配置 |

**SSR 抽查**（`pnpm exec wrangler --cwd .output dev --port 3199`，抽查后已关闭）：

| 路由 | HTTP | 表格 | callout | 代码块 | 推导时长 |
|---|---|---|---|---|---|
| `/courses/effect-ts/lessons/L01` | 200 | 4 | 2 | 4 | 34 min |
| `/courses/effect-ts/lessons/L26` | 200 | 7 | 3 | 2 | 30 min |

两课无残留围栏，标题为 h1 + 8 个 h3（正文 `##` 按站点层级下移一级，属既有渲染行为，非回归）。

### API 版本口径复核

站点 `node_modules` 未安装 `effect` 包，无法本地 import 核验，改从原课程正文 `tmp-effect-original/*.md` 提取已验证 API 白名单（85 个）。重构后正文出现 63 个，相对原课程的差异仅 `Exit.Exit<never, DbDown>`（L07）与 `Stream.Stream<number>`（L22）两处**类型别名**，不是自造函数。旧版 / 自造 API 复查均为 0 处：`catchAll`、`Effect.async`、`runSyncExit`、`Schedule.fixed(`。全课只沿用 `effect@4.1.4` 既有写法。

### 实施期修正记录

| 类别 | 修正 |
|---|---|
| 课型 | L01 由方案里的 overview 改判 practice（交付物是「搭最小工程 + 跑通第一次运行」，原正文已含 649 字符代码）；最终 0 节 overview，避开 simple 课程无 `module` 时 overview 按 module 分组的误判路径 |
| 生成方式 | 改用「纯 Markdown 草稿 → 一次性脚本统一转义并生成 TS」，从根因消除 00067 / 00074 / 00079 / 00085 记录的四类模板串转义坑；`quiz / terms / pitfalls / concepts` 由脚本从当前课时模块读出，不自造概念 id |
| 闸门接入 | Step 0 同步写 `baseline.effect` 全量豁免，6 批逐批 `--update-baseline` 收缩（`26 → 4 → 0`），收官清零 |
| API 自造 | L04 `Effect.async` → `Effect.acquireRelease` + `Effect.sync`；L07 `runSyncExit` → `Effect.runPromiseExit`；L10 `Effect.retry(call,{times,while,schedule})` → `Schedule.compose(Schedule.recurs(3), Schedule.exponential("100 millis"))`；L24 `Schedule.fixed("1 second",5)` 具体签名改为注释说明；全课 `catchAll` → `Effect.catch` |
| 代码块自包含 | L23 `range()` cursor 每批重置导致重复生产 → 持久化 `source`；L21 成功路径子任务未标 done → `runAll` 补状态；L18 `:t1` → `t1`；L25 `unsafeTransfer` 快照签名不真实且缺冲突检测 → 接收 a0 / c0 两快照并补 `conflicted` 断言；L26 `assertLocked` 检查顺序把 `latest` 误报成版本未锁定 → 浮动版本检查前置 |
| 补写未生效 | L17 草稿补段后 TS 未重新 apply，余量仍 +26；最后一次统一 `apply L17 L23 L25 L26` 后到 +187。**补草稿必须重新生成** |
| 同名课号 | `--only=L01` 会同时打印 agent L01 与 effect L01 两行，收官以全量 `content-gate` 与自建检查器分辨，不靠单行输出下结论 |

### 注意事项（收官后）

- 累计改动**未提交**，按方案等用户明确指令；不擅自 commit / push / 合并。
- `rxjs` 仍未标 `Lesson.kind`，体量闸门按既有规则跳过；本次未触碰。
- 正文变长使 `lessonTime()` 推导时长上升（L01 34 min / L26 30 min），是 00052 既有口径的预期结果，未改 `lesson-time.ts`。
- 历史任务记录 `docs/00057`–`00088` 一律未改写、未追加、未标注。
- 一次性生成器 `tmp-effect-build.mjs`、草稿 `tmp-effect-content/`、原稿备份 `tmp-effect-original/` 已在收尾清理，不入库。

</section>
