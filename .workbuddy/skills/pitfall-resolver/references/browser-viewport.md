# 无头浏览器 / 视口 / 断言

## 构造真实视口

| 症状 | 根因 | 处理 |
|---|---|---|
| `--window-size=360,740` 测不出手机断点 | 无头 Chrome 窗口宽被钳在约 500 CSS px | CDP `Emulation.setDeviceMetricsOverride` 构造精确视口，或父页面用固定宽 iframe。**不要用窗口尺寸假装手机** |
| 视口检查「通过」但真机溢出 | 只看 `window.innerWidth`，没量元素 | 检查 `document.documentElement.scrollWidth`、关键元素 `getBoundingClientRect()`、导航可见性、触控尺寸 |

## 断言质量（最容易骗过自己）

| 症状 | 根因 | 处理 |
|---|---|---|
| 冒烟全 ✓ 但有 bug | 断言把 `missing` / `undefined` / `null` 当通过（**假阳性**） | 显式比具体值（`=== true`、`>= 1`、`status === 200`），元素缺失必须报错；「没抛异常」不算成功 |
| 抽屉按钮正常但探针失败（**假阴性**） | 按钮漏 `id` / `aria-*`，只有 class | 探针按语义标记定位；补属性，别放宽断言 |

## 布局溢出

| 症状 | 根因 | 处理 |
|---|---|---|
| 手机仪表盘横溢 54–120px | `1fr` 列 min-content 被 400px 时间轴顶开 | `.grid { grid-template-columns: minmax(0, 1fr) }`、`.grid > * { min-width: 0 }`；滚动容器 `min-width: 0; max-width: 100%` |
| 图表 / 代码块 / 表格撑破页面 | 内容不可压缩且无独立滚动 | 各自独立横滑容器并给提示，不让整页横滚 |
| iOS 输入框聚焦缩放 | 字号 <16px | 输入框 `font-size: 16px` |
| 刘海屏 / 横屏矮视口异常 | 未处理安全区与减少动效 | `viewport-fit=cover` + `env(safe-area-inset-*)`；补 `prefers-reduced-motion` 与横屏规则 |
| 触控目标太小 | 沿用桌面尺寸 | ≥40px；≤780px 顶栏只留菜单 / 版本 / 主题，主视图移底部标签栏，24 课目录改左抽屉（遮罩 / Esc / 切页自动收起） |

## 清理纪律

- 临时脚本、探针、截图、临时服务**收尾必清**；服务用独立端口，不干扰用户预览。
- 视觉复核要看截图：对齐 / 溢出 / 对比度，不能只信数值断言。

## 助学 Agent 客户端运行时与 CDP 探针（00029，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 「清除全部对话」后 OPFS `tutor/` 从 `["home.json","effect-ts.json"]` 变 `["effect-ts.json"]`，课程会话残留（P0-1） | `clearAll()` 用 `new Set(['home.json'])` + `memoryFallback.keys()`；OPFS 模式内存 Map 恒空，课程 `<slug>.json` 从不入名单 | `for await (const [name, handle] of dir.entries())` 枚举实际 `.json`（`handle.kind === 'file'`），**先收集 names 再 `removeEntry`**，最后 `memoryFallback.clear()`。不要用硬编码文件名 / 内存状态推断磁盘。实测清除后 `[]` |
| 覆写 `navigator.storage.getDirectory` 抛错后有 `unhandledrejection`、抽屉 `feed=0` 空白（P0-2） | 三层缺兜底：`opfsSupported()` 只查 `'storage' in navigator`；`tutorDir()` 直接 await `getDirectory()`；`withGroup()` 与 `loadConversation()` 无 catch | `opfsSupported()` 加 `typeof navigator.storage?.getDirectory === 'function'`；`tutorDir()` try/catch 返 `null`；`withGroup()` OPFS 分支 catch 后回退内存；`getTutorConfig()` 把 `computeFingerprint()` / WebCrypto 包进 try 返 `stale`；`loadConversation()` catch 造内存会话并 push 内联提示。实测无未处理 Promise rejection、`feed>0`、本地导航可用 |
| 「仅学情页注入上下文」断言在首页 FAIL | `pageKindOf()` 把首页兜底为 `'dashboard'`，`pageTone('dashboard')` 文案含「学情摘要」，system 提示词命中关键字 | `isLearningPage()` 与 `pageKindOf()` 解耦；档位文案避开关键字，摘要只由 `contextBlock` 输出 |
| 「这两个操作符哪个先执行？」被本地导航截走，LLM 请求 0 新增 | `NAV_RE` 含「哪个 / 顺序 / 路线 / 接下来 / 先学」裸泛词 | 收紧为短语级强信号（`/下一步\|接下来学\|学什么\|学哪\|学习路线\|学习路径\|导航\|按.*顺序学/`）+ 答疑负向护栏；用例固化进 `scripts/verify-tutor.mjs`（`pnpm verify` 第二段） |
| CDP 探针一次 11 条 FAIL 但产品正常（`open_drawer()` 返回就 `send()`，mock 0 请求，下一组才 `log 0→1`，**假阴性**） | `open()` 里 `state.open=true` 同步生效但 `loadConversation()` 异步；DOM 一出现就发消息，`conversation === null` 被 `send()` early-return | 等会话就绪（`#tutor-conv option` 有值 / `.tutor-row>0` 且 `.td-busy` 消失）；`send()` 后确认**用户气泡数增加**；LLM 断言等 `/__log` 条数增加；Markdown 只看**最后一个 assistant 气泡**（历史会造假阳性）。实测修正后 60/60 |

## 真实端点验证与 CORS（00030，实测 2026-11-14）

> 查库结果：3 条均未命中（速查表缺 CORS 预检 / CDP 启动 / 事件帧关键词），靠 CDP 原始日志自排后新增，并补进 `SKILL.md` 速查表与 description 关键词。

| 症状 | 根因 | 处理 |
|---|---|---|
| `with CDP() as c:` 后直接 `c.navigate()` 报 `AttributeError: 'NoneType' object has no attribute 'sendall'`（`scripts/cdp.py:111`） | `CDP.__enter__` 只 `return self`，不自动 `start()`，`self.sock` 仍 `None` | `with CDP() as c: c.start(width=390, height=844)` 后再 navigate；写法对照 `scripts/tutor-probe.py` 的 `main()` |
| curl 带 `Origin` 的 POST 返回 `access-control-allow-origin: *`，浏览器 `fetch` 却 `TypeError: Failed to fetch`；Chrome 日志 `blocked by CORS policy: No 'Access-Control-Allow-Origin' header...` / `Response to preflight request doesn't pass access control check`，`OPTIONS` 返回 `405` 且只有 `allow: POST` | 带 `Authorization` + `Content-Type: application/json` 的跨域 POST **必先 OPTIONS 预检**；curl 不预检，看到的 `ACAO` 来自**实际 POST 响应**（LiteLLM / Cloudflare 上游透传）。预检无 `Access-Control-Allow-*`，POST 根本不发 | **以浏览器为准，不能用 curl 头代替**。端点/代理对 OPTIONS 返 `204` + `Access-Control-Allow-Origin` / `-Headers: authorization,content-type` / `-Methods: POST,OPTIONS`，实际响应补 `ACAO`。区分「端点不行」与「产品代码不行」：临时起只补 CORS 头的转发代理对照；Chrome `--no-proxy-server` 再跑一组排除系统代理（实测一致） |
| `scripts/cdp.py` 抓不到 `Log.entryAdded` / `Network.responseReceived` | `CDP.call()` 只等匹配自己 `id` 的响应，无 `id` 的事件帧被丢弃（源码注释「事件帧（无 id）忽略」） | 临时子类覆盖 `call()`，把非匹配消息 append 到 `self.events`；先 `Log.enable` + `Network.enable`，再发轻量 `Runtime.evaluate` 把事件「泵」出来，按 `method` 过滤 `LOG[error]` / `NETFAIL` / `RESP` 的 `headers`。临时探针放系统临时目录、验后删，不改仓库脚本 |

## 助学 Agent 意图路由与抽检探针（00031，实测 2026-11-14）

> 查库结果：2 条均未命中（已有假阴性条目讲「DOM 出现但会话未就绪」，不含计数基线 / 新建会话时序），对照实验自排后新增，并补进 `SKILL.md` 速查表与 description 关键词。

| 症状 | 根因 | 处理 |
|---|---|---|
| 「导航卡改用 AI 回答」断言 FAIL：`click=True log 3→4 nav 0→0 user 3→4 ans=135`，产品正确（63 条唯一失败） | 基线 `b_users` 取在 `send()` **之前**，而 `send()` 自身追加用户气泡，期望天然差 1；「卡片被移除」写成 `nav_after == nav_before`，两边 0，是**恒真空断言** | 基线取在**待测动作前一帧**：`send()` 后、点击前记 `users_before_click` / `nav_with_card`；点击后 `users_after == users_before_click` 且 `nav_after < nav_with_card`，补 `nav_with_card > nav_before` 确认出卡。实测 63/63。**不放宽断言迁就探针** |
| 真实端点抽检 6 题 assistant 全空（`len=0`、`error_note=''`、`landed=True`、`stream_done=True`），同配置不新建会话则正常 | 每题前 `newConversation()` 是 async（`createMain` → `listConversations` → `rebuildFeed`）；探针只等 `.tutor-row.length === 0`（首页空 feed 立刻成立）就发送，异步完成时 `rebuildFeed(conv, true)` **整体替换 `state.feed`**，抹掉气泡且不留 note | 「新建会话完成」信号是**会话切换器 `#tutor-conv option` 数量增加**（`conversations` 已刷新）：`before = options.length` → 点 `＋` → 等 `options.length > before` 再 `send()`。排查「气泡消失 / 回答为空」先做**不新建会话的对照组**。实测 6/6，见 `docs/00031-tutor-routing-and-grounding/sampling.md` §4 |
