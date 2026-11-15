# 00092 · 通用课程草稿生成器（gen-course.mjs）

## 目标

把 00091 引入的 `scripts/gen-agent-harness-course.mjs`（内嵌 00091 课程专属路径）通用化为
`scripts/gen-course.mjs`，供后续任何「纯 Markdown 草稿 → 课时 TS」课程复用，避免每门课重写生成器、
重新踩模板串转义 / quiz 校验的坑。

## 变更计划

1. 新增 `scripts/gen-course.mjs`：与原脚本逻辑逐行等价（frontmatter 解析、goals/concepts/quiz/terms/pitfalls
   校验、`escapeTemplate` 转义、`lNN.ts` + `lessons/index.ts` 生成、`--check` 干跑），仅两处变化：
   - `DRAFTS` / `OUT` 改为 CLI 参数：`node --experimental-strip-types scripts/gen-course.mjs <drafts-dir> <out-dir> [--check]`
   - 文件头注释改为通用说明（草稿格式契约不变：`---` 包围 JSON frontmatter + markdown 正文）
2. 删除 `scripts/gen-agent-harness-course.mjs`。
3. `import { L, withKind } from '../../course-builders.ts'` 为相对 `lessons/` 目录的固定深度，任意
   `app/data/<course>/lessons/` 结构下均成立，不改。

## 口径声明（涉及旧记录）

- `docs/README.md` 00091 行中「`scripts/gen-agent-harness-course.mjs`」的路径表述以本目录为准：
  该脚本已删除，现行命令为 `scripts/gen-course.mjs <drafts-dir> <out-dir>`（00091 草稿仍可随时重生成）。

## 验证方案

1. 幂等性：用新脚本对 00091 草稿重新生成，`git diff app/data/agent-harness-course` 必须为空（证明逐行等价）。
2. 门禁：`pnpm fmt:check` → `pnpm lint` → `pnpm verify`（verify-course / content-gate 等）全部通过。
3. 边界：`--check` 干跑通过；错误参数（缺目录参数）给出明确报错。
