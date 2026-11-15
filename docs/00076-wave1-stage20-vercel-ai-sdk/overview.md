# Wave 1 第十八批：Stage 20 Vercel AI SDK 两课（L106–L107）

## 目标

重写模块七第四个框架专论（2 课）。Vercel AI SDK 的定位与前面三个都不同：它**不提供编排范式、也不做成套件**，
只聚焦「模型交互层」——把 generate / stream / tool / provider 这套「调模型」的事做薄、做标准。

写作风险是容易写成「API 速查」。统一定位：**它的价值在「provider 抽象」与「流式/结构化输出的统一接口」**，
每课都要落到「同一段逻辑，三框架（手写/L89 路由）对照下省在哪、锁在哪」。

按 00055 下限：两节均为 framework（正文 1500 / 代码 1000）。

## 现状

| 课 | 课型 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|---|
| L106 | framework | 核心概念：ai 包 / provider / tool / streaming | 218 / 1500 | 389 / 1000 |
| L107 | framework | 对照：重写工具调用 + 流式 + 模型路由（对比 L42 / L89） | 219 / 1500 | 383 / 1000 |

## 课型复核

- L106：交付物是四个概念的可运行最小实现 → framework ✓（与前三框架同口径）
- L107：交付物是完整重写的工具调用 / 流式 / 路由 → framework ✓

**两节原标注正确。**

## 分工

| 课 | 唯一要回答的问题 | 明确不讲 |
|---|---|---|
| L106 | 四个概念各抽象哪一层，provider 抽象为什么是关键 | 完整编排（L104）、MCP（L45） |
| L107 | 同段逻辑下 AI SDK vs 手写 FC 运行时 vs L89 路由的差异 | Mastra 成套件（L103） |

## 术语统一

- **provider 抽象**：把「openai / anthropic / 本地」等模型供应商统一成同一组调用接口。
- **聚焦模型交互层**：AI SDK 不管 agent loop、不管状态机，只管「调一次模型要的活」。
- **streamText / generateText**：流式 vs 一次性；返回结构统一（text / toolCalls / usage）。
- **结构化输出（generateObject）**：用 zod schema 约束模型返回 JSON，替代手写解析。

## 变更计划

1. L106：以「三个模型三套 fetch 解析」开场；四概念抽象层对照表；最小 generateText + tool + streamText 实现；与 L36/L42 的定位差异。
2. L107：重写工具调用（对比 L42 FC 运行时）、流式（对比手写 SSE）、模型路由（对比 L89 provider 切换）；给 provider 抽象带来的「路由即换字符串」收益与锁定点。
3. 每节 ≥1 表格、≥2 callout、≥1 代码块；双扫描；`--update-baseline`；全门禁。

## 验证方案

- `content-gate --only=L106,L107` 两节 ✓ 且余量 >50。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿；`tmp-backtick.mjs` + `tmp-escape.mjs` 双扫描干净。

## 实测（实施后回填）

<section id="result">

两课均为 framework（正文 1500 / 代码 1000），全部达标且留有余量：

| 课 | 课型 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|---|
| L106 | framework | 核心概念：ai 包 / provider / tool / streaming | 1558 / 1500 | 1029 / 1000 |
| L107 | framework | 对照：重写工具调用 + 流式 + 模型路由（对比 L42 / L89） | 1623 / 1500 | 1040 / 1000 |

- L106 用「三个模型三套 fetch 解析」开场，给四概念抽象层对照表 + 常被忽略的 `generateObject` 结构化输出 + 与另三框架的定位对照表（边界最小 → 叠加性最强）。L107 用「200 行手写运行时重写后 40 行」开场，给四段对照（工具调用 vs L42 / 流式 vs SSE / 路由 vs L89 / 结构化抽取 vs JSON.parse），落点是「AI SDK 接管动词『调模型』，不接管状语『为什么调、调完怎么办』」。
- 初稿两课均低于 framework 下限（L106 1066/610、L107 1197/768）——因在 baseline 豁免里 gate 不报红，已各自补 `generateObject` 与「重写不适用情况」两节达标。教训重申：**gate 报豁免时仍要手动核 raw 计数过线**。
- 全局达标 96 → **98/142**，豁免 46 → 44。verify 四段、lint 0e/4w、typecheck 0e/9w 全绿。

</section>
