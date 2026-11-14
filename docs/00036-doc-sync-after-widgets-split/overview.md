# 00036 · 拆分后活文档口径同步（处理遗留）

> 任务类型：文档 / 注释事实校正（**零产品行为改动**）
> 日期：2026-11-14
> 前序：`00035-widgets-dir-split`（演练内核目录化）、`00034-a-group-warnings-and-kernel-review`、`00032-ts-esnext-and-warnings`

---

## 0. 历史声明（按「历史记录不可矫正」永久约定）

本次**不会改写、追加或标注任何已落盘任务记录**（`docs/NNNNN-*/` 全部文件，含 00032/00033/00034/00035），也不会修订 `AGENTS.md` / `docs/README.md` 任何既有行。以下内容一律只在**本新建任务记录**中声明，并给出正确口径：

| 被修复的旧内容 | 落盘位置 | 正确口径 |
|---|---|---|
| 「命令示例旧路径按『历史记录不可矫正』约定**不改原文**」这一**决策口径** | `00035` §0、§6 | 过度解读。用户约定的保护对象是 `docs/NNNNN-*/` 任务记录与 `AGENTS.md`/`docs/README.md` 已落盘的历史基线表述；**根 README、课程正文、代码注释、`.workbuddy/skills/` 下的活文档不属于任务记录**，应校正到当前事实。本次按用户「处理遗留」指示实施 |
| 00035 §6 登记的 4 类遗留（课程正文路径/数量、`course-widget.vue` 注释、命令示例旧路径、`analytics.ts` 目录化） | `00035` §6 | 前 3 类本次处理；`analytics.ts` 目录化仍按 00034 §6.3 决策不拆 |
| 00034 §0 声明会修复 `AGENTS.md` §3 的 warnings 统计口径，但当时未落地 | `00034` §0、`AGENTS.md` §3 | 本次**以追加新行**方式给出现行基线，不修订 §3 原有行 |
| `AGENTS.md` §2 的 `app/data/effect-course.ts app/lib/widgets.ts` 命令示例 | `AGENTS.md` §2 | 现行命令两参数都传**目录**：`… app/data/effect-course app/lib/widgets`（`load()` 自动补 `index.ts`） |
| 00032 / 00033 overview 中「去重 14 / 唯一 8」「各重复报 3 次」 | `00032` §2/§3/§7、`00033` §7 | oxlint `labels[0]` 是父作用域、`labels[-1]` 才是函数位置；**零重复，输出数即唯一数**。原文保持不动，正确口径见本文 §5 |
| 00035 之后课程正文与 README 中的 3100 / `node .output/server/index.mjs` / ES2022+ | `app/data/*/design.ts`、`README.md` | 生产预览是 `pnpm exec wrangler --cwd .output dev --port 3199`；00032 起 TS/Vite target=ESNext 且用了 ES2023 `toReversed`/`toSorted`，运行时基线应写 ES2023+ |

---

## 1. 目标

把 00027 目录化、00032 工具链升级、00035 `widgets` 拆分之后**残留在活文档里的事实失真**一次性校正，使 README、课程「教学设计说明书」页面、代码注释、skill 文档与仓库实际结构一致。

硬约束：

1. **不改任何产品行为**：只改 prose 文本、表格、注释、命令示例；不改函数体、不改课程题目/讲解/代码示例、不改校验逻辑。
2. **不碰任务记录**：见 §0；`AGENTS.md` 只允许**追加新行**（§11「新增规则只能追加新行」）。
3. **教学代码示例不改**：`app/data/*/lessons/l01.ts` 里 tsconfig 的 `"target": "ES2022"` 是 Effect 课程教学内容，不是站点构建基线，保持原样。
4. 校正后的所有命令都可复制直接跑，退出码 0。

---

## 2. 做 / 不做范围表

| # | 项 | 做 / 不做 | 理由 |
|---|---|---|---|
| 1 | `app/data/effect-course/design.ts:226/251`、`rxjs-course/design.ts:196/221` 的路径与「11 个演练内核」 | **做** | 00035 §6 明确登记的第 1 类遗留；页面会渲染给用户 |
| 2 | `app/components/course/course-widget.vue:5` 注释「11 个」 | **做** | 00035 §6 第 2 类遗留 |
| 3 | `AGENTS.md` §2 命令示例旧路径 | **做（追加新行）** | 既有行不可修订；追加「现行命令」行让维护者拿到可跑命令 |
| 4 | `course-builder` / `pitfall-resolver` 中 `[widgets.ts]` 命令示例与结论行 | **做** | 活文档，00035 §6 第 3 类遗留；照旧文档会踩 `ERR_MODULE_NOT_FOUND` |
| 5 | `README.md` 特性数字、目录结构表、架构段、开头课程数 | **做** | 同批变更引起的失真；`README.md` 是项目介绍，不是历史记录 |
| 6 | 课程正文的运行命令 3100 / `node .output/server/index.mjs` / ES2022+ | **做** | 与 `AGENTS.md` §2、00032 冲突，属同段事实校正 |
| 7 | `AGENTS.md` §3 warnings 基线 | **做（追加新行）** | 兑现 00034 §0 的声明，给出现行正确口径 |
| 8 | `AGENTS.md` §11 追加「活文档 vs 历史记录」边界 | **做（追加新行）** | 固化 §0 的判断依据，避免再次过度解读 |
| 9 | `docs/NNNNN-*/` 全部文件、`docs/README.md` 既有行 | **不做** | 用户永久约定：不可矫正 |
| 10 | `app/data/*/lessons/` 教学代码与题目 | **不做** | 课程内容，非站点文档 |
| 11 | `analytics.ts` 目录化 | **不做** | 00034 §6.3 决策「不建议现在做」，理由未变 |
| 12 | README 补写助学 Agent 介绍 / 技术栈细节 / 完整路由清单 | **不做** | 属「新增项目介绍内容」，不是校正失真；另起任务 |
| 13 | `.data/content/contents.sqlite`、`.workbuddy/memory/*.md` 历史日志 | **不做** | 前者是构建缓存自动重建；后者 append-only |

---

## 3. 变更计划

### 3.1 产品侧（6 个文件）

| 文件 | 变更 |
|---|---|
| `README.md` | 开头「当前上线一门课」→ 两门；特性两处「11 个」→「24 个（Effect 11 + RxJS 13）」；目录结构表 `app/data/effect-course.ts` → 两门 `*-course/` 目录、`app/lib/widgets.ts` → `app/lib/widgets/`（dom.ts + effect/ 11 + rxjs/ 13 + index.ts）；架构段「35KB 单模块」→ 目录化描述 |
| `app/components/course/course-widget.vue` | 注释「11 个」→「24 个，按 `app/lib/widgets/{effect,rxjs}/` 一演练一文件」 |
| `app/data/effect-course/design.ts` | 226/251 路径与数量；247 运行命令、255 ES 基线、263 冒烟 base 端口 |
| `app/data/rxjs-course/design.ts` | 196/221 路径；225 ES 基线 |

### 3.2 工具链 / 协作文档（6 个文件 + AGENTS.md 追加 3 行）

| 文件 | 变更 |
|---|---|
| `.workbuddy/skills/course-builder/SKILL.md` | 资源说明补「演练模块参数可传 `widgets/` 目录」 |
| `.workbuddy/skills/course-builder/references/workflow.md` | 阶段 3 命令 `[widgets.ts]` → `[widgets/]` |
| `.workbuddy/skills/course-builder/references/data-model.md` | 目录树 `widgets.ts` → `widgets/` 子目录结构 |
| `.workbuddy/skills/course-builder/scripts/check-course.mjs` | 顶部用法注释与 usage 字符串：参数名 `[widgets-dir]`，注明目录自动补 `index.ts`（**只改注释与提示文本，不改逻辑**） |
| `.workbuddy/skills/pitfall-resolver/references/course-content.md` | 命令示例、`app/lib/widgets.ts` 结论行改为 `app/lib/widgets` / `widgets/index.ts` |
| `.workbuddy/skills/pitfall-resolver/references/verification.md` | 两条命令的演练参数改目录 |
| `AGENTS.md` | §2 追加「现行命令」行；§3 追加「现行 warnings 基线」行；§11 追加「活文档边界」行。**既有行一字不动** |

### 3.3 踩坑库回写（闭环，见 §6）

`course-content.md` 新增一条「widgets 目录化后所有引用点」；`toolchain.md` 新增一条「项目级 skill 无法通过 Skill 工具加载」。

---

## 4. 验证方案

| 步骤 | 命令 | 通过线 |
|---|---|---|
| 格式 | `pnpm fmt` → `pnpm fmt:check` | exit 0 |
| 快速规则 | `pnpm lint` | 0 error / **3 warning**（与 00035 基线一致，不得新增） |
| 类型感知 | `pnpm typecheck` | 0 error / **5 warning**（同上） |
| 内容自检 | `pnpm verify` | exit 0；24 个 widget id 映射全通过 |
| 通用数据自检 | `node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/<topic>-course app/lib/widgets`（两门） | 两次 exit 0 |
| 构建 | `pnpm build` | exit 0 |
| 冒烟 | 起 `wrangler --cwd .output dev --port 3199` 后 `python scripts/smoke.py --base http://127.0.0.1:3199` | exit 0，18 路由 + 6 客户端 + 21 视口 |
| 页面文本抽查 | 对 `/courses/effect-ts/design`、`/courses/rxjs/design` 取 SSR HTML | 含 `app/lib/widgets/`、`24 个`；**不含** `app/lib/widgets.ts`、`11 个演练`、`ES2022+`、`3100` |
| 历史记录复核 | `git diff --name-only` + `git diff -- AGENTS.md docs/README.md` | 任务记录零改动；`AGENTS.md`/`docs/README.md` 只有新增行 |

跑完立即关闭 3199 临时服务（§10 收尾纪律）。

---

## 5. 现行口径（写在活文档里的数字）

- 演练：**24 个**，`app/lib/widgets/effect/` 11 + `app/lib/widgets/rxjs/` 13；`dom.ts` 9 个共享 helper；`index.ts` 是唯一导出面。
- 课程：两门，`app/data/effect-course/`、`app/data/rxjs-course/`，各 26 课。
- 通用数据自检第二参数：`app/lib/widgets`（目录），由 `load()` 自动补 `index.ts`；项目 `verify-course.mjs` 内部仍按 `app/lib/widgets/index.ts` 显式路径 import。
- 运行时基线：TS / Vite `target: ESNext`，用到 ES2023 `toReversed()` / `toSorted()`，浏览器需 ES2023+。
- warnings（00035 后）：`lint` 3 / `typecheck` 5，**零重复**（oxlint `labels[-1]` 为主标签）；构成为 `analytics.ts` 3 条函数作用域风格项 + `use-learning.ts` 2 条内核边界断言。
- 生产预览：`pnpm build` → `pnpm exec wrangler --cwd .output dev --port 3199`；**不再用** `node .output/server/index.mjs`。

---

## 6. 实施结果

### 6.1 变更文件（14 个，零产品行为改动）

| 类别 | 文件 | 改动 |
|---|---|---|
| 产品活文档 | `README.md` | 开头两门课、特性两处演练数 11 → 24（Effect 11 + RxJS 13）、目录结构表两门 `*-course/` + `widgets/`、`架构`段 2217 行 → 26 文件、路由清单补 `/courses/rxjs/...` 与 `/settings/llm` |
| 代码注释 | `app/components/course/course-widget.vue` | 11 个 → 24 个并说明目录布局 |
| 课程正文 | `app/data/effect-course/design.ts` | 5 处：226/251 路径与数量、247 运行命令、255 ES 基线、263 冒烟端口 |
| 课程正文 | `app/data/rxjs-course/design.ts` | 3 处：196/221 路径、225 ES 基线 |
| 协作约定 | `AGENTS.md` | **只追加 3 行**：§2 现行命令、§3 现行 warnings 基线、§11 活文档边界；既有行一字未改 |
| 索引 | `docs/README.md` | **只追加 00036 一行** |
| skill 文档 | `course-builder/SKILL.md`、`references/{workflow,data-model}.md`、`scripts/check-course.mjs` | 参数统一为目录；`check-course.mjs` 只改用法注释与 usage 提示文本，**未改任何校验逻辑** |
| 踩坑库 | `pitfall-resolver/SKILL.md`、`references/{course-content,verification,toolchain}.md` | 命令示例改目录参数；`toolchain.md:74` 失效路径更新；新增 2 条回写并补速查表关键词 |

`app/data/*/lessons/` 的教学代码与题目、`.data/` 缓存、`.workbuddy/memory/` 历史日志、`docs/NNNNN-*/` 全部任务记录均**未改动**。

### 6.2 门禁（全部 exit 0）

| 命令 | 结果 |
|---|---|
| `pnpm fmt` → `pnpm fmt:check` | 0 / 0，147 文件全绿 |
| `pnpm lint` | 0 error / **3 warning**（与 00035 基线一致，无新增） |
| `pnpm typecheck` | 0 error / **5 warning**（同上） |
| `pnpm verify` | 0；双课程全轨迹 + 助学 Agent 自检全通过 |
| `check-course.mjs app/data/effect-course app/lib/widgets` | 0；含演练映射 11 个 id 全有效 |
| `check-course.mjs app/data/rxjs-course app/lib/widgets` | 0；含演练映射 13 个 id 全有效 |
| `pnpm build` | 0，13.1s |
| `python scripts/smoke.py --base http://127.0.0.1:3199` | 0；18 路由 + 6 客户端渲染 + 21 视口全绿 |
| SSR 文本抽查（两门 `/design`） | PASS：含 `app/lib/widgets/`、`24 个演练`、`ES2023+`、`3199`；不含 `app/lib/widgets.ts`、`11 个演练内核`、`ES2022+`、`3100` |

两条目录参数命令已按活文档里的写法**原样复制执行**，证明示例可用。3199 临时服务已关闭。

### 6.3 约定复核

- `git status` / mtime 复核：`docs/00032-*/` ~ `00035-*/` 共 5 个文件的 mtime 为 17:27 / 17:40 / 18:11 / 19:57，**全部早于本次任务开始（20:02）**；本次唯一新建记录是 `docs/00036-*/overview.md`（20:06）。
- `git diff -- AGENTS.md` 中本次三处都是**纯 `+` 新增行**；相对 HEAD 的 `-`/`+` 成对差异来自 00033/00034 已落盘但未提交的改动，不是本次修订。
- HEAD 仍为 `1191467`，**未执行任何 git 写操作**（无 `add` / `commit` / `push`）。
- 踩坑库闭环已回写：`course-content.md` 新增「widgets 目录化后引用点」，`toolchain.md` 新增「Skill 工具找不到项目级 skill」「活文档 vs 历史记录边界」，`toolchain.md:74` 按「失效修正」更新并保留旧结论作提示，`SKILL.md` 速查表与 `description` 补关键词。

### 6.4 剩余遗留（本次按范围不做，需另起任务）

| 项 | 位置 | 说明 |
|---|---|---|
| 冒烟脚本自身的旧用法注释 / 默认 base | `scripts/smoke.py:2/4/156` | 仍写 3100 与 `node .output/server/index.mjs`；`AGENTS.md` §2 明确「脚本文件 `scripts/smoke.py` 保留不变」，实际调用一律显式传 `--base http://127.0.0.1:3199` |
| 课程注册表文案 | `app/data/courses.ts` 两门课 `description` | 仍写「6 阶段 24 课」，实际各 26 个 `lessons/lNN.ts`；属课程内容描述，本次未改，README 特性行已回避该数字 |
| README 介绍内容更新 | `README.md` 「多课程就绪」「纯前端」等行 | `EffectCourseData` 已改名 `CourseData`；未介绍助学 Agent / 完整路由清单 / 新依赖。属新增介绍内容，非本次「校正失真」范围 |
| `AGENTS.md` §2 旧命令示例、§3 旧 warnings 基线 | `AGENTS.md:51/61` | 按用户永久约定**保留原文**，现行口径已由本次追加的相邻行给出 |
| 历史日志中的旧路径 | `.workbuddy/memory/2026-11-13.md` 等 | append-only 日志，不改写 |
| `analytics.ts` 目录化 | `app/lib/analytics.ts` | 00034 §6.3 决策「不建议现在做」，理由未变 |
