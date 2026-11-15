# Wave 1 第二十七批：Capstone A 实现三课（L129–L131）

## 目标

按 L128 定下的施工图，落地 Capstone A 的前三块：**核心运行时 + 工具 + 手写 MCP**（L129）、**supervisor 多 Agent 编排**（L130）、**链路追踪与回放**（L131）。三课都是 `capstone`，按 00055 下限：正文 **3000 字** / 代码 **2500 字符**，余量 >50；每课 ≥1 表格、≥2 独立 `:::deep` / `:::warn` callout、≥1 可运行代码块。

必须延续 L128 的既定事实，不得另起炉灶：

- 场景是**运维助手**，四个动作：查日志、查指标、重启服务、确认告警；重启与确认带副作用且不可逆。
- 工具第一属性是权限单元：副作用等级、幂等性、审批要求写进类型；\`danger\` 工具无审批票据在类型层面就不可执行。
- 目录骨架 \`runtime/ tools/ orchestrator/ observability/ evals/ infra/\`；四个验收场景；12 条评测集含 4 条负例；风险登记表五项。
- 硬约束「不复用此前课程代码」：允许借鉴判断，禁止复用实现。

三课的特殊风险是**把 L128 的设计复述一遍**。统一定位：L128 交付图纸，L129–L131 交付**能跑的代码 + 能进 CI 的断言**，每课开头只引用一行图纸结论，随即进入实现。

| 课 | 本批唯一要回答的问题 | 明确不讲 | 必须回填的风险项 |
|---|---|---|---|
| L129 | 有界状态机、工具权限收口、手写 MCP 怎么落地并可恢复 | supervisor 分工（L130）、追踪（L131） | 误重启、循环超预算、恢复时重复执行 |
| L130 | supervisor 只做路由时，越权与漏执行怎么被挡住 | 工具实现、追踪实现 | 越权执行、审批绕过（路由层部分） |
| L131 | 状态转移与工具调用怎么统一产出事件，回放如何证明可复现 | 仪表盘 UI、评测打分 | 审计缺失 |

## 现状

| 课 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|
| L129 | 实战 Capstone A：从零实现核心运行时 + 工具 + 手写 MCP | 310 / 3000 | 537 / 2500 |
| L130 | 实战 Capstone A：从零实现多 Agent 编排（supervisor + 专门角色） | 338 / 3000 | 443 / 2500 |
| L131 | 实战 Capstone A：从零接入链路追踪与回放 | 301 / 3000 | 452 / 2500 |

## 课型复核

三课交付物都是可运行物 + 验收断言 → `capstone` ✓，沿用原标注。标题含「实战」不触犯 00058 H1（该规则只禁 theory / overview）。goals 写实现类动词。L142 虽是「课程总览」，但 gate 明确「Capstone 阶段的课不允许标 overview（复盘课也要有真实实现与验收断言）」，因此后续 L142 仍按 capstone 写，并给它一个可运行的自检验收器。

概念 id 从 `git show HEAD` 抄原骨架：`cap-a-runtime` / `cap-a-multi` / `cap-a-trace`。

## 术语统一

- **审批票据（Approval）**：danger 动作执行前必须携带的、带签发人与有效期的凭证。
- **幂等键**：动作标识 + 目标 + 会话，恢复时用它查已完成集合，防止重放重复执行。
- **执行入口收口**：所有工具调用只经由一个 \`execute()\`，旁路调用在 CI 里被穷举调用图检出。
- **路由表**：supervisor 唯一产物，只决定「谁来处理」，不产生动作、不改状态。
- **事件同源**：状态转移与工具调用从同一处产生事件，回放才能按序还原。

## 变更计划

1. L129：状态机（\`running / awaiting_approval / recovering / done / aborted\`）+ 预算中断 + 持久化恢复、工具契约与唯一执行入口、手写 MCP 三帧（\`initialize / tools/list / tools/call\`）客户端与服务端、幂等与审批票据、五条回归断言。
2. L130：supervisor 路由表 + 三个专门角色（诊断 / 执行 / 复核）、升级人工的条件、越权与漏执行的负例断言、路由不产生副作用的硬检查。
3. L131：统一事件源 + \`AsyncLocalStorage\` span 上下文 + 回放器（按事件重建状态机）+ 回放一致性断言 + 审计缺失的检出。
4. 每课末尾单列「与相邻课的分工」，并明确本课回填了 L128 风险登记表的哪一行。
5. 双扫描、渲染抽查、`--update-baseline`、三门禁。

## 验证方案

- `content-gate --only=L129,L130,L131` 三课 ✓，正文余量 >50 字、代码余量 >50 字符。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿。

## 实测（实施后回填）

<section id="result">

### 最终体量（content-gate --only=L129,L130,L131 --verbose）

| 课 | 正文 / 下限 | 余量 | 代码 / 下限 | 推导用时 |
|---|---|---|---|---|
| L129 | 3299 / 3000 | +299 | 10852 / 2500 | 79 min |
| L130 | 3206 / 3000 | +206 | 9663 / 2500 | 74 min |
| L131 | 3258 / 3000 | +258 | 9433 / 2500 | 73 min |

三课余量均 >50 字，代码余量远超下限；未靠缩进代码块凑数，六个代码块都是可运行骨架或可进 CI 的断言。

### 实现落点

- **L129**：以「重启了两次」事故开场。五态状态机 \`running / awaiting_approval / recovering / done / aborted\` + \`transition()\` 白名单；步数 / token / 墙钟三硬出口在调用模型之前检查；\`resume()\` 从 \`action.committed\` 事件重建 \`done\` 集合而不是信任快照；\`ToolGateway.execute()\` 作为唯一执行入口，审批票据绑任务、动作、签发人、有效期；手写 MCP 三帧（\`initialize / tools/list / tools/call\`）服务端只是网关薄壳，不自己执行；五条回归断言含「无审批拒绝」「票据绑动作」「恢复不重复」「预算触顶」「调用图占位」。回填 L128 风险表前三项。
- **L130**：以「supervisor 顺手补了一次工具调用」事故开场。\`RouteDecision\` 纯数据、不含回调；supervisor 工具集为空、构造器不接收网关，结构上无法产生副作用；\`decideRoute()\` 是同步纯函数，模型只产出 \`Diagnosis\`，不确定性不进控制流；新增「接缝」表明确只消费 L129 的 \`ToolGateway\` / \`AgentEvent\` / \`RuntimeState\` 三处，并用 \`assertLevelTableMatchesGateway()\` 防工具等级表漂移；覆盖率以 \`action.committed\` 事件而非分发器回执为准，专治静默漏执行；升级人工是带原因与快照引用的 \`Escalation\`；六条断言四条是负例。
- **L131**：以「复盘会拼不出动作链」开场。不另建 tracing 事件，只给 L129/L130 已有事件补 \`seq / parentSeq / source\`；六条事件不变量表（seq 单调、parentSeq 可解析、决策先于动作、提交必有结果、终态恰好一次、事件不可变）；\`AsyncLocalStorage\` 传 span 上下文，\`span.end\` 的 start/end 两阶段由同一 emitter 写出，异常路径也补 end；\`buildTree()\` 把孤儿与断链判硬错误；\`replay()\` 是纯数据变换，\`assertReplayMatchesRecovery()\` 双向比对终态 / 序号 / 已提交集合；\`assertAuditComplete()\` 把「审计缺失」具体化为五条可失败检查；给出一次标准运行的六行事件表，并区分「骨架事件全量」与「调试 span 可采样」。回填 L128 风险表「审计缺失」。

三课末尾都单列「与相邻课的分工」与风险登记表回填表，明确哪些项已闭合、哪些仍需 L132 / L133 接手，不宣称全部消除。

### 验证结果

- 双扫描：\`tmp-backtick.mjs\` 无裸反引号、\`tmp-escape.mjs\` 无反斜杠转义问题。补扫「模板串内除 \` / \\ / \$ 外的所有单反斜杠」也无命中。
- 渲染抽查：L129 table=3 / callout=3 / code=6；L130 table=4 / callout=3 / code=5；L131 table=4 / callout=3 / code=6；三课 \`leftover=0 / fenceLeak=0\`，均为 \`capstone\`。
- \`oxfmt\` → \`--update-baseline\` → \`pnpm verify\` / \`pnpm lint\` / \`pnpm typecheck\`：全绿（verify 概念引用与题目引用均通过、lint 0e/4w、typecheck 0e/9w）。
- 全局达标 **129 → 132/142**，baseline 豁免 **13 → 10**（剩余 L132–L134、L136–L142）。

### 本批踩到并修掉的问题

1. L129 回归断言里写了代码正则 \`/\\.run\\(\\s*parsed/\`，\`tmp-escape.mjs\` 抓到 \`\\s\`；同时 \`\\.\` / \`\\(\` 也会被模板串吞掉但不在该脚本的扫描字符集里。改为不含反斜杠的 \`text.includes('.run(parsed')\` 判断，并补了一次全量单反斜杠扫描。
2. L130 初稿凭空引入 \`gatewayLevelOf()\` 与 \`Executor.runReadOnly()\`，与 L129 实际接口不符。改为 \`TOOL_LEVELS\` 常量 + \`assertLevelTableMatchesGateway()\` 启动自检，并让所有角色（含只读）统一走 \`ToolGateway.execute()\`；顺带把 analyze / verify 步骤补上 \`action\`，使「决策必有动作名」成立。
3. L130 / L131 初稿正文 2868 / 2825，低于 3000 且因在豁免名单里 gate 只提示不报红。补的是两处真实缺口而非灌水：L130「接缝：复用了 L129 的哪三样东西」表 + 工具等级漂移自检；L131「一次完整运行长什么样」六行事件表 + 骨架事件与调试 span 的采样口径分界。补完 3206 / 3258。
4. L131 \`replay()\` 初稿用 \`...{ tenantId } as never\` 塞未使用参数，属自伤写法；改为在 \`ReplayResult\` 里显式声明 \`taskId / tenantId\` 并正常返回。

**规律复现**：capstone 三课初稿都不缺代码（9433–10852 字符），缺的是把代码之间的约束讲清楚的正文。补写方向应是「接缝 / 不变量 / 一次运行长什么样」，而不是继续堆示例。

**改动未提交。**

</section>
