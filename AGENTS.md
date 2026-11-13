# AGENTS.md · 本仓库协作约定

本文件面向在 `yuanwu-knowisle` 中工作的 AI agent 与维护者；**项目介绍见 `README.md`**。以下规则优先于个人习惯，详细流程见 `.workbuddy/skills/` 下的两个项目级 skill。

## 1. 遇到问题：先查库，后回写（强制）

- **遇到任何问题都必须先加载 `pitfall-resolver` skill**，不限于报错：命令失败、门禁不通过、结果不符预期、方案不确定、被用户纠正、反复试错、尚未收录的全新问题。按症状速查表定位 `references/*.md` 后再动手。
- 修复并重跑回归后，**在给出最终答复之前回写**：命中已有条目则更新（新解法、版本变化、失效修正），未命中则在对应主题文件新增条目（症状 / 根因 / 已实测处理）；查库没帮上忙也要补记实际有效解法与新关键词。**回写是任务完成条件，不是可选项。**
- 若解法改变了命令、配置或工具链，同步更新本文件与 `README.md` 的相关表述。

## 2. 命令速查

```bash
pnpm install                 # postinstall: nuxt prepare；prepare: husky
pnpm dev                     # http://localhost:3000
pnpm build                   # Nuxt 生产构建
PORT=3100 node .output/server/index.mjs   # 生产预览

pnpm fmt:check               # oxfmt 只检查格式
pnpm fmt                     # oxfmt 写回
pnpm lint                    # oxlint 快速规则
pnpm lint:fix                # 自动修复
pnpm typecheck               # oxlint --type-aware --type-check
pnpm verify                  # 内容一致性 + 学情引擎全轨迹
PORT=3199 node .output/server/index.mjs &
python scripts/smoke.py --base http://127.0.0.1:3199
```

通用内容自检（可直接复用 skill 脚本）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course.ts app/lib/widgets.ts
```

- **`generate` / `preview` / `smoke` 三个 npm script 已移除**：本项目不做静态生成，生产预览用 `PORT=3100 node .output/server/index.mjs`；冒烟统一直接调用 `python scripts/smoke.py --base ...`（pnpm 11 会把 `--` 原样透传给 Python，且 smoke.py 默认 base 是 3100，与实际 3199 临时服务不符）。脚本文件 `scripts/smoke.py` 保留不变。
- 冒烟服务用 3199 等独立端口，跑完立即关闭；不要重启用户正在使用的 3100 预览服务。

## 3. 质量门禁与覆盖范围

- 按「快 → 慢」执行：`fmt:check` → `lint` → `typecheck` → `verify` → `build` → `smoke`。任一失败即停，先查 `pitfall-resolver`。
- 通过线是 **0 errors**。存量 warnings（`lint` 19、`typecheck` 21）主要来自机械迁移的演练内核（未使用变量、`Array#reverse()` 等风格项），不阻塞构建。
- `lint` 只跑毫秒级快速规则，`typecheck` 才启用 type-aware 与 TS 编译器诊断；不要把 type-aware 写进 `.oxlintrc.json` 的常驻配置。
- 两份 Oxc 配置**只忽略不可追踪**目录：`.nuxt/`、`.output/`、`.data/`、`dist/`、`node_modules/`（oxlint 另含 `archive/`）；oxfmt 另忽略 `**/*.md`、`**/*.css`、`**/*.yaml`、`**/*.yml` 与 `pnpm-lock.yaml`。**可追踪目录一律纳入门禁**，包括 `.workbuddy/skills/` 下的 TS / MJS 文件——否则 lint-staged 把暂存文件传给工具、工具却因 `ignorePatterns` 排除，会报 `Expected at least one target file` 退出 2 并阻断提交。
- 门禁不覆盖 Vue 模板表达式与模板级类型检查（见第 9 节）。

## 4. 提交规范与 Git hooks

`pnpm install` 通过 `prepare: husky` 设置 `core.hooksPath=.husky/_`；`.husky/_/` 由 husky 生成并自忽略，两个 hook 随仓库共享。

| Hook | 命令 | 作用 |
|---|---|---|
| `pre-commit` | `pnpm exec lint-staged` | 只检查暂存文件：`*.{ts,vue,mjs,js,cjs}` → `oxfmt` 写回 + `oxlint`；`*.{json,jsonc}` → 只 `oxfmt` |
| `commit-msg` | `pnpm exec commitlint --edit "$1"` | Conventional Commits 校验 |

提交信息 `<type>(<scope>): <subject>`，scope 可选且**取值不限**（不做 `scope-enum`，避免挡住 `site` / `a11y` 等合法模块名）：

```text
feat: 新增课程注册入口
fix(course): 修正掌握度权重
docs: 补充 hooks 说明
feat(app)!: 调整学情接口
```

type 白名单：`build / chore / ci / docs / feat / fix / perf / refactor / revert / style / test`；header ≤100 字符、**body 每行 ≤100 字符**（`@commitlint/config-conventional` 默认带 `body-max-line-length`）、subject 非空且不以 `.` 结尾，其余沿用 `@commitlint/config-conventional`。`Merge` / `Revert` / `fixup!` 默认忽略。

- 提交正文只写一句短引用，任务关联编号可简写；较长的说明放 `docs/NNNNN-*/overview.md`。不确定时用 `printf ... | pnpm exec commitlint --quiet` 预验。

- hooks 只做毫秒级暂存检查；`typecheck` / `verify` / `build` 不在 hook 内，提交前手动执行或交给 CI。
- 单独调试：`git hook run pre-commit`、`printf 'feat: 示例' | pnpm exec commitlint`。
- hook 由 husky wrapper 以 `sh -e` 执行，不依赖可执行位；从 GUI 客户端提交需保证 `pnpm` 在 PATH 中。
- 仓库尚无初始提交时 lint-staged 提示 `Skipping backup because there's no initial commit yet` 并跳过备份 stash，属预期；首次提交后恢复常规机制。

## 5. 文件命名

新增文件统一 **kebab-case**（全小写 + 连字符），如 `use-learning.ts`、`quiz-card.vue`、`effect-course-design.md`。

例外（改动会破坏识别或无法 import）：

- Nuxt / 工具约定：`app/app.vue`、`index.vue`、`default.vue`、`[slug]` / `[id]` 动态路由段、`nuxt.config.ts`、`content.config.ts`、`.oxlintrc.json`、`.oxfmtrc.json`、`.commitlintrc.json`、`.lintstagedrc.json`、`.husky/`、`tsconfig.json`、`package.json`、`pnpm-lock.yaml`。
- 全大写标准名：`README.md`、`AGENTS.md`、`SKILL.md`。
- Python 模块名不能含连字符（`from cdp-client import ...` 非法），`scripts/cdp.py` 用单词名，不引入 importlib 绕路。

约定只约束**文件名**；文件内 TS / Vue 标识符仍按语言惯例用 camelCase / PascalCase。

## 6. 工具链约束（TS 7 + Oxc）

- **保持 `typescript@7.0.2`，不要为修 lint 降级 TS 6 或装回 ESLint**。TS 7 是原生 Go 编译器，不提供 programmatic Compiler API，`typescript-eslint` 8.x 加载即拒绝运行（`@oxlint/migrate` 读 flat config 时也撞同一错误，配置因此是手写的）；oxlint 的 type-aware 后端 `tsgolint` 基于 typescript-go，恰好要求 TS 7.0+。
- `oxlint@1.93.0`、`oxfmt@0.78.0`、`oxlint-tsgolint@7.0.2007` 在 `package.json` **精确锁定**：tsgolint 版本与 TS 7 小版本绑定（如 `7.0.2007` 对应 7.0.2），升级 TS 时须同步更换。husky / commitlint / lint-staged 用 `^` 范围，实际版本由 `pnpm-lock.yaml` 锁定，`--frozen-lockfile` 仍可复现。
- 不要重新引入 `eslint.config.mjs`、`@nuxt/eslint` 依赖或 `nuxt.config.ts` 里的模块注册。
- `pnpm-workspace.yaml` 中 7 条 `minimumReleaseAgeExclude` 由 pnpm 11 为放行新发布的 tsgolint 二进制包写入，**保留**。
- `pnpm peers check` 的两条 unmet peer（`unctx` 期望 `oxc-parser>=0.140`、`unplugin^3.3.0`）来自既有 Nuxt 依赖，不阻塞构建。
- Nuxt 构建撞上残留锁且记录的 PID 已不存在时，用 `NUXT_IGNORE_LOCK=1 pnpm build` 绕过。

## 7. 内容与架构约束

- **三层解耦**：内容层（`app/data/`）驱动全部页面，引擎层（`app/lib/analytics.ts`）纯计算不碰 DOM，视图层只渲染不硬编码课时列表。
- 修改课程正文前先核对 `effect@4.1.4` 版本基线，`META.version` / `verifiedAt` / `docs` 集中在数据层；**严禁混用跨版本 API**。
- 新增课程只在 `app/data/courses.ts` 追加一项，提供 `EffectCourseData` 与独立 `storageKey`；页面、侧栏与学情按数据自动生成。
- 引用完整性（阶段 / 概念 / 前置 / 答案索引 / widget 标识）必须由 `check-course.mjs` 自动校验，任何悬空引用都要让脚本失败。
- 演练内核由 `course-widget.vue` 在 `onMounted` 挂载、`onBeforeUnmount` 调用 `cleanup()` 回收定时器；改动 widget 后跑 `check-course.mjs` + `pnpm verify`。
- 学情数据只存 localStorage 且可导出；按课程隔离 storage key，导入时校验版本字段并拒绝非法备份。
- 移动优先：≤780px 底部标签栏 + 抽屉导航，图示 / 代码块 / 表格各自独立横滑，触控目标 ≥40px，输入框 16px，处理刘海屏安全区。
- 长篇说明书走 `content/docs/` 由 Nuxt Content 渲染；不要把结构化课时改写成 Markdown 内容源。

## 8. 项目级 Skill 与仓库范围

| Skill | 职责 |
|---|---|
| `.workbuddy/skills/course-builder/` | 课程构建 8 阶段流程、数据契约、通用自检脚本与数据骨架 |
| `.workbuddy/skills/pitfall-resolver/` | 按症状检索的问题排查与解决方案库（6 个主题参考文件），采用「先查库 → 再修 → 后回写」闭环 |

- `course-builder` 任何阶段遇到问题同样先加载 `pitfall-resolver`；它不再自带踩坑清单。
- **不要重新引入** `archive/` 归档目录、`.gitignore` 里的 `dist` 单文件例外，也不要提交 `.workbuddy/memory/`。工作区内容未整体并入仓库；当前课程代码只以 `app/` 与 `content/` 为准。
- 仓库中不存在 `dist/course-builder.zip`；需要分发 skill 时从 `.workbuddy/skills/` 现场打包。
- `.workbuddy/skills/` 随仓库共享且可追踪，其下 TS / MJS 代码纳入门禁；`.workbuddy/memory/` 为本机私有记忆；`dist/` 整体忽略。
- 项目级 skill 只在**当前工作区**会话自动加载；如需跨项目生效，须把整个目录复制到 `~/.workbuddy/skills/`，届时两份内容需自行保持同步。

## 9. 已知限制

- `oxlint --type-check` 基于 typescript-go，只覆盖 `.ts` 与 `.vue` 的 `<script>` 块；Vue 模板表达式与 Nuxt 专属模板规则不在范围内。模板级类型检查需 `vue-tsc`，而它依赖 TS 6 的 Compiler API，与 TS 7 需双版本并存才能共存——当前未启用。
- `@oxlint/migrate` 在本仓库不可用，`.oxlintrc.json` 为手写；不要尝试用自动迁移覆盖它。

## 10. 收尾纪律

- 只读探查用 `GIT_INDEX_FILE` 临时索引、系统临时目录里的临时配置，不污染真实索引与仓库文件。
- 未经明确指示不要执行 `git add` / `git commit`，也不要改动真实索引；提交前确认 `pre-commit` 与 `commit-msg` 两个 hook 均通过。
- 每完成一个模块立即验，不堆积未验证代码；失败时先读完整错误信息定位根因，一次性修复后重跑**全部**相关回归，不逐个补丁试；同一问题连续三次未解决，停下来说明已尝试方案并请求协助。
- 断言不得把「元素缺失」「没抛异常」当成通过；收尾清理临时脚本、探针文件、截图与临时服务。
- 记录回归结果要写清命令、退出码与关键数字，不要只写「通过」；一次性的搜索结果、临时路径与个人上下文写进 `.workbuddy/memory/`，不要写进 skill 知识库。

## 11. 任务记录组织

- 历史与变更记录统一放在 `docs/NNNNN-<task-name>/`，**一次任务一个目录**，编号 5 位递增；入口与索引是 `docs/README.md`。
- 每完成一次用户任务，新建下一个编号目录，写 `overview.md`（目标 / 变更 / 验证 / 注意事项）；涉及迁入或映射时另写 `migration.md`。**不要把新任务内容追加到已有目录或旧文件**。
- 目录名用编号开头 + kebab-case 任务名（如 `00001-init`）；只在 `docs/README.md` 索引里登记，不改历史目录中的结论；已失效的历史结论在原目录内标注「以 NNNNN 为准」。
- 拆分前的累积文件（根目录 `overview.md`、`docs/migration.md`）已废弃，内容按任务迁入上述目录；引用改用 `docs/README.md` 或具体任务目录。
