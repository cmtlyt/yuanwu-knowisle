import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L127 = withKind(
  L(
    'L127',
    25,
    '实战：部署一个有状态会话 Agent 服务并接入监控告警',
    4,
    ['L123', 'L125'],
    ['deploy-service'],
    [
      '综合 L123–L126，部署一个有状态会话 Agent 服务',
      '落地「状态外置 + 兜底 + 灰度 + 监控告警」的完整服务',
      '理解框架无关手写 → 云部署对照的路径',
    ],
    `
### 把前面四课串成一个可部署服务

本课是阶段 25 的收口实战：部署一个「有状态会话 Agent 服务」。它综合了状态外置（L123）、降级兜底（L124）、灰度（L125）、监控告警（L126）。先框架无关手写，再对照云部署。

\`\`\` title="部署骨架：状态外置 + 兜底 + 灰度 + 监控" note="关键：一个请求里同时体现「外置、灰度、兜底、监控」四件事，互相咬合。"
// 会话状态外置（L123）
async function handler(req) {
  const sid = req.sessionId
  const state = await store.get(sid)        // 外置存储恢复
  const ctx = buildContext(state)

  // 灰度路由（L125）
  const variant = canary.pick(req.userId)

  // 调用模型 + 兜底（L124）
  const t0 = Date.now()
  const res = await callModel(ctx, variant).catch(fallback)

  // 监控埋点（L126）
  metrics.record({ latency: Date.now() - t0, variant, cost: res.cost })

  await store.set(sid, appendState(state, res))  // 落盘
  return res
}

// 告警：质量跌破基线 / 错误率超阈值 / 成本突增 → 触发回滚
\`\`\`

:::deep

### 「无状态进程 + 有状态外置」是云原生的正确姿势

对照云部署（Serverless / 容器 / K8s）：只要你的 handler 保持无状态（状态都在 store 里），它就能跑在任意弹性平台上——Serverless 按需伸缩、容器编排自动扩缩。这正印证了 L123 的「状态外置是水平扩展的前提」。

:::

### 部署检查清单（对照前四课）

- 会话状态是否全部外置？重启一个实例会话不断？
- 每个外部调用是否有超时 / 重试 / 熔断 / 降级？
- prompt/模型/工具是否配置化，能否秒回滚？
- 是否埋了追踪 + 质量 + 成本监控，并配了告警阈值？
- 灰度比例能否平滑调整，回滚是否无需重新发布？

:::warn

### 「能跑」≠「能上线」

一个「本地能跑」的 Agent 服务，缺了状态外置、兜底、监控，上线后第一次流量高峰或第一次下游超时就会暴露问题。本课的完成标准不是「跑起来」，而是「过完这张部署检查清单」。

:::

`,
    null,
    [
      {
        text: '这个部署实战综合了哪些能力？',
        options: ['只有监控', '状态外置 + 兜底 + 灰度 + 监控告警', '只有灰度', '只有兜底'],
        answer: 1,
        explain: '综合 L123–L126。',
        concept: 'deploy-service',
      },
      {
        text: '「无状态进程 + 有状态外置」能跑在云原生平台的前提是？',
        options: ['更强的服务器', 'handler 保持无状态，状态都在 store 里', '更多内存', '私有化'],
        answer: 1,
        explain: '无状态才能弹性伸缩。',
        concept: 'deploy-service',
      },
      {
        text: '本课的完成标准是？',
        options: ['本地能跑', '过完部署检查清单（外置/兜底/灰度/监控/可回滚）', '代码行数', '部署到任意平台'],
        answer: 1,
        explain: '能跑 ≠ 能上线。',
        concept: 'deploy-service',
      },
    ],
    [
      ['状态外置', '会话状态存共享存储，进程无状态'],
      ['灰度路由', '按用户稳定分桶选择变体'],
      ['监控埋点', '记录延迟/成本/变体等指标'],
    ],
    [
      '把「本地能跑」当作「能上线」，缺状态外置/兜底/监控。',
      '状态仍留在进程内就上弹性平台，流量一上来会话就断。',
    ],
  ),
  'scenario',
)
