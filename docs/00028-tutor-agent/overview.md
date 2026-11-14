# 00028 · 助学 Agent（tutor-agent）

## 目标

在现有知识岛站点上，新增一个**按需唤起**的助学 agent：学生卡住时点悬浮球调出对话抽屉，agent 依据**当前页面类型**自动切换系统提示词，综合提供「答疑 / 苏格拉底式追问 / 路径导航」三类能力。

设计原则：

- **纯客户端**：无服务端 / Workers 依赖；LLM 走用户自持的 OpenAI 兼容端点。
- **混合数据源**：本地规则层只做「学情驱动的下一步导航 + 薄弱概念识别」（复用 `analytics.ts`，零 LLM 成本、离线可用）；一切内容性输出（答疑、误区检查点、苏格拉底追问）由 LLM 生成。
- **可降级**：未配置 key / 调用失败时，agent 退化为「本地导航模式」，站点其余功能不受影响。

## 需求结论（多轮问答收敛）

| 维度 | 结论 |
|---|---|
| 定位 | 综合伴学（D），**按需唤起**（非默认运行） |
| 唤起入口 | 全局**悬浮球**（右下角，避开 ≤780px 底部标签栏）；FAB + 抽屉都挂 `default.vue` 根部末尾，`position: fixed`，z-index：backdrop < FAB(z≈40) < 抽屉(z≈50)；全站点可见（含 teacher/design/settings） |
| 姿态切换 | **意图驱动**：无 UI 控件，由学生自然语言（"直接告诉我 / 考考我 / 下一步学什么"）触发，判定规则写进系统提示词 |
| 系统提示词 | 按**页面类型**自动切换（课程 / 概念 / 学情）；当前页面上下文（课程 slug、课时、选中概念等）经 **human prompt** 注入；**上下文快照在新建对话时执行一次并冻结进该会话**，同会话内发消息不再重组 |
| 学情上下文 | **仅学情页**自动注入 |
| 面板形态 | 桌面**右侧抽屉** / 移动**底部抽屉**（断点 780px，与现有布局一致） |
| LLM 契约 | OpenAI Chat Completions 兼容：`POST {baseUrl}/chat/completions`；字段 = baseUrl + apiKey + 模型名；baseUrl 完全自由（不做白名单，UI 提示需 OpenAI 兼容） |
| 配置存储 | localStorage + WebCrypto **AES-GCM** 加密，密钥 = SHA-256(设备指纹)；指纹漂移解密失败 → 明确提示"配置已重置，请重新配置"；UI 明示"配置绑定本机设备，key 保存在本机并随请求发出" |
| 对话历史 | 存 **OPFS**，按**会话组键（lessonKey）**组织：课时页=`课程-章节-课时`、课程内非课时页=`课程级共享`、**首页单独专用键**；每组含「主会话 + 若干普通会话」，打开抽屉默认加载该组主会话（无则新建），「新建对话」替换主会话且旧主会话降级可切回；**会话切换仅同组、不支持跨组，切换即更新该组主会话 ID**；每会话保留最近 **10 轮**（策略后续可调）；设置页提供清除入口；**学情导出 JSON 排除** LLM 配置与对话记录 |
| 本地导航呈现 | **摘要气泡（一句话理由）+ 结构化卡片**（课时 / 概念可点击跳转） |
| 降级容错 | 未配置 key → 抽屉可用、本地导航模式、LLM 功能内联引导去配置；调用失败（401/402/超时/网络）→ 对话流内插系统气泡 +「重试」「去设置」按钮 |
| 输出 | SSE **流式**逐字输出 |
| 设置入口 | **独立于课程**，放主页导航或侧边栏底部；抽屉内引导可跳转 |
| 消息渲染 | 对话消息支持 **Markdown** |

## 变更计划

### 新增模块（内容 / 引擎层）

- `app/lib/tutor/config.ts` — 加密配置存取（AES-GCM + 指纹派生密钥），暴露 `getTutorConfig` / `saveTutorConfig` / `clearTutorConfig`；指纹漂移时抛可识别错误。
- `app/lib/tutor/fingerprint.ts` — 浏览器设备指纹（canvas / WebGL / 字体 / 屏幕拼接 SHA-256）。
- `app/lib/tutor/context.ts` — 依页面类型装配 system prompt + human prompt 上下文；学情页注入 `analytics.ts` 结果；携带最近 10 轮历史。
- `app/lib/tutor/llm.ts` — OpenAI 兼容 `fetch` 客户端，`stream: true` SSE 解析，逐 token 回调；401/402/超时/网络错误结构化返回。
- `app/lib/tutor/navigate.ts` — 本地规则层：基于学情薄弱概念 + 课程阶段/前置关系推导「下一步导航」；产出结构化卡片数据。
- `app/lib/tutor/history.ts` — OPFS 读写对话历史，保留最近 10 轮，提供清除。
- `app/types/tutor.ts` — 相关类型（配置、消息、卡片、系统提示词档位）。

### 新增组件（视图层）

- `app/components/tutor/tutor-fab.vue` — 全局悬浮球。
- `app/components/tutor/tutor-drawer.vue` — 响应式抽屉（桌面右 / 移动底部），混排对话气泡与导航卡片。
- `app/components/tutor/tutor-message.vue` — Markdown 渲染消息气泡。
- `app/components/tutor/tutor-card.vue` — 导航卡片（课时 / 概念可跳转）。
- `app/components/tutor/tutor-system-note.vue` — 内联系统气泡（错误 + 重试 / 去设置）。

### 新增页面

- LLM 配置页（独立路由，如 `app/pages/settings/llm.vue` 或同级），含 baseUrl / apiKey / 模型名三字段 + 加密状态说明 + 清除入口；在**主页导航 / 侧边栏底部**挂入口，抽屉首屏可跳转。

### 依赖

- Markdown 渲染：建议 `markdown-it`（纯 JS、轻量）+ `DOMPurify`（LLM 输出 XSS 净化）。具体库与版本在实施时按「快 → 慢」门禁验证后锁定。

### 约定

- 新增文件统一 **kebab-case**；目录内 TS 值导入显式 `.ts`，类型走 `~/types` type-only。
- 三层解耦：`tutor/*` 属引擎 / 内容层（纯计算不碰 DOM），组件属视图层只渲染。
- 学情导出流程新增「排除 LLM 配置与对话历史」的边界。

## 待实施时确认的小项

- ~~非课时页的会话绑定策略~~ **已定**：课程内非课时页走 `${slug}:course` 课程级共享组，首页单独 `home` 专用组（见 tech-design §3.0 绑定表）。
- Markdown 库最终选型（markdown-it vs marked）与版本锁定。
- 设备指纹具体因子组合（避免过度依赖易漂移项）。
- 「10 轮」历史策略的后续调整点（预留常量 `TUTOR_TURN_LIMIT`）。

## 验证方案

1. 门禁（按 AGENTS.md 快 → 慢）：`pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` → `pnpm verify` → `pnpm build`，通过线 0 errors。
2. 功能冒烟（`pnpm build` 后 `pnpm exec wrangler --cwd .output dev --port 3199` + `python scripts/smoke.py --base http://127.0.0.1:3199`）：
   - 悬浮球在课程 / 概念 / 学情页均可唤起；桌面右抽屉 / 移动底部抽屉响应式正确。
   - 未配置 key：抽屉进入「本地导航模式」，导航卡正常，LLM 功能内联引导。
   - 配置 key：答疑 / 追问 / 导航三姿态按意图切换；Markdown 正确渲染；SSE 流式输出；导航卡可跳转课时 / 概念页。
   - 401 / 超时：对话流内系统气泡 +「重试 / 去设置」。
   - 配置加密：localStorage 中为密文；指纹漂移模拟（改指纹派生）后提示重置；学情导出不含 LLM 配置与对话。
3. 回归：`check-course.mjs`（课程数据完整性）不受影响；`analytics.ts` 纯计算无副作用。

## 待实施时确认的小项

- Markdown 库最终选型（markdown-it vs marked）与版本锁定。
- 设备指纹具体因子组合（避免过度依赖易漂移项）。
- 「10 轮」历史策略的后续调整点（预留配置常量）。

## 实施结果（2026-11-14）

分支 `feat/tutor-agent`。引擎层 7 文件、视图层 5 组件 + 1 composable、设置页、布局接入、依赖均已落地并通过全链路回归。

### 实际交付

| 层 | 文件 |
|---|---|
| 类型 | `app/types/tutor.ts`（含 `FeedItem` / `TutorNote` 视图层联合类型） |
| 引擎 | `app/lib/tutor/{fingerprint,config,context,llm,navigate,history}.ts` + 补齐 `chatStream`（SSE） |
| 编排 | `app/composables/use-tutor.ts`（useState 全局单例，配置→lessonKey→快照冻结→意图路由→流式） |
| 视图 | `app/components/tutor/{tutor-fab,tutor-drawer,tutor-message,tutor-card,tutor-system-note}.vue` |
| 页面 | `app/pages/settings/llm.vue`（三字段 + 连接测试 + 指纹漂移提示 + 清除配置/对话） |
| 接入 | `app/layouts/default.vue`（FAB + Drawer 挂根部；首页导航与侧栏底部「助手设置」入口） |
| 依赖 | `markdown-it@15.0.3`、`dompurify@3.4.17`、`@types/markdown-it@14.2.0` |
| 冒烟 | `scripts/smoke.py` 追加 `/settings/llm` SSR 路由断言 |

### 与原方案的差异（实施时收敛）

- **LLM 请求体以 `feed` 为唯一真实来源**：`history.ts` 的 `withGroup` 在 OPFS 模式每次返回新副本、内存兜底模式又与 `conv` 同一引用；若直接依赖 `conv.messages` 会「请求缺消息」或「重复计数」。`use-tutor.ts` 用 `requestMessages(conv)` 从渲染流合成历史（含冻结 snapshot + 最近 10 轮截取），OPFS 只负责持久化。
- **`NavEngine` 边界收口**：`analytics.ts` 是 `@ts-nocheck` 迁移内核，`prereqBlocked` 真实类型是 `boolean | null`、`lessonId` 可能 `undefined`；接口按真实形状放宽，未改迁移内核。
- **OPFS 方法名**：目录句柄用 `getDirectoryHandle`（原方案草稿误写 `getDirectory`），typecheck 的 `TS2339` 提前拦下这个运行时 bug。
- **z-index 阶梯**：现有 `nav 45 / drawer-backdrop 55 / sidebar 60`，故 tutor 取 `backdrop 64 < fab 62 < drawer 66`（fab 在抽屉打开时隐藏），保证抽屉盖住底部标签栏与侧栏。
- **Markdown 安全**：`markdown-it` 关 `html`，`fence` 自定义渲染复用 `highlight.ts` 的 `tok-*`；客户端再经 `DOMPurify.sanitize`（SSR 段只输出已转义 HTML）。scoped 样式对 `v-html` 节点用 `:deep()`。

### 门禁与回归（实测）

- `pnpm fmt:check` 0；`pnpm lint` **0 errors / 27 warnings**；`pnpm typecheck` **0 errors / 41 warnings**（warnings 主要来自 `no-unsafe-type-assertion`，通过线是 0 errors）。
- `pnpm verify` 两门课全绿（含学情引擎完整轨迹、导出导入、多课程隔离）。
- `pnpm build` **BUILD_EXIT=0**（37.6s，tutor 组件正确进 Workers bundle）。工具环境的 `node-safe-delete-shim` 会拦截 Nuxt 清自身构建缓存的批量删除（118>50），需对单次命令设 `CODEBUDDY_SAFE_DELETE_ENABLED=0`；已回写 `pitfall-resolver/nuxt-build.md`。
- `python scripts/smoke.py --base http://127.0.0.1:3199` **全绿**：18 条 SSR 路由（含 `/settings/llm`）、6 条客户端渲染、22 组真实视口（320/390/768/1440）无横向溢出。
- 额外交互探针（临时脚本，验后已删）：首页 / 学情页 / 课时页各 11 项，共 33 项断言全通过——FAB 可见且 fixed、抽屉唤起/关闭、未配置 key 显示「本地模式」+ 内联引导、会话组主会话建立、3 个快捷 chips、点击「下一步学什么」产出可跳转导航卡（`/courses/effect-ts/lessons/L01`）。

### 尚未覆盖（需真实 LLM 端点）

答疑 / 追问的 SSE 流式、Markdown 渲染、401/超时系统气泡与「重试」、配置加密落盘与指纹漂移重置、学情导出不含配置与对话——这些需用户自持 OpenAI 兼容端点 + 真实 key 才能端到端验证；本次仅验证了纯客户端可降级的本地导航路径与配置页 SSR。
