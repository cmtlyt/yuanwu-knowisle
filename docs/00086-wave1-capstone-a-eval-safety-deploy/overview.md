# Wave 1 第二十八批：Capstone A 横切三课（L132–L134）

## 目标

按 L128 施工图的顺序，落地 Capstone A 最后三块并收口整个分支：**评测与回归基线**（L132）、**安全护栏 + 成本优化 + 降级兜底**（L133）、**部署上线 + 全链路复盘**（L134）。三课都是 `capstone`，按 00055 下限：正文 **3000 字** / 代码 **2500 字符**，余量 >50；每课 ≥1 表格、≥2 独立 `:::deep` / `:::warn` callout、≥1 可运行代码块。

必须延续前四课的既定接口，不得另起炉灶：

- L129：`RuntimeState` 五态、`ToolGateway.execute()` 唯一执行入口、`AgentEvent` / `action.committed`、`Approval` 票据四元组、MCP 三帧。
- L130：`RoutePlan` / `RouteDecision` 纯数据、supervisor 不持网关、`coverage()` 以事件为准、`Escalation` 有类型。
- L131：append-only 统一事件流（`seq / parentSeq / source`）、`replay()` 纯数据变换、`assertReplayMatchesRecovery()` 双向一致性、`assertAuditComplete()` 五检查、骨架事件全量 / 调试 span 可采样的分层口径。
- L128：运维助手四动作、12 条评测集含 4 条负例、风险登记表五项、目录骨架 `runtime/ tools/ orchestrator/ observability/ evals/ infra/`。

本批的特殊风险是**把三课写成 L80 / L84 / L124 的复述**。统一定位：前面那些课讲「评测 / 安全 / 降级的原理」，本批讲的是**把原理装进这套具体代码里并给出可失败断言**。每课开头只引一行前课结论，随即进入本仓库的实现。

| 课 | 本批唯一要回答的问题 | 明确不讲 | 必须回填的风险项 |
|---|---|---|---|
| L132 | 12 条评测集怎么落地成能拦住倒退的基线，越权为何必须判硬失败 | 评测原理、judge 偏差（L80/L82） | 越权执行、漏执行（评测层） |
| L133 | 静态调用图、沙箱、成本路由、降级阶梯怎么接进现有执行入口而不改语义 | 注入载荷分类、通用熔断算法（L83/L89/L124） | 审批被绕过（事前拦截） |
| L134 | 六课组件怎么装配成可灰度、可回滚、可复盘的服务 | 状态外置与灰度原理（L123/L125） | 全部五项的收口验证 |

## 现状

| 课 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|
| L132 | 实战 Capstone A：从零接入评测与 Agent 检测，建立回归基线 | 310 / 3000 | 450 / 2500 |
| L133 | 实战 Capstone A：从零加安全护栏 + 成本优化 + 降级兜底 | 332 / 3000 | 395 / 2500 |
| L134 | 实战 Capstone A：从零部署上线 + 全链路复盘 | 325 / 3000 | 413 / 2500 |

## 课型复核

三课交付物都是可运行物 + 验收断言 → `capstone` ✓，沿用原标注。标题含「实战」不触犯 00058 H1（该规则只禁 theory / overview）。goals 全部改写为实现类动词。L134 虽含「复盘」，仍必须给真实装配代码与演练断言，不得写成纯文档课。

概念 id 从原骨架抄：`cap-a-eval` / `cap-a-safety` / `cap-a-deploy`（`concepts.ts` 已注册），`quiz[].concept` 全部沿用同一 id。

## 术语统一

- **回归基线**：固定用例集 + 只增不改的分数记录，跌破即判倒退。
- **硬失败**：负例里出现越权动作直接判整次运行失败，不参与加权评分。
- **静态调用图**：穷举所有 `execute()` / `tool.run()` 调用点，旁路即 CI 失败（L129 的 t5 占位在本批落地）。
- **降级阶梯**：模型 / 工具失败时逐级退让，每级都有明确的能力损失与用户可见标记。
- **交付物**：代码 + 架构图 + 评测基线 + 部署配置 + 复盘文档 + 演示脚本，缺一不可。

## 变更计划

1. L132：`EvalCase` 12 条（4 负例）+ `runCase()` 用确定性假模型与假网关跑出轨迹、`score()` 把越权判硬失败、`assertBaseline()` 棘轮、`detectSpin()` 空转检测、`AgentDetector` 三类异常信号。
2. L133：`assertCallGraph()` 静态穷举调用点 + `Sandbox` 参数与凭证隔离 + `routeByCost()` 按任务复杂度分流 + `DegradationLadder` 四级阶梯 + 演练断言。
3. L134：`createApp()` 装配六课组件 + `/live` `/ready` 分离 + 会话分桶灰度 + `RunManifest` 四版本号 + `deployDrill()` 五断言 + 复盘表与演示脚本。
4. 每课末尾单列「与相邻课的分工」，L134 额外给出 L128 风险登记表五项的最终收口状态与 Capstone A → B 的分叉说明。
5. 双扫描、渲染抽查、`--update-baseline`、三门禁。

## 验证方案

- `content-gate --only=L132,L133,L134` 三课 ✓，正文余量 >50 字、代码余量 >50 字符。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿。

## 实测（实施后回填）

<section id="result">

### 最终体量（content-gate --only=L132,L133,L134 --verbose）

| 课 | 正文 / 下限 | 余量 | 代码 / 下限 | 推导用时 |
|---|---|---|---|---|
| L132 | 3109 / 3000 | +109 | 14017 / 2500 | 95 min |
| L133 | 3222 / 3000 | +222 | 8497 / 2500 | 68 min |
| L134 | 3381 / 3000 | +381 | 6841 / 2500 | 62 min |

三课余量均 >50 字；L132 代码偏长是因为 12 条用例的类型与数据完整写出，不是灌水——用例集本身就是可验收产物。

### 实现落点

- **L132**：以「12 条全绿却在只查询工单里重启了服务」开场，根因是评测集全是正例。12 条用例按「该不该动」分组（8 正例 + 4 负例），每条期望轨迹同时含 \`allow\` 与 \`forbid\`；\`assertCaseSet()\` 防止用例集悄悄退化；\`EvalRunner\` 用确定性假模型与假网关产出 L131 事件流，\`scoreCase()\` 只从 \`action.committed\` 取动作；**越权判硬失败且整批发布失败，不参与加权**；\`RegressionBaseline\` 只增不改、与历史最优比、\`rebaseline\` 必须带理由与人；\`detectSpin()\` 三类空转信号与可解释标签；\`assertReleaseGate()\` 要求 \`negativePassed === 4\`。
- **L133**：以「MCP 里一行临时直通调用」开场，说明旁路不产生事件所以评测查不到。\`assertCallGraph()\` 纯函数穷举 \`tool.run(\` 等调用点，\`tool.run\` 恰好 1 处，旁路即 CI 失败（落地 L129 的 t5 占位）；\`Sandbox\` 三层隔离（参数边界 / 凭证不进上下文 / 网络出口白名单），包在 \`guardedExecute()\` 外层不替换网关；\`routeByCost()\` 只换模型别名、danger 一票选强模型；\`DegradationLadder\` L0–L3 四级，L2 起清空 act 步骤并写 \`degraded:read-only\` 事件，L3 交人工；\`t5\` 断言 L132 的 12 条用例与门禁原样通过，把「不改契约」写成可失败的检查。
- **L134**：以「本地全绿、上线第一小时挂」开场（装配顺序反了 + 进程内 EventLog 多实例分叉）。七行装配依赖表；\`createApp()\` 按事件流 → 网关 → 沙箱代理 → 编排 → 追踪 → 降级 → 应用顺序装配，用 \`Object.create(gateway)\` 代理只覆盖 \`execute()\`，避免为了接沙箱去改 L130 的 Dispatcher 签名；\`assertWiring()\` 检查沙箱是否真的在链上；\`readiness()\` 把六课契约变成探针项（含工具等级漂移）；\`RunManifest\` 四版本号 + 会话稳定分桶 + \`assertRollbackSafe()\` 只锁工具 schema；\`rolloutGate()\` 把评测、调用图、清单一致性汇成唯一闸门且置于构建前；\`deployDrill()\` 五条演练四条验「坏东西有没有被挡住」；七行复盘表（对了什么 / 弯路 / 重做怎么改）+ 六步演示脚本与 \`assertDemoCoversRefusal()\`；最后给出 L128 五项风险的最终收口表与 A → B 分叉说明（组件不迁移，三条方法可迁移）。

### 验证结果

- 双扫描：\`tmp-backtick.mjs\` 无裸反引号、\`tmp-escape.mjs\` 无反斜杠转义问题。另把「模板串内除 反引号 / 反斜杠 / \$ / { 外的单反斜杠」全量扫描改成**正确处理双写**的版本，六课（L129–L134）全部干净。
- 渲染抽查：L132 table=3 / callout=3 / code=6；L133 table=4 / callout=3 / code=6；L134 table=5 / callout=3 / code=5；三课 \`leftover=0 / fenceLeak=0\`，均为 \`capstone\`。
- \`oxfmt\` → \`--update-baseline\` → \`pnpm verify\` / \`lint\` / \`typecheck\`：全绿（verify 概念引用与题目引用通过、lint 0e/4w、typecheck 0e/9w）。
- 全局达标 **132 → 135/142**，baseline 豁免 **10 → 7**（剩余 L136–L142 全部是 Capstone B 与 L142）。

### 本批踩到并修掉的问题

1. L133 初稿在正文里宣称「源码检查一律不用正则」，代码块里却写了 \`split(/[\\/]/)\` 与 \`/^[a-z0-9-]+$/\`，自相矛盾且前者在模板串里会被吞。改为纯文本判断（\`lastIndexOf('/')\` 取文件名、\`SAFE_TARGET_CHARS\` 字符白名单），并把 \`assertCallGraph()\` 从「读真实目录」改成接收 \`SourceFile[]\` 的纯函数，便于在 \`t1\` 里用手工构造的旁路文件测出来。
2. L133 改纯函数时把 \`text.split('\\n')\` 误写成单反斜杠 \`'\n'\`（模板串里会变成真换行）。已修回双写 \`'\\n'\`。**全量反斜杠扫描脚本本身也有假阳性**：逐字符扫时遇到合法双写 \`\\n\` 的第二个反斜杠会误报，改成「遇到 \`\\` 后跟 \`\\` 就跳过两个字符」后六课全干净。
3. L134 初稿的 \`Dispatcher\` 直接持有原 \`ToolGateway\`，\`Sandbox\` 创建了却没接进执行链（正是本课开头讲的那次事故）；另有 \`void execute\` 这种为消除未使用变量的占位写法。改为 \`Object.create(gateway)\` 代理并覆盖 \`execute()\`，\`assertWiring()\` 加 \`wrapped\` 检查；顺带删掉工具 \`run()\` 里自行 append 事件的代码，明确事件由 L129 执行器统一产出，避免与 L131 的 seq 分配冲突。
4. L132 评测桩把跨租户校验放在假网关 \`schema.parse\` 里，L133 正文明确那只是**评测桩**，生产实现由 \`Sandbox.assertArgs()\` 承担，评测集与断言原样复用；消除「评测器替系统做安全决策」的歧义。

**规律**：Capstone 后三课的难点不在体量，而在**跨课接口自洽**。每写完一课要把上游课的真实方法名摊开对照；本批两次自伤（凭空调用点、装配旁路）都是「听起来应该有」造成的。

**改动未提交。**

</section>
