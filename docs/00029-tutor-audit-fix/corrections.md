# 00029 · 对 00028 文档契约的校正声明

> 项目约定：「新任务必须新建目录，不要追加到旧文件或旧目录；旧结论失效时在新目录说明」。
> 因此本文件是 00028（`overview.md` / `tech-design.md`）失真表述的**唯一校正入口**，00028 目录内文件一律未改动。
> 触发：2026-11-14 全量审计（静态逐条核对 + 真实浏览器动态验证）。以下每条均为**已核实的事实**，不是推测。

**读法**：凡 00028 与本文件冲突处，**以 00029 为准**。

---

## D1 · 上下文注入位置（human prompt → system prompt）

- **00028 原表述**：`overview.md` 需求结论表第 20 行「当前页面上下文……经 **human prompt** 注入」；`overview.md` 第 38 行「装配 system prompt + human prompt 上下文」。
- **事实**：实现把课程 / 课时 / 概念 / 学情摘要全部写进 **system prompt**（`context.ts` 的 `buildSystemPrompt` → `contextBlock`）。请求体为 `[{ role:'system', ... }, ...历史]`，用户轮次只有学生原话。
- **校正为**：上下文经 **system prompt** 注入。理由：不污染用户轮次、便于把冻结快照与档位提示词一起缓存；比原方案更合理，实现保持不动。
- **实证**：动态探针读取 mock 端点记录的 `messages[0]`，确认其 role=`system` 且含冻结上下文，`messages` 末帧为用户问题；首页不含「学情摘要」（见 B1）。

## D2 · 函数签名与职责归属

- **00028 原表述**：`tech-design.md` §2.1 契约表写 `streamChat(cfg, messages, onDelta, signal): Promise<void>`、`snapshotContext(page): ContextSnapshot`「收集课程/课时/概念/学情」；`tech-design.md` §3.1 时序图同样写 `llm.streamChat(...)`。
- **事实**：
  - `llm.ts` 实现为 `chatStream(cfg, messages, opts: ChatStreamOpts): Promise<string>`（`opts` 含 `onDelta` / `signal` / `timeoutMs`），返回完整文本而非 void；另有非流式 `chatOnce(cfg, messages, opts)`。
  - `context.ts` 实现为 `makeSnapshot(input: SnapshotInput): ContextSnapshot`，是**纯透传**；富上下文（课程数据解析、课时字段、`overall/diagnose` 学情摘要）全部由 `use-tutor.ts` 的 `buildSnapshot()` 收集后传入。
  - `buildMessages(conv)` 仍按冻结快照 + 最近 10 轮组装，但 `use-tutor.ts` 的 `requestMessages()` 以 **feed** 为唯一真实来源覆盖 `conv.messages`（00028 实施结果已记录该关键约定）。
- **校正为**：按上述真实签名与职责归属理解 §2.1 契约表。引擎层「纯计算」边界不变，浏览器 API 仍在 composable 侧。
- **00029 追加变更**：`ensureMain(lessonKey, snapshotFactory)` 第二参改为**惰性工厂**，已有主会话时不再求值 `buildSnapshot()`，真正落实「打开不重组」；`createMain` 仍直接收快照。

## D3 · z-index 阶梯与笔误

- **00028 原表述**：`overview.md` 需求表第 18 行、`tech-design.md` §3.5 写「backdrop < FAB(z≈40) < 抽屉(z≈50)」；`overview.md` 实施结果第 112 行写「backdrop 64 < fab 62 < drawer 66」（数字关系本身是笔误）。
- **事实**：实际阶梯为 `nav 45 / sidebar 60 / fab 62 / tutor-backdrop 64 / tutor-drawer 66`。FAB（62）**低于** backdrop（64），但 `tutor-fab.vue` 在抽屉打开时 `v-show="!isOpen"` 隐藏，故不产生遮挡冲突。
- **校正为**：以实际数值与「隐藏机制」为准；「64 < 62」是笔误，不作为设计结论。

## D4 · XSS 处理顺序写反

- **00028 原表述**：`tech-design.md` §4「所有 LLM 文本**先 `DOMPurify.sanitize`，再 markdown-it 渲染**」。
- **事实**：顺序写反且无效——先净化纯文本再渲染 Markdown，渲染仍可能产出不安全 HTML。实现为 `markdown-it({ html: false }).render(content)` → `DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })`（仅客户端）→ 代码块经 `highlight.ts` 的 `esc` 全转义；SSR 分支由 `html:false` 保证只输出已转义 HTML。`overview.md` 实施结果第 113 行已记录正确顺序。
- **校正为**：以上述实际顺序为准。动态探针实测 LLM 输出含 `<script>` 时页面无脚本节点、无执行，加粗 / 代码块 `tok-*` / 链接均正常渲染。

## D5 · 导航层调用范围（决策：改文档，不补实现）

- **00028 原表述**：`tech-design.md` §2.1 表格写 `navigate.ts`「直接调 `recommend` / `reviewQueue` / `diagnose`，把 `lessonId`/`cid` 解析成可跳转的 `lessonPath` / **概念锚点**」；§3.2 时序图同样列 `diagnose`。
- **事实**：`buildNavCards(course, state, engine, base)` 只调 `recommend` 与 `reviewQueue`；`diagnose` 已由 `use-tutor.ts` 的 `learningSummary()` 用于学情页的薄弱归因文本；概念卡统一跳课时页（`${base}/lessons/<id>`），不生成概念锚点。
- **决策**（用户审核通过，采用建议①）：**声明校正为「只用 `recommend` + `reviewQueue`；`diagnose` 用于学情摘要；概念卡统一跳课时页」**，不补实现。理由：需求结论表未要求 `diagnose` 进卡片；概念锚点需给课时页模板加稳定 id，会触碰课程数据契约，违反本任务 §1 边界。
- **00029 追加变更**：`base` 由可选改为**必传 `string`**，杜绝缺省时拼出 `/lessons/<id>` 这种脱离课程前缀的错路径，并删掉 `?? rec.next.lesson.id` 死兜底。

## D6 · 学情导出边界（需求已天然达成）

- **00028 原表述**：`overview.md` 变更计划第 64 行「学情导出流程**新增**「排除 LLM 配置与对话历史」的边界」；`tech-design.md` 第 14 行称该边界落在课程设置页。
- **事实**：实现**未加任何导出边界代码**。`analytics.ts` 的 `exportState()` 只序列化 `LearningState + exportedAt + courseVersion`；LLM 配置在 localStorage、对话在 OPFS，本就不在导出对象里，需求天然满足。
- **校正为**：「需求已达成、无需边界代码」。00029 通过 `scripts/verify-tutor.mjs` 的显式断言（导出 JSON 不含 `apiKey` / `messages` / `conversations` 等键）把该结论固化成可复现回归，避免以后误以为漏做。

## D7 · 依赖版本锁定（已改代码）

- **00028 原表述**：`tech-design.md` §2.5「安装后在 `package.json` 锁定版本」。
- **事实**：00028 实施时用了 `^` caret：`^3.4.17` / `^15.0.3` / `^14.2.0`，且 `@types/markdown-it@14` 配 `markdown-it@15` 主版本不一致。
- **00029 处理**：三个依赖改为精确版本 `dompurify@3.4.17`、`markdown-it@15.0.3`、`@types/markdown-it@14.2.0`，并同步 `pnpm-lock.yaml`。
- **主版本差异说明**：已核实 npm registry 上 `@types/markdown-it` 最新发布版本即 `14.2.0`，**不存在 15.x**；`markdown-it@15` 的类型 API 兼容性由 `pnpm typecheck`（0 errors）验证。保留 14.2.0 是唯一可行选择，不是遗漏。

## D8 · `overview.md` 重复章节

- **事实**：`docs/00028-tutor-agent/overview.md` 存在两个同名 `## 待实施时确认的小项` 章节（第 66 行与第 84 行），内容重复。
- **校正为**：**以第一个（66–71 行）为准**，第二个（84–88 行）为重复块。按项目约定不改写旧目录文件，仅在此声明。

---

## C3 · 移动端底部 sheet 尺寸（决策：改文档，不实现拖拽）

- **00028 原表述**：`tech-design.md` §2.2 写「移动底部抽屉……**可拖拽到 90vh**」。
- **事实**：`tutor-drawer.vue` 只有 `height: 75vh; max-height: 90vh`，无拖拽交互。
- **决策**（用户审核通过，采用建议①）：校正为「**固定 75vh / 最大 90vh 的底部 sheet**」，不实现拖拽把手。理由：需求结论表只要求「移动底部抽屉」；拖拽需新增 Pointer Events 生命周期管理，易与 `.td-body` 消息区滚动产生触控冲突，收益低于风险。

## 附加决策记录

- **D4 决策（错误码扩展）**：采纳建议——`LlmErrorCode` 新增 `'http'` / `'aborted'`，使 500/404 与外部取消不再误报 `parse` / `timeout`。注意此 D4 是 `fix-plan.md` E1 的决策编号，与本文件 D4（XSS 顺序）是不同条目，勿混淆。
- **F2 决策**：mock 端点与 CDP 探针落仓库 `scripts/`，不挂 CI（依赖本机 Chrome + wrangler），在 `AGENTS.md` §2 登记人工命令。

## 本任务新增的实现级约定（00028 未记载）

1. **feed 唯一真实来源**：LLM 请求体由 `use-tutor.ts` 的 `requestMessages()` 从渲染流 `feed` 合成，绝不直接依赖 `conversation.messages`（`withGroup` 在 OPFS 模式返回新副本、内存兜底模式又与 `conv` 同引用，会「缺消息」或「重复计数」）。
2. **OPFS 降级**：`tutorDir()` / `withGroup()` / `getTutorConfig()` 三层均有 try/catch，任何异常退化为内存态并给出内联提示，不产生 `unhandledrejection`。
3. **清除语义**：`clearAll()` 按 `tutor/` 目录实际内容枚举删除全部 `.json`，不依赖硬编码文件名或内存 Map。
4. **学情注入范围**：新增 `isLearningPage()`，与提示词档位 `pageKindOf()` 解耦；只有 `/courses/*/review|dashboard` 才自动插入学情导航卡与「学情摘要」。
5. **意图路由**：`NAV_RE` 收紧为短语级强信号，并对答疑语境加负向护栏；用例表固化在 `scripts/verify-tutor.mjs`。
