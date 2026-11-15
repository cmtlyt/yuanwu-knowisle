# 批次 06 · WebFetch · https://claude.com/blog/steering-claude-code-skills-hooks-rules-subage

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- callId：call_b4d76b3249cf48e8b6de056c
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写

---

**返回原文**

`````text
# Claude Code 官方博客结构提取

**文章**：《Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents》（Anthropic，2026-06-18，5 min，作者 Michael Segner）

## 一、七种指令/配置载体

文章列出**七种方法**：CLAUDE.md 文件、rules、[skills](https://code.claude.com/docs/en/skills)、[subagents](https://code.claude.com/docs/en/sub-agents)、[hooks](https://code.claude.com/docs/en/hooks-guide)、output styles、追加 system prompt（append-system-prompt）。注：**未提及 MCP**。

每种方法控制三个维度：何时加载进上下文、是否在长会话压缩（compaction）中保留、权威性（authority）。

## 二、各载体细节

### 1. CLAUDE.md（项目根目录）
- 会话开始加载，**全程保留**；compaction 后重新读取（memoized）
- 上下文成本**高**（每行都占 token）
- 用途：构建命令、目录结构、monorepo 结构、编码规范、团队惯例
- **Tip**：保持 200 行以内，指定 owner，像代码一样 review 变更
- Monorepo：每个团队目录用子目录 CLAUDE.md，可用 `claudeMdExcludes` 排除
- **企业级**：安全策略、合规要求可通过 MDM/config management 集中部署组织级 CLAUDE.md，且不可被个人设置排除

### 2. Rules（`.claude/rules/`）
- Unscoped rules：会话开始加载，compaction 时重新注入（等同 CLAUDE.md，但浪费 token）
- **Path-scoped rules**：通过 `paths` frontmatter 只在触碰匹配文件时加载，例如：

```yaml
paths:
  - "src/api/**"
  - "**/*.handler.ts"
```
- 适用：跨切面的文件特定约束（如 "migrations are append-only"）

### 3. Skills（`.claude/skills/`）
- 会话开始只加载名称和描述；完整内容在调用时加载（slash 命令如 `/code-review` 或自动匹配）
- Compaction：已调用 skills 在共享 token 预算内重新注入，最旧的先丢弃
- 适用：**程序化工作流**（deploy 流程、release checklist、review 流程）

### 4. Subagents（`.claude/agents/`）
- 会话开始加载名称、描述、工具列表；body 只在通过 Agent tool 调用时进入**独立的隔离上下文窗口**
- 只有最终消息（摘要+元数据）返回主会话；可嵌套最多 5 层
- 适用：并行运行或需隔离的副任务（deep search、log analysis、dependency audit）
- 对比：skill 在主线程中执行可观察和引导每步；subagent 只返回结果

### 5. Hooks
- 在生命周期事件上确定性触发（文件编辑、tool 调用、session start 等），注册于 `settings.json`、managed policy settings 或 skill/agent frontmatter
- 类型：command、HTTP、mcp_tool（确定性执行）、prompt、agent（用模型判断）
- 完全绕过 compaction，上下文成本低；阻断性 hook 的 stderr 会存入上下文
- 适用：确定性自动化——运行 linter、完成后发 Slack、`PreToolUse` 阻断命令（exit code 2）、`PreCompact` 备份历史

### 6. Output styles（`.claude/output-styles/`）
- 注入 system prompt，**永不压缩**，会话开始加载，成本高
- **指令遵循权威性最高**（sits in the system prompt），需谨慎使用
- ⚠️ 会**替换默认 system prompt**（除非 frontmatter 设 `keep-coding-instructions: true`），丢失软件工程相关默认指令（变更范围、注释、安全、验证习惯）
- **Tip**：先检查内置样式 **Proactive**、**Explanatory**、**Learning**

### 7. 追加 system prompt（`append-system-prompt` flag）
- 仅**加法**修改，不改变角色；仅对当次调用生效，不跨会话持久化
- 首 请求后经 prompt caching 降本
- 适用：编码标准、输出格式、领域知识；注意指令越多遵循度递减（尤其互相矛盾时）

## 三、反模式与选择建议（"When to use each method"）

| 你正在做 | 应改为 |
|---|---|
| CLAUDE.md 里写 "Every time X, always do Y" | 用 **hooks**（确定性 vs 模型自主选择） |
| CLAUDE.md 里写 "Never do this" | 用 **hooks**（`PreToolUse` + exit 2）、[permissions](https://code.claude.com/docs/en/permissions)，组织级强制用 [managed settings](https://code.claude.com/docs/en/settings#managed-settings) |
| CLAUDE.md 里写 30 行流程 | 放到 **skills**（`.claude/skills/`） |
| API 规则未加 paths | 用 **path-scoped rule**（unscoped 等同于写进 CLAUDE.md） |
| 项目级 CLAUDE.md 写个人偏好 | 用**用户级文件**（跨所有会话加载），项目级文件只放团队通用且针对该 codebase 的偏好 |

## 四、核心原则与延伸

- **核心权衡**：每种方法都在“上下文成本 vs 权威性”之间取舍；模型能力和努力程度由另一个旋钮（[model and effort level](https://claude.com/resources/articles/claude-model-and-effort-level-in-claude-code)）控制
- 配置好后可将 skills、subagents、hooks、output styles 打包为 [plugin](https://code.claude.com/docs/en/plugins) 分享给团队
- 更多参考：[CLAUDE.md 专文](https://claude.com/resources/articles/using-claude-md-files)、[skills 构建指南](https://claude.com/resources/articles/complete-guide-to-building-skills-for-claude)、[hooks 配置](https://claude.com/resources/articles/how-to-configure-hooks)、[Claude Code best practices](https://code.claude.com/docs/en/best-practices#write-an-effective-claude-md)

**关于作用域与优先级的说明**：文章按加载时机和上下文成本组织信息，未给出显式优先级排名；仅明确 output styles（在 system prompt 中）“指令遵循权威性最高”，managed settings 为组织级不可覆盖的强制手段。
`````
