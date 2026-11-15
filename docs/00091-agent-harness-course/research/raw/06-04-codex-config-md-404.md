# 批次 06 · WebFetch · https://learn.chatgpt.com/docs/config（404 页面记录）

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://learn.chatgpt.com/docs/config
- callId：call_49f02a2f6c064317bfd34c9d
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 注意：页面为 404/导航壳；正确入口是 /codex/config-file/config-reference.md（见 06-08）

---

**返回原文**

`````text
## 分析结果

**重要说明：** 您提供的网页内容实际上是一个 **"Page not found"（404 页面）**，并非 Codex CLI 的配置文档正文。页面中没有 `config.toml` 的结构说明、`approval_policy` / `sandbox_mode` 的具体取值定义，也没有安全模型（sandbox 机制）的详细正文内容。

页面内容主要是 OpenAI 开发者文档站点的**导航结构和目录索引**。以下是从导航中提取的相关信息：

---

### 1. 相关文档路径（来自导航目录）

根据页面中的链接，以下官方文档页面可能包含您需要的细节：

| 主题 | 路径 |
|---|---|
| Config 基础 | `/codex/config-file/config-basic` |
| 高级配置 | `/codex/config-file/config-advanced` |
| Config 参考（参数字典） | `/codex/config-file/config-reference` |
| 环境变量 | `/codex/config-file/environment-variables` |
| 示例配置 | `/codex/config-file/config-sample` |
| **AGENTS.md** | `/codex/agent-configuration/agents-md` |
| Subagents | `/codex/agent-configuration/subagents` |
| Rules | `/codex/agent-configuration/rules` |
| **权限 Profiles** | `/codex/permissions` |
| **沙箱（Sandboxing）** | `/codex/sandboxing` |
| 自动审查（Auto-review） | `/codex/sandboxing/auto-review` |
| Agent 审批与安全 | `/codex/agent-approvals-security` |

此外页面顶部提示：
> "For the complete documentation index, see llms.txt (`/llms.txt`). Markdown versions of documentation pages are available by appending `.md` to the page URL."

即可以通过 `https://developers.openai.com/codex/config-file/config-reference.md` 等方式获取 Markdown 原文。

---

### 2. 页面中实际出现的参数名（仅限原文）

由于正文缺失，页面中**没有**出现 `approval_policy` 或 `sandbox_mode` 的取值定义。与您问题直接相关的原文链接名称仅有：

- **Config Reference**（配置参考，推测包含 config.toml 全部参数）
- **Sample Config**（示例配置文件）
- **Agent configuration: AGENTS.md**
- **Sandboxing / Windows sandbox / WSL**（Windows 及 WSL 下的沙箱说明）

---

### 3. 建议

若要获取您需要的完整细节（`config.toml` 结构、`approval_policy`、`sandbox_mode` 取值、网络访问控制、AGENTS.md 合并规则、安全模型说明），建议抓取以下页面：

1. `/codex/config-file/config-reference`（或 `.md` 版本）
2. `/codex/sandboxing`
3. `/codex/permissions`
4. `/codex/agent-configuration/agents-md`

如需，我可以基于您后续提供的这些页面内容继续做详细提取。
`````
