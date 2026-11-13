# Git / hooks / 编辑器 / 文件系统

## lint-staged 与工具 ignore 冲突（实测阻断提交）

| 症状 | 根因 | 处理 |
|---|---|---|
| `pre-commit` 失败，oxfmt 报 `Expected at least one target file. All matched files may have been excluded by ignore rules.`，退出 2 | lint-staged 按扩展名把**已暂存**文件传给工具，但工具的 `ignorePatterns` 又把这些路径排除了；工具拿到空目标集就报错 | **让工具侧不再忽略任何可生成、可追踪的目录**：从 `.oxlintrc.json` / `.oxfmtrc.json` 的 `ignorePatterns` 删掉 `.workbuddy/**`、`content/**`、`public/**` 等；只保留 `.nuxt/`、`.output/`、`.data/`、`dist/`、`node_modules/` 这类**不可追踪**的生成/产物目录。然后把这些目录下的代码文件格式化一次，让 `fmt:check` 归零 |
| `pnpm lint` 对某目录报 `No files found to lint`（退出 1） | 该目录整体在 `ignorePatterns` 里 | 若目录可追踪且含代码，移除忽略并纳入门禁；不要靠改 lint-staged 配置绕过 |
| 想让 lint-staged 排除某些文件 | 官方文档：忽略应配置在**任务工具本身**，而不是 lint-staged | 实在无法改工具时，用 JS 函数式配置 + `picomatch.isMatch(file, '!pattern')` 过滤；JSON 配置里可用 negation pattern（如 `!(*.ts)`）解决 glob 重叠导致的竞态 |

验证方法（不触碰真实索引）：

```bash
export GIT_INDEX_FILE=/tmp/probe-index
git read-tree --empty
git add <目标文件>
sh .husky/_/pre-commit          # 或 git hook run pre-commit
unset GIT_INDEX_FILE
```

预期：oxfmt / oxlint 任务全绿并自动重新暂存；再注入一个语法错误文件，hook 应退出 1 阻断。测完确认 `git ls-files | wc -l` 与 `git stash list` 未变。

## husky / commitlint

| 症状 | 根因 | 处理 |
|---|---|---|
| `Skipping backup because there's no initial commit yet. This might result in data loss.` | 仓库尚无初始提交，lint-staged 无法建备份 stash | 预期行为，首次提交后自动恢复；用临时索引测试时同样会看到 |
| `git reset HEAD` / `git restore --staged` 报无法解析 HEAD | 仓库无任何提交，不存在 `HEAD` | 用 `git read-tree --empty` 把索引直接置空（只改索引、不动工作区），再核对 `git ls-files | wc -l` 为 0 |
| Windows 上 hook 不执行 | 误以为依赖可执行位 | husky wrapper 以 `sh -e` 执行，不依赖可执行位；从 GUI 客户端提交需保证 `pnpm` 在 PATH 中 |
| commitlint 拒绝合法消息（`scope-enum`） | 给 scope 加了白名单，挡住 `site` / `a11y` 等合法模块名 | 去掉 `scope-enum`，scope 可选且取值不限；只约束 type 白名单、header 长度、subject 格式 |
| 合并 / revert / fixup 消息被拒 | 规则没放行 | commitlint 默认忽略 `Merge` / `Revert` / `fixup!`，不要额外加白名单去覆盖 |
| `commit-msg` 失败，报 `body's lines must not be longer than 100 characters [body-max-line-length]`，提交未生成 | `@commitlint/config-conventional` 默认启用 `body-max-line-length: [2, always, 100]`；`.commitlintrc.json` 只覆盖了 `header-max-length`，中文长正文按字符计数同样超限 | 把 `git commit -m <header> -m <body>` 的第二段压到 **≤100 字符**（任务编号用简写、每段 body 单独计数），完整任务说明写进 `docs/NNNNN-*/overview.md`，body 只留一句短引用；提交前用 `printf 'feat: 示例\n\n关联 docs/00001-init。' \| pnpm exec commitlint --quiet` 预验，退出码 0 才提交。失败时索引仍保留已暂存文件，缩短正文后直接重跑 `git commit` 即可，不必重新 `git add` |

## 索引 / 忽略规则

| 症状 | 根因 | 处理 |
|---|---|---|
| 首次提交会带入磁盘上已不存在的文件（`AD` 状态） | 文件删了但索引条目没清 | 从索引移除残留条目；或整体 `git read-tree --empty` 重新按工作区 `git add` |
| 提交内容与工作区不一致（`AM` 状态） | 暂存后又改了文件 | 提交前统一重暂存；`git diff` 与 `git diff --cached` 都要看 |
| 单文件例外（如 `!dist/foo.zip`）没生效 | 父目录被整体忽略时，需要先放行目录 | 形如 `!dist/` + `dist/*` + `!dist/foo.zip`；若决定整体忽略，就别留半套例外，文档口径也要同步 |
| 不确定某文件是否被忽略 | 规则叠加后不直观 | `git check-ignore -v <path>`；未忽略时该命令无输出且退出 1 |

## 文件系统与命名

| 症状 | 根因 | 处理 |
|---|---|---|
| Windows 上纯大小写重命名（`MIGRATION.md` → `migration.md`）不生效 | NTFS 大小写不敏感 | 两步重命名：`old → target.__tmp__ → target` |
| Python 模块改名后 import 失败 | `from cdp-client import ...` 是非法语法 | Python 模块名用单词（如 `cdp.py`），不要连字符，也不要用 `importlib` 绕路 |
| 新增文件名不符合项目约定 | 混用 camelCase / snake_case | 项目统一 kebab-case；框架强制名（`nuxt.config.ts`、`SKILL.md`、`README.md`、`AGENTS.md`、动态路由段 `[slug]`）除外 |

## VSCode 文件嵌套（`explorer.fileNesting.patterns`）

| 症状 | 根因 | 处理 |
|---|---|---|
| 新增的父规则「不生效」 | 以为多个父 pattern 是首个匹配优先 | 源码确认：**所有匹配的父规则合并生效**，再做传递闭包归到根；通配 `*.ts` 不会吃掉 `nuxt.config.ts` 规则 |
| 写成 `*.config.*` 无效 | schema 限制 parent / child 每个模式**最多一个 `*`**（`^[^*]*\*?[^*]*$`） | 改用明确文件名 + 单星号后缀（如 `.oxlintrc.*`、`tsconfig.*.json`） |
| 规则配了却没出现嵌套 | 只有目录中**实际存在**的父文件才产生嵌套 | 确认父文件存在；`expand: false` 时子文件默认折叠在父下 |
| 新建项目级 `.vscode/settings.json` 后用户级规则全丢 | workspace 设置会**整体覆盖**用户级 patterns，不是合并 | 把全部规则复制到项目级；或只维护用户级并接受它对所有项目生效 |

改用户级 `settings.json` 前先备份；改完用等价算法模拟根目录嵌套结果，确认「哪个父收了哪些子」再收工。
