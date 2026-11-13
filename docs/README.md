# 任务记录索引

历史与变更记录按「**一次任务一个目录**」组织，编号 5 位递增。本文件是唯一入口；新任务请新建目录，**不要往已有目录或旧文件里追加**。

## 约定

- 目录名 `NNNNN-<task-name>`：编号 5 位 + kebab-case 任务名，例如 `00001-init`。
- 每个目录至少一份 `overview.md`（目标 / 变更 / 验证 / 注意事项）；涉及迁入、映射或工具链切换时另写 `migration.md`。
- 记录按任务发生时的状态写。后续结论变化时在**新目录**里说明，并在旧目录标注「以 NNNNN 为准」，不改写历史结论。
- 拆分前的累积文件（根目录 `overview.md`、`docs/migration.md`）已废弃，内容按任务迁入下列目录；引用请改用本索引或具体目录。
- 站点课程内容全部由 `app/data/*.ts` 驱动；仓库已移除 Nuxt Content 与 `content/` 目录，根 `docs/` 仅用于任务记录。

## 目录

| 编号 | 任务 | 日期 | 记录 |
|---|---|---|---|
| `00001-init` | 静态课程应用迁入 Nuxt 知识岛，站点初始化 | 2026-11-13 | [总览](00001-init/overview.md) · [迁移映射](00001-init/migration.md) |
| `00002-kebab-case-naming` | 全项目文件名统一 kebab-case | 2026-11-13 | [总览](00002-kebab-case-naming/overview.md) |
| `00003-course-builder-skill` | 沉淀 course-builder 项目级 skill | 2026-11-13 | [总览](00003-course-builder-skill/overview.md) |
| `00004-workspace-migration` | WorkBuddy 工作区内容整体迁入（后被 00005 收敛） | 2026-11-13 | [总览](00004-workspace-migration/overview.md) · [迁移映射](00004-workspace-migration/migration.md) |
| `00005-migration-scope-adjustment` | 按用户手动删除结果收敛迁入范围 | 2026-11-13 | [总览](00005-migration-scope-adjustment/overview.md) · [范围映射](00005-migration-scope-adjustment/migration.md) |
| `00006-unstage-all` | 取消所有暂存，索引置空 | 2026-11-13 | [总览](00006-unstage-all/overview.md) |
| `00007-oxc-toolchain-migration` | ESLint → oxlint + tsgolint + oxfmt | 2026-11-13 | [总览](00007-oxc-toolchain-migration/overview.md) · [迁移映射](00007-oxc-toolchain-migration/migration.md) |
| `00008-commit-hooks` | husky + commitlint + lint-staged | 2026-11-13 | [总览](00008-commit-hooks/overview.md) · [配置映射](00008-commit-hooks/migration.md) |
| `00009-dependency-version-ranges` | hooks 依赖改回 `^` 语义化范围 | 2026-11-13 | [总览](00009-dependency-version-ranges/overview.md) |
| `00010-vscode-file-nesting` | VSCode 文件嵌套：配置合并到 nuxt.config.ts | 2026-11-13 | [总览](00010-vscode-file-nesting/overview.md) |
| `00011-skill-audit` | 只读盘点 course-builder 的 check / lint 流程 | 2026-11-13 | [总览](00011-skill-audit/overview.md) |
| `00012-pitfall-skill-and-gates` | 踩坑知识库拆分为独立 skill + 门禁范围对齐 | 2026-11-13 | [总览](00012-pitfall-skill-and-gates/overview.md) · [治理映射](00012-pitfall-skill-and-gates/migration.md) |
| `00013-skill-trigger-closure` | skill 描述泛化：任何问题先查、解决后回写 | 2026-11-13 | [总览](00013-skill-trigger-closure/overview.md) · [口径调整](00013-skill-trigger-closure/migration.md) |
| `00014-readme-agents-split` | README 收敛为项目介绍，新增 AGENTS.md | 2026-11-13 | [总览](00014-readme-agents-split/overview.md) · [文档分工](00014-readme-agents-split/migration.md) |
| `00015-scripts-and-docs-reorg` | 清理无效 npm script + 任务记录目录化 | 2026-11-13 | [总览](00015-scripts-and-docs-reorg/overview.md) |
| `00016-git-commit-split` | 按任务主题把最终工作区拆分为多个提交 | 2026-11-13 | [总览](00016-git-commit-split/overview.md) |
| `00017-cloudflare-skills-and-module-cleanup` | 移除未使用的 Nuxt Content / image，安装 Cloudflare 官方部署 skill | 2026-11-13 | [总览](00017-cloudflare-skills-and-module-cleanup/overview.md) |
| `00018-course-design-as-data` | 教学设计说明书转成绑定课程的数据并渲染，skill 补这一步 | 2026-11-13 | [总览](00018-course-design-as-data/overview.md) |
