# 00012 · 踩坑知识库拆分 + 门禁范围对齐

> 2026-11-13 ｜ 由原 `overview.md`「踩坑知识库拆分」章节拆出 ｜ [索引](../README.md) ｜ [治理映射](migration.md)

## 目标

用户确认执行 [00011](../00011-skill-audit/overview.md) 建议的 1、2、4，并把踩坑记录**单独创建新 skill**，让 AI 遇到问题时自动按症状读取解决方案（而不是补在 course-builder 的 `pitfalls.md` 里）。

## 变更

- 新建项目级 skill `.workbuddy/skills/pitfall-resolver/`：`SKILL.md`（强触发 description + 症状速查表 + 追加规则 + 与 course-builder 的关系）+ 6 个 references（toolchain / nuxt-build / browser-viewport / course-content / git-hooks-editor / verification），均为「症状 → 根因 → 处理」表格。原 `course-builder/references/pitfalls.md` 全部条目迁出并扩充后**删除**。
- course-builder 同步：`SKILL.md` 资源列表与加载顺序指向新 skill、硬性规则 8 补现行门禁与 hooks；`workflow.md` 阶段 7 第 1 步改 `fmt:check` / `lint` / `typecheck`、第 2 步并列 `check-course.mjs` 与 `pnpm verify`、新增提交门禁段、阶段 3 验收命令改完整路径、交付清单加质量门禁行；两处脚本注释区分仓库内 / 复制到目标项目两种路径。
- **提交阻断修复**：`.oxlintrc.json` / `.oxfmtrc.json` 的 `ignorePatterns` 去掉 `.workbuddy/**`（oxfmt 另去掉 `content/**`、`public/**`），只保留不可追踪目录。lint-staged 官方文档确认「忽略应配置在任务工具本身」，故选择让工具侧纳入而非在 lint-staged 排除。`pnpm fmt` 格式化 3 个文件，skill 代码正式进入 lint / format 门禁。

## 验证

- `fmt:check` 34 文件全绿、`lint` 0e/19w（28 文件）、`typecheck` 0e/21w（28 文件）、`verify` 全绿、`build` 31.8s 成功、`check-course.mjs` 全绿。
- 临时索引暂存两个 skill 代码文件跑 `pre-commit`：oxfmt + oxlint 全绿并自动重新暂存、hash 未变；注入语法错误的探针后 oxfmt 报 `Expected ) but found EOF`、hook 退出 1 阻断，探针已删除。
- 真实索引 0、无 stash、无提交。

## 后续

新 skill 的触发条件随后泛化为「任何问题先加载、解决后回写」，见 [00013](../00013-skill-trigger-closure/overview.md)。
