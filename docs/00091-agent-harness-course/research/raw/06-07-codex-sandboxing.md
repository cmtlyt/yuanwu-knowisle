# 批次 06 · WebFetch · https://learn.chatgpt.com/docs/sandboxing.md

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://learn.chatgpt.com/docs/sandboxing.md
- callId：call_124330ad3050420e8a96c016
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写

---

**返回原文**

`````text
# Codex Sandboxing 文档细节提取

## 概述
文档涵盖 Codex 的 sandbox 机制：sandbox 是让 agent 自主运行但不无限制访问本机的边界，与 approval 机制配合工作——"sandbox defines technical boundaries. The approval policy decides when the agent must stop and ask before crossing them."

---

## 1. Sandbox 机制实现（平台原生强制）

- 适用于所有 spawned commands（如 `git`、包管理器、test runners），不仅限于内置文件操作
- "Codex uses platform-native enforcement on each OS"，实现因平台而异：
  - **macOS**：使用内置 **Seatbelt** framework，开箱即用（out of the box）
  - **Linux / WSL2**：依赖 `bubblewrap`（`bwrap`）
    - 安装：`sudo apt install bubblewrap`（Ubuntu/Debian）或 `sudo dnf install bubblewrap`（Fedora）
    - Codex 使用 `PATH` 上找到的第一个 `bwrap` executable；若缺失则回退到 bundled helper，但该 helper "requires support for unprivileged user namespace creation"
    - 缺失 `bwrap` 或无法创建 user namespace 时，Codex 会在启动时发出警告
  - **Windows**：
    - PowerShell 中运行：使用原生 **Windows sandbox**
    - WSL2 中运行：使用 **Linux sandbox** 实现（即 bubblewrap 路径）

### Ubuntu AppArmor 细节
- Ubuntu 25.04：从官方仓库安装 bubblewrap 无需额外 AppArmor 配置；`bwrap-userns-restrict` profile 随 `apparmor` 包发布于 `/etc/apparmor.d/bwrap-userns-restrict`
- Ubuntu 24.04：安装后可能仍告警，需手动加载 profile：
  ```bash
  sudo apt install apparmor-profiles apparmor-utils
  sudo install -m 0644 \
    /usr/share/apparmor/extra-profiles/bwrap-userns-restrict \
    /etc/apparmor.d/bwrap-userns-restrict
  sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict
  ```
- 备用方案（禁用限制）：`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`

---

## 2. `sandbox_mode` 取值（config.toml）

| 取值 | 行为 |
|---|---|
| `read-only` | agent 可查看文件，但未经 approval 不能编辑文件或运行命令 |
| `workspace-write` | agent 可读文件、在 workspace 内编辑、在该边界内运行常规本地命令；本地工作的默认低摩擦模式 |
| `danger-full-access` | agent 无 sandbox 限制运行，移除 filesystem 与 network 边界；仅在你希望 agent 全权访问时使用 |

---

## 3. `approval_policy` 取值

| 取值 | 行为 |
|---|---|
| `on-request` | agent 默认在 sandbox 内工作，需要超出边界时询问 |
| `never` | agent 不会因 approval 提示而停下 |

- ⚠️ `untrusted` 已不再支持作为可选 approval policy（需迁移，见 agent-approvals-security 文档）
- `approvals_reviewer` 取值：
  - `user`：approval 提示呈现给用户（默认）
  - `auto_review`：符合条件的 approval 提示交给 reviewer agent 处理（automatic review）

---

## 4. 推荐组合与关键配置

- **Full access** = `sandbox_mode = "danger-full-access"` + `approval_policy = "never"`
- **低风险本地自动化预设** = `sandbox_mode = "workspace-write"` + `approval_policy = "on-request"`，或对应 CLI flags：`--sandbox workspace-write --ask-for-approval on-request`
- 相关 config keys：`sandbox_mode`、`approval_policy`、`approvals_reviewer`、`sandbox_workspace_write.writable_roots`
- `writable_roots`：需跨多目录写入时扩展可写位置，而不必完全移除 sandbox
- 特定例外场景建议使用 **rules**（允许/提示/禁止 sandbox 外的 command prefixes），而非笼统扩大访问
- Automatic review 不改变 sandbox 边界，只是边界上 approval 请求的一种 reviewer；sandbox 内已允许的操作无需额外审查

---

## 5. 网络访问默认状态

- Sandbox 环境定义 "whether commands can use the network"；默认网络访问受限，超出边界的网络访问需走 approval 流程（如 approval 触发类型包括 "blocked network access"）
- **ChatGPT Work（web surface）**：
  - 在 **Settings > Data controls > Work network access** 管理 network access
  - 开启 **Allow public internet access** 后命令可访问公网；关闭时命令只能访问 managed allowlist 中的必需 hostnames
  - Web search、plugins、remote browser 有独立控件；更改在当前 run 结束并刷新执行环境后生效

---

## 6. 安全模型说明

- **双控件协同**：sandbox 是技术边界，approval 是跨越边界的时机决策
- **减少 approval fatigue**：低风险命令（读文件、编辑、常规项目命令）在已批准边界内自主运行，无需逐条确认
- **信任模型**："You aren't just trusting the agent's intentions; you are trusting that the agent is operating inside enforced limits." —— 即信任的是被强制执行的边界而非 agent 意图
- **最佳实践**：approval 提供多档 scope（如 approve once / for the session）时选最窄者；保持 project boundary 为默认；用独立 projects/worktrees 而非跨无关仓库扩大访问

---

## 7. Windows / WSL 差异摘要

| 环境 | 实现方式 | 前置条件 |
|---|---|---|
| macOS | Seatbelt | 无 |
| Linux | bubblewrap (`bwrap`) | 安装 bubblewrap 包 |
| WSL2 | Linux sandbox 实现 | 安装 bubblewrap 包 |
| Windows（native，PowerShell） | Windows sandbox | 无（原生支持） |

---

## 8. 企业/托管环境（Work Cloud）补充

- Cloud execution：Work cloud 容器沿用 Work Cloud policies，桌面浏览器 site rules 不自动适用于 cloud browsers
- Local execution：由 supported local execution requirements 管辖
- Policy 优先级（高→低）：OS-specific environment override → all-OS environment override → Global
- 本地执行中：MDM 与 legacy managed-device requirements > Agent Security > 设备 system requirements file
`````
