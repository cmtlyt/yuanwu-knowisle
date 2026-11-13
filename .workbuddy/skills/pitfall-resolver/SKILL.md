---
name: pitfall-resolver
description: 遇到任何问题都必须先加载本 skill 查找解决方案，解决并回归通过后必须更新或新增解决方案条目。通用问题排查与解决方案库（症状 → 根因 → 处理），采用「先查库 → 再修 → 后回写」闭环：报错、构建失败、lint 或类型检查不通过、格式化冲突、依赖与 peer 冲突、Git hook 阻断、提交信息被拒、SSR hydration 警告、移动端横向溢出、无头浏览器断言假阳性、工具报「无目标文件」、命令或参数失效、结果不符合预期、方案不确定、被用户纠正、卡住或反复试错、验证不通过等，不限于已收录的症状。加载后按症状速查定位参考文件再动手；回写规则是命中已有条目则更新（新解法、版本变化、失效修正），未命中则新增条目，查库未帮上忙也要补记实际有效解法。关键词：任何问题、报错、失败、异常、不生效、被阻断、冲突、警告、卡住、不符合预期、不确定、已解决、回写、更新方案、新增方案、TS 7、typescript-eslint、oxlint、oxfmt、tsgolint、pnpm、husky、lint-staged、commitlint、lint-staged ignores 顶级键、门禁忽略 .vscode、body-max-line-length、提交正文超长、Format issues found、静态资源校验失败、删除文件后验证失败、管道吞掉退出码、Nuxt、CDP、VSCode、troubleshooting、pitfall、known issue、how to fix、Cloudflare、wrangler、Workers、compatibilityDate、workerd、原生模块、better-sqlite3。This skill must be loaded first whenever the agent hits any problem, error, failure, unexpected result, blocked step, or uncertainty, before attempting a fix; after the fix is verified with regressions, update the existing solution or add a new one.
agent_created: true
---

# 问题排查与解决方案库

把重复踩过的坑沉淀成可按症状检索的知识。固定闭环：**遇到任何问题 → 先加载本 skill 查库 → 按已验证解法修复 → 重跑回归 → 回写解决方案**。每条记录都是实测结论，包含根因与可执行的修复动作，不是猜测。

## 触发范围（不限于报错）

以下全部算「问题」，识别到的第一时间就要加载本 skill，不要直接试错或凭记忆猜：

- 命令执行失败、工具调用报错、退出码非 0、超时、无输出、参数不生效
- 构建 / lint / typecheck / 格式化 / 数据自检 / 冒烟测试不通过
- 依赖安装失败、peer 冲突、版本不兼容、锁文件异常
- Git hooks 阻断、提交被拒、索引或暂存状态异常
- 页面渲染、hydration、视口、交互、数据读写不符合预期
- 结果与预期不一致、需求或方案不确定、被用户纠正、同一问题反复尝试
- 编辑器 / 操作系统 / 运行环境差异导致行为不一致
- **任何尚未收录的全新问题**：同样先加载，走同一闭环

## 使用方式（闭环，五步缺一不可）

1. **先加载**：识别出问题的第一时间加载本 skill，再读下方「症状速查」。
2. **查库**：只读命中的 `references/*.md`，按「症状 → 根因 → 处理」执行。速查表没有对应项时，先按主题挑最接近的文件扫一遍，再自行排查。
3. **修复并回归**：一次性修复后重跑相关回归（门禁顺序见 `references/verification.md`）；同一问题连续三次未解决，停下来说明已尝试方案并请求协助。
4. **回写（强制）**：问题解决、回归通过后，**在给出最终答复之前**更新或新增解决方案。这是任务的完成条件，不是可选步骤；库里没帮上忙也要写清「查库结果 + 实际有效解法」。
5. **同步口径**：若解法改变了项目命令、配置或工具链，顺手更新 README / overview / docs 中的相关表述，避免下次照旧文档再踩一次。

## 症状速查

| 症状 / 关键词 | 参考文件 |
|---|---|
| `typescript-eslint does not support TS 7.0`、`nuxi typecheck` 缺 checker、`@oxlint/migrate` 失败、TS 7 无 Compiler API、`vue-tsc` 装不上、`.vue` 模板没被检查 | `references/toolchain.md` |
| `no-unsafe-type-assertion`、`no-base-to-string`、`no-implied-eval`、迁移内核推断出宽泛类型 | `references/toolchain.md` |
| `pnpm smoke -- --base` 参数解析失败、`minimumReleaseAgeExclude` 被自动写入、unmet peer、`--frozen-lockfile` 失败、`esbuild` 无法 require | `references/toolchain.md` |
| Nuxt 构建锁残留 / PID 复用、`NUXT_IGNORE_LOCK`、Nitro 探针 404、构建通过但运行时 500、Nitro 内部模块解析警告 | `references/nuxt-build.md` |
| hydration mismatch、改名后 composable 未定义、链接按钮错位、定时器残留、多门课学情串数据 | `references/nuxt-build.md` |
| `--window-size` 测不出手机断点、断言全是 ✓ 却有 bug（假阳性）、抽屉探针假阴性、仪表盘横向溢出 | `references/browser-viewport.md` |
| 课程正文 API 在最新版不存在、跨版本 API 混用、手抄迁移丢内容、演练切课后定时器还在跑、旧应用进度看不到 | `references/course-content.md` |
| `pre-commit` 被阻断、`Expected at least one target file`、工具 ignore 与 lint-staged 冲突、无初始提交跳过 stash、commitlint 拒绝合法消息、`body-max-line-length`、`body's lines must not be longer than 100 characters`、提交正文超长、Windows hook 不执行、lint-staged 顶级 `ignores` 键（v17 不支持）、门禁忽略 `.vscode` 目录 | `references/git-hooks-editor.md` |
| 大小写重命名不生效、Python 模块名含连字符、VSCode 文件嵌套规则不生效 / workspace 覆盖用户级 | `references/git-hooks-editor.md` |
| `Format issues found in above 1 files`、`fmt:check` 单文件格式差异、`pnpm verify` 静态资源 `✗`、删除文件后校验失败、管道吞掉退出码 / 假「全绿」 | `references/toolchain.md`、`references/verification.md` |
| 何时验、验什么、临时探针与临时服务怎么清理、门禁顺序 | `references/verification.md` |
| wrangler 部署、`workerd` 占位值、`compatibilityDate` 阈值、`wrangler.jsonc` 不写 main/assets、原生模块不能进 Worker、`wrangler dev` 首启 crash #1 | `references/cloudflare-deploy.md` |
| **任何未列出的问题 / 症状不明 / 全新问题** | 先按主题挑最接近的文件扫一遍；解决后按下节规则**新增**条目并补速查表关键词 |

## 解决后回写（强制）

| 情况 | 动作 |
|---|---|
| 已有同症状条目，解法仍有效 | 不重复新增；补充了细节（版本、命令、适用边界）就更新该行并注明实测日期 |
| 已有条目，但解法失效 / 有更优解 / 版本变化 | 更新原条目：替换处理动作，保留旧结论作为「不适用」提示，注明日期 |
| 库里没有该症状 | 在对应主题文件末尾新增条目；主题不存在时新建 kebab-case 参考文件，并在速查表登记 |
| 查库未命中、靠自行排查解决 | 仍要新增条目，写明为何未命中（关键词缺失 / 症状表述不同），并补上速查表关键词 |

条目规则：

- 必须写清**触发症状**（最好含原始报错文本）、**根因**、**已实测有效的处理**，三者缺一不可；不要写「可能是……」这类未验证猜测。
- 追加到对应主题文件末尾，不新建重复条目；涉及命令时给出可直接复制的完整命令与预期退出码，注明是否需要临时环境变量 / 临时端口。
- 若出现新的报错文本或关键词，同步补进本文件的速查表与 `description`，让下次能自动命中。
- 只记可复用的结论；一次性的搜索结果、临时路径、个人上下文不要写入本库（那是 `.workbuddy/memory/` 的职责）。
- 文件名统一 kebab-case；`SKILL.md` 为框架强制名例外。

## 与 course-builder 的关系

`course-builder` 负责「怎么从零构建一门交互式课程」（8 阶段流程、数据契约、通用自检脚本）。本 skill 负责「出问题时怎么修」，与课程构建流程解耦，**任何项目里的同类问题都适用**。course-builder 任何阶段遇到问题都应转而加载本 skill，解决并回归通过后回写解决方案，不再自带踩坑清单。
