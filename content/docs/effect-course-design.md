---
title: Effect 4.1.4 深度课 · 教学设计说明书
description: 6 阶段 24 课的学习路径、知识点依赖图、学情模型公式与长期扩展机制
updatedAt: 2026-11-13
---

# Effect 4.1.4 深度课 · 教学设计说明书

> 面向「想真正理解 Effect 为什么这样设计」的学习者，而不是只想查 API 的人。
> 版本基线核实日期：2026-11-13。

---

## 0. 版本基线（先钉死，再设计）

| 项目 | 结论 | 依据 |
|---|---|---|
| 课程主线 | **effect@4.1.4** | npm registry `latest` dist-tag |
| 其他 dist-tags | `prev: 3.22.4`、`rc: 4.0.0-rc.118`、`beta: 4.0.0-beta.107` | npm dist-tags |
| 4.0 稳定发布 | 2026-09-30，「Rebuilt from the ground up」 | 官方发布公告 |
| LTS | 4.x bug 修复至 2029-09（或 5.0 后 1 年）；安全修复至 2029-09（或 5.0 后 2 年） | 官方公告 |
| 官方文档 | `effect.website/docs/v4/`（`/docs/` 重定向到 v4 onboarding） | 官网 |
| 包形态 | 单包 `effect`，**零运行时依赖**；`effect/http`、`effect/schema`、`effect/sql`、`effect/rpc`、`effect/ai`、`effect/workflow` 等子路径 | npm 4.1.4 exports |
| 官方基准 | 最小包 35.6→7.1 kB；吞吐 0.71M→4.57M tasks/s；5 万 fiber 堆 157.5→21.8 MB | 官方公告 |
| 稳定性 | 模块带 `@stability stable / unstable / experimental`；全生态版本锁步 | 官方迁移指南 |

**纯 v4 主线**：全部代码与原理按 4.1.4 讲，不引入旧版本 API。课程中特别标注了一处官方文档不一致：并发章节的部分打印示例仍出现树形 Cause 输出，而 v4 的 Cause 模块是扁平 `reasons` 数组，以模块文档为准。

内容中已核对的 v4 事实（避免按旧资料教错）：
- `Effect<Success, Error, Requirements>`；`Effect.Success / Error / Services` 提取工具
- `Context.Service`、`Context.make`、`Service.use()`；`Effect.run*With(context)`
- `Effect.forkChild / forkDetach / forkScoped / forkIn`；`Fiber.join / await / interrupt`；`interruptUnsafe()`
- `Cause { reasons: ReadonlyArray<Fail | Die | Interrupt> }`；`Cause.combine / hasFails / hasDies / hasInterrupts / pretty`
- `Effect.catch / catchTag / catchDefect / catchCause / exit / result`；`Effect.retry / timeout`
- `Layer.succeed / effect / scoped / merge / provide / provideMerge`；`acquireRelease`、`Effect.scoped`、`addFinalizer`
- `MixedScheduler`、`MaxOpsBeforeYield = 2048`、`PreventSchedulerYield`、`SchedulerDispatcher` 优先级桶
- `ManagedRuntime.make`（首次构建失败会被缓存，不自动重建）

---

## 1. 教学目标与受众

**受众**：有 TypeScript / Promise / async-await 经验，但没有系统学过 effect system 的工程师。不要求函数式编程背景。

**总目标**：能独立讲清「一个 Effect 从构造、组合、装配依赖，到被 root fiber 解释、被调度器让出、最终产出 Exit」的完整链路，并能在真实项目里渐进落地。

**三层认知目标**：

| 层 | 问题 | 覆盖课时 |
|---|---|---|
| L1 架构设计 | 为什么把程序建模成值？三通道如何把架构写进类型？ | S0 / S1 / S3 / S5 |
| L2 运行原理 | 错误、依赖、资源、并发分别由什么机制保证？ | S2 / S3 / S4 前半 |
| L3 底层逻辑 | 指令树长什么样？runLoop 如何解释？调度器何时让出？中断如何注入？ | L18 / L19 / L20（课程核心，标 ★） |

---

## 2. 平缓学习路径（6 阶段 × 4 课 = 24 课）

设计原则：**每个新概念至多依赖 1–2 个已学概念**；先把「能跑起来」的心智模型建立好，再引入抽象；底层原理放在第 4 阶段，此时学习者已有足够的具体经验支撑抽象。难度按 1→5 递进，阶段 4 是唯一的陡坡，用 3 个交互演练拆解。

| 阶段 | 课时 | 标题 | 分钟 | 难度 | 核心概念 | 交互演练 |
|---|---|---|---|---|---|---|
| **S0 心智模型与准备** | L01 | 为什么需要 Effect：TypeScript 的四个缺口 | 20 | 1 | 程序即值 | 惰性蓝图 |
| | L02 | 程序即值：Effect<Success, Error, Requirements> | 25 | 1 | 三通道、惰性 | 三通道拼装台 |
| | L03 | 安装、配置与第一次运行 | 20 | 1 | 运行边界 | 惰性蓝图 |
| | L04 | pipe、Effect.gen 与组合的本质 | 30 | 2 | 组合、yield* | 惰性蓝图 |
| **S1 核心值与组合** | L05 | 构造子全景 | 25 | 2 | 构造子、预期错误 | 三通道拼装台 |
| | L06 | 组合与变换 | 30 | 2 | 组合子、并发选项 | 并发时间轴 |
| | L07 | 类型是怎么长出来的：E 与 R 的累积 | 30 | 3 | 通道累积 | 三通道拼装台 |
| | L08 | 运行边界与 Exit | 25 | 2 | Exit / Result | 惰性蓝图 |
| **S2 错误与诊断** | L09 | 两类错误：failure 与 defect | 25 | 2 | 预期错误、缺陷 | Cause 构建器 |
| | L10 | Cause 的底层结构：扁平 reasons 数组 | 35 | 4 | Cause.reasons | Cause 构建器 |
| | L11 | 恢复策略与重试边界 | 30 | 3 | 恢复、Schedule | 重试策略 |
| | L12 | 可观测性：日志、追踪与失败报告 | 25 | 2 | 日志与追踪 | — |
| **S3 依赖与资源** | L13 | Context.Service：类型化的服务键 | 25 | 2 | 服务键 | 依赖图 |
| | L14 | Layer 是构造配方 | 30 | 3 | Layer 三段式 | 依赖图 |
| | L15 | 依赖图与记忆化 | 35 | 4 | merge/provide | 依赖图 |
| | L16 | Scope 与资源安全 | 35 | 4 | finalizer LIFO | finalizer 栈 |
| **S4 并发与运行时底层 ★** | L17 | Fiber：虚拟线程与运行中的 Effect | 35 | 3 | Fiber 生命周期 | 监督树 |
| | L18 | ★ 指令解释器：Effect 蓝图与 runLoop | 45 | 5 | 指令树、trampoline | 单步解释器 |
| | L19 | ★ Scheduler：协作让出与公平性 | 40 | 5 | 操作预算 2048 | 调度模拟 |
| | L20 | ★ 结构化并发与异步中断 | 45 | 5 | 四种 fork、中断传播 | 监督树 |
| **S5 流、调度与工程化** | L21 | Stream：零到多个值与背压 | 35 | 3 | pull-based | 背压模拟 |
| | L22 | Schedule：把重试策略变成值 | 30 | 3 | 退避与抖动 | 重试策略 |
| | L23 | 并发原语与 STM | 30 | 3 | Ref / STM | 并发时间轴 |
| | L24 | 生态、稳定性与渐进落地 | 30 | 2 | 子路径 / 稳定性 | 依赖图 |

合计约 **12 小时** 净学习时长，建议按 25–30 分钟/天推进，约 4–5 周完成，之后进入长期复习。

**与官方 learning spine 的关系**：官方 onboarding 的 5 步（core idea → setup → first program → errors → concurrency）被完整包含在 S0–S2、S4；本课程在其之上补了三块官方不展开的内容：① 依赖图与资源生命周期的类型演算；② runtime 内部执行链；③ 学情驱动的复习节奏。

---

## 3. 知识点依赖图

26 个概念节点，每个带 `stage / weight / prereqs`。引擎据此做前置缺口归因。主干：

```
program-value → three-channels → composition → gen → type-accumulation
                     ↓                                   ↓
                  laziness → runners → exit        typed-error → defect → cause → recovery
                     ↓                    ↓                                   ↓
                   fiber → runloop → scheduler              context → layer → layer-graph
                     ↓                                              ↓
                  concurrency → stream                          scope
                     ↓
                    stm                              schedule ← recovery
                                              ecosystem ← layer-graph + context
```

- `runloop` 与 `scheduler` 权重 4（最高），是「底层逻辑」的考核重点。
- 前置未达 70 分的概念会在诊断里被标为「前置缺口」，而不是笼统地判为「没学会」。

---

## 4. 单课时结构（固定模板，降低认知负荷）

1. **目标**（2 条可验证的行为目标）
2. **知识块**：prose 讲解 / code 示例（带语法高亮与一句提示）/ callout（tip 提示、warn 易错、deep 底层）/ list 对照表，每课 3–4 块
3. **交互演练**：11 个可复用组件之一，必须动手操作才计入学情
4. **关键术语** + **常见误区**（每课 1–2 条，直接写学习者最常犯的错）
5. **随堂测验**：每题即时反馈 + 解析 + 概念标签，可重做
6. **完成按钮**：写入进度并解锁路径下一课的推荐

交互组件清单：三通道拼装台、惰性蓝图、单步指令解释器、调度模拟、Cause 构建器、Layer 依赖图、finalizer 栈、Fiber 监督树、并发时间轴、Stream 背压、Schedule 重试策略。全部零依赖 SVG/DOM 实现，离线可用。

---

## 5. 学情分析模型

### 5.1 数据采集
- 课时访问次数、停留时长（进入/离开计时）
- 每次答题：`ts / lessonId / qIndex / correct / concept / isReview`
- 演练完成标记、课时完成时间、每日会话汇总
- 全部存 localStorage，键 `effect-course-state-v1`，可导出 JSON

### 5.2 概念级掌握度

```
mastery = 100 × (0.30·recent + 0.20·accuracy + 0.25·retention + 0.25·exposure)

recent    = 最近 5 次作答按 exp(-Δt / 14天) 加权的正确率
accuracy  = (correct + 1) / (total + 2)              // 拉普拉斯平滑，避免 1 题满分
retention = exp(-Δt / S)                             // 艾宾浩斯式遗忘
exposure  = min(1, total / 4)                        // 样本不足不轻易判「掌握」
```

记忆稳定度 S（天）随复习演化：
- 答对：`S ← min(90, S × (1 + 0.8·(1 − R)) + 0.6)`
- 答错：`S ← max(0.5, S × 0.55)`

状态：`≥80 牢固` / `≥60 发展中` / `<60 薄弱` / 未接触。阶段掌握度按概念权重（2–4）加权平均。

### 5.3 诊断规则（按优先级归因）

| 条件 | 归因 | 建议动作 |
|---|---|---|
| 前置概念 mastery < 70 | 前置缺口 | 回到前置课时重做测验 |
| retention < 0.6 且 accuracy ≥ 0.65 | 遗忘型 | 加入今日复习队列 |
| accuracy < 0.6 | 误解型 | 重读「常见误区」+ 重跑交互演练 |
| 其余 | 练习不足 | 补 2–3 道同概念题 |

### 5.4 复习调度
`retention < 0.82` 进入复习队列，按 retention 升序排列；复习答对会拉长 S，从而把下次复习推远。复习中心可随机抽该概念的题，错题本保留最近 12 条错误记录并支持一键回到原课时。

### 5.5 视图
- 课程地图：阶段卡片（掌握度 / 完成数）+ 全部课时 + 下一步建议
- 学情仪表盘：4 个 KPI、六维能力雷达、阶段与概念掌握度条、14 天时长柱状、薄弱点归因
- 复习中心：遗忘队列 + 抽题复习 + 错题本
- 教学准备：版本基线、扩课机制、课时级质量表

---

## 6. 长期教学准备

1. **内容层独立**：所有课时、概念、题目集中在 `app/data/effect-course.ts`。新增课时只需追加一项 `L(...)` 并在 `CONCEPTS` 登记，地图、侧栏、雷达、复习队列、诊断全部自动接入。
2. **引擎与视图解耦**：`app/lib/analytics.ts`（模型）、`app/lib/widgets.ts`（演练）、`app/pages` + `app/components`（Vue 视图）、`app/assets/css/main.css`（外观）互不依赖具体实现，可单独替换。
3. **版本更新机制**：升级 Effect 时只需更新 `META` 的版本号、核实日期与 LTS 说明，并复核受影响的课时代码；教学准备页集中列出需要复核的 v4 事实清单。
4. **数据可迁移**：学情档案为显式 v1 schema，导出/导入 JSON 可跨设备、跨浏览器迁移；未来改 schema 只需补一个 `importState` 迁移分支。
5. **质量闭环**：某课时正确率长期 < 55%（≥3 次作答）自动标记「需修订」，提示拆细课时或重写讲解；课时表还记录访问、停留、重做次数、演练完成率，用于判断是「内容难」还是「没人看」。
6. **教学节奏**：建议 25–30 分钟/天；连续学习天数、每日目标、累计时长都在本地记录，不上传任何数据。

---

## 7. 运行与维护

- 本课程已迁入 **Nuxt 4 知识岛站点** `yuanwu-knowisle`，作为 `/courses/effect-ts` 下的一门课程实体；站点首页 `/` 是课程岛。
- 运行：`pnpm dev`（开发）或 `pnpm build && PORT=3100 node .output/server/index.mjs`（生产预览）。
- 内容、引擎、演练、视图四层解耦：`app/data/effect-course.ts` 是唯一内容源，`app/data/courses.ts` 是课程注册表，`app/lib/analytics.ts` 是学情引擎，`app/lib/widgets.ts` 是 11 个演练内核，`app/components/course/*` 与 `app/pages/courses/[slug]/*` 是 Vue 视图。
- 浏览器需支持 ES2022+（Chrome / Edge / Firefox / Safari 近两年版本）。
- **移动端适配**（≤780px）：顶栏精简为「菜单 / logo / 版本 / 主题」，5 个主视图改固定底部标签栏（图标 + 短标签，触控高度 ≥48px）；24 课目录改左侧抽屉（遮罩、Esc、点击空白、切页自动关闭）；卡片单列或两列，KPI 两列；代码块、原理图示、课时数据表、14 天时间轴保留独立横向滚动并给出滑动提示；输入框 16px 防 iOS 自动缩放；适配 `viewport-fit=cover` 与刘海屏 `env(safe-area-inset-*)`；横屏矮视口与 `prefers-reduced-motion` 另有规则。
- 回归自检：`pnpm verify`（数据一致性 + 学情引擎全轨迹）、`python scripts/smoke.py --base http://127.0.0.1:3100`（11 条路由 SSR、客户端渲染、320/390/768/1440 四种真实视口的横向溢出与导航检查）。每次改动 `effect-course.ts`、引擎或样式后都跑一遍。
- 手机视口用 `scripts/cdp.py` 通过 CDP `Emulation.setDeviceMetricsOverride` 构造：无头 Chrome 的 `--window-size` 被钳在约 500 CSS px，测不到 390px。

## 8. 已知边界

- 交互演练是**原理模拟**，不是真实 Effect runtime；真实运行请用官方 Playground 或本地装 `effect@4.1.4`。
- 课程内容基于 2026-11-13 核实的 v4.1.4 文档与迁移指南；`unstable / experimental` 模块可能变化，涉及处已标注。
- 学情数据存在浏览器本地，清理浏览器数据会丢失，建议定期在「设置」导出备份。
