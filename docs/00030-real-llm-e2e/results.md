# 00030 · 真实 LLM 端点端到端验证结果

> **状态：已完成（2026-11-14），结论分档：用户所给端点「不可用于浏览器直连」，但产品代码本身「可用」。**
> 本轮**未改任何产品代码**；凭据未写入仓库；临时探针与临时服务均已清理。
> 方法见 `overview.md`。

## 1. 一句话结论

用户提供的本地 OpenAI 兼容端点（LiteLLM 代理，`http://127.0.0.1:15721`，模型 `agnes-3.0-flash`）**用 curl 完全正常、用浏览器完全不通**：它不处理 OPTIONS 预检，而助学 Agent 的请求必然带 `Authorization` + `application/json`，必定先预检。加一层补齐 CORS 头的转发代理后，真实模型的 SSE 流式、连接测试、答疑 / 追问 / 导航三姿态、千字长回答全部正常。因此**缺陷在端点/代理的 CORS 能力，不在助学 Agent 代码**。

## 2. 端点契约实测（阶段 1–3，curl）

| 项 | 结果 |
|---|---|
| 形态 | 本地 `15721` 转发至 `agnes-ai.com`，响应含 `x-litellm-*` / `server: cloudflare` |
| 根路径 `GET /` | 404 |
| `GET /v1/models` | 200 `{"models":[]}`（代理不实现模型枚举） |
| `POST /chat/completions` | 200，标准 `choices[0].message.content` + `usage` |
| `POST /v1/chat/completions` | 200（两种路径都可用；实现 `endpointOf()` 拼裸 host，设置页填裸 host 即可） |
| 非流式 / 流式 | 均可用；流式 `content-type: text/event-stream`，首帧 `delta:{role:'assistant',content:''}`，末帧 `finish_reason:stop` 后 `data: [DONE]` |
| **带 `Origin` 的 POST** | 200 且 `access-control-allow-origin: *`、`access-control-allow-credentials: true` |
| **OPTIONS 预检** | **`405 Method Not Allowed`，响应头仅 `allow: POST`，无任何 `Access-Control-Allow-*`** |

## 3. 浏览器实证（阶段 4，Chrome CDP，页面 origin `http://127.0.0.1:3199`）

`Authorization` 与 `Content-Type: application/json` 都不是 CORS 安全首部，跨域 POST **必定**先发 OPTIONS 预检。实测：

| 实验 | 结果 | Chrome 原始事件 |
|---|---|---|
| 同源 `fetch('/')` | 200（对照组，浏览器网络正常） | — |
| 简单 POST（`text/plain`、无自定义头，理论上不预检） | `TypeError: Failed to fetch` | `LOG[error] ... blocked by CORS policy: No 'Access-Control-Allow-Origin' header...`；无 `responseReceived` |
| **产品完整 POST** | `TypeError: Failed to fetch`，**POST 未发出** | 先 `REQ OPTIONS` → `RESP 405` → `LOG[error] Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header...` → `NETFAIL net::ERR_FAILED Fetch` |
| 手动 OPTIONS | 同上，`405` | 同上 |

- **排除代理干扰**：加 `--no-proxy-server` 重跑，四组结果完全一致。
- **解释 curl 与浏览器的矛盾**：curl 看到的 `ACAO:*` 来自**上游实际 POST 响应**；curl 不执行预检流程。浏览器被 `405` 预检挡在门外，永远走不到那个带 CORS 头的响应。**判定 CORS 可行性必须以浏览器为准，不能用 curl 的响应头代替。**

### 产品降级行为（正确）

- 设置页「测试连接」→ `连接失败：Failed to fetch`；
- 抽屉 4 次提问均得到系统气泡：`⚠ 调用失败 / 无法连接 LLM 端点。请检查 baseUrl 是否正确、端点是否允许浏览器跨域（CORS）。 / Failed to fetch / 重试 / 去设置`，无空白抽屉、无 `unhandledrejection`、无重复用户气泡；
- 错误归类为 `network`，与 00029 定的错误码契约一致。

## 4. 对照组：补齐 CORS 后产品链路全通（阶段 4–5）

临时起一个只补 CORS 头的转发代理（`127.0.0.1:3210 → 15721`，OPTIONS 返回 204 + `ACAO:*` / `Allow-Headers: authorization,content-type` / `Allow-Methods: POST,GET,OPTIONS`），**不改产品代码**，把设置页 baseUrl 指向它：

| 验证项 | 结果 |
|---|---|
| 配置保存 / 测试连接 | 保存成功；`连接成功，模型返回：好` |
| **真实 SSE 答疑** | 200 → 打字机渲染，assistant 气泡产出真实模型文本 |
| **追问姿态** | 「那为什么 Effect 里要用 flatMap 而不是 map？」→ 1131 字，正确区分 Monad 语义与数组方法 |
| **导航姿态** | 「下一步学什么」→ `.tutor-navcard` 0→1，LLM 请求 **0 新增**，卡片指向「动机与起步：TypeScript 的缺口与第一次运行」 |
| **长回答 / 60s 超时** | 「800 字、5 个小标题」→ 1374 字，**60s 内完成，未触发 `DEFAULT_TIMEOUT_MS` 超时** |
| 请求契约 | 3 次答疑/追问 POST 全部 200，`Bearer` + `stream:true` 契约成立 |
| 偶发扰动 | 阶段 A 连发 3 次短请求时上游偶发 500，代理透传为 502；后续流式链路均 200，非系统性 |

> 探针取「最后一个 assistant 气泡」时，导航那一轮拿到的是上一轮文本，因为导航卡不是 `.tutor-md` 节点；补验脚本已用「导航卡数量 + LLM 请求增量」确认导航姿态正确，不是产品缺陷。

## 5. 实测新发现：真实模型的输出质量风险

答疑轮「用一句话讲讲 flatMap 和 map 的区别」的真实回复是：

> 「map 对数组每个元素执行一次函数并返回扁平的一维数组，而 flatMap 先执行函数再自动将结果数组展平一层……」

**前半句是概念错误**：`Array.prototype.map` 不扁平，扁平的是 `flatMap`。追问轮反而正确指出「这里遵循 Monad 语义，不是数组方法」。判断是短回答档位下模型把「数组的 flatMap」与「Effect 的 flatMap」混在一起，而 system prompt 的课程语境没把它拉回来。

这印证了 00029 §7.6 「三姿态输出质量依赖真实模型，mock 无法验证」的遗留，且**首次实证它是真实风险**：助学场景里，一句自信但错误的解释比不回答更有害。建议（后续任务，本轮未实施）：

1. system prompt 明确「本站 `flatMap` 指 Effect 的链式编排，不是 `Array.prototype.flatMap`」；
2. 对「一句话 / 简短」档位追加「先对齐语境再作答」的约束；
3. 或把概念类问题强制带上当前课时的概念释义作为上下文。

## 6. 修复方向（供审核，本轮未实施）

| 方案 | 做法 | 取舍 |
|---|---|---|
| **A（推荐）** | **端点侧补 CORS**：让 `15721` 代理对 OPTIONS 返回 204 + `ACAO` / `Allow-Headers` / `Allow-Methods`，并给实际 POST 响应补 `ACAO`。可用一节 Nginx / 轻量转发层实现 | 不改产品代码、不破坏「纯客户端 + key 不经过站点服务器」的既定架构与隐私承诺；代价是用户需自行配置端点 |
| **B** | **站点侧反向代理**：Nuxt/Workers 加同源 `/api/llm` 转发，浏览器无跨域 | 需要改架构：key 会经过站点服务器（与设置页现有文案冲突）、Workers 出站白名单、限流与密钥管理，成本显著 |
| **C（低成本改进，可随 A 一起做）** | **失败诊断细化**：现在预检失败、网络不可达、401 都可能在 UI 上笼统呈现 `Failed to fetch`。可在连接测试里区分「预检失败 → 提示端点需支持 CORS」 | 不动架构，直接降低用户自查成本；设置页已有「请确认端点允许浏览器跨域」文案，但失败时没有针对性引导 |

> 方案 C 属产品代码改动，按项目约定需另起任务目录并先写 overview，等审核后实施。

## 7. 仍未覆盖 / 生产环境额外风险

- **Mixed Content**：线上站点是 HTTPS（自定义域名），若 baseUrl 仍填 `http://127.0.0.1:15721` 这类本地 HTTP 端点，浏览器可能在 CORS 之前就按混合内容拦截。本次预览是 HTTP，未复验；需在真实 HTTPS 环境验证（Chrome 对 localhost 有潜在可信来源豁免，结论不能凭规范推断）。
- 慢模型 / 超长回答触发 60s 整次超时仍未实测（本次 1374 字在数秒内完成）。
- `access-control-allow-credentials: true` 与 `access-control-allow-origin: *` 的组合在 `credentials:'include'` 下非法；当前实现未带凭据模式，未触发，但换端点时需注意。
- 多标签页配置同步、Safari / Firefox OPFS 兼容性、探针不进 CI —— 沿用 00029 §7.6，本轮未触及。
- **本轮未验证「未配置 / 调用失败时本地导航仍可用」以外的离线路径细节**，该行为由 00029 的 60 断言覆盖。

## 8. 环境与收尾

- 预览 `wrangler --cwd .output dev --port 3199`、临时 CORS 代理 `3210` 均已停止；`15721` 是用户自有服务，未动。
- 4 个临时探针脚本放在系统临时目录，验后已删除，**未落仓库**；baseUrl / apiKey 由环境变量传入，仓库文档不记具体凭据。
- 复现方式：按 `AGENTS.md` §2 起预览，再按本文 §4 的形态补一层 CORS 转发层即可；不需要改产品代码。
