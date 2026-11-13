import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书（绑定到课程的数据，非独立 Markdown） ---------------- */

export const DESIGN: CourseDesign = {
  title: 'Effect 4.1.4 深度课 · 教学设计说明书',
  summary:
    '面向「想真正理解 Effect 为什么这样设计」的学习者，而不是只想查 API 的人。6 阶段 26 课、27 概念、59 题、11 个交互演练的学习路径、知识点依赖图、学情模型公式与长期扩展机制。版本基线核实日期：2026-11-13。',
  sections: [
    {
      id: 'baseline',
      title: '0. 版本基线（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '课程主线', v: 'effect@4.1.4（npm registry latest dist-tag）' },
            { k: '其他 dist-tags', v: 'prev: 3.22.4、rc: 4.0.0-rc.118、beta: 4.0.0-beta.107' },
            { k: '4.0 稳定发布', v: '2026-09-30，「Rebuilt from the ground up」' },
            {
              k: 'LTS',
              v: '4.x bug 修复至 2029-09（或 5.0 后 1 年）；安全修复至 2029-09（或 5.0 后 2 年）',
            },
            { k: '官方文档', v: 'effect.website/docs/v4/（/docs/ 重定向到 v4 onboarding）' },
            {
              k: '包形态',
              v: '单包 effect，零运行时依赖；effect/http、effect/schema、effect/sql、effect/rpc、effect/ai、effect/workflow 等子路径',
            },
            {
              k: '官方基准',
              v: '最小包 35.6→7.1 kB；吞吐 0.71M→4.57M tasks/s；5 万 fiber 堆 157.5→21.8 MB',
            },
            {
              k: '稳定性',
              v: '模块带 @stability stable / unstable / experimental；全生态版本锁步',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '纯 v4 主线',
          text: '全部代码与原理按 4.1.4 讲，不引入旧版本 API。课程中特别标注了一处官方文档不一致：并发章节的部分打印示例仍出现树形 Cause 输出，而 v4 的 Cause 模块是扁平 reasons 数组，以模块文档为准。',
        },
        {
          type: 'list',
          title: '已核对的 v4 事实（避免按旧资料教错）',
          items: [
            'Effect<Success, Error, Requirements>；Effect.Success / Error / Services 提取工具',
            'Context.Service、Context.make、Service.use()；Effect.run*With(context)',
            'Effect.forkChild / forkDetach / forkScoped / forkIn；Fiber.join / await / interrupt；interruptUnsafe()',
            'Cause { reasons: ReadonlyArray<Fail | Die | Interrupt> }；Cause.combine / hasFails / hasDies / hasInterrupts / pretty',
            'Effect.catch / catchTag / catchDefect / catchCause / exit / result；Effect.retry / timeout',
            'Layer.succeed / effect / scoped / merge / provide / provideMerge；acquireRelease、Effect.scoped、addFinalizer',
            'MixedScheduler、MaxOpsBeforeYield = 2048、PreventSchedulerYield、SchedulerDispatcher 优先级桶',
            'ManagedRuntime.make（首次构建失败会被缓存，不自动重建）',
          ],
        },
      ],
    },
    {
      id: 'goals',
      title: '1. 教学目标与受众',
      blocks: [
        {
          type: 'prose',
          text: '受众：有 TypeScript / Promise / async-await 经验，但没有系统学过 effect system 的工程师。不要求函数式编程背景。',
        },
        {
          type: 'prose',
          text: '总目标：能独立讲清「一个 Effect 从构造、组合、装配依赖，到被 root fiber 解释、被调度器让出、最终产出 Exit」的完整链路，并能在真实项目里渐进落地。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖课时'],
          rows: [
            ['L1 架构设计', '为什么把程序建模成值？三通道如何把架构写进类型？', 'S0 / S1 / S3 / S5'],
            ['L2 运行原理', '错误、依赖、资源、并发分别由什么机制保证？', 'S2 / S3 / S4 前半'],
            [
              'L3 底层逻辑',
              '指令树长什么样？runLoop 如何解释？调度器何时让出？中断如何注入？',
              'L19 / L20 / L21（课程核心，标 ★）',
            ],
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '2. 平缓学习路径（6 阶段 26 课，密度随复杂度动态调整）',
      intro: '下表由课程数据动态生成，新增课时会自动出现。',
      blocks: [
        {
          type: 'prose',
          text: '设计原则：每个新概念至多依赖 1–2 个已学概念；先把「能跑起来」的心智模型建立好，再引入抽象；底层原理放在第 4 阶段，此时学习者已有足够的具体经验支撑抽象。难度按 1→5 递进，阶段 4 是唯一的陡坡，用 3 个交互演练拆解。',
        },
        { type: 'lessons' },
        {
          type: 'prose',
          text: '合计约 12 小时净学习时长，建议按 25–30 分钟/天推进，约 4–5 周完成，之后进入长期复习。',
        },
        {
          type: 'list',
          title: '与官方 learning spine 的关系',
          items: [
            '官方 onboarding 的 5 步（core idea → setup → first program → errors → concurrency）被完整包含在 S0–S2、S4。',
            '本课程在其之上补了三块官方不展开的内容：① 依赖图与资源生命周期的类型演算；② runtime 内部执行链；③ 学情驱动的复习节奏。',
          ],
        },
      ],
    },
    {
      id: 'graph',
      title: '3. 知识点依赖图',
      blocks: [
        {
          type: 'prose',
          text: '26 个概念节点，每个带 stage / weight / prereqs。引擎据此做前置缺口归因。主干依赖（箭头表示依赖方向）：',
        },
        {
          type: 'code',
          title: '概念依赖主干',
          code: `program-value → three-channels → composition → gen → type-accumulation
                     ↓                                   ↓
                  laziness → runners → exit        typed-error → defect → cause → recovery
                     ↓                    ↓                                   ↓
                   fiber → runloop → scheduler              context → layer → layer-graph
                     ↓                                              ↓
                  concurrency → stream                          scope
                     ↓
                    stm                              schedule ← recovery
                                              ecosystem ← layer-graph + context`,
        },
        {
          type: 'list',
          items: [
            'runloop 与 scheduler 权重 4（最高），是「底层逻辑」的考核重点。',
            '前置未达 70 分的概念会在诊断里被标为「前置缺口」，而不是笼统地判为「没学会」。',
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
            '目标（2 条可验证的行为目标）',
            '知识块：prose 讲解 / code 示例（带语法高亮与一句提示）/ callout（tip 提示、warn 易错、deep 底层）/ list 对照表，每课 3–4 块',
            '交互演练：11 个可复用组件之一，必须动手操作才计入学情',
            '关键术语 + 常见误区（每课 1–2 条，直接写学习者最常犯的错）',
            '随堂测验：每题即时反馈 + 解析 + 概念标签，可重做',
            '完成按钮：写入进度并解锁路径下一课的推荐',
          ],
        },
        {
          type: 'list',
          title: '交互组件清单（11 个，零依赖 SVG/DOM，离线可用）',
          items: [
            '三通道拼装台、惰性蓝图、单步指令解释器、调度模拟、Cause 构建器、Layer 依赖图、finalizer 栈、Fiber 监督树、并发时间轴、Stream 背压、Schedule 重试策略',
          ],
        },
      ],
    },
    {
      id: 'analytics',
      title: '5. 学情分析模型',
      blocks: [
        {
          type: 'prose',
          text: '数据采集：课时访问次数、停留时长（进入/离开计时）；每次答题记录 ts / lessonId / qIndex / correct / concept / isReview；演练完成标记、课时完成时间、每日会话汇总；全部存 localStorage（键 effect-course-state-v1），可导出 JSON。',
        },
        {
          type: 'code',
          title: '概念级掌握度（0–100，四项加权）',
          code: `mastery = 100 × (0.30·recent + 0.20·accuracy + 0.25·retention + 0.25·exposure)
recent    = 最近 5 次作答按 exp(-Δt / 14天) 加权的正确率
accuracy  = (correct + 1) / (total + 2)              // 拉普拉斯平滑，避免 1 题满分
retention = exp(-Δt / S)                             // 艾宾浩斯式遗忘
exposure  = min(1, total / 4)                        // 样本不足不轻易判「掌握」`,
        },
        {
          type: 'code',
          title: '记忆稳定度 S（天）随复习演化',
          code: `答对：S ← min(90, S × (1 + 0.8·(1 − R)) + 0.6)
答错：S ← max(0.5, S × 0.55)`,
        },
        {
          type: 'table',
          columns: ['条件', '归因', '建议动作'],
          rows: [
            ['前置概念 mastery < 70', '前置缺口', '回到前置课时重做测验'],
            ['retention < 0.6 且 accuracy ≥ 0.65', '遗忘型', '加入今日复习队列'],
            ['accuracy < 0.6', '误解型', '重读「常见误区」+ 重跑交互演练'],
            ['其余', '练习不足', '补 2–3 道同概念题'],
          ],
        },
        {
          type: 'prose',
          text: '复习调度：retention < 0.82 进入复习队列，按 retention 升序排列；复习答对会拉长 S，从而把下次复习推远。复习中心可随机抽该概念的题，错题本保留最近 12 条错误记录并支持一键回到原课时。',
        },
        {
          type: 'list',
          title: '视图',
          items: [
            '课程地图：阶段卡片（掌握度 / 完成数）+ 全部课时 + 下一步建议',
            '学情仪表盘：4 个 KPI、六维能力雷达、阶段与概念掌握度条、14 天时长柱状、薄弱点归因',
            '复习中心：遗忘队列 + 抽题复习 + 错题本',
            '教学准备：版本基线、扩课机制、课时级质量表',
            '教学设计：本说明书，作为绑定到课程的数据渲染（见各章节）',
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
            '内容层独立：所有课时、概念、题目集中在 app/data/effect-course/ 目录（index.ts 聚合 + stages/concepts/meta/design + lessons 逐课时文件）。新增课时只需新建 lessons/lNN.ts 并在 CONCEPTS 登记，地图、侧栏、雷达、复习队列、诊断全部自动接入。',
            '引擎与视图解耦：analytics.ts（模型）、widgets.ts（演练）、pages + components（Vue 视图）、main.css（外观）互不依赖具体实现，可单独替换。',
            '版本更新机制：升级 Effect 时只需更新 META 的版本号、核实日期与 LTS 说明，并复核受影响的课时代码；教学准备页集中列出需要复核的 v4 事实清单。',
            '数据可迁移：学情档案为显式 v1 schema，导出/导入 JSON 可跨设备、跨浏览器迁移；未来改 schema 只需补一个 importState 迁移分支。',
            '质量闭环：某课时正确率长期 < 55%（≥3 次作答）自动标记「需修订」，提示拆细课时或重写讲解；课时表还记录访问、停留、重做次数、演练完成率，用于判断是「内容难」还是「没人看」。',
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
          title: '已迁入知识岛',
          text: '本课程已迁入 Nuxt 4 知识岛站点 yuanwu-knowisle，作为 /courses/effect-ts 下的一门课程实体；站点首页 / 是课程岛。',
        },
        {
          type: 'prose',
          text: '运行：pnpm dev（开发）或 pnpm build && PORT=3100 node .output/server/index.mjs（生产预览）。',
        },
        {
          type: 'prose',
          text: '内容、引擎、演练、视图四层解耦：app/data/effect-course/ 目录是唯一内容源（index.ts 聚合各章节），app/data/courses.ts 是课程注册表，app/lib/analytics.ts 是学情引擎，app/lib/widgets.ts 是 11 个演练内核，app/components/course/* 与 app/pages/courses/[slug]/* 是 Vue 视图。',
        },
        {
          type: 'prose',
          text: '浏览器需支持 ES2022+（Chrome / Edge / Firefox / Safari 近两年版本）。',
        },
        {
          type: 'prose',
          text: '移动端适配（≤780px）：顶栏精简为「菜单 / logo / 版本 / 主题」，6 个主视图改固定底部标签栏（图标 + 短标签，触控高度 ≥48px，含「教学设计」）；26 课目录改左侧抽屉（遮罩、Esc、点击空白、切页自动关闭）；卡片单列或两列，KPI 两列；代码块、原理图示、课时数据表、14 天时间轴保留独立横向滚动并给出滑动提示；输入框 16px 防 iOS 自动缩放；适配 viewport-fit=cover 与刘海屏 env(safe-area-inset-*)；横屏矮视口与 prefers-reduced-motion 另有规则。',
        },
        {
          type: 'prose',
          text: '回归自检：pnpm verify（数据一致性 + 学情引擎全轨迹）、python scripts/smoke.py --base http://127.0.0.1:3100（SSR 路由、客户端渲染、320/390/768/1440 四种真实视口的横向溢出与导航检查）。每次改动 effect-course/ 目录、引擎或样式后都跑一遍。',
        },
        {
          type: 'prose',
          text: '手机视口用 scripts/cdp.py 通过 CDP Emulation.setDeviceMetricsOverride 构造：无头 Chrome 的 --window-size 被钳在约 500 CSS px，测不到 390px。',
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
            '交互演练是原理模拟，不是真实 Effect runtime；真实运行请用官方 Playground 或本地装 effect@4.1.4。',
            '课程内容基于 2026-11-13 核实的 v4.1.4 文档与迁移指南；unstable / experimental 模块可能变化，涉及处已标注。',
            '学情数据存在浏览器本地，清理浏览器数据会丢失，建议定期在「设置」导出备份。',
          ],
        },
      ],
    },
  ],
}
