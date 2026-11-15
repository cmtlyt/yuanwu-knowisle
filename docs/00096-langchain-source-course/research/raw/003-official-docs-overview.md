# 检索 003 · 官方文档 LangChain JavaScript overview（WebFetch）

- 日期：2026-11-15
- 来源：https://docs.langchain.com/oss/javascript/langchain/overview
- 级别：A 级（官方文档站，页面标注 edit on github: langchain-ai/docs/src/oss/langchain/overview.mdx）

## 核心叙事（决定课程「新架构」模块口径）
- 定位：**Agent = Model + Harness**。`create_agent` 是「最小、高度可配置的 agent harness」；harness = 模型循环之外的一切（提示词、工具、塑造行为的 middleware）。
- 官方三层选型：
  1. **LangChain** `create_agent`——高度可定制 harness，按需组合模型/工具/数据。
  2. **LangGraph**——低层编排框架，用于「确定性 + agentic 混合工作流」的高级需求。
  3. **LangSmith**——对以上任一框架构建的 agent 做 trace/debug/evaluate；推荐搭配 LangSmith Engine（监控 trace、检测问题、提议修复）。
  - 另有 Deep Agents：Managed Deep Agents（自带 context compression / virtual filesystem / subagents）、Deep Agents SDK（自托管）、Agent Server，构建在 LangChain agents 之上。
- 官方示例 API（`npm install langchain zod @langchain/openai`）：
  ```ts
  import { createAgent, tool } from "langchain";
  import * as z from "zod";
  const getWeather = tool((input) => ..., {
    name: "get_weather", description: "...",
    schema: z.object({ city: z.string().describe("...") }),
  });
  const agent = createAgent({ model: "gpt-6.1-sol", tools: [getWeather] });
  await agent.invoke({ messages: [{ role: "user", content: "..." }] });
  ```
- **关键命名差异**：文档示例用 `createAgent`（camelCase）， overview 段落文字用 `create_agent`（Python 风格）。**TS 源码真实导出名必须以仓库源码为准**（见源码取证分片），这是「不靠记忆」要抓的重点之一。
- 支持 provider：OpenAI / Anthropic / Google / OpenRouter / Fireworks / Baseten / Ollama / Azure / AWS Bedrock。
