# 00003 · 沉淀 course-builder 项目级 skill

> 2026-11-13 ｜ 由当日记忆日志拆出 ｜ [索引](../README.md)

## 目标

用户要求「把课程规划和创建的流程总结成一个 skill 放到当前目录下」。按 skill-creator 规范初始化为**项目级 skill**，并打包分发。

## 变更

- 位置：`.workbuddy/skills/course-builder/`（最初在工作区 `C:/Users/cmtlyt/WorkBuddy/学习/`，后随仓库共享范围调整迁入本仓库；分发包 `course-builder.zip` 最终未纳入仓库，见 [00005](../00005-migration-scope-adjustment/overview.md)）。
- 结构：
  - `SKILL.md` — frontmatter（`agent_created: true`、触发条件）、8 阶段工作流表、8 条硬性规则、资源索引。
  - `references/workflow.md` — 8 阶段输入 / 动作 / 产出 / 验收 + 交付清单模板。
  - `references/data-model.md` — 内容契约、学情状态、掌握度 0.30/0.20/0.25/0.25 公式、遗忘与诊断、多课程注册表。
  - `references/pitfalls.md` — 版本核实、Chrome 500px 钳制、Nitro 静态清单、hydration、自动导入改名、假阳性断言等踩坑（后于 [00012](../00012-pitfall-skill-and-gates/overview.md) 迁出并删除）。
  - `scripts/check-course.mjs` — 通用数据一致性 / 引用完整性 / DAG 校验，接受数据模块路径参数。
  - `assets/course-skeleton.ts` — 最小可扩充的课程数据骨架。

## 验证

- 官方 `package_skill.py` 校验通过并打包。
- `check-course.mjs` 对真实 6/24/26/48 课程 + widgets 注册表全绿，对骨架全绿；反向用例（非法 answer 索引）正确失败并退出 1。

## 当时的踩坑

`widgets.ts` 导出的 `Widgets` 是**带自定义 `.has()` 的门面对象**（内部另有映射表），不是 Map/Set；通用脚本初版按 `Object.hasOwn` 判断误报，改成鸭子类型 `typeof W.has === 'function'` 优先。
