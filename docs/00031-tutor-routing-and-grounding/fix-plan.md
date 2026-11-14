# 00031 · 逐条修复清单（待审核）

> 配套 `overview.md`。每条含：根因 → 修复动作 → 落点文件 → 单项验证。
> 编号与 `overview.md` §2 分组一致；验证阶段号见 `overview.md` §3。
> **本文件是方案，未实施。**

---

## A 组 · 意图粗路由静默误判

### A1 · 收窄导航词表，弱信号一律交 LLM

- **根因**（`app/lib/tutor/context.ts:107-121`）：
  ```
  const NAV_RE = /下一步|接下来学|学什么|学哪|学习路线|学习路径|导航|按.*顺序学/
  const QA_RE  = /为什么|原理|区别|报错|如何|怎么|是什么|哪个/
  const STRONG_NAV_RE = /下一步|学什么|学哪/
  ```
  ① `导航` 是裸泛词，「这个 API 怎么导航 / 路由怎么配」这类答疑句会误命中；② `按.*顺序学` 的 `.*` 贪婪跨句，「为什么按这个顺序学不对」虽有 `QA_RE` 护栏兜住，但「这段代码按推荐顺序学会怎样」仍会误判；③ 命中即 `pushNav()` 并 `return`，**LLM 请求为 0**，UI 上不报错、日志里无痕迹，用户无从察觉。00029 只收紧过一次词表，没有解决「长尾表达」这一类问题。
- **动作**：保留现有「护栏优先 → 强信号 → 默认 LLM」三段结构（改动最小），只做两处替换 + 一处扩充：
  ```ts
  // 只留短语级强信号：去掉裸词「导航」与贪婪的「按.*顺序学」
  const NAV_STRONG_RE = /下一步|接下来学|学什么|学哪|学习路线|学习路径|按什么顺序学|按顺序学/
  // 护栏补充常见答疑信号，避免组合句被强导航词带走
  const QA_RE = /为什么|原理|区别|报错|如何|怎么|是什么|哪个|是不是|对不对|会不会|能不能|错了|不对|含义|用法/
  // 护栏让步条件不变（「下一步学什么，为什么」仍是导航）
  const EXPLICIT_NAV_RE = /下一步|学什么|学哪|学习路线|学习路径/

  export function detectIntent(text: string): Intent {
    if (QA_RE.test(text) && !EXPLICIT_NAV_RE.test(text)) return 'llm'
    return NAV_STRONG_RE.test(text) ? 'nav' : 'llm'
  }
  ```
  - **同步改用例期望**：`['帮我导航一下', 'nav']` → `'llm'`（D1 决策①：弱导航信号交 LLM 由三姿态自决）。其余 14 条期望保持不变。
  - **兼容性已逐条核对**（方案阶段静态推演，实施时由阶段 2 实证）：除上述 1 条外，其余 14 条在新正则下判定不变——易踩坑的三条分别是 `先学哪个更合适` → `nav`（命中 `学哪`，护栏因 `EXPLICIT_NAV_RE` 让步）、`这两个操作符哪个先执行？` → `llm`（`QA_RE` 命中且无强导航词）、`为什么顺序会错` → `llm`（去掉贪婪词后 `NAV_STRONG_RE` 不再命中）。
  - **明确接受的不完美**：含强导航词的组合句（如「为什么下一步学这个」）仍可能判 `nav`。正则不是分类器，与其继续堆词表，不如由 **A2 提供自助出口**——这是本方案的核心取舍。
- **文件**：`app/lib/tutor/context.ts`
- **验证**：阶段 2（`verify-tutor.mjs` 扩充用例表）+ 阶段 5（弱信号实测触发 LLM 请求）。

### A2 · 导航卡加「改用 AI 回答」兜底出口

- **根因**：`use-tutor.ts:434-458` 的 `send()` 在 `detectIntent(prompt) === 'nav'` 时 `pushNav(navCards()); return`，没有给用户任何改走 LLM 的入口；`retry()`（460-470 行）只处理 `error` note，不处理 `nav`。误判后用户只能自己换措辞重试。
- **动作**：
  1. `use-tutor.ts` 新增 `askAi()` 并加入 `return` 暴露。复用现有 `lastPrompt`、`runLlm()`、`guideText()`，**不改 `FeedItem` / `TutorNavCards` 类型**：
     ```ts
     async function askAi(): Promise<void> {
       if (!state.value.lastPrompt || state.value.streaming) return
       const last = state.value.feed[state.value.feed.length - 1]
       if (!last || last.kind !== 'nav') return          // 只对最近一张导航卡生效
       if (state.value.configStatus !== 'ok' || !runtimeConfig) {
         pushNote({ type: 'guide', text: guideText() })
         return                                          // 未配置时保留卡片，不要先删后提示
       }
       removeItem(last.id)                                // 移除导航卡，避免同题出现两种答案
       await runLlm()                                     // 从 feed 组装历史，不重复追加用户气泡
     }
     ```
     **硬约束**：`runLlm()` 走 `requestMessages(conv)` 从 `feed` 合成请求体（00028/00029 的关键约定），移除 nav 后 feed 末项正是原用户气泡；**不得**改写成 `send(lastPrompt)`，否则会重复追加用户气泡。
  2. `tutor-card.vue`：加 `canAskAi?: boolean` prop 与 `defineEmits<{ askAi: [] }>()`，在卡片底部渲染一个次要按钮（未配置时也渲染，点击给引导）。
  3. `tutor-drawer.vue:172`：`<TutorCard :cards="item.cards" />` → 增加 `:can-ask-ai="item.id === feed[feed.length - 1]?.id"` 与 `@ask-ai="tutor.askAi()"`。只让最后一张卡可操作，避免历史卡误删。
  4. 按钮文案与样式沿用 `.btn ghost sm` / `.tnc-*` 体系，不加新组件、不加 z-index。
- **文件**：`app/composables/use-tutor.ts`、`app/components/tutor/tutor-card.vue`、`app/components/tutor/tutor-drawer.vue`
- **验证**：阶段 5 新增断言——点击后导航卡消失、mock 收到 LLM 请求、`.tutor-row.role-user` 数量**不增加**；未配置时导航卡仍在且出现引导 note。

### A3 · 用例表 15 → ~35，覆盖长尾与组合句

- **根因**：`scripts/verify-tutor.mjs:34-50` 只有 15 条，且以「已修过的那几个反例」为主，没有长尾表达、贪婪匹配反例、中英混排、组合句。
- **动作**：按四类补充（对象数组或元组均可，但**沿用现有元组写法**；注意 `toolchain.md` 记过元组数组推断 `no-base-to-string` 的坑，若改成对象数组需同步处理）：
  | 类别 | 示例 | 期望 |
  |---|---|---|
  | 弱导航长尾 | 「我该从哪开始」「接着往下看什么」「帮我规划一下」「帮我导航一下」 | `llm` |
  | 贪婪/裸词反例 | 「这段代码按推荐顺序学会怎样」「这个路由怎么导航」「导航守卫的原理」 | `llm` |
  | 答疑护栏 | 「为什么这么安排」「flatMap 的含义」「是不是该先学这个」「这样写对不对」 | `llm` |
  | 强导航保持 | 「下一步学什么」「学习路线」「按什么顺序学」「先学哪个更合适」 | `nav` |
  | 组合句（标注已知边界） | 「下一步学什么，为什么」 | `nav`（护栏让步，符合既有语义） |
- **文件**：`scripts/verify-tutor.mjs`
- **验证**：阶段 2 `pnpm verify` 第二段全绿，断言总数从 24 提升，命令与退出码不变。

### A4 · 动态探针补 2 条断言

- **动作**：`scripts/tutor-probe.py` 增加：① 发一条弱导航句，断言 mock `/__log` 请求数 +1 且 `.tutor-navcard` 数量不增；② 触发强导航出卡后点「改用 AI 回答」，断言卡消失、请求数 +1、用户气泡数不增、最后 assistant 气泡非空。沿用 00029 的时序纪律（等会话就绪、确认用户气泡入流、等 mock 收到请求、只看最后一个 assistant 气泡），**不改产品代码迁就探针**。
- **文件**：`scripts/tutor-probe.py`
- **验证**：阶段 5 原 60 条 + 本组新增 2 条 + B3 的 system 首帧断言 1 条 = 63 条，0 FAIL。

---

## B 组 · system prompt 课程语境约束

### B1 · `BASE_PERSONA` 增语境优先与跨语境消歧原则

- **根因**（`app/lib/tutor/context.ts:47-52`）：现有原则只有「中文回答 / TS-JS 示例 / 精炼 / 不确定就说明边界，不要编造 API」。00030 的答疑发生在**首页打开的会话**：`buildSnapshot()`（`use-tutor.ts:202-219`）给出 `course: 'home'`、`courseTitle: '源悟的知识岛'`、`pageKind: 'dashboard'`，`lessonConcepts` / `lessonGoals` / `lessonPitfalls` 全空，`contextBlock()`（68-79 行）只输出一行「当前课程：源悟的知识岛」。system prompt 里**没有任何 Effect / RxJS 语境**，模型只能按通用 JS 数组语义作答，还把 `map` 说成「返回扁平的一维数组」。
- **动作**：在 `BASE_PERSONA` 的「原则」段追加（**控制在 4 行内**，避免提示词膨胀与 token 成本上升）：
  ```
  - 语境优先：解释概念或 API 时，以「当前会话冻结上下文」里的课程、课时、核心概念与常见误区为准；同名术语在通用语言与本站课程里含义不同时，先点明区分再作答，不要默认按通用语义解释。
  - 歧义先澄清：若无法判断学生问的是哪个语境（例如 Effect 的 flatMap 与 Array.prototype.flatMap），先用一句话反问，或同时给出两者区别；不要凭猜测下断言。
  - 短答也要对齐语境：即使学生要求「一句话」「简单说」，也不能为压缩长度而省略必要的语境区分。
  ```
  保留原有「不确定就说明边界，不要编造 API」。**不改 `buildSystemPrompt()` 的组装结构**（`BASE_PERSONA + pageTone + 冻结上下文` 四段拼接不变），不动 `SnapshotInput` / `ContextSnapshot` 类型。
- **文件**：`app/lib/tutor/context.ts`
- **验证**：阶段 2 文本断言 + 阶段 5 mock `messages[0]` 断言 + 阶段 6 真实端点抽检。

### B2 · `lesson` / `concept` 档位补强

- **根因**：`pageTone('lesson')`（56-57 行）与 `pageTone('concept')`（58-59 行）只描述「倾向追问 / 先讲透再给误区」，没有要求答案锚定本课时概念与误区；而 `contextBlock` 明明已经注入了 `本课时核心概念` / `本课常见误区`。
- **动作**：两档文案各追加一句「解释概念时以本课时核心概念与常见误区为准；遇到同名 API 先区分语境。」
  - **`review` / `dashboard` 档（60-64 行）保持原样**：00029 B1 的教训是档位文案不得含「学情摘要」四字，否则首页 system 会凭空命中该关键字、破坏「仅学情页注入」的动态断言。**本次改动不得引入该词**。
- **文件**：`app/lib/tutor/context.ts`
- **验证**：阶段 2 断言 `buildSystemPrompt(plain)` 仍不含「学情摘要」（复用 00029 B1 回归网）；阶段 5 首页/学情页注入范围断言保持 0 FAIL。

### B3 · 分层验证：确定性断言进 CI，模型输出只做抽检

- **根因**：输出质量依赖真实模型、具有随机性。若把「回复里必须/不得出现某句话」写成门禁，会产生 flaky 断言，且与 `pitfall-resolver/verification.md`「不得把元素缺失/没抛异常当通过」的纪律相悖。
- **动作**：
  1. **L1（进 CI）**：`verify-tutor.mjs` 新增纯文本断言——`buildSystemPrompt()` 在 `dashboard` / `lesson` / `concept` 三种 `pageKind` 下都包含「语境优先」关键片段；`dashboard` 空快照仍不含「学情摘要」；`messages[0].role === 'system'` 契约不变。
  2. **L2（动态探针）**：`tutor-probe.py` 通过 mock `/__log` 断言请求体 `messages[0].content` 含消歧规则与冻结上下文、末帧为用户问题（00029 D1 契约不破）。
  3. **L3（人工抽检，不进 CI）**：按 `docs/00030-real-llm-e2e/results.md` §4 形态起临时 CORS 转发层 + 用户真实端点，跑 `overview.md` §3 的 6 道歧义概念题，**记录合格率与典型失败样本**。通过线只要求「不再出现『map 返回扁平一维数组』这一具体错误」，不对模型措辞做硬性字符串匹配。
  4. 若 L3 显示规则仍被忽略，再考虑 D3（首页注入站点课程语境）或把消歧规则提到 `BASE_PERSONA` 更靠前位置——**属于新一轮任务，不在本方案实施范围内**。
- **文件**：`scripts/verify-tutor.mjs`、`scripts/tutor-probe.py`；抽检命令与判分标准写在 `overview.md` §3，不落脚本到仓库（D4）。
- **验证**：阶段 2 / 5 / 6 分别对应 L1 / L2 / L3。

---

## 覆盖核对

| 问题 | 归属 |
|---|---|
| 导航词表泛词 / 贪婪 / 长尾误判 | A1 + A3 |
| 误判后无法自助恢复（静默） | A2 + A4 |
| 首页会话无课程语境 | B1（消歧规则）+ B3（抽检验证），D3 暂不采纳 |
| 课时页答案未锚定概念与误区 | B2 |
| 输出质量不可硬断言 | B3 分层（L1/L2 进 CI，L3 仅记录） |
| 不破坏 00029 B1「仅学情页注入」 | B2 明确不改 dashboard 档 + L1 复用断言 |
| 不破坏 `feed` 唯一真实来源 | A2 硬约束：复用 `runLlm()`，禁止 `send(lastPrompt)` |

阶段 1–5 全绿、阶段 6 完成抽检记录、阶段 7 收尾并回写踩坑库，即视为本任务完成。
