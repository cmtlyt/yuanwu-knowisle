import type { CourseDesign } from '~/types/course'

/* ---------------- 课程设计说明书（绑定课程的数据，由「教学设计」视图渲染） ---------------- */
export const DESIGN: CourseDesign = {
  title: 'LangChain 源码深度课 · 教学设计说明书',
  summary:
    '基于 langchainjs@7704471 与 langgraphjs@fa426b2 真实源码取证的源码走读型课程：10 模块 / 34 阶段 / 132 课。1.x 主线（模块一~八）→ 0.x→1.x 迁移（模块九）→ 两个 Capstone（模块十）。全部 API 名与行为来自源码证据台账，禁止凭记忆叙述。',
  sections: [
    {
      id: 'baseline',
      title: '版本基线',
      intro: '版本信息唯一来源是 META，正文不散落版本号。',
      blocks: [
        {
          type: 'table',
          title: '取证快照（2026-11-15）',
          columns: ['包', '版本', '说明'],
          rows: [
            ['langchain (JS)', '1.6.6', '主包：createAgent + middleware，实现体一行 new ReactAgent'],
            ['@langchain/core', '1.4.1', '底座：消息/模型/工具/Runnable，零依赖策略'],
            ['@langchain/langgraph', '1.7.4', '编排内核：Pregel/Channel/checkpoint'],
            ['langchain-classic', '1.0.61', '旧 API 隔离包，模块九专用'],
            ['Python 主线', '1.5.0 / core 1.8.0', '与 TS 线完全不同，禁止混用'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: '最重要的取证纪律',
          text: 'TS 线与 Python 线版本号、API 名、架构叙事完全独立。任何一句「LangChain 现在……」都要先问：说的是哪条线？本课全程 TS 线。',
        },
      ],
    },
    {
      id: 'path',
      title: '学习路径与依赖',
      intro: '模块编号即依赖序：主线模块一~八 → 迁移模块九 → Capstone 模块十。课时依赖见每课 prereqs。',
      blocks: [{ type: 'lessons' }],
    },
    {
      id: 'modules',
      title: '模块地图',
      blocks: [
        {
          type: 'table',
          title: '三段式结构',
          columns: ['段', '模块', '内容', '课数'],
          rows: [
            ['1.x 主线', '一 坐标与版本', '仓库地形 / 运行时底座 / 导出面', '9'],
            ['1.x 主线', '二 core 数据原语', '消息 / 模型 / 工具 / Prompt', '17'],
            ['1.x 主线', '三 Runnable 与组合', 'LCEL 真实实现', '10'],
            ['1.x 主线', '四 createAgent 与 ReactAgent', '新架构核心', '14'],
            ['1.x 主线', '五 中间件体系', 'hook 契约 + 20 内置件', '14'],
            ['1.x 主线', '六 LangGraph 编排内核', 'Channel / Pregel / checkpoint', '18'],
            ['1.x 主线', '七 全栈能力', 'RAG 五环 / 记忆 / 可观测 / MCP', '13'],
            ['1.x 主线', '八 结构化输出与类型系统', '双策略 / 类型级 reduce', '6'],
            ['迁移', '九 0.x → 1.x', '世界观 / 映射 / 走查', '23'],
            ['实战', '十 Capstone', '迁移型 + 综合型', '8'],
          ],
        },
      ],
    },
    {
      id: 'method',
      title: '取证方法与边界',
      blocks: [
        {
          type: 'list',
          title: '五条划界',
          items: [
            'L36 回调只讲执行树视角；消费视角归 L92/L93。',
            'L81 只讲 langgraph prebuilt createReactAgent；langchain 包的 createAgent 在模块四。',
            '9C 三个走查是教学示范（完整代码）；Capstone A 是独立交付（验收断言 + 关键提示）。',
            '旧 API 全程只在模块九出现，主线模块零铺垫。',
            '每条事实句都标注 文件:行 + commit，写不出出处的不写。',
          ],
        },
        {
          type: 'kv',
          title: '证据资产',
          rows: [
            { k: '证据台账', v: 'research/evidence/01-08（版本/机制/模块取证/映射表/草稿契约）' },
            { k: '原文快照', v: 'research/raw/001-003（websearch / npm registry / 官方文档）' },
            { k: '源码锚点', v: 'langchainjs@7704471 + langgraphjs@fa426b2（浅克隆取证）' },
          ],
        },
      ],
    },
    {
      id: 'mastery',
      title: '学情模型',
      blocks: [
        {
          type: 'prose',
          title: '掌握度口径',
          text: '沿用站点统一学情引擎：概念掌握度 = 0.30×近次作答 + 0.20×正确率 + 0.25×记忆保持 + 0.25×练习覆盖；≥80 扎实 / ≥60 发展中 / <60 薄弱。132 个概念与 132 课一一对应，quiz 归因可精确到课。',
        },
        {
          type: 'list',
          title: '扩展机制',
          items: [
            '加课：新增 drafts/LNN.md → gen-course 生成 lNN.ts → concepts.ts 登记，视图/引擎零改动。',
            '版本升级：只改 META 与证据快照，正文引用行为不写死版本号。',
            '演练：本课以源码走读为主，未配置交互演练；如需补充，widget 字段由 null 换成注册表标识即可。',
          ],
        },
      ],
    },
    {
      id: 'verify',
      title: '验证方式',
      blocks: [
        {
          type: 'code',
          title: '门禁链',
          code: 'node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs langchain-course/\npnpm verify    # 内容一致性 + content-gate 体量闸门 + 学情引擎全轨迹\npnpm fmt:check && pnpm lint && pnpm typecheck && pnpm build',
          note: 'check-course 校验引用完整性与前置顺序；content-gate 校验课型体量下限。',
        },
      ],
    },
  ],
}
