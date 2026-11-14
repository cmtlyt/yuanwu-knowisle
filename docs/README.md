# 任务记录索引

历史与变更记录按「**一次任务一个目录**」组织，编号 5 位递增。本文件是唯一入口；新任务请新建目录，**不要往已有目录或旧文件里追加**。

**先建 overview 再实施**：动手改代码 / 数据 / 配置前，先新建 `NNNNN-<task-name>/overview.md` 写清「目标 + 变更计划 + 验证方案」；改动较大时先给用户审核，通过后再实施。规则详见 `AGENTS.md` 第 11 节。

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
| `00019-cloudflare-workers-deploy-config` | 配置 Nuxt 部署到 Cloudflare Workers（本地配置与验证，未上线） | 2026-11-13 | [总览](00019-cloudflare-workers-deploy-config/overview.md) |
| `00020-github-actions-ci-cd` | 用 GitHub Actions 接管质量门禁与 Cloudflare 部署，替代本地手动命令 | 2026-11-13 | [总览](00020-github-actions-ci-cd/overview.md) |
| `00021-cloudflare-custom-domain` | 自定义域名 yuanwu-knowisle.cmtlyt.top（根 wrangler.jsonc 加 routes + workers_dev=false） | 2026-11-13 | [总览](00021-cloudflare-custom-domain/overview.md) |
| `00022-ignore-vscode-in-gates` | lint/格式化门禁忽略 `.vscode`，并把 `.vscode` 纳入版本库 | 2026-11-13 | [总览](00022-ignore-vscode-in-gates/overview.md) |
| `00023-github-actions-secrets-if` | 修复 CI/CD「job 级 if 引用 secrets」导致 workflow 解析失败、0 job | 2026-11-13 | [总览](00023-github-actions-secrets-if/overview.md) |
| `00024-rxjs-course-multicourse` | 新增 RxJS 7.8.2 深度课，落地多课程架构（类型契约 / 校验脚本 / 共享视图层去硬编码） | 2026-11-13 | [总览](00024-rxjs-course-multicourse/overview.md) |
| `00025-required-course-type-narrowing` | `useRequiredCourse` 类型收窄（composable 层类型守卫，修复多课程页面 `CourseEntry \| undefined` 报错） | 2026-11-13 | [总览](00025-required-course-type-narrowing/overview.md) |
| `00026-course-restructure-dynamic-quantity` | 动态课时密度 + 面向完整性驱动题目数（Effect 24→26 / RxJS 24→26 重构、3 道同面向题改写、skill 同步、verify 正确率自洽化、pitfall-resolver 回写） | 2026-11-13 | [总览](00026-course-restructure-dynamic-quantity/overview.md) |
| `00027-course-dir-layout` | 课程数据层目录化（巨型单文件 → 同名目录 + index.ts + 章节拆分；共享 course-builders.ts；目录内带 `.ts` 导入；verify/check 脚本改目录发现；course-builder skill 落地目录模板） | 2026-11-13 | [总览](00027-course-dir-layout/overview.md) |
| `00028-tutor-agent` | 新增按需唤起的助学 Agent（加密 LLM 配置 + OPFS 会话 + 学情驱动的本地导航 + SSE 流式答疑，纯客户端可降级） | 2026-11-14 | [总览](00028-tutor-agent/overview.md) · [技术方案](00028-tutor-agent/tech-design.md) |
| `00029-tutor-audit-fix` | 助学 Agent 审计缺陷修复（清除漏删 / OPFS 降级链 / 学情注入范围 / 意图误判 / 契约校正 / 可复现动态回归资产） | 2026-11-14 | [总览](00029-tutor-audit-fix/overview.md) · [修复清单](00029-tutor-audit-fix/fix-plan.md) · [契约校正](00029-tutor-audit-fix/corrections.md) |
| `00030-real-llm-e2e` | 真实 LLM 端点端到端验证（CORS 预检 405 实证、补 CORS 后真实模型三姿态全通、输出质量新发现、修复方向） | 2026-11-14 | [总览](00030-real-llm-e2e/overview.md) · [验证结果](00030-real-llm-e2e/results.md) |
| `00031-tutor-routing-and-grounding` | 助学 Agent 意图路由误判修复（强信号白名单 + 「改用 AI 回答」兜底）与 system prompt 课程语境消歧，含真实端点 6 题抽检 | 2026-11-14 | [总览](00031-tutor-routing-and-grounding/overview.md) · [修复清单](00031-tutor-routing-and-grounding/fix-plan.md) · [抽检记录](00031-tutor-routing-and-grounding/sampling.md) |
| `00032-ts-esnext-and-warnings` | 显式固化 TS target=ESNext + 放开 Vite 产物降级，修订 18 条高价值/高风险 warnings（运行时类型守卫、`toReversed`/`toSorted`、SSE 循环），并单列 7 条未使用变量的功能与成因统计 | 2026-11-14 | [总览](00032-ts-esnext-and-warnings/overview.md) · [未使用项统计](00032-ts-esnext-and-warnings/unused-vars.md) |
| `00033-cleanup-invalid-unused-vars` | 清理 7 条未使用变量中真正无效的 6 条（4 个冗余 catch 参数、残留标志与残留计算），保留可复用 `svg()` helper；warnings 16/18 → 10/12 | 2026-11-14 | [总览](00033-cleanup-invalid-unused-vars/overview.md) |
| `00034-a-group-warnings-and-kernel-review` | 落地「历史记录不可矫正」永久约定；修复 A 组 5 条函数作用域警告；只读评估 widgets/analytics 两个迁移内核的同名目录拆分可行性与做/不做建议（拆分未实施） | 2026-11-14 | [总览](00034-a-group-warnings-and-kernel-review/overview.md) |
| `00035-widgets-dir-split` | 演练内核目录化：`app/lib/widgets.ts`（2217 行）拆成 `app/lib/widgets/` 目录（dom.ts 共享 helper + effect/ 11 + rxjs/ 13 一演练一文件 + index.ts 聚合），函数体逐字不动，Node 校验脚本改显式 index.ts 入口 | 2026-11-14 | [总览](00035-widgets-dir-split/overview.md) |
| `00036-doc-sync-after-widgets-split` | 处理拆分遗留：校正 README / 课程正文 / 代码注释 / skill 文档中的路径、演练数量、命令与运行时基线失真；AGENTS.md 只追加现行命令与 warnings 基线；历史任务记录零改动 | 2026-11-14 | [总览](00036-doc-sync-after-widgets-split/overview.md) |
| `00037-backlog-value-review` | 只读评估剩余遗留的价值：纠正 `EffectCourseData` / feed 虚拟化 / 焦点陷阱三处旧判断，按 ROI 给出 P0 三项与做/不做表；未改产品代码 | 2026-11-14 | [总览](00037-backlog-value-review/overview.md) |
| `00038-tutor-error-diag-and-doc-fix` | 实施 00037 的 P0：B1 `llm.ts` 网络错误映射为可读诊断 + 确定性断言；A1 `courses.ts` 24→26 课；A2 README 依赖表述校正；并实核查助学 AI 可用性 | 2026-11-14 | [总览](00038-tutor-error-diag-and-doc-fix/overview.md) |
| `00039-multimode-course-rendering` | 多模式课程渲染重构：`renderMode` 分派 simple/complex 4 层渲染（模块手风琴 / 模块主轴雷达 / 子阶段三级头），组件按模式分组目录（`course/simple|complex/`），simple 课零行为变化 | 2026-11-15 | [总览](00039-multimode-course-rendering/overview.md) |
| `00040-gitattributes-line-ending` | 用 `.gitattributes` + `git add --renormalize .` 消除 CRLF/LF 幽灵 diff（53 条 → 0） | 2026-11-15 | [总览](00040-gitattributes-line-ending/overview.md) |
| `00041-complex-render-test-course` | 创建 complex 渲染测试课程 `agent-test-course`（3 模块 / 3 阶段含子阶段 / 5 课 / 4 概念 / 15 题），端到端验证 4 层渲染 | 2026-11-15 | [总览](00041-complex-render-test-course/overview.md) |
| `00049-remove-agent-test-course` | 删除 00041 的临时测试课程数据（保留 complex 渲染层），verify 回落 2 门课 | 2026-11-15 | [总览](00049-remove-agent-test-course/overview.md) |
| `00050-complex-course-skill-conventions` | 将 complex（4 层）课程数据规范写入 course-builder skill（data-model.md 复杂模式小节 + 接口对齐 + 骨架 types.ts + SKILL.md 资源描述），不动产品代码 | 2026-11-15 | [总览](00050-complex-course-skill-conventions/overview.md) |
