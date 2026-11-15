import type { Concept } from '~/types/course'

/* ---------------- 知识点图谱（约 142 概念，对应 142 课） ---------------- */
export const CONCEPTS: Concept[] = [
  // —— 阶段 0 · 工程基线 ——
  { id: 'ts-first', name: '先手写、后框架', stage: 0, weight: 2, prereqs: [] },
  { id: 'toolchain', name: 'TS 7 + Node 24 工具链', stage: 0, weight: 2, prereqs: ['ts-first'] },
  { id: 'version-lock', name: '版本锁定', stage: 0, weight: 2, prereqs: ['toolchain'] },
  { id: 'scaffold', name: '项目脚手架', stage: 0, weight: 2, prereqs: ['toolchain'] },
  { id: 'observability-priming', name: '可观测预埋', stage: 0, weight: 2, prereqs: ['scaffold'] },

  // —— 阶段 1 · 认知基础 ——
  { id: 'agent-boundary', name: 'Agent 的边界', stage: 1, weight: 3, prereqs: ['ts-first'] },
  { id: 'agent-components', name: 'Agent 组成要素', stage: 1, weight: 2, prereqs: ['agent-boundary'] },
  { id: 'model-decides', name: '模型决定下一步', stage: 1, weight: 3, prereqs: ['agent-components'] },
  { id: 'agent-selection', name: 'Agent 选型清单', stage: 1, weight: 2, prereqs: ['model-decides'] },
  { id: 'llm-call', name: 'LLM 调用基础', stage: 1, weight: 2, prereqs: ['scaffold'] },

  // —— 阶段 2 · 范式全景 ——
  { id: 'paradigm-taxonomy', name: '范式总览', stage: 2, weight: 2, prereqs: ['model-decides'] },
  { id: 'cot', name: 'CoT 思维链', stage: 2, weight: 4, prereqs: ['paradigm-taxonomy'] },
  { id: 'react', name: 'ReAct 范式', stage: 2, weight: 4, prereqs: ['paradigm-taxonomy', 'llm-call'] },
  { id: 'react-loop', name: 'ReAct 循环实现', stage: 2, weight: 3, prereqs: ['react'] },
  { id: 'plan-execute', name: 'Plan-and-Execute', stage: 2, weight: 3, prereqs: ['paradigm-taxonomy'] },
  {
    id: 'plan-execute-impl',
    name: 'P&E 实现对比',
    stage: 2,
    weight: 3,
    prereqs: ['plan-execute', 'react-loop'],
  },
  { id: 'rewoo', name: 'ReWOO', stage: 2, weight: 2, prereqs: ['plan-execute'] },
  { id: 'reflexion', name: 'Reflexion 范式', stage: 2, weight: 3, prereqs: ['react'] },
  { id: 'reflexion-memory', name: 'Reflexion 记忆回路', stage: 2, weight: 3, prereqs: ['reflexion'] },
  { id: 'tot', name: 'Tree-of-Thoughts', stage: 2, weight: 3, prereqs: ['react'] },
  { id: 'got', name: 'Graph-of-Thoughts', stage: 2, weight: 3, prereqs: ['tot'] },
  { id: 'lats', name: 'LATS', stage: 2, weight: 3, prereqs: ['tot', 'reflexion'] },
  { id: 'voyager', name: 'Voyager', stage: 2, weight: 2, prereqs: ['reflexion'] },
  { id: 'autogpt-lineage', name: 'AutoGPT 谱系', stage: 2, weight: 2, prereqs: ['react'] },
  { id: 'least-to-most', name: 'Least-to-Most 与 ADaPT', stage: 2, weight: 2, prereqs: ['plan-execute'] },
  { id: 'self-consistency', name: 'Self-Consistency', stage: 2, weight: 2, prereqs: ['cot'] },

  // —— 阶段 3 · 范式对比与选型 ——
  {
    id: 'paradigm-matrix',
    name: '范式对比矩阵',
    stage: 3,
    weight: 3,
    prereqs: ['react', 'tot', 'plan-execute', 'reflexion'],
  },
  { id: 'hybrid-paradigm', name: '混合范式', stage: 3, weight: 2, prereqs: ['paradigm-matrix'] },
  { id: 'anti-pattern', name: 'Agent 反模式', stage: 3, weight: 2, prereqs: ['paradigm-matrix'] },
  { id: 'paradigm-benchmark', name: '三范式对比实战', stage: 3, weight: 3, prereqs: ['hybrid-paradigm'] },

  // —— 阶段 4 · 核心循环与运行时 ——
  { id: 'agent-loop', name: 'Agent Loop 骨架', stage: 4, weight: 3, prereqs: ['react-loop'] },
  { id: 'tao', name: 'Thought/Action/Observation', stage: 4, weight: 2, prereqs: ['agent-loop'] },
  { id: 'context-budget', name: '上下文预算', stage: 4, weight: 3, prereqs: ['agent-loop'] },
  { id: 'termination', name: '终止与回归', stage: 4, weight: 2, prereqs: ['agent-loop'] },
  { id: 'state-machine', name: '状态机建模', stage: 4, weight: 2, prereqs: ['agent-loop'] },
  { id: 'runtime-impl', name: '最小运行时实现', stage: 4, weight: 4, prereqs: ['tao', 'termination'] },
  { id: 'streaming', name: '流式输出', stage: 4, weight: 3, prereqs: ['runtime-impl'] },

  // —— 阶段 5 · 工具与函数调用 ——
  { id: 'function-calling', name: 'Function Calling 原理', stage: 5, weight: 3, prereqs: ['runtime-impl'] },
  { id: 'tool-schema', name: '工具 Schema 规范', stage: 5, weight: 3, prereqs: ['function-calling'] },
  { id: 'tool-safety', name: '工具安全边界', stage: 5, weight: 3, prereqs: ['tool-schema'] },
  { id: 'parallel-tools', name: '并行调用', stage: 5, weight: 2, prereqs: ['function-calling'] },
  {
    id: 'fc-runtime',
    name: 'FC 运行时实现',
    stage: 5,
    weight: 4,
    prereqs: ['tool-schema', 'parallel-tools'],
  },

  // —— 阶段 6 · MCP ——
  { id: 'mcp-motivation', name: 'MCP 动机', stage: 6, weight: 2, prereqs: ['tool-schema'] },
  { id: 'mcp-triad', name: 'MCP 三件套', stage: 6, weight: 3, prereqs: ['mcp-motivation'] },
  { id: 'mcp-handwritten', name: '手写 MCP 协议', stage: 6, weight: 4, prereqs: ['mcp-triad'] },
  { id: 'mcp-sdk', name: 'MCP 官方 SDK', stage: 6, weight: 3, prereqs: ['mcp-handwritten'] },
  { id: 'mcp-integration', name: 'MCP 接入 Agent', stage: 6, weight: 2, prereqs: ['mcp-sdk'] },

  // —— 阶段 7 · 记忆与 RAG ——
  { id: 'memory-layers', name: '记忆三层架构', stage: 7, weight: 3, prereqs: ['agent-loop'] },
  { id: 'vector-rag', name: '向量 RAG 管线', stage: 7, weight: 4, prereqs: ['memory-layers'] },
  { id: 'graph-rag', name: 'Graph RAG', stage: 7, weight: 3, prereqs: ['vector-rag'] },
  { id: 'structured-memory', name: '结构化记忆', stage: 7, weight: 2, prereqs: ['memory-layers'] },
  { id: 'context-compression', name: '上下文压缩', stage: 7, weight: 3, prereqs: ['context-budget'] },
  { id: 'persistence-privacy', name: '持久化与隐私', stage: 7, weight: 2, prereqs: ['structured-memory'] },

  // —— 阶段 8 · 推理增强 ——
  { id: 'cot-engineering', name: 'CoT 工程化', stage: 8, weight: 3, prereqs: ['cot'] },
  { id: 'tot-engine', name: 'ToT 工程实现', stage: 8, weight: 4, prereqs: ['tot', 'cot-engineering'] },
  { id: 'got-engine', name: 'GoT 工程实现', stage: 8, weight: 3, prereqs: ['got', 'tot-engine'] },
  { id: 'voting-impl', name: '多路径投票实现', stage: 8, weight: 2, prereqs: ['self-consistency'] },
  { id: 'scratchpad', name: 'Scratchpad', stage: 8, weight: 2, prereqs: ['cot-engineering'] },

  // —— 阶段 9 · 规划与重规划 ——
  { id: 'task-decomposition', name: '任务分解', stage: 9, weight: 3, prereqs: ['plan-execute'] },
  {
    id: 'pe-engine',
    name: 'P&E 引擎实现',
    stage: 9,
    weight: 4,
    prereqs: ['task-decomposition', 'plan-execute-impl'],
  },
  { id: 'replanning', name: '动态重规划', stage: 9, weight: 3, prereqs: ['pe-engine'] },
  { id: 'adapt', name: 'ADaPT', stage: 9, weight: 2, prereqs: ['least-to-most', 'replanning'] },

  // —— 阶段 10 · 自我反思与纠错 ——
  {
    id: 'reflexion-mech',
    name: 'Reflexion 机制',
    stage: 10,
    weight: 3,
    prereqs: ['reflexion', 'reflexion-memory'],
  },
  { id: 'self-critique', name: '自我批评循环', stage: 10, weight: 3, prereqs: ['reflexion-mech'] },
  { id: 'verification-loop', name: '验证回路', stage: 10, weight: 4, prereqs: ['self-critique'] },

  // —— 阶段 11 · 多智能体 ——
  { id: 'multi-agent-when', name: '何时用多 Agent', stage: 11, weight: 2, prereqs: ['paradigm-matrix'] },
  { id: 'agent-protocol', name: '对话协议设计', stage: 11, weight: 3, prereqs: ['multi-agent-when'] },
  { id: 'multi-agent-impl', name: '多 Agent 系统实现', stage: 11, weight: 4, prereqs: ['agent-protocol'] },
  { id: 'orchestration', name: '编排模式', stage: 11, weight: 3, prereqs: ['multi-agent-impl'] },
  { id: 'conflict-consistency', name: '冲突与一致性', stage: 11, weight: 2, prereqs: ['multi-agent-impl'] },
  { id: 'human-in-loop', name: '人在回路', stage: 11, weight: 2, prereqs: ['orchestration'] },

  // —— 阶段 12 · 可观测性 ——
  { id: 'observability-dash', name: '可观测仪表盘', stage: 12, weight: 2, prereqs: ['runtime-impl'] },
  { id: 'tracing', name: '链路追踪', stage: 12, weight: 3, prereqs: ['observability-dash'] },
  { id: 'replay-debug', name: '回放调试', stage: 12, weight: 3, prereqs: ['tracing'] },
  { id: 'span-middleware', name: 'span 追踪中间件', stage: 12, weight: 4, prereqs: ['tracing'] },
  {
    id: 'trace-integration',
    name: '追踪接入多 Agent',
    stage: 12,
    weight: 3,
    prereqs: ['span-middleware', 'multi-agent-impl'],
  },

  // —— 阶段 13 · 评测体系 ——
  { id: 'eval-dimensions', name: '评测维度', stage: 13, weight: 3, prereqs: ['paradigm-benchmark'] },
  { id: 'trajectory-eval', name: '轨迹级评测', stage: 13, weight: 3, prereqs: ['eval-dimensions'] },
  { id: 'benchmarks', name: '主流基准', stage: 13, weight: 2, prereqs: ['eval-dimensions'] },
  { id: 'regression-baseline', name: '回归基线', stage: 13, weight: 3, prereqs: ['trajectory-eval'] },
  { id: 'eval-harness', name: 'Eval harness', stage: 13, weight: 4, prereqs: ['regression-baseline'] },
  { id: 'llm-as-judge', name: 'LLM-as-Judge', stage: 13, weight: 3, prereqs: ['eval-harness'] },

  // —— 阶段 14 · 安全与对齐 ——
  { id: 'prompt-injection', name: '提示注入', stage: 14, weight: 4, prereqs: ['agent-loop'] },
  { id: 'injection-defense', name: '注入防御', stage: 14, weight: 3, prereqs: ['prompt-injection'] },
  { id: 'least-privilege', name: '工具最小权限', stage: 14, weight: 3, prereqs: ['tool-safety'] },
  { id: 'output-guardrails', name: '输出护栏', stage: 14, weight: 3, prereqs: ['injection-defense'] },
  { id: 'tenant-isolation', name: '多租户隔离', stage: 14, weight: 2, prereqs: ['persistence-privacy'] },

  // —— 阶段 15 · 成本与性能 ——
  { id: 'model-routing', name: '模型路由策略', stage: 15, weight: 3, prereqs: ['llm-call'] },
  { id: 'routing-impl', name: '模型路由实现', stage: 15, weight: 4, prereqs: ['model-routing'] },
  { id: 'caching', name: '缓存体系', stage: 15, weight: 3, prereqs: ['model-routing'] },
  { id: 'prompt-pruning', name: '提示裁剪', stage: 15, weight: 2, prereqs: ['context-budget'] },
  { id: 'concurrency-batch', name: '并发批处理', stage: 15, weight: 2, prereqs: ['routing-impl'] },

  // —— 阶段 16 · 框架生态总览 ——
  { id: 'framework-dimensions', name: '框架选型维度', stage: 16, weight: 3, prereqs: ['paradigm-matrix'] },
  {
    id: 'framework-methodology',
    name: '对照方法论',
    stage: 16,
    weight: 2,
    prereqs: ['framework-dimensions'],
  },
  { id: 'framework-template', name: '框架无关骨架', stage: 16, weight: 2, prereqs: ['version-lock'] },

  // —— 阶段 17 · LangGraph ——
  {
    id: 'langgraph-core',
    name: 'LangGraph 核心',
    stage: 17,
    weight: 3,
    prereqs: ['framework-dimensions', 'agent-loop'],
  },
  {
    id: 'langgraph-react',
    name: 'LangGraph ReAct',
    stage: 17,
    weight: 2,
    prereqs: ['langgraph-core', 'react-loop'],
  },
  {
    id: 'langgraph-multi',
    name: 'LangGraph 多 Agent',
    stage: 17,
    weight: 2,
    prereqs: ['langgraph-core', 'multi-agent-impl'],
  },
  {
    id: 'langgraph-obs',
    name: 'LangGraph 可观测',
    stage: 17,
    weight: 2,
    prereqs: ['langgraph-core', 'tracing'],
  },

  // —— 阶段 18 · OpenAI Agents SDK ——
  { id: 'oa-core', name: 'OpenAI Agents 核心', stage: 18, weight: 3, prereqs: ['framework-dimensions'] },
  {
    id: 'oa-rewrite',
    name: 'OpenAI Agents 重写',
    stage: 18,
    weight: 2,
    prereqs: ['oa-core', 'runtime-impl'],
  },
  {
    id: 'oa-guardrails',
    name: 'OpenAI guardrails',
    stage: 18,
    weight: 2,
    prereqs: ['oa-core', 'output-guardrails'],
  },

  // —— 阶段 19 · Mastra ——
  { id: 'mastra-core', name: 'Mastra 核心', stage: 19, weight: 2, prereqs: ['framework-dimensions'] },
  {
    id: 'mastra-workflow',
    name: 'Mastra workflow',
    stage: 19,
    weight: 2,
    prereqs: ['mastra-core', 'fc-runtime'],
  },
  { id: 'mastra-mcp', name: 'Mastra MCP', stage: 19, weight: 2, prereqs: ['mastra-core', 'mcp-sdk'] },
  { id: 'mastra-obs', name: 'Mastra 可观测', stage: 19, weight: 2, prereqs: ['mastra-core', 'tracing'] },

  // —— 阶段 20 · Vercel AI SDK ——
  { id: 'ai-sdk-core', name: 'AI SDK 核心', stage: 20, weight: 2, prereqs: ['framework-dimensions'] },
  { id: 'ai-sdk-rewrite', name: 'AI SDK 重写', stage: 20, weight: 2, prereqs: ['ai-sdk-core', 'streaming'] },

  // —— 阶段 21 · LlamaIndex / LangChain ——
  { id: 'llamaindex-core', name: 'LlamaIndex 核心', stage: 21, weight: 2, prereqs: ['framework-dimensions'] },
  {
    id: 'llamaindex-rag',
    name: 'LlamaIndex RAG',
    stage: 21,
    weight: 2,
    prereqs: ['llamaindex-core', 'vector-rag'],
  },
  { id: 'langchain-core', name: 'LangChain 核心', stage: 21, weight: 2, prereqs: ['framework-dimensions'] },
  {
    id: 'langchain-rewrite',
    name: 'LangChain 重写',
    stage: 21,
    weight: 2,
    prereqs: ['langchain-core', 'fc-runtime'],
  },

  // —— 阶段 22 · 框架横评与迁移 ——
  {
    id: 'framework-matrix',
    name: '框架横评矩阵',
    stage: 22,
    weight: 3,
    prereqs: ['langgraph-core', 'oa-core', 'mastra-core', 'ai-sdk-core'],
  },
  { id: 'framework-fallback', name: '回退手写', stage: 22, weight: 3, prereqs: ['framework-matrix'] },
  { id: 'framework-benchmark', name: '四框架对比', stage: 22, weight: 2, prereqs: ['framework-matrix'] },
  { id: 'python-ecosystem', name: 'Python 生态对照', stage: 22, weight: 1, prereqs: ['framework-matrix'] },

  // —— 阶段 23 · 专项 Agent ——
  {
    id: 'coding-agent',
    name: '编码 Agent',
    stage: 23,
    weight: 3,
    prereqs: ['fc-runtime', 'multi-agent-impl'],
  },
  { id: 'data-agent', name: '数据 Agent', stage: 23, weight: 2, prereqs: ['fc-runtime', 'vector-rag'] },
  { id: 'research-agent', name: '研究 Agent', stage: 23, weight: 2, prereqs: ['vector-rag', 'graph-rag'] },
  { id: 'gui-agent', name: 'GUI / 具身 Agent', stage: 23, weight: 1, prereqs: ['agent-loop'] },
  { id: 'voice-agent', name: '语音 Agent', stage: 23, weight: 2, prereqs: ['streaming'] },

  // —— 阶段 24 · 生态与工具市场 ——
  { id: 'mcp-ecosystem', name: 'MCP 生态', stage: 24, weight: 1, prereqs: ['mcp-integration'] },
  { id: 'model-ecosystem', name: '模型供应商生态', stage: 24, weight: 1, prereqs: ['model-routing'] },

  // —— 阶段 25 · 部署与运维 ——
  { id: 'stateful-scaling', name: '有状态扩展', stage: 25, weight: 3, prereqs: ['persistence-privacy'] },
  { id: 'degradation', name: '降级兜底', stage: 25, weight: 3, prereqs: ['stateful-scaling'] },
  { id: 'canary', name: '灰度发布', stage: 25, weight: 2, prereqs: ['degradation'] },
  { id: 'lifecycle-ops', name: '全生命周期运维', stage: 25, weight: 2, prereqs: ['observability-dash'] },
  { id: 'deploy-service', name: '部署服务', stage: 25, weight: 3, prereqs: ['stateful-scaling', 'canary'] },

  // —— 阶段 26 · Capstone A ——
  {
    id: 'cap-a-arch',
    name: 'Capstone A 架构',
    stage: 26,
    weight: 3,
    prereqs: ['paradigm-matrix', 'mcp-triad', 'multi-agent-impl'],
  },
  { id: 'cap-a-runtime', name: 'Capstone A 运行时', stage: 26, weight: 3, prereqs: ['cap-a-arch'] },
  { id: 'cap-a-multi', name: 'Capstone A 多 Agent', stage: 26, weight: 3, prereqs: ['cap-a-runtime'] },
  { id: 'cap-a-trace', name: 'Capstone A 追踪', stage: 26, weight: 3, prereqs: ['cap-a-multi'] },
  { id: 'cap-a-eval', name: 'Capstone A 评测', stage: 26, weight: 2, prereqs: ['cap-a-trace'] },
  { id: 'cap-a-safety', name: 'Capstone A 安全成本', stage: 26, weight: 2, prereqs: ['cap-a-eval'] },
  { id: 'cap-a-deploy', name: 'Capstone A 部署', stage: 26, weight: 2, prereqs: ['cap-a-safety'] },

  // —— 阶段 27 · Capstone B ——
  {
    id: 'cap-b-arch',
    name: 'Capstone B 架构',
    stage: 27,
    weight: 3,
    prereqs: ['tot', 'graph-rag', 'multi-agent-impl'],
  },
  { id: 'cap-b-reasoning', name: 'Capstone B 推理', stage: 27, weight: 3, prereqs: ['cap-b-arch'] },
  { id: 'cap-b-rag', name: 'Capstone B RAG', stage: 27, weight: 3, prereqs: ['cap-b-reasoning'] },
  { id: 'cap-b-multi', name: 'Capstone B 研究小组', stage: 27, weight: 3, prereqs: ['cap-b-rag'] },
  { id: 'cap-b-trace', name: 'Capstone B 追踪评测', stage: 27, weight: 2, prereqs: ['cap-b-multi'] },
  { id: 'cap-b-safety', name: 'Capstone B 安全成本', stage: 27, weight: 2, prereqs: ['cap-b-trace'] },
  { id: 'cap-b-deploy', name: 'Capstone B 部署', stage: 27, weight: 2, prereqs: ['cap-b-safety'] },
  {
    id: 'course-review',
    name: '课程总览与进阶',
    stage: 27,
    weight: 1,
    prereqs: ['cap-a-deploy', 'cap-b-deploy'],
  },
]
