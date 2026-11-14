import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 11 ========== */

export const L69 = withKind(
  L(
    'L69',
    11,
    '三种编排模式对比与选型（supervisor / 群聊 / 图 workflow）',
    2,
    ['L68'],
    ['orchestration'],
    [
      '对比 supervisor / 群聊 / 图 workflow 三种编排模式',
      '理解各自的控制强度、灵活性与适用场景',
      '能按任务特点选对编排模式',
    ],
    `
### 三种编排，三种控制强度

多 Agent 怎么「组织起来」有三种主流模式：supervisor（集中调度）、群聊（自由发言）、图 workflow（固定流程）。区别在「谁来决定谁发言」。

\`\`\` title="三种编排模式" note="控制强度：图 workflow > supervisor > 群聊；灵活性正好反过来。"
// ① supervisor：集中调度，supervisor 决定每轮谁发言
//   supervisor → researcher → supervisor → writer → done

// ② 群聊：所有 Agent 在一个消息流里自由发言
//   researcher: "...", reviewer: "...", researcher: "...", ...

// ③ 图 workflow：固定节点与边，按 DAG 执行
//   A → B → C
//        ↘ D → E
//   （B 完成才到 C 和 D，图结构写死流程）
\`\`\`

:::deep

### 选型维度：控制 vs 灵活

流程固定、步骤明确 → 图 workflow（最可控、可预测）。流程大致明确、需要动态调度 → supervisor（平衡）。任务开放、需要多角色自由碰撞 → 群聊（最灵活但最不可控）。

:::

### 三模式速查

- supervisor：任务可分解但发言顺序需动态决定（如研究 + 评审迭代）。
- 群聊：头脑风暴、多角色自由讨论（如创意生成）。
- 图 workflow：流程写死、可复现（如固定流水线）。

:::warn

### 群聊最烧钱也最难调试

群聊没有显式编排，容易「越聊越远」、重复发言、无法收敛。除非任务确实需要自由碰撞，否则优先考虑 supervisor 或图。

:::

`,
    null,
    [
      {
        text: '控制强度从高到低的正确排序是？',
        options: [
          '群聊 > supervisor > 图',
          '图 workflow > supervisor > 群聊',
          'supervisor > 图 > 群聊',
          '三者相同',
        ],
        answer: 1,
        explain: '图最可控，群聊最灵活。',
        concept: 'orchestration',
      },
      {
        text: '流程写死、可复现的场景，适合？',
        options: ['群聊', '图 workflow', 'supervisor', '自由聊天'],
        answer: 1,
        explain: '固定流程用图 workflow。',
        concept: 'orchestration',
      },
      {
        text: '群聊模式的缺点是？',
        options: ['太可控', '易跑题、重复发言、难收敛', '太快', '太省 token'],
        answer: 1,
        explain: '群聊最灵活但最不可控。',
        concept: 'orchestration',
      },
    ],
    [
      ['supervisor 编排', '集中调度，决定每轮谁发言'],
      ['群聊编排', '多 Agent 在消息流自由发言'],
      ['图 workflow', '固定节点边、按 DAG 执行'],
    ],
    ['流程固定却用群聊，结果不可控、难复现。', '开放任务硬套图 workflow，灵活性被写死。'],
  ),
  'practice',
)
