# 无头浏览器 / 视口 / 断言

## 构造真实视口

| 症状 | 根因 | 处理 |
|---|---|---|
| `--window-size=360,740` 仍测不出手机断点 | 无头 Chrome 窗口宽度被钳在约 500 CSS px | 用 CDP `Emulation.setDeviceMetricsOverride` 构造精确视口；或在父页面用固定宽度 iframe 承载应用。**不要用窗口尺寸假装手机** |
| 视口检查「通过」但真机溢出 | 只看了 `window.innerWidth`，没量元素 | 检查 `document.documentElement.scrollWidth`、每个关键元素的 `getBoundingClientRect()` 是否越界、导航可见性、触控目标尺寸 |

## 断言质量（最容易骗过自己）

| 症状 | 根因 | 处理 |
|---|---|---|
| 冒烟脚本全是 ✓ 但实际有 bug | 断言把 `missing` / `undefined` / `null` 当成通过（**假阳性**） | 断言显式比较具体值（`=== true`、`>= 1`、`status === 200`），元素缺失必须报错；不要把「没抛异常」当成功 |
| 抽屉按钮功能正常但探针报失败（**假阴性**） | 按钮漏了 `id` / `aria-*`，只有 class 在 | 交互探针按语义标记（`id` / `aria-*`）定位；修复时补上缺失属性，别只改探针放宽断言 |

## 布局溢出

| 症状 | 根因 | 处理 |
|---|---|---|
| 手机端仪表盘横向溢出 54–120px | `1fr` 栅格列的 min-content 被 400px 时间轴顶开 | `.grid { grid-template-columns: minmax(0, 1fr) }`、`.grid > * { min-width: 0 }`；滚动容器加 `min-width: 0; max-width: 100%` |
| 图表 / 代码块 / 表格撑破页面 | 内容宽度不可压缩且没有独立滚动 | 图示、代码块、表格、时间轴各自独立横滑容器并给提示，不要让整页横滚 |
| iOS 输入框聚焦时页面缩放 | 字号小于 16px | 输入框统一 `font-size: 16px` |
| 刘海屏 / 横屏矮视口异常 | 未处理安全区与减少动效偏好 | `viewport-fit=cover` + `env(safe-area-inset-*)`；补 `prefers-reduced-motion` 与横屏矮视口规则 |
| 触控目标太小 | 沿用桌面尺寸 | 触控目标 ≥40px；≤780px 顶栏只留菜单/版本/主题，主视图移到底部标签栏，24 课目录改左侧抽屉（遮罩 / Esc / 切页自动收起） |

## 清理纪律

- 临时脚本、探针文件、截图、临时服务**收尾必须清理**；验证服务用独立端口，不干扰用户正在使用的预览。
- 视觉复核要真的看截图：对齐、溢出、对比度，不能只信数值断言。

## 助学 Agent 客户端运行时与 CDP 探针（00029，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 「清除全部对话记录」后 OPFS `tutor/` 从 `["home.json","effect-ts.json"]` 变成 `["effect-ts.json"]`，课程会话残留（P0-1） | `clearAll()` 用 `new Set(['home.json'])` + `memoryFallback.keys()` 拼删除名单；OPFS 模式下内存 Map 恒为空，各课程 `<slug>.json` 从不被列入 | 改为 `for await (const [name, handle] of dir.entries())` 枚举实际 `.json`（`handle.kind === 'file'`），**先收集 names 再逐个 `removeEntry`**，最后 `memoryFallback.clear()`。不要用硬编码文件名或内存状态推断磁盘内容。实测清除后 `tutor/` 为 `[]` |
| 覆写 `navigator.storage.getDirectory` 抛错后出现 `unhandledrejection`、抽屉 `feed=0` 空白（P0-2） | 三层缺兜底：`opfsSupported()` 只查 `'storage' in navigator`；`tutorDir()` 直接 await `getDirectory()`；`withGroup()` 读写与 `loadConversation()` 都没有 catch，异常冒泡成未处理 Promise rejection | `opfsSupported()` 加 `typeof navigator.storage?.getDirectory === 'function'`；`tutorDir()` 整体 try/catch 返回 `null`；`withGroup()` 的 OPFS 分支 try/catch 后回退内存分支；`getTutorConfig()` 把 `computeFingerprint()` / WebCrypto 一起包进 try 返回 `stale`；`loadConversation()` 加 catch 造内存会话并 push 内联提示。实测无 `unhandledrejection`、`feed>0`、本地导航仍可用 |
| 「仅学情页自动注入学情上下文」的动态断言在首页仍 FAIL | `pageKindOf()` 把首页兜底为 `'dashboard'` 档位，而 `pageTone('dashboard')` 文案里写了「学情摘要」四字，system 提示词凭空命中关键字 | 把「是否学情页」(`isLearningPage()`) 与「提示词档位」(`pageKindOf()`) 解耦；档位文案避开该关键字，真正注入的摘要只由 `contextBlock` 输出 |
| 「这两个操作符哪个先执行？」被本地导航截走，LLM 请求 0 新增 | `NAV_RE` 含「哪个 / 顺序 / 路线 / 接下来 / 先学」等裸泛词 | 收紧为短语级强信号（`/下一步\|接下来学\|学什么\|学哪\|学习路线\|学习路径\|导航\|按.*顺序学/`）+ 答疑语境负向护栏；用例表固化进 `scripts/verify-tutor.mjs`（`pnpm verify` 第二段） |
| CDP 探针一次报 11 条 FAIL 但产品代码没问题（**假阴性**）：`open_drawer()` 返回就 `send()`，mock 记录 0 请求，下一组才 `log 0→1` | `open()` 里 `state.open=true` 同步生效，但 `loadConversation()` 异步；抽屉 DOM 一出现就发消息会因 `conversation === null` 被 `send()` early-return | 探针必须等会话就绪（`#tutor-conv option` 有值 / `.tutor-row>0` 且 `.td-busy` 消失）；`send()` 后确认**用户气泡数增加**；LLM 断言等 mock `/__log` 条数增加；Markdown 只看**最后一个 assistant 气泡**（历史会话会制造假阳性）。实测修正后 60/60 通过 |

## 真实端点验证与 CORS（00030，实测 2026-11-14）

> 查库结果：以下 3 条**均未命中**既有条目（速查表缺 CORS 预检 / CDP 启动 / 事件帧相关关键词），靠 CDP 原始日志自行排查后新增；已同步补 `SKILL.md` 速查表与 description 关键词。

| 症状 | 根因 | 处理 |
|---|---|---|
| `with CDP() as c:` 后直接 `c.navigate()` 报 `AttributeError: 'NoneType' object has no attribute 'sendall'`（`scripts/cdp.py:111`） | `CDP.__enter__` 只 `return self`，**不会自动调用 `start()`**，`self.sock` 仍是 `None` | `with CDP() as c: c.start(width=390, height=844)` 之后再 navigate；写法对照 `scripts/tutor-probe.py` 的 `main()` |
| curl 带 `Origin` 的 POST 返回 `access-control-allow-origin: *`，浏览器里 `fetch` 却一律 `TypeError: Failed to fetch`；Chrome 日志 `blocked by CORS policy: No 'Access-Control-Allow-Origin' header...` 或 `Response to preflight request doesn't pass access control check`，`OPTIONS` 返回 `405` 且响应头只有 `allow: POST` | 带 `Authorization` + `Content-Type: application/json` 的跨域 POST **必定先发 OPTIONS 预检**；curl 不执行预检流程，它看到的 `ACAO` 来自**实际 POST 响应**（LiteLLM / Cloudflare 上游透传）。预检 `405` 且无 `Access-Control-Allow-*`，POST 根本不会发出 | **判定 CORS 可行性必须以浏览器为准，不能用 curl 响应头代替**。端点/代理需对 OPTIONS 返回 `204` + `Access-Control-Allow-Origin` / `-Headers: authorization,content-type` / `-Methods: POST,OPTIONS`，并给实际响应补 `ACAO`。区分「端点不行」与「产品代码不行」的最快方法：临时起一层只补 CORS 头的转发代理做对照，产品代码不用改。用 Chrome `--no-proxy-server` 再跑一组可排除系统代理干扰（实测两组一致） |
| 用 `scripts/cdp.py` 抓不到 `Log.entryAdded` / `Network.responseReceived`，看不到 CORS 原始错误文本 | `CDP.call()` 只等与自己 `id` 匹配的响应，无 `id` 的事件帧被直接丢弃（源码注释「事件帧（无 id）忽略」） | 临时子类覆盖 `call()`，把非匹配消息 append 到 `self.events`；先 `Log.enable` + `Network.enable`，再连续发若干次轻量 `Runtime.evaluate` 把事件「泵」出来，按 `method` 过滤 `LOG[error]` / `NETFAIL` / `RESP` 的 `headers`。临时探针放系统临时目录、验后删除，不要为一次性诊断改仓库脚本 |

## 助学 Agent 意图路由与抽检探针（00031，实测 2026-11-14）

> 查库结果：以下 2 条**均未命中**既有条目（已有假阴性条目讲的是「抽屉 DOM 出现但会话未就绪」，不含计数基线 / 新建会话时序），靠对照实验自行排查后新增；已同步补 `SKILL.md` 速查表与 description 关键词。

| 症状 | 根因 | 处理 |
|---|---|---|
| 新增的「导航卡改用 AI 回答」动态断言 FAIL：`click=True log 3→4 nav 0→0 user 3→4 ans=135`，但产品行为正确（63 条里唯一失败） | 计数基线 `b_users` 取在 `send()` **之前**，而 `send()` 本身会追加一条用户气泡，使「点击不重复追加」的期望天然差 1；另外把「卡片被移除」写成 `nav_after == nav_before`，两边都是 0，是**恒真空断言**（卡片出没出、删没删都没验到） | 断言基线一律取在**待测动作的前一帧**：`send()` 之后、点击之前记 `users_before_click` 与 `nav_with_card`；点击后要求 `users_after == users_before_click` 且 `nav_after < nav_with_card`，并补 `nav_with_card > nav_before` 确认强导航确实出卡。实测修正后 63/63 通过。**不要放宽断言或改产品代码迁就探针** |
| 真实端点抽检 6 道题 assistant 气泡全空（`len=0`、`error_note=''`、`landed=True`、`stream_done=True`），而同配置不新建会话时一次就拿到完整正确回答 | 每题前调 `newConversation()`，但它是 async（`createMain` → `listConversations` → `rebuildFeed`）；探针只等 `.tutor-row.length === 0`（首页空 feed 立刻成立）就发送，异步完成时的 `rebuildFeed(conv, true)` **整体替换 `state.feed`**，把刚入流的用户气泡与正在流式的 assistant 气泡一起抹掉，且不留错误 note | 「新建会话完成」的可观测信号是**会话切换器 `#tutor-conv option` 数量增加**（`conversations` 已刷新），不能只看 DOM 变空：`before = options.length` → 点 `＋` → 等 `options.length > before` 再 `send()`。排查这类「气泡消失 / 回答为空」先做**不新建会话的对照组**，能一次区分产品缺陷与探针时序。实测修正后 6/6 拿到回答，见 `docs/00031-tutor-routing-and-grounding/sampling.md` §4 |
