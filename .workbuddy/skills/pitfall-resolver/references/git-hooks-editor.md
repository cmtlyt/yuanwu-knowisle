# Git / hooks / 编辑器 / 文件系统

## lint-staged 与工具 ignore 冲突（实测阻断提交）

| 症状 | 根因 | 处理 |
|---|---|---|
| `pre-commit` 失败，oxfmt 报 `Expected at least one target file. All matched files may have been excluded by ignore rules.`，退出 2 | lint-staged 按扩展名传**已暂存**文件，工具 `ignorePatterns` 又排除这些路径，工具拿到空目标集 | 让工具侧不再忽略可追踪目录：从 `.oxlintrc.json` / `.oxfmtrc.json` 的 `ignorePatterns` 删 `.workbuddy/**`、`content/**`、`public/**`；只留 `.nuxt/`、`.output/`、`.data/`、`dist/`、`node_modules/` 等不可追踪产物目录；再把目录下代码格式化一次让 `fmt:check` 归零 |
| `pnpm lint` 对某目录报 `No files found to lint`（退出 1） | 目录整体在 `ignorePatterns` | 可追踪且含代码就移除忽略纳入门禁，不要改 lint-staged 绕过 |
| 想让 lint-staged 排除某些文件 | 忽略应配在**任务工具本身**，不是 lint-staged | 无法改工具时用 JS 函数式配置 + `picomatch.isMatch(file, '!pattern')`；JSON 配置用 negation pattern（如 `!(*.ts)`）解决 glob 重叠竞态 |
| `.lintstagedrc.json` 加顶级 `"ignores": [".vscode/**"]` 反而阻断提交 | lint-staged v17 object 配置**无顶级 `ignores` 键**，会被当名为 `ignores` 的 glob 任务（数组无 task）触发 schema / 语义错误；且 `*.{json,jsonc}` 是**单层 `*`**，不匹配 `.vscode/settings.json` | 不在 lint-staged 加 `ignores`。门禁修复在工具侧：两个 rc 的 `ignorePatterns` 各加 `".vscode/**"`，再 `pnpm fmt` 写回一次（改 rc 自身会触发重排版），lint-staged 不动 |

验证方法（不触碰真实索引）：

```bash
export GIT_INDEX_FILE=/tmp/probe-index
git read-tree --empty
git add <目标文件>
sh .husky/_/pre-commit          # 或 git hook run pre-commit
unset GIT_INDEX_FILE
```

预期：oxfmt / oxlint 全绿并自动重新暂存；注入语法错误文件后 hook 应退出 1。测完确认 `git ls-files | wc -l` 与 `git stash list` 未变。

## lint-staged 参数超长（Windows 命令行上限，实测阻断提交）

| 症状 | 根因 | 处理 |
|---|---|---|
| 大提交（≈120+ 文件）`pre-commit` 失败：`✖ oxfmt` + `Task killed: oxfmt`，文案乱码 `������̫����` / `锟斤拷锟斤拷` | lint-staged 把全部暂存文件**绝对路径**拼一条命令，Windows 经 `.cmd` shim 走 cmd.exe 受 **8191 字符**上限；单文件约 70 字符，208 文件 14.4K → `命令行太长。`（GBK 按 UTF-8 解码成乱码） | `.husky/pre-commit` 用 v17 分片开关 `pnpm exec lint-staged --max-arg-length=4000`（默认 0 不分片）。实测 4000（~55/批）通过；**8000 仍超**（单批 ~7.2K + cmd 包装越界）。改完直接试跑该命令验证，不必真提交 |
| 想用 JS 函数配置自己切片 | v17 函数任务**必须返回命令字符串**（或一层嵌套数组）；返回 `undefined`（自己 spawn 完就结束）报 `Invalid value for '[Function]': undefined` / `Commands must be strings…`，且函数任务 `files` 被置空、路径需自拼 | 不自写切片，用 `--max-arg-length`；确需函数任务就返回 `files` 拼好的命令串（注意绝对路径反斜杠的 shell 解析） |

诊断手法（不碰索引）：

```bash
git diff --cached --name-only | grep -E '\.(ts|vue|mjs|js|cjs)$' > .git/staged.txt
node -e "const fs=require('fs'),p=require('path');const f=fs.readFileSync('.git/staged.txt','utf8').trim().split('\n').map(x=>p.resolve(x));console.log('绝对路径总长',f.join(' ').length,'/ 上限 8191')"
```

超 8191 必触发。同数量**相对路径**往往不超（7.8K vs 14.4K），所以本地 `pnpm fmt` / `pnpm lint` 全绿也可能被 hook 挡住——门禁按目录扫描，lint-staged 传绝对路径。

## husky / commitlint

| 症状 | 根因 | 处理 |
|---|---|---|
| `Skipping backup because there's no initial commit yet. This might result in data loss.` | 无初始提交，lint-staged 无法建备份 stash | 预期行为，首次提交后恢复；临时索引测试同样会看到 |
| `git reset HEAD` / `git restore --staged` 报无法解析 HEAD | 无提交则无 `HEAD` | `git read-tree --empty` 直接置空索引（不动工作区），核 `git ls-files | wc -l` 为 0 |
| Windows 上 hook 不执行 | 误以为依赖可执行位 | husky wrapper 以 `sh -e` 执行，不依赖可执行位；GUI 客户端提交需保证 `pnpm` 在 PATH |
| commitlint 拒绝合法消息（`scope-enum`） | scope 白名单挡住 `site` / `a11y` | 去掉 `scope-enum`，scope 可选且取值不限；只约束 type 白名单、header 长度、subject 格式 |
| 合并 / revert / fixup 消息被拒 | 规则没放行 | 默认忽略 `Merge` / `Revert` / `fixup!`，不要额外加白名单覆盖 |
| `commit-msg` 报 `body's lines must not be longer than 100 characters [body-max-line-length]`，提交未生成 | `@commitlint/config-conventional` 默认 `body-max-line-length: [2, always, 100]`，`.commitlintrc.json` 只覆盖 `header-max-length`；中文按字符计数同样超限 | `git commit -m <header> -m <body>` 第二段压到 **≤100 字符**（编号简写、每段单独计数），完整说明写 `docs/NNNNN-*/overview.md`；预验 `printf 'feat: 示例\n\n关联 docs/00001-init。' \| pnpm exec commitlint --quiet` 退出 0 再提交。失败时索引保留，缩短 body 直接重跑 `git commit`，无需重新 `git add` |
| `subject must not be sentence-case [subject-case]`；中文信息也被拒，`--quiet` 下无输出 | `config-conventional` 默认 `subject-case: [2, never, ['sentence-case', 'start-case', 'pascal-case', 'upper-case']]`；subject **以大写英文词开头**（`Wave 1 …` / `Fix …`）即判 sentence-case，与后面中文无关 | subject 一律中文开头（`feat(course): 完成 Wave 1 …`）或整句小写英文开头，不用大写英文起头。预验失败去掉 `--quiet` 看规则名。实测 `feat(course): Wave 1 全部 142 课重写收官（00057-00088）` 被拒，改「完成 Wave 1 …」通过；索引不丢，改完直接重跑 |

## 索引 / 忽略规则

| 症状 | 根因 | 处理 |
|---|---|---|
| 首次提交带入已不存在的文件（`AD`） | 文件删了索引条目没清 | 从索引移除残留，或 `git read-tree --empty` 后按工作区重新 `git add` |
| 提交内容与工作区不一致（`AM`） | 暂存后又改文件 | 提交前统一重暂存；`git diff` 与 `git diff --cached` 都要看 |
| 单文件例外（如 `!dist/foo.zip`）没生效 | 父目录整体忽略时需先放行目录 | `!dist/` + `dist/*` + `!dist/foo.zip`；决定整体忽略就别留半套例外，文档口径同步 |
| 不确定文件是否被忽略 | 规则叠加不直观 | `git check-ignore -v <path>`；未忽略时无输出且退出 1 |

## 文件系统与命名

| 症状 | 根因 | 处理 |
|---|---|---|
| Windows 纯大小写重命名（`MIGRATION.md` → `migration.md`）不生效 | NTFS 大小写不敏感 | 两步：`old → target.__tmp__ → target` |
| Python 模块改名后 import 失败 | `from cdp-client import ...` 非法语法 | 模块名用单词（如 `cdp.py`），不要连字符，也不要 `importlib` 绕路 |
| 新文件名不符约定 | 混用 camelCase / snake_case | 统一 kebab-case；框架强制名（`nuxt.config.ts`、`SKILL.md`、`README.md`、`AGENTS.md`、`[slug]`）除外 |

## VSCode 文件嵌套（`explorer.fileNesting.patterns`）

| 症状 | 根因 | 处理 |
|---|---|---|
| 新增父规则「不生效」 | 以为多父 pattern 首个匹配优先 | 源码确认：**所有匹配的父规则合并生效**，再做传递闭包归到根；`*.ts` 不会吃掉 `nuxt.config.ts` 规则 |
| 写 `*.config.*` 无效 | schema 限制 parent / child 每模式**最多一个 `*`**（`^[^*]*\*?[^*]*$`） | 用明确文件名 + 单星号后缀（如 `.oxlintrc.*`、`tsconfig.*.json`） |
| 配了规则却没嵌套 | 只有目录里**实际存在**的父文件才产生嵌套 | 确认父文件存在；`expand: false` 时子文件默认折叠 |
| 新建项目级 `.vscode/settings.json` 后用户级规则全丢 | workspace 设置**整体覆盖**用户级 patterns，不是合并 | 全部规则复制到项目级，或只维护用户级并接受全局生效 |

改用户级 `settings.json` 前先备份；改完用等价算法模拟根目录嵌套结果，确认「哪个父收了哪些子」再收工。
