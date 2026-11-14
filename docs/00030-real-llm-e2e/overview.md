# 00030 · 真实 LLM 端点端到端验证

> **状态：已完成（2026-11-14），实测结论见 `results.md`。**
> 触发：00029 §7.6 列明「真实 OpenAI 兼容端点 + 真实 key 下的长回答、模型输出质量、CORS 可行性」从未验证；本轮由用户提供一个本地可用的 OpenAI 兼容端点，做一次端到端实证。
> 上游：`docs/00028-tutor-agent/`、`docs/00029-tutor-audit-fix/`。

## 1. 目标

把「助学 Agent 的答疑 / 追问姿态在真实浏览器 + 真实模型下是否真的可用」从推测变成实测结论，具体回答：

1. **可行性**：浏览器跨域直连用户端点是否成立（预检 / 响应头 / 凭据模式）；
2. **契约**：`POST {baseUrl}/chat/completions` + Bearer + `stream:true` 的 SSE 增量能否被 `chatStream` 正确解析到收束；
3. **质量**：三姿态（答疑 / 追问 / 导航）在真实模型下的输出是否符合提示词档位预期；
4. **边界**：长回答与 `DEFAULT_TIMEOUT_MS = 60_000` 的关系、错误码文案在真实异常下的表现。

## 2. 不改动边界（重要）

- **本轮不改任何产品代码**。若发现缺陷，只在本目录记录实证 + 出修复建议，等用户审核后再另起任务实施。
- 不改 `docs/00028-*` / `docs/00029-*` 旧目录；旧结论失效时在本目录声明。
- **凭据不落仓库**：baseUrl / apiKey 由命令行参数或环境变量传入临时验证脚本，不写入 `docs/`、`scripts/` 或记忆文件。仓库内只记录端点形态（本地代理、LiteLLM）、响应契约与结论。
- 不动用户正在使用的 3100 预览；临时服务只用 3199 / 3210，跑完立即关闭。

## 3. 分层验证计划

| 阶段 | 动作 | 断言 / 观察点 |
|---|---|---|
| 1 端点契约 | curl 探测根路径、`/models`、两种 `/chat/completions` 路径 | 路径拼接、非流式 JSON 结构、`choices[0].message.content` |
| 2 CORS | curl 带 `Origin` 分别发 OPTIONS 预检与实际 POST | `Access-Control-Allow-Origin` / `-Credentials` / 预检状态码 |
| 3 SSE 契约 | curl `stream:true` 抓全流 | `data:` 帧形状、首帧 role-only、末帧 `[DONE]`、行分隔 |
| 4 浏览器实证 | Workers 预览(3199) + Chrome CDP，设置页填真实配置后发问 | **浏览器是否发出预检、预检是否被拒**、请求实际是否到达端点、SSE 打字机渲染、Markdown、错误气泡 |
| 5 三姿态/长回答 | 同一会话发多轮：答疑、追问、导航，另发一次长输出请求 | 输出档位、是否触发 60s 超时、是否有截断 |
| 6 收尾 | 停临时服务、清理临时脚本、记录结论、按 `pitfall-resolver` 闭环回写 | 无残留服务；新症状入库 |

## 4. 通过线

- 阶段 1–3 由 curl 给出确定结论（不依赖浏览器）。
- 阶段 4–5 **以浏览器实际行为为准**：curl 带 `Origin` 的响应头不能替代浏览器预检判定；若预检失败，即使 POST 能返回 200 也判为「浏览器链路不可用」。
- 结论分三档：**可用 / 有条件可用（需代理或改配置） / 不可用**，并写明适用范围（本端点 ≠ 所有 OpenAI 兼容端点）。

## 5. 已探测事实（2026-11-14 15:47，阶段 1–3）

| 项 | 实测 |
|---|---|
| 端点形态 | `http://127.0.0.1:15721` 本地代理转发至 `agnes-ai.com`，响应头含 `x-litellm-*` / `server: cloudflare`，为 LiteLLM 兼容层 |
| 路径 | `POST /chat/completions` 与 `POST /v1/chat/completions` 均 200；实现 `endpointOf()` 拼裸 host，故设置页应填 `http://127.0.0.1:15721`（不带 `/v1`，带了也可） |
| 鉴权 | 带 `Authorization: Bearer <用户提供的占位凭据>` 的请求被接受（代理侧不校验或透传上游凭证）；具体凭据不记入仓库 |
| 非流式 | `choices[0].message.content` 为标准字符串，`finish_reason: stop`，含 `usage` |
| 流式 | `content-type: text/event-stream`，标准 `chat.completion.chunk`；首帧 `delta:{role:'assistant',content:''}`，后续逐段 `content` |
| **CORS** | 带 `Origin` 的 **POST** 返回 `access-control-allow-origin: *` + `access-control-allow-credentials: true`；但 **OPTIONS 预检返回 `405 Method Not Allowed` / `allow: POST`，且响应头无任何 `Access-Control-Allow-*`** —— 浏览器跨域带 `Authorization` + `application/json` 必定先预检，需阶段 4 确证是否被阻断 |

## 6. 实施结果

阶段 4–5 已完成，详见 **`results.md`**：

- 结论分档：**用户所给端点「不可用于浏览器直连」**（OPTIONS 预检 405 且无 CORS 头），**产品代码「可用」**（补 CORS 后真实模型全链路通过）。
- 实证：浏览器预检失败的原始 Chrome 日志、产品降级气泡、三姿态、1374 字长回答未触发 60s 超时。
- 新发现：真实模型在短回答档位给出 `Array.prototype.map` 的概念性错误，属输出质量风险。
- 修复方向 A / B / C 已列在 `results.md` §6，**本轮未实施、未改产品代码**，等审核。
- 临时服务已停、临时探针已删、凭据未落仓库。
