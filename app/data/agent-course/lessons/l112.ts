import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 22 ========== */

export const L112 = withKind(
  L(
    'L112',
    22,
    '横向对比矩阵：六大框架的能力 / 成本 / 可控性 / 学习曲线 / 运行时位置',
    2,
    ['L96', 'L100', 'L103', 'L106', 'L108', 'L110'],
    ['framework-matrix'],
    [
      '用一张矩阵对比 LangGraph / OpenAI Agents / Mastra / AI SDK / LlamaIndex / LangChain 六大框架',
      '掌握能力 / 成本 / 可控性 / 学习曲线 / 运行时位置五个维度',
      '能据矩阵为真实项目做初筛',
    ],
    `
### 把六个框架放在同一把尺子下

前面 L96–L111 逐个讲了六个框架。现在把它们并排，用同一组维度打分，才能回答「我该用谁」。五个维度：能力覆盖、成本、可控性、学习曲线、运行时位置（请求结束后，你的编排逻辑「活」在哪里）。

\`\`\` title="横向对比矩阵（速览）" note="关键：没有任何框架「全胜」，只有「在哪个维度上最优」。"
            能力    成本   可控性  学习曲线  运行时位置
LangGraph    图/状态  中     高      陡        进程内 + Platform
OpenAI Agents run/多Agent 低   中      缓        session 内 + tracing 云
Mastra       全栈    低     中      中        进程内 + 内置部署
AI SDK      流式/工具 低    高      缓        框架无关（最薄）
LlamaIndex   RAG    中     中      中        进程内
LangChain    生态全  中     中      陡        进程内
\`\`\`

:::deep

### 可控性 vs 运行时位置的张力

可控性高（LangGraph / AI SDK）意味着框架不替你藏太多黑盒，但你也要自己拼；运行时位置决定「编排是否可持久化 / 可恢复」——纯进程内框架（Mastra / LangChain）请求结束状态就没了，除非你自己接存储；LangGraph checkpoint / OpenAI session 则内置了状态持久化。

:::

### 五个维度的取舍口诀

- 要「图编排 + 状态持久化」→ LangGraph。
- 要「轻量多 Agent + 少代码」→ OpenAI Agents SDK。
- 要「全栈一体化 + 内置部署」→ Mastra。
- 要「薄封装 + 流式 + 多 provider」→ AI SDK。
- 要「RAG 全家桶」→ LlamaIndex；要「生态广度」→ LangChain。

:::warn

### 矩阵是初筛不是终审

矩阵帮你缩小到 1–2 个候选，但最终选型一定要「同一需求手写 + 框架双实现」实测（L94 方法论），别只看表格拍板。

:::

`,
    null,
    [
      {
        text: '「运行时位置」这个维度衡量的是？',
        options: ['模型跑在哪个云', '编排逻辑在请求结束后「活」在哪里', '代码放在哪个目录', 'token 成本高低'],
        answer: 1,
        explain: '指编排状态是否可持久化 / 可恢复。',
        concept: 'framework-matrix',
      },
      {
        text: '要「图编排 + 内置状态持久化」，首选？',
        options: ['AI SDK', 'LangGraph', 'Mastra', 'LlamaIndex'],
        answer: 1,
        explain: 'LangGraph 的图 + checkpoint 主打状态持久化。',
        concept: 'framework-matrix',
      },
      {
        text: '选型矩阵的作用是？',
        options: ['直接定最终框架', '缩小候选到 1–2 个，再实测验证', '替代文档', '评估模型好坏'],
        answer: 1,
        explain: '矩阵是初筛，实测才是终审。',
        concept: 'framework-matrix',
      },
    ],
    [
      ['能力覆盖', '框架支持的功能广度'],
      ['可控性', '框架替你藏多少黑盒'],
      ['运行时位置', '编排状态在请求后是否可恢复'],
    ],
    ['只看「谁最火」选型，不看自己的需求维度。', '把矩阵当终审，跳过 L94 的实测对照。'],
  ),
  'framework',
)
