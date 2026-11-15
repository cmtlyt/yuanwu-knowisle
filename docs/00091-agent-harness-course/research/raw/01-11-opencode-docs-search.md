# 批次 01 · 第 11 条 · WebSearch

- 暂存文件：`research/raw/01-11-opencode-docs-search.md`
- 来源：会话记录 `9471105c-…jsonl` 中该工具调用的原始返回文本，机械导出、未经改写
- 核实日期：2026-11-15
- 可信级别：搜索摘要（多为二手，须按 evidence 台账定级）
- 调用参数：{   "query": "OpenCode 官方文档 Anomaly MIT 架构 state machine runner permission 配置" }

---
**返回原文**

````text
# Search Results for "OpenCode 官方文档 Anomaly MIT 架构 state machine runner permission 配置"

## 1. [The open source coding agent](https://opencode.ai/)

The open source coding agent OpenCode。 Log in with ChatGPT Plus or Pro or GitHub Copilot. Or use an OpenCode subscription. Bring your own tools Connect the services you already use with MCP servers, hook into OpenCode with plugins, and teach agents your workflows with skills. GitHub Linear Figma Sentry Notion Slack Supabase Stripe Open source With over 220,000 GitHub stars, 1,000+ contributors, and over 20,000 commits, OpenCode is used and trusted by over 22M developers every month. GitHub stars 227K Contributors 1K+ Monthly devs 22M OpenCode contributors MIT licensed (opens in a new tab). Built in the open by Anomaly (opens in a new tab) and 1,092 contributors (opens in a new tab). Star on GitHub227K, 226,557 stars (opens in a new tab)Contribute (opens in a new tab) Console Console Everything you need for working with AI High-quality inference for frontier and open-weight models, low-cost subscriptions with generous limits, and the tools your team needs to manage spend and collaborate effectively. Start for free

**URL:** https://opencode.ai/

---

## 2. [權限](https://opencode.ai/docs/zh-tw/permissions)

權限 OpenCode。權限 OpenCode 使用 permission 設定來決定某個操作是否應自動執行、提示您審批,還是被阻止。 從 v1.1.1 開始,舊版 tools 布林設定已被廢棄,並已合併到 permission 中。舊版 tools 設定仍然支援,以保持向後相容。 操作 每條權限規則解析為以下之一: "allow" — 無需審批直接執行 "ask" — 提示審批 "deny" — 阻止該操作 設定 您可以全域設定權限(使用 *),並覆寫特定工具的權限。 opencode.json複製已複製失敗 { "$schema": "https://opencode.ai/config.json", "permission": { "*": "ask", "bash": "allow", "edit": "deny" } } 您還可以一次性設定所有權限: opencode.json複製已複製失敗 { "$schema": "https://opencode.ai/config.json", "permission": "allow" } 細粒度規則(物件語法) 對於大多數權限,您可以使用物件來根據工具輸入套用不同的操作。 opencode.json複製已複製失敗 { "$schema": "https://opencode.ai/config.json", "permission": { "bash": { "*": "ask", "git *": "allow", "npm *": "allow", "rm *": "deny", "grep *": "allow" }, "edit": { "*": "deny", "packages/web/src/content/docs/*.mdx": "allow" } } } 規則透過模式比對進行評估,最後比對的規則優先。常見做法是將萬用的 "*" 規則放在最前面,更具體的規則放在後面。 萬用字元 權限模式使用簡單的萬用字元比對: * 比對零個或多個任意字元 ? 精確比對一個字元 所有其他字元按字面值比對 主目錄展開 您可以在模式開頭使用 ~ 或 $HOME 來參照您的主目錄。這對於 external_directory 規則特別有用。

**URL:** https://opencode.ai/docs/zh-tw/permissions

---

## 3. [权限](https://opencode.ac.cn/docs/permissions)

权限 OpenCode。权限 控制哪些操作需要批准才能运行。 OpenCode 使用 permission 配置来决定某个操作是应自动运行、提示你还是被阻止。 从 v1.1.1 开始,旧版布尔值配置 tools 已被弃用,并已合并到 permission 中。为保持向后兼容,旧的 tools 配置仍受支持。 操作 每个权限规则最终都会解析为以下之一 "allow" — 无需批准即可运行 "ask" — 提示批准 "deny" — 阻止操作 自动模式 使用 --auto 启动 OpenCode,以自动批准未明确拒绝的权限请求。 终端窗口 opencode --auto 你也可以在 opencode run 中使用自动模式。 终端窗口 opencode run --auto "Refactor this module" 明确的 "deny" 规则仍然有效。自动模式只会更改原本需要请求批准的请求。 在 TUI 中,打开命令面板并选择 启用自动批准权限 或 禁用自动批准权限 来切换模式。当自动模式激活时,提示符会在当前智能体旁边显示一个弱化的 auto 指示器。 配置 你可以全局设置权限(使用 *),并覆盖特定工具。 opencode.json { "$schema": "https://opencode.ac.cn/config.json", "permission": { "*": "ask", "bash": "allow", "edit": "deny" } } 你也可以一次性设置所有权限 opencode.json { "$schema": "https://opencode.ac.cn/config.json", "permission": "allow" } 精细规则(对象语法) 对于大多数权限,你可以使用对象根据工具输入应用不同的操作。

**URL:** https://opencode.ac.cn/docs/permissions

---

## 4. [Permissions](https://opencode-tutorial.com/zh/docs/permissions)

Permissions OpenCode Tutorial。Permissions Control which actions require approval to run. OpenCode 使用 permission 配置来决定是否自动运行、提示您或阻止给定的操作。 从 v1.1.1 开始,旧的 tools 布尔配置已被弃用,并已合并到 permission 中。旧的 tools 配置仍然支持向后兼容。 ##操作 (Actions) 每个权限规则解析为以下之一: "allow" — 无需批准即可运行 "ask" — 提示批准 "deny" — 阻止操作 ##配置 (Configuration) 您可以全局设置权限(使用 *),并覆盖特定工具。 bash { "$schema": "https://opencode.ai/config.json", "permission": { "*": "ask", "bash": "allow", "edit": "deny" } } 您也可以一次设置所有权限: bash { "$schema": "https://opencode.ai/config.json", "permission": "allow" } ##细粒度规则(对象语法) 对于大多数权限,您可以使用对象来根据工具输入应用不同的操作。 bash { "$schema": "https://opencode.ai/config.json", "permission": { "bash": { "*": "ask", "git *": "allow", "npm *": "allow", "rm *": "deny", "grep *": "allow" }, "edit": { "*": "deny", "packages/web/src/content/docs/*.mdx": "allow" } } } 规则通过模式匹配进行评估,最后匹配的规则获胜。 一种常见的模式是首先放置捕获所有 "*" 规则,然后在之后放置更具体的规则。 ###通配符 (Wildcards) 权限模式使用简单的通配符匹配: * 匹配零个或多个任意字符 ?

**URL:** https://opencode-tutorial.com/zh/docs/permissions

---

## 5. [权限](https://opencode.ubitools.com/zh-cn/permissions/)

权限 OpenCode。权限 控制哪些操作需要你的批准。 OpenCode 通过 permission 配置来决定某个操作是自动执行、向你确认,还是直接被阻止。 从 v1.1.1 起,旧的布尔型 tools 配置已废弃,并合并进 permission 中。为了兼容旧版本,tools 仍然可以使用,但不再推荐。 动作类型 每条权限规则最终会解析为以下三种之一: "allow" —— 直接执行,不需要确认 "ask" —— 执行前弹出提示,询问是否允许 "deny" —— 直接禁止执行 配置方式 你可以通过通配符(如 *)设定全局默认,再为具体工具单独覆盖: opencode.json { "$schema": "https://opencode.ai/config.json", "permission": { "*": "ask", "bash": "allow", "edit": "deny" } } 也可以直接把所有权限一次性设为同一个值: opencode.json { "$schema": "https://opencode.ai/config.json", "permission": "allow" } 细粒度规则(对象语法) 对于大部分权限,你都可以使用对象语法,按输入内容做更细的区分: opencode.json { "$schema": "https://opencode.ai/config.json", "permission": { "bash": { "*": "ask", "git *": "allow", "npm *": "allow", "rm *": "deny" }, "edit": { "*": "deny", "packages/web/src/content/docs/*.mdx": "allow" } } } 规则按模式匹配,最后匹配到的规则优先。常见写法是先写一个总的 "*" 规则,再写更具体的规则覆盖它。 通配符 权限模式使用简单的通配匹配: * 匹配任意长度的任意字符(包括空字符串) ?

**URL:** https://opencode.ubitools.com/zh-cn/permissions/

---

*Found 5 results • Provider: 1 • Search performed on 2026-11-15*
````
