# 00029 · 逐条修复清单（待审核）

> 配套 `overview.md`。每条含：根因 → 修复动作 → 落点文件 → 单项验证。
> 编号与审计报告一一对应；验证阶段号见 `overview.md` §4。

---

## A 组 · P0 运行时缺陷（必须修）

### A1 · `clearAll()` 漏删课程会话文件

- **根因**：`names = new Set(['home.json'])` 再加 `memoryFallback.keys()`。OPFS 模式下内存 Map 恒为空，因此只删首页文件；`<slug>.json` 全部残留。设置页文案「会话与消息将全部删除」与实现不符，且涉及用户隐私承诺。
- **动作**：`tutorDir()` 成功后用 `for await (const [name] of dir.entries())` 枚举 `tutor/` 下所有 `.json` 并逐个 `removeEntry(name)`；不再依赖硬编码文件名与内存 Map。`memoryFallback.clear()` 保持独立执行（无论 OPFS 是否可用）。删除失败仍按现状静默跳过，不阻断 UI。
- **文件**：`app/lib/tutor/history.ts`
- **验证**：阶段 5。课时页产生 `effect-ts.json` → 设置页清除 → 断言 `tutor/` 目录为空（允许随后 `ensureMain` 重建的当前组空文件，但不包含历史消息）。

### A2 · OPFS / WebCrypto 异常时降级链断裂

- **根因**：三层都缺兜底——① `tutorDir()` 直接 `await navigator.storage.getDirectory()`（该方法可能不存在或抛 `SecurityError`）；② `withGroup()` 的 OPFS 分支 `readFile`/`writeFile` 无 try/catch；③ `loadConversation()` 只有 `finally` 无 `catch`，异常冒泡成 `unhandledrejection`，抽屉 `isOpen=true` 但 `feed=0` 空白。设置页 `refresh()` 同样无兜底，`loading` 永久为 true。
- **动作**：
  1. `opfsSupported()` 增加 `typeof navigator.storage?.getDirectory === 'function'` 检测；`tutorDir()` 整体包 try/catch，异常返回 `null`。
  2. `withGroup()` OPFS 分支整体 try/catch，任何读写失败时**回退到内存分支**（避免半写状态）。
  3. `config.ts` 的 `getTutorConfig()`：`await computeFingerprint()` 包 try/catch；`crypto.subtle` 不可用或指纹计算失败时返回 `{ status:'stale', config:null }`，不抛错。`saveTutorConfig()` 同步加保护，失败时向上返回可识别结果供 UI 提示（不改变现有返回类型则至少不抛未处理异常）。
  4. `use-tutor.ts` 的 `loadConversation()` 加 `catch`：降级为内存会话（用 `ensureMain` 的内存兜底路径），并 push 一条系统气泡说明「本机存储不可用，本次对话不跨刷新保存」；保证抽屉不空白、`busy` 复位。
  5. `settings/llm.vue` 的 `refresh()` 加 try/catch + `finally { loading.value = false }`。
- **文件**：`app/lib/tutor/history.ts`、`app/lib/tutor/config.ts`、`app/composables/use-tutor.ts`、`app/pages/settings/llm.vue`
- **验证**：阶段 5。覆写 `navigator.storage.getDirectory` 抛错 → 断言无 `unhandledrejection`、`feed>0`、可正常发本地导航消息；再模拟 `crypto.subtle.digest` 抛错 → 断言设置页不卡 `loading`。

---

## B 组 · P1 需求偏差（必须修）

### B1 · 学情上下文「仅学情页注入」被破坏

- **根因**：`pageKindOf()` 把首页 / 课程地图 / teacher / design / settings 兜底为 `'dashboard'`，把「系统提示词档位」与「是否学情页」两个语义混为一谈。`learningSummary()` 与 `rebuildFeed(intro)` 都以 `pageKind` 判定，导致首页开场插学情导航卡、LLM 的 system 首帧含「学情摘要」。
- **动作**：新增纯函数 `isLearningPage()`，仅当 `route.path` 以 `/courses/` 开头且含 `/review` 或 `/dashboard` 时为真；`learningSummary()` 与 `rebuildFeed(intro)` 的开场卡片改用它。`pageKindOf()` 保留 `'dashboard'` 作为兜底**档位**（不改 `PageKind` 类型、不动 `pageTone()` 的 switch），避免牵动类型契约。
- **文件**：`app/composables/use-tutor.ts`
- **验证**：阶段 5。首页打开抽屉无 `.tutor-navcard`、mock 记录的 system 首帧不含「学情摘要」；`/courses/effect-ts/dashboard` 打开抽屉有导航卡、system 含「学情摘要」。

### B2 · 意图正则过宽，答疑被截到本地导航

- **根因**：`NAV_RE` 含 `哪个 | 顺序 | 路径 | 路线 | 继续学 | 接下来 | 先学` 等泛词。实证「这两个操作符哪个先执行？」→ 本地导航卡（nav 1→2），LLM 请求 0 新增。
- **动作**：
  1. 收紧为**短语级强信号**：`/下一步|接下来学|学什么|学哪|学习路线|学习路径|导航|按.*顺序学/`，移除所有裸泛词。
  2. `detectIntent()` 加负向护栏：文本含 `为什么|原理|区别|报错|如何|怎么|是什么` 且**不含** `下一步|学什么|学哪` 时，一律返回 `'llm'`。
  3. 保留方案 §3.3 的既定语义：命中导航走本地卡片，其余交 LLM 由系统提示词自决三姿态。
- **文件**：`app/lib/tutor/context.ts`
- **验证**：阶段 2（新增 `scripts/verify-tutor.mjs` 用例表）+ 阶段 5（CDP 实测「哪个」类问题触发 LLM 请求）。用例表至少覆盖：`下一步学什么`→nav、`这两个操作符哪个先执行？`→llm、`为什么顺序会错`→llm、`考考我`→llm、`直接告诉我`→llm、`学习路线`→nav。

---

## C 组 · P2 体验与健壮性

### C1 · FAB 角标状态滞后

- **根因**：`configStatus` 初值 `'absent'`，只有 `loadConversation()`（打开抽屉）才刷新；已配置时角标仍显示「配」。
- **动作**：`useTutor()` 首次在客户端调用时触发一次轻量配置探测（只更新 `configStatus` / `runtimeConfig`，**不加载会话、不做快照**）；用模块级 `configProbePromise` 复用，`loadConversation()` 直接 await 同一 Promise，避免竞态与重复解密。
- **文件**：`app/composables/use-tutor.ts`、`app/components/tutor/tutor-fab.vue`（角标条件不变，仅数据源及时）
- **验证**：阶段 5。配置保存后刷新首页，未打开抽屉时 `.fab-badge` 不存在；未配置时存在。

### C2 · `body.tutor-open` 无对应样式

- **根因**：drawer 在打开时 `document.body.classList.add('tutor-open')`，但 `main.css` 未定义该选择器；实测 `overflow: visible`，移动端抽屉打开时背景可滚动。
- **动作**：先确认实际滚动容器（`html` 或 `body`），在 `main.css` 加 `body.tutor-open { overflow: hidden; }`（必要时同时锁 `html`）；≤780px 生效即可，桌面保持一致。
- **文件**：`app/assets/css/main.css`
- **验证**：阶段 5。移动端视口打开抽屉后 `getComputedStyle(document.body).overflow === 'hidden'`，关闭后恢复。

### C3 · 底部 sheet 拖拽（**待决策**）

- **根因**：方案 §2.2 写「可拖拽到 90vh」，实现只有 `height:75vh; max-height:90vh`。
- **推荐（选项①）**：在 `corrections.md` 声明该表述失效，改为「固定 75vh / 最大 90vh」。理由：需求结论表只要求「移动底部抽屉」；拖拽把手易与消息区滚动产生触控冲突，且需新增 Pointer Events 生命周期管理。
- **选项②**：实现拖拽把手（pointerdown/move/up + `prefers-reduced-motion` 降级），需动 `tutor-drawer.vue` 模板与脚本。
- **验证**：选项①只需文档核对；选项②需阶段 5 增加拖拽手势断言。

---

## D 组 · 方案 ↔ 实现契约校正（**只写新目录，不改 00028 文件**）

> 项目约定「新任务必须新建目录，不要追加到旧文件或旧目录；旧结论失效时在新目录说明」。以下全部落到 `docs/00029-tutor-audit-fix/corrections.md`，逐条写明「00028 的 §X 表述以 00029 为准」及理由。本组以**文档校正**为主，唯一例外是 D7 需同步修改 `package.json`（依赖版本精确锁定）；00028 目录内文件一律不动。

| 编号 | 00028 原表述 | 事实 | 处理 |
|---|---|---|---|
| D1 | 需求表「当前页面上下文经 **human prompt** 注入」 | 实现把课程/课时/学情全放进 **system prompt**（`buildSystemPrompt`） | 校正为 system 注入，注明理由：避免污染用户轮次、便于冻结快照与提示词缓存（实现更合理） |
| D2 | `streamChat(cfg, messages, onDelta, signal)`、`snapshotContext(page)` 由引擎层收集 | 实际 `chatStream(cfg, messages, opts)`；`makeSnapshot(input)` 纯透传，富上下文由 composable 收集 | 校正 §2.1 契约表为真实签名与职责归属 |
| D3 | z-index `backdrop < FAB(z≈40) < 抽屉(z≈50)`；实施结果写「backdrop 64 < fab 62」 | 实际 `nav45 / sidebar60 / fab62 / tutor-backdrop64 / tutor-drawer66`；FAB 在抽屉打开时 `v-show` 隐藏，故 62<64 无冲突；「64 < 62」是笔误 | 校正 §3.5 与实施结果表述，说明隐藏机制 |
| D4 | §4「所有 LLM 文本**先 DOMPurify.sanitize，再 markdown-it 渲染**」 | 顺序写反且无效；实现为 `markdown-it(html:false)` → `DOMPurify.sanitize` → `highlight.ts` 全转义，实证无 `<script>` 注入 | 校正为实际顺序，并说明 SSR 分支由 `html:false` 保证 |
| D5 | `buildNavCards` 调 `recommend/reviewQueue/diagnose`，概念解析成可跳转**锚点** | 实现只用前两者；`diagnose` 已用于 `learningSummary()` 的薄弱归因；概念卡统一跳课时页 | **待决策**：推荐声明校正（不触课程数据契约）；若选②则补实现并扩大范围 |
| D6 | 「学情导出流程新增排除 LLM 配置与对话的边界」 | 实现未加代码；`exportState` 只序列化 `LearningState + exportedAt + courseVersion`，天然满足 | 声明「需求已达成、无需边界代码」，并补 F1 断言把结论固化 |
| D7 | §2.5「安装后在 package.json 锁定版本」 | 实际用 `^` caret；`@types/markdown-it@14` 配 `markdown-it@15` 主版本不一致 | **改代码**：三个依赖改精确版本；先核实 `@types/markdown-it` 是否有 15.x，若无则保留 14.x 并在方案里注明「API 兼容已由 typecheck 验证」 |
| D8 | `overview.md` 存在两个「待实施时确认的小项」章节（重复） | 文档冗余 | 在 `corrections.md` 声明以第一个（66–71 行）为准，第二个为重复块 |

---

## E 组 · 其余代码健壮性（审计「其他」项）

| 编号 | 问题 | 修复动作 | 文件 |
|---|---|---|---|
| E1 | `httpError` 把 500 / 404 归为 `parse`，系统气泡文案「端点返回了无法解析的响应」误导 | **待决策 D4**：扩展 `LlmErrorCode` 加 `'http'`（或 `'aborted'`），`httpError` 对非 401/402/403/429 返回该码并带 status；`tutor-system-note.vue` 增文案「端点返回 HTTP {status}」 | `llm.ts`、`types/tutor.ts`、`tutor-system-note.vue` |
| E2 | 外部 `signal` 取消被误报 `timeout`（`makeController` 未区分内部超时与外部 abort） | 内部超时用 `timedOut` 标记；catch 仅在其为真时归 `timeout`，其余 abort 归 D4 新增的 `'aborted'` / 或返回已收文本 | `llm.ts` |
| E3 | SSE 响应无任何有效帧时返回空串、不报错，UI 插入空气泡 | `chatStream` 收尾时若 `full` 为空且未收到 `[DONE]` → 抛 `parse`；`runLlm()` 对空回复移除占位气泡并 push 一条系统提示 | `llm.ts`、`use-tutor.ts` |
| E4 | `createMain` / `switchConversation` 在写入新 `mainId` 后未重跑 `normalizeMain`，落盘出现两个 `main:true`（靠读取时兜底） | 设置 `mainId` 后再调一次 `normalizeMain(group)` | `history.ts` |
| E5 | `lessonLink()` 在 `base` 缺省时返回 `/lessons/<id>` 错误路径；`?? rec.next.lesson.id` 是死代码 | `buildNavCards` 的 `base` 改为必传 `string`（composable 已总传 `courseBase(c.slug)`），去掉无效兜底 | `navigate.ts` |
| E6 | `loadConversation()` 每次打开抽屉都无条件求值 `buildSnapshot()`（含 `diagnose` 计算），与「打开不重组」字面不符 | `ensureMain` 第二参改为快照工厂 `() => ContextSnapshot`，仅新建会话时调用；`createMain` 保持直接传快照。同步在 D2 校正契约表 | `history.ts`、`use-tutor.ts` |
| E7 | `routeWatchBound` 模块级布尔，首个调用组件卸载后 watch 被清理却不重置，路由监听永久失效 | 用 `onScopeDispose(() => { routeWatchBound = false })` 在作用域销毁时释放 | `use-tutor.ts` |
| E8 | SSE 只按 `\n` 切行，不兼容单独 `\r` 分隔 | 行分隔改 `/\r\n|\n|\r/` | `llm.ts` |
| E9 | `fontFactor()` 里 `void baseW`、`context.ts` 的 `courseLine()` 无意义函数等 lint warning | 清理，不新增 warning 基数 | `fingerprint.ts`、`context.ts` |
| E10 | `readStored()` JSON 解析失败返回 `absent`（「从未配置」），损坏的密文 blob 应提示「配置已重置」 | 解析失败但 key 存在时返回 `stale`，让 UI 走重置提示 | `config.ts` |

---

## F 组 · 验证资产（**待决策 F2**）

### F1 · `scripts/verify-tutor.mjs`（推荐）

Node `--experimental-strip-types` 直跑，挂进 `pnpm verify`。内容：① B2 意图用例表；② D6 断言 `exportState` 输出不含 `apiKey` / `messages` / `conversations` 字段；③ `resolveLessonKey` 绑定表用例。仅 import 纯计算模块，不碰 DOM / OPFS。

### F2 · `scripts/tutor-mock.py` + `scripts/tutor-probe.py`（推荐）

把本轮一次性探针落仓库，形成可复现的动态回归：mock 端点支持 SSE / 401 / 429 / 500 / CORS 预检 / `__log` 请求记录；CDP 探针覆盖 `overview.md` §4 阶段 5 的全部断言。**不挂进 CI**（依赖本机 Chrome 与 wrangler），在 `AGENTS.md` 第 2 节补一行人工命令说明。

---

## 覆盖核对

审计结论里的全部条目均有归属：P0×2 → A1/A2；P1×2 → B1/B2；P2×3 → C1/C2/C3；契约偏差×8 → D1–D8；「其他」健壮性 → E1–E10；验证资产 → F1/F2。阶段 5 断言表由 FAIL 转 PASS 即视为本任务完成。
