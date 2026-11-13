# 00013 · skill 描述泛化：任何问题先查、解决后回写

> 2026-11-13 ｜ 由原 `overview.md`「skill 描述改为…」章节拆出 ｜ [索引](../README.md) ｜ [口径调整](migration.md)

## 目标

用户要求「修改 skill 描述，遇到任何问题都应该先加载 skill 查找解决方案，解决完之后更新或新增解决方案」。目标是项目级 `pitfall-resolver`。

## 变更

- `SKILL.md` 的 description 改以「遇到任何问题都必须先加载本 skill 查找解决方案，解决并回归通过后必须更新或新增解决方案条目」开头（783 字符，中英文强触发词），不再局限于具体报错关键词枚举。
- 正文新增「触发范围（不限于报错）」与五步闭环（先加载 → 查库 → 修复并回归 → 回写（强制） → 同步口径）；「追加规则」升级为「解决后回写（强制）」，按 4 种情况规定更新 vs 新增：已有且有效→补细节；失效或更优解→更新；无该症状→新增；查库未命中→仍新增并补关键词。速查表加「未列出的全新问题」行。
- `references/verification.md` 加「回归通过后回写知识库，未回写视为任务未完成」纪律。
- `course-builder/SKILL.md`（硬性规则 8 / 资源列表 / 加载顺序）、`references/workflow.md` 阶段 7 验收、README 项目级 Skill 章节同步；项目级 `MEMORY.md` 新增「问题处理闭环」长期约定，让下个会话也遵守。

## 验证

- frontmatter 3 个 key，description 无半角 `: ` 破坏 YAML。
- `fmt:check`（34 文件）/ `lint` 0e19w / `typecheck` 0e21w / `verify` 复跑全绿；真实索引 0、无 stash、无提交。

## 注意事项

description 放宽后仍只在**本工作区会话**自动匹配（项目级 skill）；跨项目生效需复制到 `~/.workbuddy/skills/`，用户当时未确认，未擅自复制。README 的对应章节后于 [00014](../00014-readme-agents-split/overview.md) 移入 `AGENTS.md`。
