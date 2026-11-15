import { L, withKind } from '../../course-builders.ts'

export const L06 = withKind(
  L(
    'L06',
    2,
    'Codex CLI（下）：开放许可、Responses 绑定与「自家 harness 未必最优」',
    2,
    ['L05'],
    ['h-codex-approval'],
    [
      '评估 Codex CLI 的许可（Apache-2.0）与模型接入现实（wire_api 仅支持 responses）对多模型团队的影响',
      '引用 arXiv 2610.00917 与 Composio 数据说明「厂商自家 harness 不是自家模型稳定最优」',
      '给出 Codex CLI 的适用与排除场景',
    ],
    `### 开源了，但只开源了一半的「自由」

Codex CLI 的官方 README（[openai/codex](https://github.com/openai/codex)）声明 **Apache-2.0** 许可——可以自托管、审计、修改。但生态接入有一个结构性绑定：\`model_providers\` 的 \`wire_api\` **仅支持 \`responses\` 一个值**（官方 [config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)）。也就是说，接第三方模型的前提是对方兼容 OpenAI Responses 协议。内置 provider 里 \`ollama\`、\`lmstudio\` 是保留 ID（本地推理走得通），还有 gcp 与 amazon-bedrock 内置配置；但任何「只有 Chat Completions 协议」的自托管服务都进不来。

这形成了一个值得记住的形态标签：**开源外壳 + 协议锁定**。横向对比时，它既不是 Claude Code 那种全封闭，也不像 Pi/OpenCode/Hermes 那样走 OpenAI-compatible endpoint 的通用路线（F-B14 台账：Bug Hunt 系列里 Pi / OpenCode / Hermes / Kilo / Grok Build 走 OpenAI-compatible，Claude Code / DSH 走 Anthropic-compatible，Codex 走 Responses endpoint——**接入协议本身就是 harness 的派系分界线**）。

### 基准表现：三个「反直觉」

**反直觉一：自家 harness 未必自家模型最优。** [arXiv 2610.00917](https://arxiv.org/abs/2610.00917) 摘要原文：*A model's own vendor harness is not reliably its best, and higher cost does not reliably buy a higher score.* 最扎眼的数字：Terminal-Bench 4 上 GPT 在 **PI** 下比在 **DSH** 下得分更高，且每任务成本**不到 DSH 的四分之一**。Codex-GPT 这个原生配对在 66 组配置里只是普通一员，没有特殊地位。

**反直觉二：榜单上它不在头部。** Harness Leaderboard 三模型均分 Codex **44.5**（快照 2026-11-15，公告口径），落在 Qwen Code（44.7）之后、明显低于头部五家（51.4 ~ 49.2）。独立复测（Bug Hunt 系列）还抓到两个工程细节：Codex high 档的缓存命中率 **94.1%**，是所有 harness 中唯一低于 98.7% 的——提示词工程差异会直接写进成本；而它的原生优势场景（headless CI、\`--sandbox\` + \`--ask-for-approval\` 组合自动化）恰恰是榜单测不到的部分。

**反直觉三：Composio 垫底可能是配置伪影。** 同一模型（Kimi K3）26 任务里 Codex 完成 **17/26** 垫底、两次撞上 **900 秒超时上限**——其中一个任务 Pi 用 446 秒就解出了（[第三方转述，C 级](https://code404zero.com/?p=502)）。按 L02 四问：这是终止面配置（固定超时）写出的分数，不是能力结论。 Composio 团队自己的建议之一就是「检查固定超时阈值」。

### 优缺点裁决

**优点**：① Apache-2.0 + 官方仓库，企业可审计；② 沙箱自动化最强——\`workspace-write\` + \`on-request\` / \`never\` + granular approval 组合是无人值守 CI 的现成答案（L05）；③ AGENTS.md 生态兼容（\`project_doc_*\` 键族 + \`model_instructions_file\`），且这条标准正被多家 harness 采纳；④ 协议绑定反向保证了 Responses 特性（远程压缩 \`remote_compaction\`、Web 搜索等 capabilities）在自家生态内的一等支持。

**缺点**：① Responses 协议锁定，多模型团队受限（对比 OpenCode/Kilo 的 75+ providers、Hermes 的 18+ providers）；② 榜单成绩中游且差距显著（44.5 vs 头部 49.2+，官方口径）；③ 配置面大且变动快——\`untrusted\`/\`on-failure\` 被移除/弃用、文档站从 developers.openai.com 迁到 learn.chatgpt.com（404 与重定向并存），旧教程失真率高，一切参数以 [现行 config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) 为准；④ Composio 类短超时场景需要手工调终止参数，默认值未必合适。

### 适用与排除

**适合**：CI/CD 与无人值守自动化（沙箱 + headless 是第一梯队）；已在 OpenAI 生态（Responses API、ChatGPT Work 云端）的团队；需要「开源可审计但生态统一」的中间路线。**排除**：多厂商模型混用（选 Kilo/OpenCode/Hermes）；需要 Chat-Completions-only 自托管模型（协议不符）；把「榜单排名」当唯一决策依据的团队——先跑 L02 四问，再看自己的任务域。

到这里，两个「权限控制面」的极端答案都拆完了：Claude Code 把权限做成产品，Codex 把权限做进操作系统。下一章的 DeepSeek Harness 换了赛道——它不在权限上卷，而是把**整个 harness 做成插件树**。

### 追问与辨析：model_providers 的现实约束与一份可抄的形状

\`wire_api\` 仅支持 \`responses\` 是 Codex CLI 生态评估里最容易踩的坑，值得把接入现实展开一层。官方 config-reference 里 \`model_providers.<id>\` 的关键子项包括：\`base_url\`、\`env_key\`（API key 环境变量，官方推荐它而不是 \`experimental_bearer_token\`）、\`wire_api\`（唯一取值 \`responses\`）、\`requires_openai_auth\`、重试与超时参数（\`request_max_retries\` 默认 4、\`stream_max_retries\` 默认 5、\`stream_idle_timeout_ms\` 默认 300000），以及 \`capabilities.external_web_access\` / \`remote_compaction\` 这类能力开关。内置保留 ID 是 \`openai\`、\`ollama\`、\`lmstudio\`，另有 gcp 与 amazon-bedrock 内置配置（\`project_id\` / \`location\` / \`aws.profile\` / \`aws.region\`）：

\`\`\`toml
# ~/.codex/config.toml —— 自定义 provider 的完整形状（对照官方 config-reference）
[model_providers.my-gateway]
name = "My Responses-compatible Gateway"
base_url = "https://gateway.internal.example.com/v1"
env_key = "MY_GATEWAY_API_KEY"          # 官方推荐 env_key 而非 bearer token
wire_api = "responses"                  # 唯一取值；Chat-Completions-only 服务无法接入
request_max_retries = 4
stream_idle_timeout_ms = 300000

[model_providers.my-gateway.auth]
command = "op login --json"             # 动态取凭据；不得与 env_key 组合
timeout_ms = 5000
refresh_interval_ms = 300000

model_provider = "my-gateway"
\`\`\`

这个形状解释了「开源外壳 + 协议锁定」的实际含义：接入自由度取决于你的网关是否愿意实现 Responses 协议。很多自托管推理栈（vLLM、Ollama）主打 Chat Completions 兼容，Responses 支持参差不齐——所以「Codex 能不能接我们的私有模型」的答案不在 Codex，在模型的协议面。选型评审时把这一条放进 checklist，能省掉一次失败 PoC。

顺带修正一个容易混淆的点：\`ollama\` / \`lmstudio\` 是内置保留 ID（不可覆盖），所以本地模型并非不能接——前提仍是本地栈暴露了 Responses 兼容端点。换句话说，Codex 的模型中立性是「协议中立性减一档」：文件开源、凭据灵活、但协议单一。横向选型时，把它与 Pi/OpenCode 的 OpenAI-compatible 路线（L24 派系表）放在同一格对比即可。
`,
    null,
    [
      {
        text: '想给 Codex CLI 接一个只支持 OpenAI Chat Completions 协议的自托管模型，官方支持吗？',
        options: [
          '支持，model_providers 里随便配',
          '不支持——model_providers 的 wire_api 只支持 responses 一个值；协议不匹配无法接入',
          '支持，改个 base_url 就行',
          '只有付费版支持',
        ],
        answer: 1,
        explain:
          '官方 config-reference：model_providers.<id> 的 wire_api 取值仅 responses（内置 openai/ollama/lmstudio 为保留名）。Codex CLI 与 OpenAI Responses API 是结构性绑定，接第三方模型要对方兼容 Responses 协议。',
        concept: 'h-codex-approval',
      },
      {
        text: 'arXiv 2610.00917 关于「厂商自家 harness」的结论是？',
        options: [
          '自家模型配自家 harness 永远最强',
          "A model's own vendor harness is not reliably its best——厂商配对没有稳定优势，且更高成本买不来更高分",
          '厂商 harness 都很弱',
          '只对开源模型成立',
        ],
        answer: 1,
        explain:
          "论文摘要原文：A model's own vendor harness is not reliably its best, and higher cost does not reliably buy a higher score. 证据如 Terminal-Bench 4 上 GPT 在 PI 下高于 DSH 且每任务成本不到 1/4。",
        concept: 'h-codex-approval',
      },
      {
        text: 'Composio 26 任务对比里 Codex 完成数垫底（17/26），最合理的解读是？',
        options: [
          'Codex CLI 是最差的 harness',
          '证据显示它两次撞上 900 秒超时上限——同一任务 Pi 用 446 秒解出；「卡在固定超时」与「能力不足」是两类问题，先查配置伪影再下结论',
          '说明 OpenAI 模型不行',
          '数据是假的',
        ],
        answer: 1,
        explain:
          'Composio 数据（C 级转述）明确记录 Codex 两次撞 900 秒上限，而同一任务 Pi 446 秒解出。这正是 L02 四问的「配置伪影」检查项：终止条件与超时设置会直接写出分数。',
        concept: 'h-codex-approval',
      },
      {
        text: 'Codex CLI 的许可证与 Claude Code 的关键差异是？',
        options: [
          '都是专有',
          'Codex CLI 是 Apache-2.0（官方 README），可自托管审计；Claude Code 专有（© Anthropic PBC）',
          'Codex 是 MIT，Claude 是 GPL',
          '都没开源',
        ],
        answer: 1,
        explain:
          '官方 README 列 Apache-2.0；F-B13 台账核对两者许可证。Codex 开源但协议绑定（Responses API），形成「开源外壳 + 协议锁定」的混合形态。',
        concept: 'h-codex-approval',
      },
    ],
    [
      [
        'Responses API',
        'OpenAI 的会话式补全协议；Codex CLI 的 model_providers.wire_api 仅支持此值，是与第三方模型的结构性绑定',
      ],
      ['开源外壳 + 协议锁定', '代码开源可审计，但生态接入被单一协议锁定的 harness 形态'],
      ['配置伪影', '超时、输出上限等 harness 配置造成的分数失真——Codex 在 Composio 撞 900s 上限是典型案例'],
    ],
    [
      '把「Codex 开源」当成「可自由接任何模型」——代码 Apache-2.0，但 wire_api 锁定 Responses 协议',
      '看到 Composio 垫底就判死刑——先查超时/输出上限等配置伪影（L02 四问③④），再看真实能力差距',
      '假设「OpenAI 出品所以配 GPT 最优」——arXiv 论文实测厂商配对没有稳定优势',
    ],
  ),
  'theory',
)
