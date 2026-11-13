# 00016 · 按任务主题把工作区拆分为多个提交

> 2026-11-13 ｜ [索引](../README.md)

## 目标

用户要求「根据任务内容和变更文件分别创建多个 commit」。此前仓库**无任何提交、真实索引为空**，全部内容以未跟踪文件形式一次性堆在工作区；本次把这份最终状态切成若干语义独立、可逐条回溯的提交。

## 拆分原则

- **按主题分组，而非按任务编号凑数**：15 个历史任务里，`00006-unstage-all`（只动索引）、`00010-vscode-file-nesting`（改的是仓库外的用户级 VSCode 配置）、`00011-skill-audit`（只读盘点）在仓库中没有可提交的文件；`00004` 的结论已被 `00005` 收敛，`00013` 只是改写 `00012` 里的同一份 skill 描述。机械做成 15 个提交会产生空提交或伪造中间状态。
- **每个文件只归属一个提交**：工作区只有「最终状态」，不反向构造历史中间版本，避免 `package.json` / `AGENTS.md` 之类文件被反复改写后再改回。
- **任务内容通过提交正文关联**：每条提交 message 的 body 注明对应的 `docs/NNNNN-*/` 任务目录；`docs/` 全部记录集中在最后一个提交，作为整段历史的索引。
- **配置先于代码**：工具链与 hooks 配置排在源码之前，保证后续每个提交都处在完整门禁上下文中。
- 提交信息遵循 `AGENTS.md` 第 4 节与 `.commitlintrc.json`；`pre-commit`（lint-staged）与 `commit-msg`（commitlint）两个 hook 全程启用，不跳过。

## 提交清单

| # | 提交信息（`type: subject`） | 文件范围 | 关联任务 |
|---|---|---|---|
| 1 | `chore: 初始化项目配置与依赖基座` | `.gitignore`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`nuxt.config.ts`、`content.config.ts` | 00001 / 00002 / 00005 / 00007 / 00009 / 00015 |
| 2 | `build: 引入 Oxc lint 与格式配置` | `.oxlintrc.json`、`.oxfmtrc.json` | 00007 |
| 3 | `build: 配置 husky 提交门禁与约定式提交` | `.husky/`、`.lintstagedrc.json`、`.commitlintrc.json` | 00008 / 00009 |
| 4 | `feat: 实现课程站点页面与交互组件` | `app/`（28 个 TS / Vue / CSS 文件，含 00007 的类型修复） | 00001 / 00002 / 00007 |
| 5 | `feat: 接入课程文档与静态资源` | `content/`、`public/` | 00001 |
| 6 | `test: 添加课程校验与冒烟脚本` | `scripts/` | 00001 / 00015 |
| 7 | `chore: 沉淀课程构建与踩坑治理技能` | `.workbuddy/skills/`（course-builder / pitfall-resolver） | 00003 / 00012 / 00013 |
| 8 | `docs: 收敛 README 并新增 AGENTS 协作约定` | `README.md`、`AGENTS.md` | 00014 / 00016 |
| 9 | `docs: 建立按任务编号组织的变更记录` | `docs/`（00001–00016 共 25 个 md + 索引） | 00001–00016 |

本目录 `overview.md` 属于第 9 个提交，因此**不记录提交 hash**（自引用无法成立）；需要对应关系时用 `git log --oneline` 按上表顺序查看。

## 随本次任务同步的修订

- `AGENTS.md` 第 10 节原先写「仓库目前无初始提交、真实索引为空」，提交后已失效，改为通用的「未经明确指示不要执行 `git add` / `git commit`」+「提交前确认两个 hook 通过」。
- `docs/README.md` 索引登记 `00016`。
- 按 `pitfall-resolver` 闭环回写：`references/git-hooks-editor.md` 新增 `body-max-line-length` 条目，`SKILL.md` 速查表与 description 补关键词；`AGENTS.md` 第 4 节补上 body 行长度约束。
- `.workbuddy/memory/` 仍按 `.gitignore` 本机私有，不进入任何提交；`dist/`、`.nuxt/`、`.output/`、`.data/`、`node_modules/` 同样被忽略。

## 验证

- 提交前预检：`pnpm fmt:check` → 34 文件全部合规（exit 0）；`pnpm lint` → 0 errors / 19 warnings（exit 0）。
- 首次提交尝试被 `commit-msg` 拒绝：`@commitlint/config-conventional` 默认启用 `body-max-line-length: 100`，正文超长，**未产生任何提交**、索引保留已暂存文件；缩短正文并用 `printf ... | pnpm exec commitlint --quiet` 批量预验 9 条消息后重跑通过，全程未用 `--no-verify`。
- 每个提交均由 husky 触发 `lint-staged` 与 `commitlint`，任一失败即中止，不做 `--no-verify` 绕过。
- 收尾复核：`git log --oneline`、`git status --short`、`git show --stat`，并复跑 `fmt:check` / `lint` / `typecheck` / `verify` / `build`，确认 hook 的 `oxfmt` 写回没有引入未提交改动。

## 注意事项

- 拆的是**最终工作区**，不是重放 15 次任务的历史；`docs/NNNNN-*/` 才是按任务发生顺序的历史记录，两者分工不同。
- 首个提交后 lint-staged 不再提示 `Skipping backup because there's no initial commit yet`，stash 备份机制恢复常规（`AGENTS.md` 第 4 节该条仍适用于全新建仓场景）。
- 如对拆分粒度不满意，可用 `git reset --soft <第 1 个提交的父>` 回到无提交状态重新分组；但已推送的提交不要改写。
