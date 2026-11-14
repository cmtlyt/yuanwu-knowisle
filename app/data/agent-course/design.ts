import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书（绑定到课程的数据，非独立 Markdown） ---------------- */

export const DESIGN: CourseDesign = {
  title: 'AI Agent 工程：从范式到生产 · 教学设计说明书',
  summary:
    '面向已具备基础编程能力的 TS 开发者，建立 AI Agent 的完整工程化知识体系。11 模块、28 阶段、142 课、142 概念：理论 + 无框架手写实战（TypeScript 7 / Node 24）+ 框架对照 + 两个从零 Capstone。版本基线核实日期：2026-11-15。',
  sections: [
    {
      id: 'baseline',
      title: '0. 版本基线（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '实现语言', v: 'TypeScript 7（本仓库锁定 typescript@7.0.2）' },
            { k: '运行环境', v: '固定 Node 24 LTS（不混用 Deno / Bun）' },
            { k: '教学基线', v: 'OpenAI 兼容接口（openai / @openai/agents / @openai/guardrails 示例）' },
            { k: '课程代号', v: 'agent-course · /courses/agent' },
            { k: '课程结构', v: 'complex 4 层（Module → Stage → SubStage → Lesson），renderMode: complex' },
            {
              k: '框架版本（2026-11-15 联网核实）',
              v: '@langchain/langgraph@1.x、langchain@1.x、@openai/agents@0.22.x、@mastra/core@1.82.x、ai@7.0.x、llamaindex@0.12.x、@modelcontextprotocol/sdk@1.x、@opentelemetry/api@1.x、langsmith@0.12.x',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '先手写、后框架',
          text: '所有实战课先不依赖框架用 TS 手写，再对照主流 TS 框架等价用法；框架对照为练手可跳过。MCP 也不例外：先纯手写协议，再用官方 TS SDK 对照重写同一 Server。',
        },
        {
          type: 'callout',
          tone: 'deep',
          title: '课程解耦',
          text: '本课程不引用、不呼应、不前置依赖本项目任何既有课程（含 Effect / RxJS 深度课）。两个 Capstone 各自从零、不共享代码，选做其一或双做。',
        },
      ],
    },
    {
      id: 'goals',
      title: '1. 教学目标与受众',
      blocks: [
        {
          type: 'prose',
          text: '受众：熟悉 TypeScript、异步编程、HTTP 与基础数据结构，了解 Prompt 基本概念的开发者。不要求已学过任何 Agent 框架。',
        },
        {
          type: 'prose',
          text: '总目标：能独立讲清「模型如何决定下一步」，能从零写出带工具、记忆、追踪、评测的 Agent 系统，能按真实项目需求在「手写 vs 框架」之间做有依据的选型。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖范围'],
          rows: [
            ['L1 理论', 'Agent 是什么？12 种范式各解决什么问题？', '模块二'],
            ['L2 工程', '运行时、工具、MCP、记忆、多 Agent 如何落地？', '模块三 ~ 五'],
            ['L3 生产', '可观测、评测、安全、成本、部署如何可靠交付？', '模块六、九'],
            ['L4 选型', '手写 vs 六大框架，何时回退手写？', '模块七'],
            ['L5 综合', '两个从零 Capstone，各自成体系交付。', '模块十、十一'],
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '2. 平缓学习路径（11 模块 28 阶段 142 课）',
      intro: '下表由课程数据动态生成，新增课时会自动出现。',
      blocks: [
        {
          type: 'prose',
          text: '设计原则：每个新概念至多依赖 1–2 个已学概念；先把「能跑起来」的范式心智模型建好，再引入运行时抽象；框架专论放在所有手写主线之后，此时学习者已有足够对照基准。阶段三「范式全景」拆 3 个子阶段（3.1 基线范式 / 3.2 反思与搜索树 / 3.3 谱系与分解）仅为导航分组，不增课、不改课号。',
        },
        { type: 'lessons' },
        {
          type: 'prose',
          text: '约 30 小时净学习时长，建议按 25–30 分钟/天推进，约 8–10 周完成；两个 Capstone 选做其一即可完课，学有余力者双做。',
        },
      ],
    },
    {
      id: 'graph',
      title: '3. 知识点依赖图',
      blocks: [
        {
          type: 'prose',
          text: '142 个概念节点，每个带 stage / weight / prereqs，构成 DAG。引擎据此做前置缺口归因。主干依赖（箭头表示依赖方向）：',
        },
        {
          type: 'code',
          title: '概念依赖主干',
          code: `ts-first → toolchain → scaffold → llm-call
                          ↓
agent-boundary → agent-components → model-decides → paradigm-taxonomy
        ↓                                          ↓
   agent-selection                          cot → self-consistency
                                            react → react-loop → agent-loop → runtime-impl
        ↓                                     ↓            ↓                 ↓
  plan-execute → rewoo                  reflexion → tot → got → lats   tao → termination
        ↓                                     ↓                         ↓
  task-decomposition                     reflexion-memory          state-machine → streaming
        ↓                                     ↓
     pe-engine → replanning → adapt     reflexion-mech → self-critique → verification-loop
                                            ↓
  function-calling → tool-schema → fc-runtime → multi-agent-impl → orchestration
        ↓                                                            ↓
   mcp-triad → mcp-handwritten → mcp-sdk → mcp-integration   human-in-loop
        ↓
  memory-layers → vector-rag → graph-rag → research-agent`,
        },
        {
          type: 'list',
          items: [
            'react / cot / runtime-impl / fc-runtime / tot-engine / pe-engine / verification-loop / multi-agent-impl / span-middleware / eval-harness / prompt-injection / routing-impl 等为核心权重 4 概念。',
            '前置未达 70 分的概念会在诊断里被标为「前置缺口」，而不是笼统判为「没学会」。',
          ],
        },
      ],
    },
    {
      id: 'lesson-template',
      title: '4. 单课时结构（固定模板，降低认知负荷）',
      blocks: [
        {
          type: 'list',
          title: '每课六块',
          items: [
            '目标（2–4 条可验证的行为目标）',
            '知识块：prose 讲解 / code 示例（TS，带一句提示）/ callout（tip 提示、warn 易错、deep 底层）/ list 对照表',
            '关键术语 + 常见误区（每课 1–3 条）',
            '随堂测验：每题即时反馈 + 解析 + 概念标签，可重做',
            '完成按钮：写入进度并解锁路径下一课的推荐',
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: '交互演练待后续增量',
          text: 'Agent 课为全新课程，按课程解耦规则不复用 Effect / RxJS 的 24 个演练，本批落地课时 widget 字段为空；交互演练作为独立后续任务补充。',
        },
      ],
    },
    {
      id: 'analytics',
      title: '5. 学情分析模型',
      blocks: [
        {
          type: 'prose',
          text: '数据采集：课时访问次数、停留时长；每次答题记录 ts / lessonId / qIndex / correct / concept / isReview；完成时间、每日会话汇总。全部存 localStorage（键 knowisle:agent:v1），可导出 JSON。',
        },
        {
          type: 'code',
          title: '概念级掌握度（0–100，四项加权）',
          code: `mastery = 100 × (0.30·recent + 0.20·accuracy + 0.25·retention + 0.25·exposure)
recent    = 最近 5 次作答按 exp(-Δt / 14天) 加权的正确率
accuracy  = (correct + 1) / (total + 2)              // 拉普拉斯平滑
retention = exp(-Δt / S)                             // 艾宾浩斯式遗忘
exposure  = min(1, total / 4)`,
        },
        {
          type: 'table',
          columns: ['条件', '归因', '建议动作'],
          rows: [
            ['前置概念 mastery < 70', '前置缺口', '回到前置课时重做测验'],
            ['retention < 0.6 且 accuracy ≥ 0.65', '遗忘型', '加入今日复习队列'],
            ['accuracy < 0.6', '误解型', '重读「常见误区」+ 重跑演练'],
            ['其余', '练习不足', '补 2–3 道同概念题'],
          ],
        },
        {
          type: 'list',
          title: '视图（complex 模式）',
          items: [
            '课程地图：模块手风琴 + 子阶段三级头 + 模块导航条',
            '学情仪表盘：模块主轴雷达 + 模块下钻 + 知识点明细',
            '复习中心：遗忘队列 + 抽题复习 + 错题本',
            '教学准备：版本基线、扩课机制、课时级质量表',
            '教学设计：本说明书，作为绑定到课程的数据渲染',
          ],
        },
      ],
    },
    {
      id: 'prep',
      title: '6. 长期教学准备',
      blocks: [
        {
          type: 'list',
          items: [
            '内容层独立：所有课时、概念、题目集中在 app/data/agent-course/ 目录。新增课时只需新建 lessons/lNN.ts 并在 CONCEPTS 登记，地图、侧栏、雷达、复习队列、诊断全部自动接入。',
            '引擎与视图解耦：analytics.ts（模型）、app/lib/widgets/（演练目录）、pages + components（Vue 视图）互不依赖具体实现。',
            '版本更新机制：框架版本统一集中在 META，升级时只需更新 META 并复核受影响的框架对照课正文。',
            '数据可迁移：学情档案为显式 v1 schema，导出/导入 JSON 可跨设备迁移。',
            '质量闭环：某课时正确率长期 < 55%（≥3 次作答）自动标记「需修订」。',
            '教学节奏：建议 25–30 分钟/天；连续学习天数、每日目标、累计时长都在本地记录，不上传任何数据。',
          ],
        },
      ],
    },
    {
      id: 'running',
      title: '7. 运行与维护',
      blocks: [
        {
          type: 'callout',
          tone: 'tip',
          title: '已接入知识岛',
          text: '本课程作为 /courses/agent 下的一门 complex 模式课程实体；站点首页 / 是课程岛，课程注册表在 app/data/courses.ts。',
        },
        {
          type: 'prose',
          text: '运行：pnpm dev（开发）或 pnpm build && pnpm exec wrangler --cwd .output dev --port 3199（生产 Worker 预览）；回归自检：pnpm verify（数据一致性 + 学情引擎全轨迹 + complex 引用完整性）。',
        },
        {
          type: 'prose',
          text: '内容、引擎、视图四层解耦：app/data/agent-course/ 目录是唯一内容源，app/data/courses.ts 是课程注册表，app/lib/analytics.ts 是学情引擎，app/components/course/complex/ 是 complex 渲染视图。',
        },
      ],
    },
    {
      id: 'boundaries',
      title: '8. 已知边界',
      blocks: [
        {
          type: 'list',
          items: [
            '本批落地为课程数据层；交互演练（widget）待后续增量任务补充，当前每课 widget 为空。',
            '课程代码样例默认以 OpenAI 兼容接口为教学基线，多供应商 / 本地模型留到模块七统一讲解。',
            'Python 生态（AutoGen / CrewAI / LiteLLM / LlamaGuard）仅作架构对照，不写 Python 代码。',
            '学情数据存在浏览器本地，清理浏览器数据会丢失，建议定期在「设置」导出备份。',
          ],
        },
      ],
    },
  ],
}
