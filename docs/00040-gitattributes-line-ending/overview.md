# 00040 · 修复换行符幽灵改动（.gitattributes）

## 背景

`feat/agent-course-outline` 分支 `git status` 显示 62 个文件 modified，但 `git diff`（工作区 vs HEAD 实质比较）只认 9 个有真实内容差异（course-builder/SKILL.md、course.ts、use-course.ts、analytics.ts、[slug] 四页、verify-course.mjs）。其余 53 个（tutor/widgets/.vue/.ts 等）是**纯换行幽灵改动**：HEAD 存 CRLF、工作区是 LF，在 `core.autocrlf=true` 下被 Git 自动翻转，内容零差异却被 status 误标 modified，且每次 git 操作反复刷 `LF will be replaced by CRLF` 警告。

根因：仓库**没有** `.gitattributes`（无换行权威规范），叠加本地 `core.autocrlf=true`。

## 目标

1. 新增 `.gitattributes`：所有文本文件统一规范为 LF；二进制声明 `binary`；保留/补 `.sh`/`.bat` 的换行规范。
2. 配置后对**已检出文件**执行一次 LF 归一化（`git add --renormalize` 思路：让 Git 按新规范重算 index 的换行），消除幽灵改动。
3. 最终 `git status` 只剩 9 个真实改动（+ 新增的 untracked 文件 + 本任务记录本身），换行相关误报归零、警告消失。

## 变更计划

1. 写 `.gitattributes`（文本一律 `-crlf`/`text=auto`；`.sh` `eol=lf`；`.bat/.cmd` `eol=crlf`；图片/字体/二进制 `binary`）。
2. `git add --renormalize .`：让 Git 按新 .gitattributes 重新规范化 index，消除 53 个纯换行 ghost。
3. 复核：`git status` 应只剩真实改动 + 未跟踪文件；`git diff` 不再出现 `LF will be replaced by CRLF` 警告。
4. 不动 `core.autocrlf`（保留用户/系统设置），靠 .gitattributes 做权威覆盖。

## 验证方案

- `git status --short` 中 ` M` 行数应大幅下降（只剩真实改动的 9 个左右）。
- 任意跑一次 `git ls-files --eol` 不再出现大量 `i/lf w/crlf` 冲突行（工作区与 index 一致）。
- `git diff` 输出不再刷 `LF will be replaced by CRLF` 警告。
- 真实改动的 9 个文件 diff 内容不变（仍可见实质差异）。

## 实施结果（2026-11-14）

1. 新增 `.gitattributes`：`* text=auto` 统一规范 LF；源码/文本/配置/文档/lint/build 文件显式 `text eol=lf`；`.sh` LF、`.bat/.cmd/.ps1` CRLF；图片/字体/wasm 声明 `binary`；lock 文件保持文本。
2. `git add --renormalize .` 将 index 换行归一到 LF，**53 个纯换行幽灵改动全部清零**，`git status` 由 62 个 M 降到 9 个（仅剩真实改动）。
3. `git ls-files --eol` 复核：全为 `i/lf`，无 `i/crlf w/lf` 冲突行；`git diff` 不再刷 `LF will be replaced by CRLF` 警告。
4. 未改动 `core.autocrlf`、未动 `.gitignore`；9 个真实改动文件内容不变，仅换行归一后 diff 更干净。

验证全绿，门禁不受影响（仅新增 1 个 `.gitattributes` + 1 个目录，未触碰构建/校验逻辑）。

## 风险

- `git add --renormalize` 只改写 index 的换行表示，不改工作区文件实际内容、不改任何真实改动；安全。
- 若历史提交是 CRLF、新规范是 LF，`--renormalize` 会把 index 归一到 LF；后续提交时 Git 不会因换行产生噪音 diff。
- 二进制若误标文本会被 `--renormalize` 破坏，故先按扩展名精确声明 binary。

## 不变量

- 9 个真实改动的文件，其**内容**不变，只可能因换行归一化而 diff 更干净。
- 不改动 `core.autocrlf`、不动 `.gitignore`。
