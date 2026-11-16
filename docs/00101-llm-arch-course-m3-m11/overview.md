# 00101 · LLM 架构深度课 M3–M11 模块落地（剩余 85 课全量）

- 分支：`feat/llm-arch-course-outline`（承接 00098 大纲 / 00099 M1 / 00100 M2）
- 状态：**完成**（2026-11-16）—— M3–M11 共 85 课（全课 L27–L111）全量落地，全门禁绿：`verify-course`（111 课 / 111 概念 / 444 题，教师报表 111 行）✓ / `pnpm verify` 四段（体量闸门 464/464）✓ / M3–M11 87 文件 lint·typecheck 0e / `fmt:check` ✓ / `nuxt build` ✓。因 `index.ts` 聚合 111 课、85 文件原子生成，作为**一个内聚批次**提交（拆批会留下 index 引用未提交文件的中间态）。
- 落地形态：`app/data/llm-arch-course/lessons/l27-l111.ts`（一课一文件）；扩 `concepts.ts`（85 概念，stage 12–50）与 `lessons/index.ts`；脚手架（modules / stages 51 阶段 / design / meta / courses.ts）沿用 00099，不改。
- 内容源：00098 的 `drafts/m1-m7-volume-plan.md` + `m8-m11-volume-plan.md`（课数 / kind / 难度 / prereqs / concepts / 来源 / 正文目标），正文按官方 contentStats 口径实写，关键数字只认 A 级 S-* 来源。
- 日期：2026-11-16

## 1. 目标

把 00098 大纲的 M3–M11（85 课）落地到 `app/data`，与已落地的 M1（00099，L01–L14）、M2（00100，L15–L26）合成**完整 111 课**。M3–M7 讲「各家架构补 Transformer 哪个短板」（MoE / SSM+混合 / 扩散 / 横评选型 / DeepSeek 专讲）；M8–M11 讲「工程闭环」（预训练 / 微调 / 对齐 / 打包部署）。

## 2. 硬约束

1. **content-gate 体量阈值（00055 口径）**：theory 1200 词 / 400 码、framework 1500 / 1000、practice·scenario 1800 / 1500、capstone 3000 / 2500；只设下限不设上限。`contentStats.proseWords` = 汉字数 + 英文整词数，代码块整段剥离进 codeChars。
2. **课型自洽（00058）**：practice 课 goals 必含实现类动词（实现/写出/搭/跑通/接入/产出…）；标题含「实战」不能标 theory/overview；代码围栏 info-string 不含反引号。
3. **md 模板字符串安全**：草稿经 `gen-course.mjs` 生成时自动转义反引号与 `${`，**不手写 lNN.ts**（手写易出转义 SyntaxError，见 00099/00100 过程坑）。正文里 `\|` 只用在实际表格单元格，正文一律裸 `|`。
4. **verify-course 不变量**：难度 1–5 整数；stage / 概念 / 题目概念引用有效；prereqs 指向**更早**课时；DESIGN 绑定；complex 模式 Stage.module / Lesson.subStage 有效；每个概念至少被一道题覆盖（warning 级，仍尽量满足）。
5. **全课 111 课连续编号**：M1=L01–L14、M2=L15–L26（已落地）；本批 M3=L27–L37、M4=L38–L48、M5=L49–L54、M6=L55–L61、M7=L62–L71、M8=L72–L82、M9=L83–L95、M10=L96–L104、M11=L105–L111。`index.ts` 原注释为补缺口前的旧编号（M3=L27–L36 等），本批一并校正。
6. **prereqs 全局映射**：草稿的阶段内 id（如 M3-L01）统一映射为全课连续 id（L27）；跨模块引用换算后仍须指向更早课。**唯一冲突**：M7-L08（R1 推理链，L69）草稿 prereq 含 M10-L04（GRPO→L99，晚于 L69），违反「更早」约束——本批改为 `[L62]`（M7-L01），正文里以「与 M10 GRPO 呼应」文字说明，不写进 prereqs。

## 3. 分批计划

| 批次 | 模块 | 课 | 全局 id | stage | capstone |
|---|---|---|---|---|---|
| 3A | M3 MoE | 11 | L27–L37 | 12–16 | L34 |
| 3A | M4 SSM/混合 | 11 | L38–L48 | 17–20 | L44 |
| 3A | M5 扩散 LLM | 6 | L49–L54 | 21–23 | 无 |
| 3B | M6 横评选型 | 7 | L55–L61 | 24–28 | L59 |
| 3B | M7 DeepSeek | 10 | L62–L71 | 29–33 | L71 |
| 3B | M8 预训练 | 11 | L72–L82 | 34–36 | L82 |
| 3C | M9 微调 | 13 | L83–L95 | 37–41 | L95 |
| 3C | M10 对齐 | 9 | L96–L104 | 42–46 | L104 |
| 3C | M11 打包部署 | 7 | L105–L111 | 47–50 | L111 |

> 每批：草稿（frontmatter + md）→ `gen-course.mjs` 转 TS → 扩 `index.ts` → 探针双达标 → `verify-course` / `content-gate` / lint / typecheck / build 全绿 → 提交。

## 4. 验证方案

- `tmp/probe-all.mjs`（直接 import LLM_ARCH_COURSE，按 kind 阈值对 L27–L111 逐课比对 contentStats，输出精确缺口）——比 `content-gate --only` 精确（`--only` 会跨课程混入 effect/rxjs/skill 同号课）。
- `node --experimental-strip-types scripts/verify-course.mjs` → 教师报表应为 **111 行**、进度 100%、引用完整性全绿。
- `node --experimental-strip-types scripts/content-gate.mjs` → 体量闸门全达标（总课数 111）、课型自洽 0 错。
- `pnpm exec oxlint` / `oxlint --type-aware --type-check` / `oxfmt --check`（本课程文件）→ 0 error。
- `pnpm build` → Build complete。

## 5. 进度

- [x] spec.json（85 课元数据）+ concepts.ts 扩至 111 概念
- [x] 3A：M3/M4/M5（28 课，L27–L54）
- [x] 3B：M6/M7/M8（28 课，L55–L82）
- [x] 3C：M9/M10/M11（29 课，L83–L111）
- [x] 全量门禁回归 + docs 索引登记

## 6. 过程坑（待回写 pitfall-resolver）

1. **spec 元数据驱动 + 草稿生成器**：85 课元数据集中在 `spec.json`（由 `tmp/build-spec.mjs` 生成并自检 id 连续/prereq 更早/kind 合法），草稿骨架由 `tmp/gen-skeletons.mjs` 产出，作者只写正文 + quiz/terms/pitfalls；落地前用 `tmp/normalize-frontmatter.mjs` 以 spec 覆盖 frontmatter 元数据，杜绝标题/goals/prereqs 漂移（本批 85 份 0 处不符）。大批量课程务必走「spec 真源 → 草稿 → 机械生成 → 规范化」管线，不手写 lNN.ts。
2. **gen-course.mjs 会覆盖 index.ts**：生成器只把 drafts-dir 的课写进 index.ts（本批只有 L27–L111），会把 L01–L26 挤掉。修复：生成前备份 index.ts，生成后用 `tmp/build-index.mjs` 重建全部 111 课聚合 + 修正旧编号注释（原注释是补缺口前的 M3=L27–L36 旧口径）。
3. **概念 prereqs 字段不能省**：`verify-course.mjs:118` 直接 `c.prereqs.every(...)`，无 `prereqs` 字段会抛 TypeError。生成器对无前置概念漏写 `prereqs: []`（本批仅 `next-token` 命中），补空数组后全绿。
4. **prereq 前向引用**：M7-L08（R1，L69）草稿原 prereq 含 M10-L04（GRPO→L99，晚于 L69），违反「前置更早」。改为 `[L62]`，正文用「与 M10 GRPO（L99）呼应」文字交叉引用，不进 prereqs。
5. **容器失衡**：85 草稿中 L44 的 `:::deep` 未闭合就被 `:::tip` 覆盖，用 `tmp/check-containers-drafts.py`（栈 + 忽略代码围栏）定位第 269 行，补 `:::` 后 0 处问题。大批量写作后必须跑容器栈检查，不能只靠体量探针。
6. **oxfmt gen→fmt 两步**：gen-course 输出紧凑格式，`oxfmt --check` 会报 86 文件需格式化；跑 `oxfmt` 后体量不变（代码块剥离口径稳定），全绿。
