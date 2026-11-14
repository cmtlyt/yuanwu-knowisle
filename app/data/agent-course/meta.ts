import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ---------------- */
export const META: CourseMeta = {
  version: 'typescript@7.0.2 · node@24 LTS',
  verifiedAt: '2026-11-15',
  lts: 'Node 24 LTS（本课固定运行环境，不混用 Deno / Bun）；TypeScript 7.0.2（本仓库锁定）',
  docs: 'https://modelcontextprotocol.io/docs',
  release: 'https://github.com/modelcontextprotocol/typescript-sdk/releases',
  playground: 'https://platform.openai.com/playground',
  source: 'https://github.com/anthropics/anthropic-cookbook',
  notes: [
    '全课实现语言 TypeScript 7，运行环境固定 Node 24 LTS；教学基线默认 OpenAI 兼容接口。',
    '框架对照（本次 2026-11-15 联网核实）：@langchain/langgraph@1.x、langchain@1.x、@openai/agents@0.22.x、@openai/guardrails@0.3.0、@mastra/core@1.82.x、ai@7.0.x、llamaindex@0.12.x、@modelcontextprotocol/sdk@1.x、@opentelemetry/api@1.x、langsmith@0.12.x。',
    '正文不硬编码小版本号，版本统一以本 META 为准；框架对照课为练手可跳过，主线是无框架 TS 手写。',
    'Python 生态（AutoGen / CrewAI / LiteLLM / LlamaGuard）仅作架构对照，不写 Python 代码。',
    '两个 Capstone（A 工具型 / B 研究型）各自从零、不共享代码，选做其一或双做。',
  ],
}
