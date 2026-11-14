# 00028 · 助学 Agent 技术方案（tutor-agent）

> 上游需求见 `docs/00028-tutor-agent/overview.md`。本文档是**技术方案**：把 PRD 落到本仓库的真实代码结构、模块划分、数据契约与验证路径。分支：`feat/tutor-agent`。

## 1. 现状快照（方案依据）

已核实的仓库事实，方案的所有落点都基于这些：

- **Nuxt 4 + Vue 3**，`nuxt.config.ts` 用 `@nuxt/ui`、`@nuxtjs/device`、`@nuxt/a11y` 等；构建 `cloudflare_module` preset（部署走 Workers，但**本 agent 纯客户端、不依赖 Workers 运行时**，只在浏览器内跑）。
- **三层解耦**：内容层 `app/data/<course>/*`（每课目录化：`index.ts` 聚合 + `stages/concepts/meta/design.ts` + `lessons/lNN.ts`）、引擎层 `app/lib/analytics.ts`（纯计算、`@ts-nocheck` 迁移内核，类型在 `~/types/course` 收口）、视图层 `app/pages` + `app/components`。
- **`analytics.ts` 已提供**：`recommend()`（`next` 课时 + `prereqBlocked` + 一句话 `advice` + `reviewCount`）、`reviewQueue()`（遗忘区概念列表，含 `lessonId`/`reason`/`mastery`/`retention`）、`diagnose()`（四类归因：前置缺口 / 遗忘型 / 误解型 / 练习不足）。**本地导航层可近乎零成本复用这三者。**
- **`CourseData.Lesson` 已含 `pitfalls: string[]`**（课页已渲染「常见误区」），`terms: string[][]`，`goals: string[]`，`quiz: QuizQuestion[]`（每题含 `explain` + `concept`）。误区检查点既可由 LLM 生成，也可**可选**引用 `pitfalls` 作为锚点。
- **`useCourse()` / `useRequiredCourse()`** 提供 `slug` / `course` / `data` / `lessons` / `stages` / `concepts` / `lessonPath`；`useLearning()` 提供 `stateOf(course)` / `engineOf(course)` / `mutate` / `replace`，全站学情单例。
- **设置页** `app/pages/courses/[slug]/settings.vue` 已实现学情导出 / 导入 / 清空（`engine.exportState` / `importState` / `reset`），导出走 Blob 下载，文件名 `knowisle-<slug>-<date>.json`。**本 agent 的「学情导出不含 LLM 配置与对话」边界落在此处。**
- **断点 780px**：`default.vue` 移动 / 桌面切换、底部标签栏 / 侧边栏、`onResize` 均以 780 为界；本 agent 抽屉沿用此断点。

## 2. 模块划分与新增文件

全部新增，不改动既有课程数据契约（零字段新增，符合「误区交给 LLM、本地只做导航」的决策）。

### 2.1 引擎 / 内容层（`app/lib/tutor/`，纯计算不碰 DOM）

| 文件 | 职责 | 关键契约 |
|---|---|---|
| `fingerprint.ts` | 设备指纹 = canvas hash + WebGL 渲染器串 + 字体探测 + 屏幕分辨率 + 时区，拼串后 SHA-256（WebCrypto）。返回 `{ hash: string, factors: string[] }`；任一因子取不到时退化为可用因子，不抛错 | `computeFingerprint(): Fingerprint`（async，依赖 `crypto.subtle`，仅 `import.meta.client`） |
| `config.ts` | LLM 配置加密存取。存储键 `knowisle:tutor:llm:v1`，值为 AES-GCM 密文（iv + ciphertext + 指纹 hash 三件套的 base64）；密钥 = `SHA-256(fingerprint.hash)` | `getTutorConfig(): Promise<TutorConfig\|null>`、`saveTutorConfig(cfg)`、`clearTutorConfig()`；指纹漂移时 `getTutorConfig` 解密失败返回 `null` 并置 `stale=true` 标志供 UI 提示「配置已重置」 |
| `navigate.ts` | 本地导航层。入参 `(course, state, engine, pageKind)`；产出「下一步导航卡」+「薄弱概念卡」 | `buildNavCards(...): TutorNavCards`；直接调 `engine.recommend(state)` / `engine.reviewQueue(state)` / `engine.diagnose(state)`，把 `lessonId`/`cid` 解析成可跳转的 `lessonPath` / 概念锚点 |
| `context.ts` | 上下文装配。**在新建对话时执行一次，结果冻结进该会话**；抽屉打开/同会话内发消息均不再重组。`snapshotContext(page): ContextSnapshot` 按 `pageKind` 选 system prompt 档位 + 收集课程/课时/概念/学情（学情页额外注入 `overall/diagnose` 摘要）；`buildMessages(conv): LLMMessage[]` 用会话冻结的 snapshot + 该会话最近 `TUTOR_TURN_LIMIT` 轮 | 会话上下文冻结于此；`buildNavCards` 由 navigate 提供 |
| `llm.ts` | OpenAI 兼容 `fetch` 客户端。`POST {baseUrl}/chat/completions`，`stream:true`，SSE 逐行解析 `data:` 帧的 `choices[0].delta.content`；结构化错误 | `streamChat(cfg, messages, onDelta, signal): Promise<void>`，错误抛 `LlmError{ code: 'auth'\|'quota'\|'network'\|'timeout'\|'parse', status? }` |
| `history.ts` | **会话（conversation）容器**，OPFS 存取，**按会话组（lessonKey）组织**。存储布局：`/tutor/<slug>.json`（该课程所有组：各课时键 + `${slug}:course` 课程级组）+ `/tutor/home.json`（首页组）。每条会话 = `{ id（时间戳+随机，全局唯一）, lessonKey, main, createdAt, updatedAt, snapshot: ContextSnapshot, messages: TutorTurn[] }`；`messages` 只保留最近 `TUTOR_TURN_LIMIT=10` 轮（预留可调）。每个 lessonKey 组 = `conversations[]`（同组可多会话）+ `mainId`（主会话）。LLM 配置**不**写进会话（走 `config.ts` 单独加密存储） | `resolveLessonKey(route): string`（**永远非空**：课时页=`${slug}:${stage}:${lessonId}`；课程内非课时页=`${slug}:course`；首页=`home`；见 §3.0 绑定表）、`loadGroup(lessonKey)`（路由到对应文件，取该组全部会话 + mainId）、`ensureMain(lessonKey, snapshot)`（打开时：加载主会话，无则新建主会话）、`createMain(lessonKey, snapshot)`（「新建对话」：新建会话并**替换**该组 mainId，旧主会话降级为普通会话仍可切回）、`switchConversation(lessonKey, convId)`（**仅同组切换，且切换即把该会话设为组 mainId**；跨组不支持）、`appendMessage(lessonKey, convId, turn)`、`clearAll()` |

> 说明：`context.ts` 依赖 `navigate.ts` 产出的卡片与 `history.ts` 的历史，组合出最终 LLM 请求体。`fingerprint/config` 只被 `context`（取 baseUrl/key/model）与设置页使用。

### 2.2 视图层（`app/components/tutor/`，只渲染不硬编码课时）

| 文件 | 职责 |
|---|---|
| `tutor-fab.vue` | 全局悬浮球，挂 `default.vue` 根部（`<slot/>` 之后、`drawer-backdrop` 旁）。固定右下角，`bottom` 在 ≤780px 时避让底部标签栏高度；未配置 key 时显示「配」角标提示 |
| `tutor-drawer.vue` | 响应式抽屉：≥780px 右侧 420px 宽面板，<780px 底部 75vh sheet（可拖拽到 90vh）。内部混排对话气泡（`tutor-message`）与导航卡片（`tutor-card`），底部输入框 + 意图提示词（"直接告诉我 / 考考我 / 下一步学什么"快捷 chips）。SSE 流式渲染 |
| `tutor-message.vue` | 单条对话气泡，Markdown 渲染（markdown-it + DOMPurify），代码块用现有 `highlight.ts` 的高亮 + 复用 `main.css` 的 `tok-*` 样式类 |
| `tutor-card.vue` | 导航卡片：摘要一句话 + 结构化列表（下一步课时 / 薄弱概念，`NuxtLink` 跳转到 `lessonPath` / 概念锚点） |
| `tutor-system-note.vue` | 内联系统气泡：错误码→文案映射（401=key 无效、402=额度不足、超时、网络）+「重试」「去设置」按钮 |

> 抽屉与 FAB 由一个 `useTutor()` composable（`app/composables/use-tutor.ts`）驱动开合、流式状态、错误态；`tutor-drawer.vue` 消费该 composable，避免把 LLM 副作用写进模板。

### 2.3 设置与页面

| 文件 | 职责 |
|---|---|
| `app/pages/settings/llm.vue` | 独立路由 LLM 配置页（**不在课程 `[slug]` 下**，全站共享一套 baseUrl/key/model）。三字段 + 连接测试（`GET {baseUrl}/models` 或一次极小 chat 试探）+ 加密状态说明 + 清除。指纹漂移时显示「本机环境已变化，配置已重置」 |
| `default.vue` 改动 | ① 导航 tabs 的「非课程分支」（首页/侧边栏底部）追加「助手设置」项 → `/settings/llm`；② 渲染 `<TutorFab/>`；③ 学情 / 课程页保持不动 |

### 2.4 类型

| 文件 | 内容 |
|---|---|
| `app/types/tutor.ts` | `LessonKey = string`（会话组键：课时页 `${slug}:${stage}:${lessonId}`、课程内非课时页 `${slug}:course`、首页 `home`，**永不空**）、`TutorConfig{ baseUrl, apiKey, model, fingerprintHash }`、`PageKind='lesson'\|'concept'\|'review'\|'dashboard'`、`ContextSnapshot{ pageKind, course, lessonId?, conceptId?, learningSummary? }`（新建时冻结）、`Conversation{ id（时间戳+随机，全局唯一）, lessonKey, main: boolean, createdAt, updatedAt, snapshot, messages }`、`LessonGroup{ lessonKey, mainId, conversations }`、`TutorTurn{ role:'user'\|'assistant'\|'system', content, ts }`、`LLMMessage`、`TutorNavCards{ next?: NavItem, weaks: WeakItem[] }`、`LlmErrorCode` |

### 2.5 依赖

- `markdown-it`（Markdown 渲染，纯 JS 轻量）+ `dompurify`（LLM 输出 XSS 净化）。二者均为浏览器可用，不引入构建期改动。安装后在 `package.json` 锁定版本，跑通 `pnpm install`（postinstall `nuxt prepare`）。
- 代码高亮复用现有 `app/lib/highlight.ts`，**不**引入 highlight.js / prism。

## 3. 关键数据流

### 3.0 打开时序（配置判断 → 会话加载/新建）

```
点 FAB 打开抽屉 → useTutor.open()
  ① getTutorConfig()          ← 配置判断，永远第一步（优先于 ②③④）
       → { status: 'ok'|'absent'|'stale' }（stale=指纹漂移已重置）
       它不阻止后续步骤，只决定 LLM 能力是否可用
  ② lessonKey = resolveLessonKey(route)   ← 会话组键，**永远非空**（见下方绑定表）
  ③ ensureMain(lessonKey, snapshot)         ← 加载该组的主会话
       已有主会话 → 恢复（带它冻结的 snapshot + 历史消息）
       无 → 新建主会话（此刻才做一次性上下文快照）
  ④ 渲染会话切换器：只列「当前 lessonKey」内的会话（同组切换；跨组不支持）
  → 渲染：status==='absent' 时首屏显示「配置引导」+ 本地导航卡（可正常呈现会话与导航）
```

**会话组键（lessonKey）绑定表**——`resolveLessonKey(route)` 永不返回空：

| 路由 | lessonKey | 存储文件 |
|---|---|---|
| `/courses/[slug]/lessons/[id]` | `${slug}:${stage}:${lessonId}` | `/tutor/<slug>.json` |
| 课程内非课时页（地图 / dashboard / review / design / teacher / settings） | `${slug}:course` | `/tutor/<slug>.json` |
| 首页 `/` | `home` | `/tutor/home.json` |

> 即「b 课程级共享会话 + 首页专用键」。概念页 / 学情页无章节-课时键，统一落到 `${slug}:course` 课程级组；首页单独 `home` 组。

**「新建对话」动作**（抽屉内按钮 / 快捷键）：`createMain(lessonKey, snapshot)` —— 新建一条会话并**替换**该组的 `mainId`；旧主会话降级为普通会话，仍留在该组的 `conversations[]` 可切回。上下文快照只在「新建」这一刻执行。

> 上下文装配**归属新建对话**而非抽屉打开：同一会话内后续发消息沿用该会话冻结的 snapshot，不重组；只有「新建对话」才重新 `snapshotContext`。
> 会话切换**仅同组**：切换器数据源 = 当前 `lessonKey` 的 `conversations[]`；换课时后选择器整体刷新，旧组会话留在 OPFS，回到该组才重新加载。
> **切换即更新主会话 ID**：`switchConversation(lessonKey, convId)` 选定某会话时，把它设为该组 `mainId`（下次打开该组默认载入它）；「新建对话」与「切换」都走同一 mainId 写入逻辑。

### 3.1 一次「答疑 / 追问」（当前会话内）

```
学生输入 → useTutor.send(conv)
  → context.buildMessages(conv.snapshot, conv.messages.slice(-TUTOR_TURN_LIMIT))
  → llm.streamChat(cfg, messages, onDelta, signal)
  → 逐帧 onDelta 追加到当前气泡（SSE 打字机）
  → 完成后 history.appendMessage(lessonKey, conv.id, {user, assistant})
```

### 3.2 一次「路径导航」（本地，零 LLM）

```
学生说「下一步学什么」/ 学情页默认 → navigate.buildNavCards(course, state, engine, pageKind)
  → engine.recommend / reviewQueue / diagnose
  → 渲染 tutor-card（气泡理由 + 可跳转卡片）
```

### 3.3 姿态判定（意图驱动）

`context.ts` 内做**轻路由**：先正则/关键词粗判学生意图（`直接|告诉|答案` → 答疑；`考我|追问|为什么` → 苏格拉底；`下一步|学什么|导航` → 本地导航命中则不发 LLM）。命中本地导航走 3.2；否则携系统提示词档位（按 pageKind）走 3.1，系统提示词内写清三姿态判定与切换规则，LLM 自行决定输出姿态。

## 3.5 FAB / 抽屉挂载位置

- `<TutorFab/>` 与 `<TutorDrawer/>` 都渲染在 `default.vue` **根部末尾**（与现有 `.drawer-backdrop` 同级、其后），`position: fixed`，实际 DOM 位置不重要，关键在 z-index 阶梯：内容/顶栏/侧栏 < `.drawer-backdrop` < **tutor-fab (z≈40)** < **tutor-drawer (z≈50，盖住 fab)**。
- FAB 固定**右下角**，`bottom: calc(… + env(safe-area-inset-bottom))` 避让刘海屏；≤780px 时再叠加底部标签栏高度，避免遮挡。
- 因共用 `default.vue`，FAB 在 teacher / design / settings 页也可见；默认**全站点可见**（便于配置时测试），如需在某页隐藏加 `route.path` 条件。

## 4. 安全与边界

- **XSS**：所有 LLM 文本先 `DOMPurify.sanitize`，再 markdown-it 渲染；代码块走 `highlight` 的 `esc`。
- **key 隐私**：仅存本机 localStorage（AES-GCM 加密），学情导出 `exportState` 不涉及；`settings/llm.vue` 明示「key 保存在本机、随请求明文发往你配置的端点」。
- **指纹漂移**：`getTutorConfig` 解密失败 → 返回 null + stale 标志 → 设置页与 FAB 显示「配置已重置，请重新配置」，不清除其他数据。
- **CORS**：OpenAI 兼容端点需允许浏览器跨域；`llm.ts` 捕获 `TypeError`（fetch 网络/CORS）归一为 `code:'network'`。

## 5. 验证路径

1. **门禁（快→慢）**：`pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` → `pnpm verify` → `pnpm build`，通过线 0 errors。新增 `app/lib/tutor/*.ts`、`app/components/tutor/*.vue`、`app/pages/settings/llm.vue`、`app/types/tutor.ts` 全纳入门禁（kebab-case、可追踪目录）。
2. **功能冒烟**：`pnpm build` → `pnpm exec wrangler --cwd .output dev --port 3199` → `python scripts/smoke.py --base http://127.0.0.1:3199`，并手工核验：
   - FAB 在课程 / 概念 / 学情页均可唤起；桌面右抽屉 / 移动底部抽屉 780px 响应式正确。
   - 未配置 key：抽屉进本地导航模式，卡片正常；LLM 功能内联引导去 `/settings/llm`。
   - 配置 key：三姿态切换；Markdown + 代码高亮渲染；SSE 流式；导航卡跳转；401/超时出系统气泡 + 重试/去设置。
   - 加密：localStorage 为密文；改指纹因子模拟漂移 → 提示重置；学情导出不含 LLM 配置与对话。
3. **回归**：`check-course.mjs`（课程完整性）不受影响；`analytics.ts` 纯计算无副作用；既有 5 个 course 组件不动。

## 6. 实施顺序（建议）

1. `types/tutor.ts` + `fingerprint.ts` + `config.ts`（加密基座）
2. `history.ts` + `navigate.ts`（本地层）
3. `context.ts` + `llm.ts`（LLM 层）
4. `use-tutor.ts` + 5 个 `tutor-*` 组件
5. `settings/llm.vue` + `default.vue` 接入
6. 装 `markdown-it` + `dompurify`，门禁 + 冒烟

> 全程「先查 `pitfall-resolver` 再动手，回归后回写」。