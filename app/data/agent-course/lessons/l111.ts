import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L111 = withKind(
  L(
    'L111',
    21,
    '对照：用 LangChain JS 重写 Function Calling + 检索链（对比 L42 / L49）',
    3,
    ['L110', 'L42', 'L49'],
    ['langchain-rewrite'],
    [
      '用 LangChain 重写 Function Calling 与检索链，对比 L42 / L49 手写版',
      '理解 tool + chain 如何替代手写运行时与 RAG 管线',
      '度量代码量与可控性的差异',
    ],
    `
### FC 与检索的 LangChain 版

L42 手写的 FC 运行时、L49 手写的 RAG 管线，用 LangChain 重写。

\`\`\` title="FC + 检索链重写" note="关键：\\\`bindTools\\\` 替代手写 tool schema 生成；\\\`retriever\\\` 替代手写检索；chain 拼装替代手写 prompt 拼接。"
// Function Calling（对照 L42 runWithTools）
// LangChain 版：
const modelWithTools = model.bindTools([weather, calc])  // 绑定工具
const res = await modelWithTools.invoke(messages)        // 模型返回 tool_calls
// 执行 + 回填仍需自己写，但工具绑定与解析框架包了

// 检索链（对照 L49 手写 embed+retrieve）
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
const retriever = vectorStore.asRetriever()              // 检索器
const ragChain = createStuffDocumentsChain({ llm, prompt, outputParser })
const docs = await retriever.invoke(query)               // 检索
const answer = await ragChain.invoke({ context: docs, question: query })  // 生成
\`\`\`

:::deep

### 度量差异

代码量：LangChain 版缩短（bindTools / retriever / chain 内置）。可控性：让渡——工具绑定细节、检索器内部、chain 的组装方式都由框架决定。但 LangChain 组件化强，你仍可「拆开」用某个组件（如只用 retriever，不用 chain）。

:::

### 对照结论

- FC：bindTools 替代手写 tool schema，执行/回填仍要自己写。
- 检索：retriever 替代手写 embed+检索，chain 替代手写 prompt 拼接。
- LangChain 组件化：可单独用 retriever，不必全量用 chain。

:::warn

### LangChain 抽象层次多

LangChain 的抽象（chain/retriever/prompt/outputParser）层次多、概念密，学习曲线陡。它适合「深度用 RAG 生态」，简单场景手写更直接。

:::

`,
    null,
    [
      {
        text: 'L42 手写的 tool schema 生成，在 LangChain 里是？',
        options: ['手写', 'bindTools（绑定工具）', 'chain', 'retriever'],
        answer: 1,
        explain: 'bindTools。',
        concept: 'langchain-rewrite',
      },
      {
        text: 'L49 手写的检索，在 LangChain 里是？',
        options: ['chain', 'retriever（检索器）', 'bindTools', 'prompt'],
        answer: 1,
        explain: 'retriever。',
        concept: 'langchain-rewrite',
      },
      {
        text: 'LangChain 的组件化优势是？',
        options: ['概念少', '可单独用某个组件（如只用 retriever）', '更快', '无抽象'],
        answer: 1,
        explain: '组件化可拆开用。',
        concept: 'langchain-rewrite',
      },
    ],
    [
      ['bindTools', '把工具绑定到模型'],
      ['retriever', '检索器抽象'],
      ['chain', 'LCEL 组合的链'],
    ],
    [
      '简单场景也全量用 LangChain，学习曲线陡、得不偿失。',
      '把 LangChain 当「银弹」，忽视它抽象层次多的成本。',
    ],
  ),
  'framework',
)
