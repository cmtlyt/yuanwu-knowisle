import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书 ---------------- */

export const DESIGN: CourseDesign = {
  title: 'Agent Harness 深度比较 · 教学设计说明书',
  summary:
    '面向「用过至少一个 coding agent、想系统搞清各 harness 差异与适用边界」的工程师。17 阶段 27 课：方法论 2 课 + 15 个系统各成一章（主流 6 系统各 2 课）+ 横向对比 4 课。全部论述基于可证实资料（A/B 级来源），每课夹带原文链接。证据快照：2026-11-15。',
  sections: [
    {
      id: 'baseline',
      title: '0. 证据口径（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            {
              k: '证据快照',
              v: '2026-11-15（7 批 44 条检索，台账见 docs/00091-agent-harness-course/research/）',
            },
            { k: '分级', v: 'A=官方页面/仓库原文；B=可信第三方实测；C=仅搜索摘要（正文不单独引用）' },
            {
              k: '横向基准',
              v: 'Harness Leaderboard（28,849 trials）、Bug Hunt Bench（89 clean runs）、Composio 26 任务、arXiv 2610.00917（66 配置/6,204 轨迹）',
            },
            { k: '方法论锚点', v: 'FeatureBench 事故文档（answer key 泄漏，15× fetch 差异）' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: '快照纪律',
          text: '本课程所有分数、成本、star 数、版本号都标注「快照 2026-11-15」或给出可点击来源。排名与分数随时间变化，课程教的是「怎么读」，不是「谁是第一」。',
        },
        {
          type: 'list',
          title: '已知的写作陷阱（正文一律规避）',
          items: [
            'Pi 官网的「拒绝 MCP」已演变为「内置 MCP + Codemode」——旧文章失真，正文按官网现行口径。',
            'Pi（Interactive/Print-JSON/RPC/SDK）与 DSH（Standard/PTC/Minimal/Creative）各有一套「四种模式」，不能混写。',
            'Hermes 工具数在官方文档不同页面为 40+/60+/70+，正文写「官方文档随快照漂移」并给两个链接。',
            '成本指标至少四种口径（per run / per solved task 两种聚合 / per solved trial），数值不可混算。',
            'Harness Leaderboard 上 p=0.14 的 3.6 分差距不得写成「更强」；FeatureBench 修复前数字已确认灌水。',
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
          text: '受众：用过 Claude Code / Codex / Cursor 等至少一个 agent 工具，正在选型或想理解「为什么换个 harness 分数差这么多」的工程师。不要求读过各系统源码。',
        },
        {
          type: 'prose',
          text: '总目标：拿到任何一个 agent 系统，能用四控制面（主循环 / 上下文 / 权限 / 终止）拆解它；面对任何对比分数，能说出基准口径、样本量与统计显著性；给自己的场景选出候选与排除项，并给出证据链接。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖课时'],
          rows: [
            ['评估框架', 'harness 是什么？对比数据怎么读？', 'S0（L01–L02）'],
            ['机制拆解', '15 个系统各自的主循环、上下文、权限、终止长什么样？', 'S1–S15（L03–L23）'],
            ['综合决策', '全景对照、基准交叉、流派归纳、场景选型。', 'S16（L24–L27）'],
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '2. 学习路径（17 阶段 27 课）',
      intro: '下表由课程数据动态生成，新增课时会自动出现。',
      blocks: [
        {
          type: 'prose',
          text: '设计原则：先建立评估框架（S0），再逐个系统拆解（S1–S15，主流系统两课、单课系统一课），最后横向综合（S16）。章节顺序兼顾生态影响力与依赖关系：Claude Code/Codex 先讲，因为它们定义了「权限运行时」与「沙箱审批」两个后来者反复引用的原型；Pi/mini-swe-agent 讲极简路线；OpenClaw 放在横向章之前，作为反面教材收尾。',
        },
        { type: 'lessons' },
        {
          type: 'prose',
          text: '每课约 12–18 分钟；全课约 7–8 小时。单课系统章读起来快，但不建议跳过——横向章的对照表全部依赖这些系统的事实。',
        },
      ],
    },
    {
      id: 'method',
      title: '3. 比较方法论（本课程的核心资产）',
      blocks: [
        {
          type: 'list',
          title: '四控制面拆解框架',
          items: [
            '主循环：单 agent 循环 / 常驻服务 / 状态机 runner / 记忆驱动循环。',
            '上下文管理：压缩触发点、指令载体加载策略、跨会话持久化。',
            '权限：审批弹窗 / allowlist / 沙箱强制 / 平台原生隔离。',
            '终止与人工介入：plan mode、diff 审查、checkpoint 回滚、后台化。',
          ],
        },
        {
          type: 'list',
          title: '读对比数据的四问',
          items: [
            '基准是什么口径？（FeatureBench 事故：77% 的 trial 在读镜像里的答案）',
            '样本量与显著性？（28,849 trials、p=0.14 与秩相关 0.36 的含义不同）',
            '成本是哪种口径？（per run ≠ per solved task ≠ per solved trial）',
            '是 harness 的功劳还是 model×harness 交互？（换 harness 排名会翻转）',
          ],
        },
      ],
    },
    {
      id: 'boundaries',
      title: '4. 已知边界',
      blocks: [
        {
          type: 'list',
          items: [
            '证据快照 2026-11-15：各系统迭代极快（DSH developer preview、OpenCode 2.x、Grok Build 每周数次发版），正文结论有保质期。',
            'Cline 截至快照无榜单分数（changelog 列为下一个加入），横向表标「暂无可复核实测」。',
            'Kimi Code / Qwen Code 1.0 / OpenClaw 的架构细节部分来自官方发布稿转述（B/C 级），正文标注来源级别。',
            '本课程不含交互演练组件（widget: null），动手验证请按各课官方链接安装真实工具。',
          ],
        },
      ],
    },
  ],
}
