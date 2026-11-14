import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 9 ========== */

export const L60 = L(
  'L60',
  9,
  '实战：实现 Plan-and-Execute 引擎（含动态重规划钩子）',
  20,
  4,
  ['L59', 'L15'],
  ['pe-engine'],
  [
    '用 TS 实现完整的 P&E 引擎',
    '内置动态重规划钩子（计划偏离现实时触发）',
    '对照 LangGraph 的 plan-execute 图',
  ],
  [
    prose(
      '把 P&E 做成一个引擎',
      '本课把「规划 → 执行 → 检测偏离 → 重规划」整合成可运行的 P&E 引擎。重点在**重规划钩子**——计划偏离现实时怎么自动修正。',
    ),
    code(
      'P&E 引擎',
      'async function peEngine(planner, executor, goal, opts) {\n  let plan = await planner.decompose(goal)       // ① 规划\n  const results: Record<string, string> = {}\n\n  for (let round = 0; round < opts.maxReplans; round++) {\n    for (const sg of plan) {                     // ② 执行\n      const input = sg.dependsOn.map((d) => results[d]).filter(Boolean)\n      const r = await executor.run(sg, input)\n      results[sg.id] = r.output\n\n      // ③ 重规划钩子：检测是否偏离计划\n      if (await shouldReplan(sg, r)) {\n        plan = await planner.replan(goal, plan, results)  // ④ 重规划\n        break                                          // 跳出当前计划，重新执行\n      }\n    }\n    if (plan.every((sg) => results[sg.id])) return synthesize(results)\n  }\n  throw new Error("多次重规划后仍未完成")\n}',
      '关键：`shouldReplan` 钩子在每步执行后检测「结果是否偏离预期」，偏离就调用 `planner.replan`。',
    ),
    call(
      'deep',
      '重规划钩子的两种触发',
      '① 失败触发：子目标执行失败（工具报错、结果空）。② 偏离触发：结果虽成功但不符合预期（如「查天气」返回了「查询失败」）。钩子要能区分「该重试」还是「该重规划」。',
    ),
    list('引擎的三个参数', [
      'maxReplans：重规划次数上限，防止无限重规划。',
      'executor：可替换的执行组件（ReAct / 简单工具调用）。',
      'shouldReplan：重规划判断钩子，可注入自定义策略。',
    ]),
    call(
      'tip',
      '框架对照：LangGraph plan-execute',
      'LangGraph 的 plan-execute 图：`planner` 节点 → `executor` 节点 → `replan` 条件边（判断是否重规划）→ 回到 planner 或结束。你的 `shouldReplan` 钩子对应它的条件边。',
    ),
  ],
  null,
  [
    q(
      'P&E 引擎的四个阶段是？',
      [
        '读、写、执行、删除',
        '规划 → 执行 → 检测偏离 → 重规划',
        '加密、解密、签名、哈希',
        '训练、推理、部署、运维',
      ],
      1,
      '规划、执行、检测、重规划。',
      'pe-engine',
    ),
    q(
      '`shouldReplan` 钩子的作用是？',
      ['美化日志', '每步执行后检测结果是否偏离计划，偏离则重规划', '加快速度', '省内存'],
      1,
      '重规划钩子检测偏离。',
      'pe-engine',
    ),
    q(
      '`maxReplans` 参数的作用是？',
      ['控制颜色', '防止无限重规划', '控制温度', '控制模型大小'],
      1,
      '重规划次数上限。',
      'pe-engine',
    ),
  ],
  [
    ['重规划钩子', '检测计划偏离并触发重规划的回调'],
    ['偏离检测', '判断执行结果是否偏离预期'],
    ['maxReplans', '重规划次数上限'],
  ],
  ['不设重规划上限，计划反复偏离导致无限循环。', '把「执行失败」和「结果偏离」混为一谈，用同一策略处理。'],
)
