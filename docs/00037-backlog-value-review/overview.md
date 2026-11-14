# 00037 · 剩余遗留的价值评估（只读，不实施）

> 任务类型：只读评估 / 决策支持（**零产品代码改动**）
> 日期：2026-11-14
> 前序：`00036-doc-sync-after-widgets-split`（处理拆分遗留）、`00034`、`00031`、`00030`

---

## 0. 历史声明（按「历史记录不可矫正」永久约定）

本次**不改写任何已落盘任务记录**（`docs/NNNNN-*/` 全部文件）、不改 `AGENTS.md` / `docs/README.md` 既有行。评估中发现的前序结论偏差，只在本新建记录中声明并给出正确口径：

| 被修复的旧内容 | 落盘位置 | 正确口径（本次实测） |
|---|---|---|
| 「README … `EffectCourseData` 旧类型名」被列为待修失真 | `00036` §6.4 | **误判**。`app/types/course.ts:98` 仍有 `export type EffectCourseData = CourseData`（明确注释「保留名以兼容既有引用」），`:113` 的 `CourseEntry.data?: EffectCourseData` 也仍用它。README:12 表述正确，**无需改** |
| README「零额外运行时依赖」的失真程度未被点明 | `00036` §6.4 | `package.json` 实际有 **27 个 `dependencies`**（Nuxt UI / Tiptap 全套 / Tailwind / `markdown-it` / `dompurify` / `@nuxt/a11y` 等），README:13 属于明确事实错误，比同段其它项更该修 |
| 「feed 不虚拟化」被列为性能遗留 | `00030` / 此前遗留清单 | **价值≈0**。`app/lib/tutor/history.ts:22` 有 `TUTOR_TURN_LIMIT = 10`，`:190` 每轮把 `conv.messages` 截到 `20` 条；渲染流有硬上限，不存在长会话 DOM 膨胀 |
| 「抽屉焦点陷阱」被列为 a11y 遗留 | `00030` / 此前遗留清单 | **已部分实现**：`tutor-drawer.vue:116` 有 `role="dialog" aria-modal="true"`、`:99` 有 Escape 关闭、`:93` 打开时聚焦输入框；仅缺 Tab 焦点循环，属边际改进 |

---

## 1. 目标

回答「剩余遗留里哪些有价值」。评估分两层：

- **A 层**：`00036` §6.4 登记的 6 类剩余遗留（上一轮交付时明确「需另起任务」的项）。
- **B 层**：更早任务（`00030` / `00031` / `00034`）留下的功能性 / 质量性遗留 —— 它们里有比纯文档项价值更高的。

判定维度：用户可感知度、出错概率、改动面、回归风险、验证成本。**本次只读，不改任何产品代码 / 数据 / 配置**，也不跑完整门禁（文档评估无需构建）。

---

## 2. 实证核实（本次只读采样）

| 事实 | 证据 |
|---|---|
| 课程卡片描述直接渲染给用户 | `app/pages/index.vue:47/65` 的 `{{ c.description }}`；`courses.ts` 两门课 description 都写「6 阶段 24 课」，而 `app/data/*/lessons/` 各 **26 个** `lNN.ts`（`lessons/index.ts` 聚合 26 项） |
| README「零额外运行时依赖」错误 | `package.json` 27 个 `dependencies` |
| `EffectCourseData` 仍有效 | `app/types/course.ts:98` 兼容别名、`:113` 仍引用 |
| `smoke.py` 默认连不上现行预览 | `scripts/smoke.py:156` `default="http://127.0.0.1:3100"`；现行服务是 3199；`AGENTS.md` §2 明令「脚本文件 `scripts/smoke.py` 保留不变」，所有实际调用都显式传 `--base` |
| CI 无运行时回归 | `.github/workflows/ci-cd.yml` 的 `test` job 只到 `fmt:check → lint → typecheck → verify → build`，**无 smoke**；`smoke.py` 依赖本机 Chrome/Edge（`from cdp import … find_browser`），CI 需额外起 wrangler 服务 |
| 网络错误文案笼统 | `app/lib/tutor/llm.ts:112` `if (err instanceof TypeError) return new LlmRequestError('network', err.message \|\| '网络不可达')` —— CORS 预检 405 会把浏览器原文 `Failed to fetch` 直接透给用户（00030 已实证） |
| 60s 是「整次响应」超时 | `llm.ts:12` `DEFAULT_TIMEOUT_MS = 60_000`，`:81` `makeController` 对整次请求挂一个定时器；00030 实测 1374 字长回答在 60s 内完成，接近边界 |
| 多标签页不同步 | 全仓无 `addEventListener('storage'` 命中 |
| 会话消息有上限 | `history.ts:22` `TUTOR_TURN_LIMIT = 10`、`:190` `slice(-cap)` |
| 剩余 warnings | `typecheck` **5 条零重复**：`analytics.ts` L40/112/119 三条 `consistent-function-scoping` + `use-learning.ts` L34/50 两条 `no-unsafe-type-assertion`；`analytics.ts` 506 行单闭包状态机 |
| 真实模型澄清规则 | `00031` 抽检 Q6「歧义先澄清」未稳定生效（6 题 5 合格 / 1 部分合格），属提示词效果、不能写硬断言 |

---

## 3. A 层：00036 剩余遗留逐项评估

| # | 项 | 价值 | 做 / 不做 | 理由 | 改动面 / 风险 |
|---|---|---|---|---|---|
| A1 | `courses.ts` 两门课 description「24 课」→ 26 课 | **高** | **做** | 首页课程卡片**直接渲染**该文案，是用户第一眼可见的数字错误；两行字符串、零逻辑 | 1 文件 2 行；跑 `verify` + `smoke` 即可 |
| A2 | README:13「零额外运行时依赖」+ 补一句助学 Agent 依赖 | **高** | **做** | 与 27 个 `dependencies` 直接矛盾，损害项目介绍可信度；一行改写 | 1 文件 1–2 行；零风险 |
| A3 | README 完整路由清单 / 助学 Agent 特性介绍 | **中低** | **不做（或搭 A2 顺手）** | 属「新增介绍内容」而非纠错；路由表已有两门课与 `/settings/llm` 概括行，边际收益小 | 1 文件；可与 A2 合并但不要扩成重写 |
| A4 | `scripts/smoke.py` 注释与默认 3100 | **中** | **可做，但需先解约定冲突** | 直接 `python scripts/smoke.py`（不带 `--base`）必然连不上 3199，是真实踩坑点；但 `AGENTS.md` §2 明确「脚本文件保留不变」，改脚本等于推翻已落盘决策 | 改 1 个默认值 + 2 行注释；按约定 `AGENTS.md` 只能**追加新行**声明口径变更，不能修订原行 |
| A5 | README `EffectCourseData` | **无价值** | **不做** | 见 §0：类型别名仍在用，原文正确 | — |
| A6 | `AGENTS.md` 历史行 / 历史日志 / `.data/` 缓存 | **不做** | **不做** | 用户永久约定保护；现行口径已由 00036 追加的相邻行给出 | — |
| A7 | `analytics.ts` 目录化 | **低（负收益）** | **不做** | 506 行是共享闭包状态机，拆分要重写状态模型并撞 `use-learning.ts` 的 `TS2322`；00034 §6.3 已充分论证 | 高回归风险 |

**A 层结论**：6 类里只有 **A1 + A2** 值得做（合计 3 行、用户可见、零风险），A4 需要先确认是否愿意推翻「脚本保留不变」的旧决策。

---

## 4. B 层：更早的功能性遗留逐项评估

| # | 项 | 价值 | 做 / 不做 | 理由 | 改动面 / 风险 |
|---|---|---|---|---|---|
| B1 | **LLM 网络错误诊断**（`Failed to fetch` → 可操作提示） | **最高** | **做** | 00030 实证：本地端点 OPTIONS 405 时用户只看到英文 `Failed to fetch`，无法判断是 CORS / Mixed Content / 端点未启 / HTTP 密钥；这是唯一被真实用户旅程撞到过的缺陷 | `llm.ts` 1 处映射 + 错误文案；确定性断言可进 CI；低风险 |
| B2 | **CI 加运行时冒烟** | **高** | **建议单独立项、先验证可行性** | CI 目前只到 `build`，PR 合并前没有任何 SSR / 视口回归；这是**保障缺口**而非 bug。但 `smoke.py` 依赖本机 Chrome + 需起 wrangler 后台服务，Linux runner 环境可能 flaky | 改 workflow 1 文件；需先跑一次 `gh workflow run` 验证，成本高于收益不确定性 |
| B3 | **60s 整次超时改为「首帧 + 总时长」或可配置** | **中高** | **可做** | 慢模型 / 超长回答会在首个 token 之前就被 60s 掐断；00030 长回答已贴近边界 | `makeController` 逻辑改动，需区分 first-token / total；中风险，要补 SSE 时序断言 |
| B4 | 真实端点 CORS（15721 的 OPTIONS 405） | **高（条件性）** | **不在代码里做** | 若用户要用该本地端点，这是阻断项；但根因在代理服务，产品代码加服务端代理属架构决策，00030 已明确不做 | 环境侧配置，非仓库改动 |
| B5 | HTTPS 线上 Mixed Content 未验 | **中** | **不做（无环境）** | 本地无法验证；需线上域名 + http 端点才有意义 | 需部署环境 |
| B6 | 真实模型「歧义先澄清」（Q6） | **中** | **暂不做** | 提示词效果不稳定，不能写硬断言；要改 `BASE_PERSONA` 并重新跑真实端点 6 题抽检，验证成本高 | 低风险但 flaky，人工抽检 |
| B7 | 多标签页 `storage` 监听 | **中低** | **不做** | 使用场景少；配置本就加密存 localStorage，跨页同步可能引入新的竞态 | 中风险 |
| B8 | 抽屉 Tab 焦点循环 trap | **低** | **不做** | 已有 `role=dialog` / `aria-modal` / Escape / 打开聚焦，仅缺循环；装了 `@nuxt/a11y` 但收益边际 | — |
| B9 | feed 虚拟化 | **≈0** | **不做** | 见 §0：`TUTOR_TURN_LIMIT=10` 已把消息截到 20 条 | — |
| B10 | 剩余 5 条 warnings / B 组 cfs / C 组边界断言 | **低（负收益）** | **不做** | 3 条纯风格项在迁移内核里收益≈0；2 条断言按踩坑库明令保留（换成注解会触发 `TS2322`）；`svg()` 按 00033 决策保留 | — |
| B11 | 组合句强导航误判 | **低** | **不做** | 00031 已用「改用 AI 回答」按钮兜底，用户可一键转 LLM | — |

---

## 5. 推荐（按 ROI 排序，做 / 不做表格）

| 优先级 | 项 | 做 / 不做 | 一句话理由 |
|---|---|---|---|
| P0 | B1 LLM 网络错误诊断 | **做** | 唯一被真实用户旅程撞到、且改动最小 |
| P0 | A1 `courses.ts` 描述数字 | **做** | 首页卡片可见的事实错误，两行 |
| P0 | A2 README 依赖表述 | **做** | 与 27 个依赖直接矛盾，一行 |
| P1 | B2 CI 加 smoke | **先验证再决定** | 保障缺口价值高，但环境依赖可能 flaky；单独立项 |
| P1 | B3 超时策略 | **可做** | 影响长回答可用性，需补 SSE 断言 |
| P2 | A4 smoke 默认值 | **需用户先解约定冲突** | 真实踩坑点，但与 `AGENTS.md`「脚本保留不变」冲突 |
| — | A3 / A5 / A6 / A7、B4–B11 | **不做** | 误判、约定保护、收益≈0 或风险 > 收益 |

**建议批次**：P0 三项合并成一个小任务（3 个文件、约 5 行改动 + 1 处错误文案映射），一次门禁即可；P1 各自单独立项，不要混进文档批次。

---

## 6. 验证方案（若后续授权实施，须另起新编号任务）

- P0 批次：`fmt:check → lint → typecheck → verify → build`，`lint/typecheck` 保持 **3/5 warnings**；B1 需给 `llm.ts` 的错误映射补确定性文本断言（可进 CI，不依赖真实模型）。
- A1/A2：抽查首页与 `/courses/*` SSR HTML 含「26 课」且不含「24 课」；README 文本复核。
- B2：先 `gh workflow run` 做 workflow 解析校验，再确认 runner 能找到 Chrome 且 wrangler 后台服务就绪。
- 任何实施都按 §11 先建新编号 overview，**不得追加到本目录**。

---

## 7. 本次结果

- 纯只读评估：核实 12 组事实，产出 3 张做/不做表与 ROI 排序；**未修改任何产品代码 / 数据 / 配置**。
- 只新建本记录 `docs/00037-backlog-value-review/overview.md`，并在 `docs/README.md` **追加一行**索引；既有行与全部历史任务记录零改动。
- 追加 `.workbuddy/memory/2026-11-14.md` 一段；未执行任何 git 写操作。
