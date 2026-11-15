# 00097 · 修复 Agent 工程课地图白屏（difficulty 越界）

- 分支：`fix/agent-difficulty-whitescreen`，基点 `main@afe25b6`
- 日期：2026-11-16

## 目标

访问 `/courses/agent` 课程地图页白屏。控制台首错为 `RangeError: Invalid count value: -19`（`String.repeat`），后续 `Cannot destructure property 'type' of 'vnode'` 是首次渲染抛错后的连锁卸载异常。修复并防止同类问题回归。

## 根因

- `app/components/course/complex/map.vue` 三处 + `simple/map.vue` 一处直接渲染 `'●'.repeat(l.difficulty) + '○'.repeat(5 - l.difficulty)`，无任何边界保护。
- `app/data/agent-course` 的 **L59–L90 共 32 课** `difficulty` 被误填成课时分钟数（theory 20–26、practice 40–44、overview 20），而正常值域为 1–5。首个渲染到的 L59 `difficulty=24` 触发 `'○'.repeat(5 - 24)` = `'○'.repeat(-19)`，抛错导致整页渲染中断 → 白屏。
- 另三门课（effect / rxjs / langchain / agent-harness）difficulty 均为合法 1–5，问题仅限 agent-course 的这一段批量数据。
- `check-course.mjs` 未校验 difficulty 值域，这类坏数据能穿过 `pnpm verify`。

## 变更计划

1. **数据**：将 L59–L90 的 difficulty 修正为合法值，口径与相邻正常课时一致——theory / overview = 2、practice = 3（L54–L58 即 theory=2 / practice=3）。
2. **渲染防御**：在两个 map.vue 抽取 `difficultyDots(d)` 函数，对 d 做归一化（取有限整数、clamp 到 1–5）后再 repeat，保证任何脏数据都不会抛 RangeError；模板 4 处统一改调用。
3. **门禁**：`check-course.mjs` 在「课时内容块」新增「difficulty 为 1–5 整数」校验，失败即 exit 1。

## 验证方案

- 数据侧：Node 加载 `agent-course/lessons/index.ts`，断言 142 课 difficulty 全为 1–5 整数，越界数 = 0。
- 门禁：`pnpm verify`（含新增 difficulty 校验）全绿。
- 质量门禁（快→慢）：`pnpm fmt:check` → `pnpm lint`（0 errors）→ `pnpm typecheck`（0 errors）→ `pnpm build`。
- 页面侧：`pnpm build` 后 `wrangler --cwd .output dev --port 3199` 生产预览，验证 `/courses/agent` 地图页 200 且控制台无 RangeError（独立端口，跑完即关）。
- 回写：按 AGENTS.md §1 将本症状/根因/处理回写 pitfall-resolver（nuxt-build.md 或 course-content.md）。

## 注意事项

- 遵守「历史记录不可矫正」：不改任何 `docs/NNNNN-*/` 旧记录，仅在本文给出正确口径。
- 渲染层 clamp 是防御，不替代数据修复；两者都做，避免只治标。
- 不碰用户正在使用的 3100 预览服务，冒烟/调试统一用 3199 等独立端口。
