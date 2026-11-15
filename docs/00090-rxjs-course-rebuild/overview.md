# 00090 · RxJS 深度课内容质量重构（26 课全量）

## 状态

**方案已获用户批准（2026-11-15「全部重建」），实施中**。
分支 `feat/rxjs-course-rebuild`，基点 `main@8230fbe`（00089 Effect 重构已合并）。方案审批前只做只读诊断与拉分支，课程内容零改动、未提交。

## 用户决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 体量阈值 | **沿用 `content-gate.mjs` 现有 6 档绝对下限**，不给 rxjs 单独降档，闸门阈值表不动 |
| 2 | 课型集合 | **只用 theory / practice**，不硬套 framework / scenario / capstone |
| 3 | overview 名额 | **0 节**：无纯导览课（L01 是动机 + 源全景、L11 是决策树，都交付理解）；且 simple 课程 `STAGES` 无 `module`，多节 overview 会全挤进 `undefined` 组触发 `perModule:1` 护栏误判。00089 Effect 已验证 0 节可行 |
| 4 | 推进节奏 | **6 批按阶段**（3 / 4 / 5 / 4 / 5 / 5 课），用户要求连续推进、中途不询问 |
| 5 | 提交边界 | 不擅自 commit / push / 合并，收官后等用户明确指令 |

## 目标

把 `app/data/rxjs-course/` 的 26 课，从「概念介绍骨架」重构为 00052 定义的「理论 + 代码 + 经验」三元精品课；给每课标注正确 `Lesson.kind`，使这门课**首次纳入体量闸门**，最终 `baseline.rxjs` 豁免清零、全量闸门 **194/194**（agent 142 + effect 26 + rxjs 26）。

## 现状诊断（实测）

| 维度 | 实测 |
|---|---|
| 规模 | 26 课 / 6 阶段 / 28 概念 / 69 道题 / **26 课全绑定 widget（13 种）** |
| 正文 | **58–288 字**（中位约 125），代码 **164–408 字符** |
| 结构 | 26 课全部 **0 张表格**、每课 1 callout + 1 代码块、headings 1–3 的同构骨架 |
| 门禁 | 26 课 `Lesson.kind` 全空 → `content-gate` 整门跳过；当前 168/168 只覆盖 agent + effect |
| 渲染模式 | `renderMode` 缺省 simple，`STAGES` 无 `module` 字段；`DESIGN` 有 |
| 版本 | `META.version = rxjs@7.8.2`；原文 41 处 import / **59 个已验证 API 名** |
| 课型线索 | **L21 标题含「实战」**（H1 强制 practice）；26 课 goals 几乎全是理解类动词，仅 L05 含「写出」 |

缺口量级：相对 `theory 1200 字 / 400 字符`、`practice 1800 字 / 1500 字符`，正文约需 **10 倍**、代码约 **4–9 倍**。

## 硬边界（不做什么）

- 不改 26 个课时 id / 28 个概念 id（`c-` 前缀）/ `prereqs` / 6 个 STAGES / 13 种 widget 绑定 / `courses.ts` 注册 / META 锁定的 `rxjs@7.8.2` / DESIGN。
- 不动渲染层、学情引擎、`lesson-time.ts`、`content-gate.mjs` 阈值表；不把 simple 改 complex、不加 MODULES。
- `quiz / terms / pitfalls` 可增强，但 `quiz[].concept` 必须沿用已注册概念 id。

## 变更计划

### Step 0 · 闸门接入（先做，关键）

一次性给 26 课加 `withKind(...)` 并把 `goals` 换成含实现类动词的版本，同时**必须**在 `scripts/content-gate-baseline.json` 写入 `"rxjs": ["L01"…"L26"]` 全量豁免。否则标注瞬间 26 课全部不达标、`pnpm verify` 立刻变红。预期此时 `verify` 仍为 0、闸门显示 168/168 + 26 课豁免。

课型按「交付物是理解还是可运行物」逐课判定（00058 强制约束），**12 theory + 14 practice + 0 overview**：

| 课型 | 课号 |
|---|---|
| theory (12) | L01 L02 L03 L08 L09 L10 L11 L13 L15 L18 L22 L23 |
| practice (14) | L04 L05 L06 L07 L12 L14 L16 L17 L19 L20 L21 L24 L25 L26 |

L21 标题含「实战」，按 H1 判 practice；所有 practice 的 goals 均含实现 / 写出 / 搭 / 跑通 / 产出 等动词，满足 H2。实施期按 00058 逐课复核，口径修正写进本任务记录，不改历史记录。

### Step 1 · 逐批重写

沿用 00089 已验证的「**纯 Markdown 草稿 → 一次性生成脚本**」：草稿写 `.md`，脚本统一转义反斜杠 / 反引号 / `${` 并序列化 `quiz / terms / pitfalls`，结构化字段从当前课时模块读出（避免自造 `c-` 概念 id），再生成 `lNN.ts`。四类模板串转义坑从根因消除。**补写草稿后必须重新 apply**。

### Step 2 · 每批闭环

`oxfmt` → `content-gate --only=... --verbose` **手看 raw 与余量**（豁免名单里 gate 不报红）→ `--update-baseline` → `pnpm verify` / `lint` / `typecheck` → 渲染抽查（table / callout / code / leftover / fenceLeak）→ 回填批次记录 + `docs/README.md` 索引 + memory 日志。

### Step 3 · 收官

`baseline.rxjs` 清零、194/194、`pnpm build` + SSR 抽查（slug `rxjs`）、坑库回写、清理全部临时脚本与草稿。**不提交**，等用户明确指令。

**每课交付标准**：事故 / 问题开场、唯一问题表、机制对照表、真实 7.8.2 写法、自包含最小模型 + 可失败断言、≥2 个独立 `:::deep` / `:::warn`、≥1 表格、≥1 可运行代码块、真实踩坑、验收清单、与相邻课分工 / 接缝表；余量 >50 字，不擦线。

## 相对 Effect 的新增风险

1. **时序语义是最大正确性风险**：marble、有界并发、背压、`share` refCount、Subject 重放——代码块必须自包含且状态迁移闭合（00089 曾踩 cursor 每批重置、成功路径未标 done、快照签名凭空造等坑）。
2. **26 课全绑定 widget**：正文重写后须与 13 种演练对齐，避免「正文讲的和演练演的不是一回事」。
3. **原文白名单含 7.x 遗留**：`empty()` / `never()` 与 `EMPTY` / `NEVER` 并存、`retryWhen` 已弃用。重写按 META notes + DESIGN「已核对的 7.x 事实」校准；只沿用已验证形状，不混 9.0-beta 写法（统一从 `rxjs` 导入、废弃 `rxjs/operators`、Subscription 改类）。
4. **跨课程同名课号**：`--only=L01` 会同时打印 agent / effect / rxjs 三行，收官用全量 gate + 自建逐课检查器分辨。
5. **正文变长使 `lessonTime()` 推导时长上升**属 00052 既有口径的预期结果，不改 `lesson-time.ts`。

## 验证方案

| 检查 | 判据 |
|---|---|
| `content-gate --only=... --verbose` | 每课正文 / 代码双达标，余量 >50 |
| `content-gate`（全量） | **194/194 达标、0 豁免** |
| `pnpm verify` / `lint` / `typecheck` | 四段全绿 / 0 error（沿用 4w / 9w 基线） |
| `renderMarkdown(md)` 抽查 | 含 `<table>` / `class="callout` / `class="code-block"`，无 leftover / fenceLeak |
| `check-course.mjs app/data/rxjs-course app/lib/widgets` | 引用完整性、13 种 widget 绑定仍可解析 |
| `pnpm build` + SSR 抽查 | 收官一次，核对 1–2 课正文与推导时长 |

## 注意事项

- Step 0 的「全量豁免」是让闸门接入不破坏 CI 的临时手段，不是放宽标准；每批重写后由 `--update-baseline` 自动收缩，收官必须清零。
- 站点 `node_modules` 未安装 `rxjs` 包，API 一律沿用原文白名单，不凭记忆写签名。
- 历史任务记录（`docs/00057`–`00089`）一律不改写、不追加、不标注；本任务只在新建目录里说明口径变化。

## 实测（实施后回填）

<section id="result">

**状态：已完成（2026-11-15），未提交**。分支 `feat/rxjs-course-rebuild`，26 课全量重写完毕，`baseline.rxjs` 清零，全量闸门 **194/194、0 豁免**（agent 142 + effect 26 + rxjs 26）。

### 交付规模

| 项 | 结果 |
|---|---|
| 课时 | 26 课全部重写（6 阶段 S0–S5，分 6 批 3 / 4 / 5 / 4 / 5 / 5 课） |
| 课型 | **12 theory + 14 practice + 0 overview**（方案初判与实施一致，L21 标题含「实战」按 H1 判 practice） |
| 正文 | 合计 **51,569 字**，单课 1656–2223，均值 1983（原 58–288 字） |
| 代码 | 合计 **68,699 字符**，单课 1578–3495，均值 2642（原 164–408 字符） |
| 结构 | 每课 6–8 张表格、2–3 个独立 callout、2 个递进代码块（原 0 表格 / 1 callout / 1 代码块） |
| 改动 | 课程侧 27 个已追踪文件 `+6294 / −1571` 行（26 个课时 ts + `content-gate-baseline.json`，清理临时产物前 `git diff --shortstat` 实测），另新建 `docs/00090-rxjs-course-rebuild/overview.md`；收尾再更新 `docs/README.md` 索引与项目级坑库 2 个文件 |

逐课实测（`contentStats(md)` 的 `proseWords` / `codeChars`，括号内为超出下限的余量）：

| 课 | kind | 正文 | 代码 | 课 | kind | 正文 | 代码 |
|---|---|---|---|---|---|---|---|
| L01 | theory | 2204 (+1004) | 1578 (+1178) | L14 | practice | 2061 (+261) | 3125 (+1625) |
| L02 | theory | 1919 (+719) | 1886 (+1486) | L15 | theory | 1896 (+696) | 2704 (+2304) |
| L03 | theory | 1796 (+596) | 2068 (+1668) | L16 | practice | 2043 (+243) | 3356 (+1856) |
| L04 | practice | 2127 (+327) | 3246 (+1746) | L17 | practice | 2223 (+423) | 2973 (+1473) |
| L05 | practice | 2141 (+341) | 2339 (+839) | L18 | theory | 1707 (+507) | 2523 (+2123) |
| L06 | practice | 1988 (+188) | 3266 (+1766) | L19 | practice | 2032 (+232) | 2919 (+1419) |
| L07 | practice | 2040 (+240) | 2517 (+1017) | L20 | practice | 1902 (+102) | 3495 (+1995) |
| L08 | theory | 2053 (+853) | 2251 (+1851) | L21 | practice | 2178 (+378) | 3279 (+1779) |
| L09 | theory | 1711 (+511) | 1962 (+1562) | L22 | theory | 1773 (+573) | 1882 (+1482) |
| L10 | theory | 1854 (+654) | 2337 (+1937) | L23 | theory | 1914 (+714) | 2566 (+2166) |
| L11 | theory | 1981 (+781) | 2125 (+1725) | L24 | practice | 2158 (+358) | 2785 (+1285) |
| L12 | practice | 2112 (+312) | 2858 (+1358) | L25 | practice | 1930 (+130) | 3230 (+1730) |
| L13 | theory | 1656 (+456) | 2738 (+2338) | L26 | practice | 2170 (+370) | 2691 (+1191) |

最小正文余量 L20 `+102` 字、最小代码余量 L05 `+839` 字符，全部 >50，无擦线；26 课渲染抽查 `leftover=0 / fenceLeak=0`。

### 闸门与回归（真实退出码）

| 命令 | 退出码 | 关键数字 |
|---|---|---|
| `pnpm fmt` / `fmt:check` | 0 | 308 文件格式一致 |
| `content-gate --update-baseline` | 0 | 回写为 `{"agent":[],"effect":[],"rxjs":[]}` |
| `content-gate`（全量） | 0 | **194/194 达标、0 课豁免** |
| `pnpm verify` | 0 | 四段全绿；contentStats 口径 / 容器渲染 / 真实课程抽样全通过 |
| `pnpm lint` | 0 | 4 warnings / **0 errors**（既有基线） |
| `pnpm typecheck` | 0 | 9 warnings / **0 errors**（既有基线） |
| `check-course.mjs app/data/rxjs-course app/lib/widgets` | 0 | 引用 / 答案索引 / DAG / **13 种 widget** / DESIGN 全通过 |
| `pnpm build` | 0 | 14.2s，产出 `.output` + wrangler 配置 |

**SSR 抽查**（`pnpm exec wrangler --cwd .output dev --port 3199`，抽查后已关闭、端口无监听）：

| 路由 | HTTP | 表格 | callout | 代码块 | 推导时长 |
|---|---|---|---|---|---|
| `/courses/rxjs/lessons/L01` | 200 | 7 | 2 | 2 | 29 min |
| `/courses/rxjs/lessons/L26` | 200 | 8 | 3 | 2 | 36 min |

两课无残留围栏、无残留转义反引号，标题为 h1 + h3（正文 `##` 按站点层级下移一级，属既有渲染行为，非回归）。

### API 版本口径复核

站点 `node_modules` 未安装 `rxjs` 包，沿用 00089 的「原文白名单」做法：从 `tmp-rxjs-original/*.md` 的 import 语句提取已验证 API 名（59 个），并按来源分组复核。重构后相对原文仅新增 3 个操作符：

| 新增名 | 归属 | 判定 |
|---|---|---|
| `subscribeOn` | `rxjs/operators` | 7.8.2 标准操作符，原文「三种常见调度器」示例里用过但 import 未列全；本次显式补 import |
| `observeOn` | `rxjs/operators` | 同上，原文「subscribeOn vs observeOn」段落用过 |
| `withLatestFrom` | `rxjs/operators` | 同上，原文「四种组合」示例里用过 |

三者都不是自造 API，也不是 9.0-beta 写法。旧版 / 弃用写法的代码块调用为 **0 处**：`retryWhen(`、`catchAll`、`multicast(` 全课 0 命中；`empty()` / `never()` / `publish().refCount()` / `share({ refCount })` 仅作为「6.x 遗留写法」出现在正文历史对照表与 callout 中；扫描到的 `flatMap(` 是 L08 代码块里 JS 数组的 `Array.prototype.flatMap`，与 RxJS 操作符无关。

正文统一按 DESIGN 的 7.x 导入约定：`rxjs`（创建 / 组合 / 类 / 常量）、`rxjs/operators`（单参数操作符）、`rxjs/testing`（`TestScheduler`），不混 9.0-beta 的「统一从 rxjs 导入、废弃 rxjs/operators」。

### 实施期修正记录

| 类别 | 修正 |
|---|---|
| 生成方式 | 沿用 00089 的「纯 Markdown 草稿 → 一次性脚本统一转义并生成 TS」；`quiz / terms / pitfalls / concepts / prereqs / widget` 由脚本从当前课时模块读出，不自造 `c-` 概念 id。四类模板串转义坑零复发 |
| 闸门接入 | Step 0 同步写 `baseline.rxjs` 全量豁免，6 批逐批收缩 `26 → 23 → 19 → 14 → 10 → 5 → 0`，收官清零 |
| 版本口径 | `retryWhen` 弃用 → `retry({ count, delay })`；`throwIfEmpty("...")` → error 工厂函数；`EMPTY()` / `NEVER()` → 常量；`publish` / `multicast` / `share({ refCount })` 标为 6.x 历史对照，代码块只用 `share()` / `shareReplay({ bufferSize, refCount })`；`TestScheduler` 构造改深度相等断言函数、`run()` 按字符计帧 |
| 补写未生效 | 批次 2 四课、批次 5 的 L17 / L21、批次 6 的 L24 / L26 初稿正文不足或擦线；一律补「逐值推演表 / 评审清单 / 落地顺序」等实质节，**补草稿后重新 `apply`** 才生效 |
| 代码块自包含 | L06 把「逐个值调用 take」明确写成负例；L07 简化 `batchBy` 并加展平断言；L08 `flatten` 的 merge 分支改为真正交错交付；L17 `MiniSubject` 补齐 complete 通知；L21 去掉未消费的 `destroy$` 与多余的 `startWith`；L23 修正 `fixedWindowDebounce` 的错误期望值；L25 加 cursor 重置负例与展平不变量；L26 marble 解析器支持同帧分组并写负例 |
| 同名课号 | 三门课都用 `LNN` 编号，`--only=L01` 会打印三行；生成器 `check` 直接读 rxjs 单门模块，收官以全量 `content-gate` 判达标 |

### 注意事项（收官后）

- 累计改动**未提交**，按方案等用户明确指令；不擅自 commit / push / 合并 / 删分支。
- 三门课（agent 142 / effect 26 / rxjs 26）现全部纳入 `content-gate`，全局 **194/194、0 豁免**，baseline 三个数组均为空。
- 正文变长使 `lessonTime()` 推导时长上升（L01 29 min / L26 36 min），是 00052 既有口径的预期结果，未改 `lesson-time.ts`。
- 历史任务记录 `docs/00057`–`00089` 一律未改写、未追加、未标注；`docs/00089` 索引行里的「未提交」等表述按「历史记录不可矫正」约定保持原样。
- 一次性生成器 `tmp-rxjs-build.mjs`、草稿 `tmp-rxjs-content/`、原稿备份 `tmp-rxjs-original/` 已在收尾清理，不入库。

</section>
