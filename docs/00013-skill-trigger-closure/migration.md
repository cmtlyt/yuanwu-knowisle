# 00013 · 口径调整：触发泛化与回写闭环

> 2026-11-13 ｜ 由原 `docs/migration.md`「口径调整」小节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

承接 [00012](../00012-pitfall-skill-and-gates/overview.md) 新建的 `pitfall-resolver`，把触发条件从「具体报错关键词」改为「任何问题」，并补上解决后的回写闭环。

| 变更 | 说明 |
|---|---|
| `pitfall-resolver/SKILL.md` frontmatter | description 改为**遇到任何问题必须先加载**（中英文强触发词），并明确解决并回归后必须回写；开头即强触发句 |
| `pitfall-resolver/SKILL.md` 正文 | 新增触发范围（不限于报错）、五步闭环、强制回写的 4 种情况表；速查表补「全新问题」行；要求新报错文本同步补进速查表与 description |
| `pitfall-resolver/references/verification.md` | 通用纪律加「回归通过后回写知识库，未回写视为任务未完成」 |
| `course-builder` | 硬性规则 8、资源列表、加载顺序、`workflow.md` 阶段 7 验收同步为「任何问题先加载，解决后回写」 |
| `README.md` / `overview.md` / 项目级 `MEMORY.md` | 项目级 Skill 章节改写为闭环说明，并把「先查库 → 再修 → 后回写」记为长期约定（README 部分后于 00014 移入 `AGENTS.md`） |

只改 Markdown，未动代码与配置；`fmt:check`（34 文件）/ `lint` 0e19w / `typecheck` 0e21w / `verify` 复跑全绿。description 用全角冒号与顿号，避免半角 `: ` 破坏 YAML；长度 783 字符，含 `name` / `description` / `agent_created` 三个键。项目级 skill 仍只在当前工作区会话自动加载。
