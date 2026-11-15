# 00093 · AGENTS.md 结构性重排

## 目标

用户反馈 AGENTS.md「有点杂乱」。杂乱根源是 00034 起的「只能追加新行，不得修订已有行」维护方式：旧表述失效后不删，靠紧邻追加新行修正，形成「旧行 + 修正行」叠层。本次按用户指令对该文件做一次性结构性重排，改为**现行口径优先**的维护方式。

## 变更计划

只改 `AGENTS.md`（+ `docs/README.md` 追加索引行），不改任何代码：

1. **§2 命令速查**：删除速查块里重复/过期的 build + smoke 三行（与下方生产预览块重复）；删除已失效的 `check-course.mjs app/data/effect-course.ts app/lib/widgets.ts` 示例块（改为现行目录参数版）；合并散落的 4 条修正 bullet 为两小节（生产预览与冒烟 / 课程内容工具）。CI/CD 描述在 §2 与 §4 重复两次，收敛到 §3 一处。
2. **§3 质量门禁**：删除两代并存的 warnings 基线（旧「lint 10 / typecheck 12、唯一 8 条」与 00035 后「lint 3 / typecheck 5」），换为 00093 实测基线 **lint 5 / typecheck 10**（00092 移入 skill 的 `gen-course.mjs` 带来 1 条新 `consistent-function-scoping`；`migrate-blocks-to-md.mjs` 1 条为 00053 后既有）。
3. **§4 提交规范**：hook 表 `pre-commit` 单元格直接写现行命令 `pnpm exec lint-staged --max-arg-length=4000`，删除紧随其后的覆盖 bullet；4000 的由来保留为解释段。
4. **§11 任务记录组织**：把 00034「历史记录不可矫正」与 00036「活文档范围」的叠层修正合并为两条清晰现行规则；**修订 AGENTS.md 自身的维护约定**——不再要求「只能追加新行」，改为「修订/重排时新建任务记录登记被替换的旧表述」（本任务即首次执行）；`docs/README.md` 历史索引行仍不改写。
5. 其余章节（1 / 5 / 6 / 7 / 8 / 9 / 10）内容不变。

## 验证方案

- 重排前后逐条比对：现行规则零丢失（下表登记被替换表述，可追溯）。
- `pnpm fmt:check` / `pnpm lint` / `pnpm typecheck` 全过（AGENTS.md 为 md，oxfmt 不处理，但确认无误伤）。
- 00093 实测基线与 §3 描述一致（`pnpm exec oxlint` / `oxlint --type-aware --type-check` 的 warning 位置清单）。

## 被替换的旧表述登记（历史保全）

| 被替换内容 | 原位置 | 现行口径 |
|---|---|---|
| 速查块内重复的 `pnpm build` / `wrangler dev 3199` / `smoke.py` 三行 | §2 首块 | 收敛到「生产预览与冒烟」独立小节 |
| `check-course.mjs app/data/effect-course.ts app/lib/widgets.ts` 过期示例 | §2 | 目录参数版（`load()` 自动补 `index.ts`） |
| 「上方示例路径已失效，按约定不修订原文」修正 bullet | §2 | 示例本身已改为现行路径，修正语删除 |
| warnings 旧基线「lint 10 / typecheck 12，唯一 8 条，`svg()` warning」 | §3 | 00035 目录化后已消失；现行 5 / 10 |
| warnings 00035 基线「lint 3 / typecheck 5」 | §3 | 00092 移入 gen-course.mjs 后实测 5 / 10 |
| 「pre-commit 现行命令是 …--max-arg-length=4000（覆盖上表单元格）」bullet | §4 | 表格单元格直接写现行命令 |
| §2/§4 重复两次的 CI/CD 描述 | §2、§4 | 收敛到 §3 |
| §11「已失效的历史结论在原目录内标注『以 NNNNN 为准』」 | §11 | 已被 00034「历史记录不可矫正」废止，删除 |
| §11「本文档如需新增规则，只能追加新行，不得修订已有行」 | §11 | 00093 起改为「修订时新建任务记录登记旧表述」 |
| 00034/00036 叠层修正的行文 | §11 | 合并为两条现行规则，语义不变 |

## 注意事项

- 本次修订经用户明确指令授权（「整理 agents.md 文件」），是对 00034 追加式维护约定的首次豁免；豁免本身已写入 §11 成为新约定，后续重排照此办理。
- `docs/README.md` 的 00091 / 00092 索引行不动；00093 只追加新行。
