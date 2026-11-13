import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书（绑定到课程的数据，非独立 Markdown） ---------------- */

export const DESIGN: CourseDesign = {
  title: 'RxJS 7.8.x 深度课 · 教学设计说明书',
  summary:
    '面向「有 JS/Promise 经验、想真正理解响应式数据流为什么这样设计」的学习者。6 阶段 26 课、28 概念、69 题、13 个交互演练，含知识点依赖图与学情模型公式。版本基线核实日期：2026-11-13。',
  sections: [
    {
      id: 'baseline',
      title: '0. 版本基线（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '课程主线', v: 'rxjs@7.8.2（npm registry latest dist-tag）' },
            { k: '其他 dist-tags', v: 'next: 9.0.0-beta.1（beta）、forward-compat: 5.6.0-forward-compat.5' },
            { k: '官方文档', v: 'rxjs.dev/guide/overview（入门 + API）' },
            { k: '包形态', v: '单包 rxjs；创建/单值从 rxjs 导入，单一参数操作符从 rxjs/operators 导入' },
            { k: '稳定性', v: '7.x 长期维护；9.0.0-beta 不用于正文' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '纯 7.8 主线',
          text: '全部代码与原理按 7.8.x 讲。9.0.0-beta 的破坏性变更（统一从 rxjs 导入、废弃 rxjs/operators、Subscription 改类）只记于此处，正文与代码一律使用 7.x 的 import 约定，不混用。',
        },
        {
          type: 'list',
          title: '已核对的 7.x 事实（避免按旧资料教错）',
          items: [
            'flatMap 在 7.x 是 mergeMap 的别名（不再是 6.x 里被移出的名字）。',
            'exhaustMap / exhaustMapTo 在 7.x 已回归并可用。',
            'Subject / BehaviorSubject / ReplaySubject / AsyncSubject 四种语义差异（无状态 / 最近值 / 最近 N / 完成时最后值）。',
            'share 支持 { refCount }；shareReplay 带 { bufferSize }；BehaviorSubject 需初始值。',
            'Scheduler：queueScheduler（微任务）、asyncScheduler（宏任务）、animationFrameScheduler、asapScheduler。',
            'TestScheduler（rxjs/testing）用 Marble 图做虚拟时间断言。',
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
          text: '受众：有 TypeScript / Promise / 前端或 Node 经验，但没有系统学过响应式流（Reactive Streams / Rx 时间模型）的工程师。不要求函数式编程背景。',
        },
        {
          type: 'prose',
          text: '总目标：能独立讲清「一条冷流如何被创建、组合、扁平化、多播、调度，并在错误/取消时安全收尾」的完整链路，并能在真实项目（含 Angular）里落地与测试。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖课时'],
          rows: [
            ['L1 架构设计', '为什么把「时间里的数据」建模成流？冷/热、多播的边界？', 'S0 / S4'],
            ['L2 运行原理', '扁平化按什么时序合并？错误/取消如何传播与回收？', 'S2 / S3'],
            ['L3 底层逻辑', '调度器如何把时间注入？背压如何整形？如何用虚拟时间测试？', 'S5（L22–L26）'],
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
          text: '设计原则：先把「能跑起来」的心智模型建立好（冷/热、三态、订阅回收），再引入组合与扁平化；把「取消旧内层」这类反直觉语义放在第 2 阶段用 4 个交互演练拆解；错误、多播、调度依次展开，最后落地测试与框架。难度按 1→4 递进，第 2、5 阶段是陡坡。',
        },
        { type: 'lessons' },
        {
          type: 'prose',
          text: '合计约 12 小时净学习时长，建议按 25–30 分钟/天推进，约 4–5 周完成，之后进入长期复习。',
        },
      ],
    },
    {
      id: 'graph',
      title: '3. 知识点依赖图',
      blocks: [
        {
          type: 'prose',
          text: '28 个概念节点，每个带 stage / weight / prereqs。引擎据此做前置缺口归因。主干依赖（箭头表示依赖方向）：',
        },
        {
          type: 'code',
          title: '概念依赖主干',
          code: `c-callbacks → c-cold-hot → c-triplet → c-teardown
                              │              │
                              │              └→ c-subject → c-state-subj
                              │                    c-subject → c-share → c-share-pitfall
                              │
c-sources → c-new-observable → c-transform → c-filter → c-reduce
                                        │
                                        └→ c-flatten → c-concat
                                                  └→ c-merge → c-switch → c-exhaust
                                                  └→ c-backpressure
c-triplet → c-terminal → c-retry → c-error-prop / c-safe
c-sources → c-scheduler → c-time-ops
c-transform → c-combine`,
        },
        {
          type: 'list',
          items: [
            'c-flatten、c-merge 权重 4（最高），是「底层逻辑」的考核重点。',
            '前置未达 70 分的概念会在诊断里被标为「前置缺口」。',
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
            '交互演练：13 个可复用组件之一，必须动手操作才计入学情',
            '关键术语 + 常见误区（每课 1–2 条，直接写学习者最常犯的错）',
            '随堂测验：每题即时反馈 + 解析 + 概念标签，可重做',
            '完成按钮：写入进度并解锁路径下一课的推荐',
          ],
        },
        {
          type: 'list',
          title: '交互组件清单（13 个，零依赖 SVG/DOM，离线可用）',
          items: [
            '源操作符节奏、冷/热对比、订阅回收、观察者协议、map 流水线、过滤取舍、嵌套展开、四操作符时序对比（核心）、重试退避、Subject 多播、share 引用计数、调度器时间注入、多源组合',
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
          text: '数据采集：课时访问次数、停留时长（进入/离开计时）；每次答题记录 ts / lessonId / qIndex / correct / concept / isReview；演练完成标记、课时完成时间、每日会话汇总；全部存 localStorage（键 knowisle:rxjs:v1），可导出 JSON。',
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
            '内容层独立：所有课时、概念、题目集中在 app/data/rxjs-course/ 目录（index.ts 聚合 + stages/concepts/meta/design + lessons 逐课时文件）。新增课时只需新建 lessons/lNN.ts 并在 CONCEPTS 登记，地图、侧栏、雷达、复习队列、诊断全部自动接入。',
            '引擎与视图解耦：analytics.ts（模型）、widgets.ts（演练）、pages + components（Vue 视图）、main.css（外观）互不依赖具体实现，可单独替换。',
            '版本更新机制：升级到 8.x/9.x 时只需更新 META 的版本号、核实日期与 LTS 说明，并复核受影响的课时代码；9.0 的 import 约定变化在基线区集中记录。',
            '数据可迁移：学情档案为显式 v1 schema，导出/导入 JSON 可跨设备、跨浏览器迁移；未来改 schema 只需补一个 importState 迁移分支。',
            '质量闭环：某课时正确率长期 < 55%（≥3 次作答）自动标记「需修订」；课时表记录访问、停留、重做次数、演练完成率。',
            '教学节奏：建议 25–30 分钟/天；连续天数、每日目标、累计时长都在本地记录，不上传任何数据。',
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
          text: '本课程已迁入 Nuxt 4 知识岛站点 yuanwu-knowisle，作为 /courses/rxjs 下的一门课程实体；站点首页 / 是课程岛。',
        },
        {
          type: 'prose',
          text: '运行：pnpm dev（开发）或 pnpm build && pnpm exec wrangler --cwd .output dev --port 3199（生产 Worker 预览）；冒烟用 python scripts/smoke.py --base http://127.0.0.1:3199。',
        },
        {
          type: 'prose',
          text: '内容、引擎、演练、视图四层解耦：app/data/rxjs-course/ 目录是唯一内容源（index.ts 聚合各章节），app/data/courses.ts 是课程注册表，app/lib/analytics.ts 是学情引擎，app/lib/widgets.ts 是演练内核，app/components/course/* 与 app/pages/courses/[slug]/* 是 Vue 视图。',
        },
        {
          type: 'prose',
          text: '浏览器需支持 ES2022+（Chrome / Edge / Firefox / Safari 近两年版本）。',
        },
        {
          type: 'prose',
          text: '回归自检：pnpm verify（多课程数据一致性 + 学情引擎全轨迹）、check-course.mjs（引用完整性）、smoke.py（SSR 路由 + 真实视口）。每次改动 rxjs-course/ 目录、引擎或样式后都跑一遍。',
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
            '交互演练是原理模拟，不是真实 RxJS runtime；真实运行请用官方 Playground 或本地装 rxjs@7.8.2。',
            '课程内容基于 2026-11-13 核实的 7.8.2 文档；9.0.0-beta 可能继续变动，涉及处已在基线区标注。',
            '学情数据存在浏览器本地，清理浏览器数据会丢失，建议定期在「设置」导出备份。',
          ],
        },
      ],
    },
  ],
}
