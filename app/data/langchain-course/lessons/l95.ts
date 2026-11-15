import { L, withKind } from '../../course-builders.ts'

export const L95 = withKind(
  L(
    'L95',
    27,
    'provider 包结构与 Hub/load 序列化：import_map 与模型注册',
    2,
    ['L03'],
    ['lc-provider-hub'],
    [
      '取证 provider 包的统一依赖形态：自家 SDK 进 dependencies、core 走 workspace peer',
      '还原 basePush/basePull 的 langsmith 后端与 lc_hub_* 溯源元数据注入',
      '解释 generateModelImportMap 的模型类注册机制与 import_map 在 load() 还原中的角色',
    ],
    `### 模块七收尾：32 个 provider 包与一张 import map

本课是模块七最后一课，回到 L03 立下的「主包导出面」视角，看两个外围问题：**几十个厂商适配包如何组织成不互相污染的生态；一个从 Hub 拉下来的 prompt 序列化载荷如何还原成可运行对象**。核心结论：**provider 依赖单向指向 core（core 不认识任何 provider），而 Hub/load 体系的本质是「载荷不含代码，类必须由调用方注册」——import map 就是那张注册表**。

### 走读：provider 包的统一形态

先看目录事实：\`libs/providers/\` 下共 32 个包——langchain-openai / anthropic / aws / cloudflare / cohere / deepseek / exa / fireworks / google 系（google/google-common/google-gauth/google-genai/google-vertexai/google-vertexai-web/google-webauth 共 7 个）/ groq / ibm / mistralai / mongodb / neo4j / ollama / openrouter / perplexity / pgvector / pinecone / qdrant / redis / tavily / together-ai / typesafe / weaviate / xai。两类混编：模型 provider（openai/anthropic…）与向量库/搜索 provider（pinecone/qdrant/pgvector…）。

\`\`\`json
// libs/providers/langchain-openai/package.json（关键片段）
"dependencies": {
  "js-tiktoken": "^1.0.12",
  "openai": "^7.47.0",
  "zod": "^4.6.6"
},
"peerDependencies": {
  "@langchain/core": "workspace:^"
}
\`\`\`

*— langchainjs/libs/providers/langchain-openai/package.json:29-36（commit 7704471）*

依赖形态的三个统一约定。其一，**自家 SDK 进 dependencies**（openai ^7.47.0），core 相关类型工具（zod、js-tiktoken）也进 dependencies——运行时真实需要的都自给自足。其二，**@langchain/core 永远是 peerDependencies 且版本写 workspace:^**——monorepo 内指向 workspace 版本，发布时解析成兼容范围；用户侧安装 provider 时必须同时装 core，版本由用户统一钉住。这保证了「多个 provider 共享同一个 core 实例」，L05 的 Symbol.for 跨包判型、L12 的消息类型互通全部建立在这个前提上。其三，**core 不认识任何 provider**：initChatModel（L09）是主包里唯二的动态桥——provider 与 core 的连接只在用户侧发生。

包内 src 目录同样有约定：langchain-openai 的 src 分 azure/ chat_models/ converters/ decisions/ embeddings.ts llms.ts tools/ types.ts utils——**chat_models/llms/embeddings/tools 四个目录与 core 的四个抽象基类一一对应**（L16、L20、L86、L22 讲过的契约）。decisions/ 是个新面孔：模型能力决策表（哪些模型支持什么特性），对应 @langchain/model-profiles 的生成机制（package.json 里 typegen:profiles 脚本可见）。google 系拆成 7 个包的案例值得记：按**传输与认证方式**拆包（gauth/google-webauth/vertexai-web…）而不是按产品拆——同一厂商多认证通道的场景，包边界跟认证走。

### 走读：Hub 的 push/pull 与溯源注入

\`\`\`ts
// libs/langchain/src/hub/base.ts
import { Client } from "langsmith";

export async function basePush(repoFullName: string, runnable: Runnable, options?): Promise<string> {
  const client = options?.client ?? new Client(options);
  const payloadOptions = {
    object: runnable,
    parentCommitHash: options?.parentCommitHash,
    isPublic: options?.isPublic,
    description: options?.description,
    readme: options?.readme,
    tags: options?.tags,
  };
  return client.pushPrompt(repoFullName, payloadOptions);
}

export async function basePull(ownerRepoCommit: string, options?): Promise<PromptCommit> {
  const client = options?.client ?? new Client(options);
  const promptObject = await client.pullPromptCommit(ownerRepoCommit, {
    includeModel: options?.includeModel, skipCache: options?.skipCache,
  });
  promptObject.manifest.kwargs.metadata = {
    ...promptObject.manifest.kwargs.metadata,
    lc_hub_owner: promptObject.owner,
    lc_hub_repo: promptObject.repo,
    lc_hub_commit_hash: promptObject.commit_hash,
  };
  // mustache 嵌套变量的 dot 修复（stripDotNotation）……
  return promptObject;
}
\`\`\`

*— langchainjs/libs/langchain/src/hub/base.ts:15-96（commit 7704471）*

三个事实。其一，**Hub 没有独立后端**：basePush/basePull 直接调 langsmith Client 的 pushPrompt/pullPromptCommit——prompt Hub = langsmith 的 prompt 仓库，鉴权、网络、存储全部复用 langsmith 基础设施。\`ownerRepoCommit\` 参数形如 \`owner/repo:commitHash\`，与 git 的引用语义同构（不带 commit 默认最新）。其二，**溯源三件套**：pull 回来的 manifest 元数据被注入 lc_hub_owner/lc_hub_repo/lc_hub_commit_hash——拉下来的 prompt 对象自带「出处」，运行时可以校验来源，缓存层也能按 commit hash 做键。其三，一个有趣的补丁：mustache 格式的嵌套 prompt 变量若含点号会被误解析（base.ts:72-94），basePull 对 input_variables 做 stripDotNotation 修复——**hub pull 层承担了历史格式缺陷的运行时补偿**，这是「序列化格式不能改、只能在读取端打补丁」的活案例。

### 走读：generateModelImportMap 与类注册

\`\`\`ts
export function generateModelImportMap(modelClass?: new (...args: any[]) => BaseLanguageModel) {
  const modelImportMap: Record<string, any> = {};
  if (modelClass !== undefined) {
    const modelLcName = modelClass?.lc_name();
    let importMapKey;
    if (modelLcName === "ChatOpenAI") importMapKey = "chat_models__openai";
    else if (modelLcName === "ChatAnthropic") importMapKey = "chat_models__anthropic";
    else if (modelLcName === "ChatAzureOpenAI") importMapKey = "chat_models__openai";
    else if (modelLcName === "ChatVertexAI") importMapKey = "chat_models__vertexai";
    // ... ChatGoogleGenerativeAI / ChatBedrockConverse / ChatMistralAI / ChatFireworks / ChatGroq ...
    else throw new Error("Received unsupported model class when pulling prompt.");
    modelImportMap[importMapKey] = { ...modelImportMap[importMapKey], [modelLcName]: modelClass };
  }
  return modelImportMap;
}
\`\`\`

*— langchainjs/libs/langchain/src/hub/base.ts:98-137（commit 7704471）*

这段代码回答了一个本质问题：**序列化载荷不含代码，pull 下来的 prompt 里引用的模型类从哪来**？答案是把责任转给调用方——pullPrompt 时传入模型类，工厂函数按 \`lc_name()\` 查表生成 import map（命名空间键 \`chat_models__xxx\` → \`{ ChatXxx: 类构造器 }\`），load() 反序列化时按载荷里的 lc 命名空间与类名从这张表取回类。查不到就直接抛错——**不认识就是不认识，没有运行时扫描、没有动态 import**。注意 ChatOpenAI 与 ChatAzureOpenAI 共用 \`chat_models__openai\` 键：同一 provider 包的多个类共享命名空间段，这是 lc 序列化命名空间按「包」而不是按「类」组织的证据。

配套的还有 generateOptionalImportMap（处理可选依赖的类，找不到注册也不报错的宽松版本）与 langchain 包 load/ 目录的五个文件（import_constants/import_map/import_type/map_keys/serializable），其中 serializable.ts 只有一行 \`export * from "@langchain/core/load/serializable"\`——**序列化机制本体在 core（Serializable 基类），langchain 包只做「包名映射」与 re-export**，与 L08 讲的转发层策略一脉相承。

### 走读：import_map 是构建产物

\`\`\`ts
/** Auto-generated by import-map plugin. Do not edit manually */

export * as browser from "../browser.js";
export * as chat_models__universal from "../chat_models/universal.js";
export * as index from "../index.js";
export * as load__serializable from "../load/serializable.js";
export * as storage__encoder_backed from "../storage/encoder_backed.js";
export * as storage__file_system from "../storage/file_system.js";
export * as storage__in_memory from "../storage/in_memory.js";
export * as tools from "../tools/index.js";
import { ChatPromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder, ... } from "@langchain/core/prompts";
const prompts__chat = { AIMessagePromptTemplate, ChatMessagePromptTemplate, ChatPromptTemplate, ... };
export { prompts__chat };
\`\`\`

*— langchainjs/libs/langchain/src/load/import_map.ts:1-84（commit 7704471）*

import_map.ts 文件头第一行就声明了它的性质：**构建插件自动生成，禁止手改**。它导出两样东西：命名空间段（\`browser\`/\`chat_models__universal\`/\`load__serializable\`/\`storage__*\`/\`tools\` 等，覆盖主包的可序列化面）与映射表对象（\`prompts__chat\`/\`schema\`/\`schema__runnable\`/\`prompts__pipeline\`…，从 core 与主包 import 的类按段组装）。load() 的还原算法由此闭环：**载荷对象带 \`lc: { id: [命名空间段, 类名], ... }\` 指纹 → import map 按 id 找回类 → kwargs 还原构造参数**。L03 讲「主包导出面就是产品重心」时留的伏笔在此回收：导出面有多大，import map 就有多大——**可序列化的对象集与可导入的对象集严格同源**。

对照一个易混概念收尾：\`SaveableVectorStore.save/load\`（vectorstores.ts:866-901）是 vectorstore 的**专用**本地持久化（自定格式、自管兼容），而 lc 序列化 + import map 是**通用**的对象图序列化（跨网络、跨进程、带溯源）。前者存「数据」，后者传「可执行配置」——两者的分工与 L89 的缓存/checkpoint 分工同构：不同持久化面解决不同持久化问题。

### 本课小结

- provider 统一形态：自家 SDK dependencies + @langchain/core workspace:^ peer；32 个包四目录（chat_models/llms/embeddings/tools）对应 core 四抽象；core 不认识任何 provider。
- Hub = langsmith prompt 仓库：basePush/basePull 直调 Client.pushPrompt/pullPromptCommit；pull 注入 lc_hub_owner/repo/commit_hash 溯源三件套。
- 载荷不含代码：generateModelImportMap 把调用方传入的模型类按 lc_name() 注册进 \`chat_models__xxx\` 命名空间段，不认识直接抛错。
- import_map.ts 是构建插件自动生成的「命名空间 → 类」注册表，load() 还原对象的唯一依据；可序列化集与可导入集同源。
- 模块七全链收束：RAG 五环 → 记忆缓存三面（Memory/checkpoint/Store）→ 可观测双课 → 外部连接双课。模块八将进入结构化输出与类型系统的深水区。
`,
    null,
    [
      {
        text: 'langchain-openai 的依赖形态是什么？',
        options: [
          '@langchain/core 是 dependencies 之一',
          'openai SDK 与 zod/js-tiktoken 进 dependencies，@langchain/core 是 workspace:^ 的 peerDependencies',
          '全部打包进单文件',
          'core 依赖 provider（方向相反）',
        ],
        answer: 1,
        explain:
          'libs/providers/langchain-openai/package.json:29-36：dependencies 是 js-tiktoken/openai/zod，peerDependencies 只有 @langchain/core: workspace:^。依赖方向单向指向 core——core 不认识任何 provider，provider 全靠 core 的抽象（L16/L19/L86 的基类）接入。这是 L02「依赖方向」在 provider 层的再证实。',
        concept: 'lc-provider-hub',
      },
      {
        text: 'Hub 的 push/pull 底层调用的是什么？',
        options: [
          '自建 Hub REST API',
          'langsmith Client 的 pushPrompt/pullPromptCommit——Hub 的存储后端就是 langsmith',
          'npm registry',
          'GitHub API',
        ],
        answer: 1,
        explain:
          'libs/langchain/src/hub/base.ts:15-56：basePush 调 client.pushPrompt(repoFullName, payloadOptions)、basePull 调 client.pullPromptCommit(ownerRepoCommit, ...)，Client 来自 import { Client } from "langsmith"。「prompt Hub = langsmith 仓库」——没有独立的 Hub 服务，复用 langsmith 的存储与鉴权。',
        concept: 'lc-provider-hub',
      },
      {
        text: 'basePull 拉回的 manifest 会被注入哪三个元数据字段？',
        options: [
          'author/version/license',
          'lc_hub_owner / lc_hub_repo / lc_hub_commit_hash——prompt 对象的溯源三件套',
          'created_at/updated_at/tags',
          '没有注入，原样返回',
        ],
        answer: 1,
        explain:
          'hub/base.ts:65-70：promptObject.manifest.kwargs.metadata = { ...metadata, lc_hub_owner: promptObject.owner, lc_hub_repo: promptObject.repo, lc_hub_commit_hash: promptObject.commit_hash }。拉下来的每个 prompt 都带「谁/哪个仓库/哪个提交」的溯源信息，嵌入 manifest 元数据随对象一起传播。',
        concept: 'lc-provider-hub',
      },
      {
        text: 'generateModelImportMap("ChatAnthropic") 生成的键是什么？收到不认识的模型类呢？',
        options: [
          '键 anthropic；不认识的自动创建',
          '键 chat_models__anthropic；不认识的模型类直接 throw Received unsupported model class when pulling prompt',
          '键 ChatAnthropic 本身；不认识的返回空 Map',
          '键 chat_models；不认识的静默跳过',
        ],
        answer: 1,
        explain:
          'hub/base.ts:98-137：lc_name() 为 ChatAnthropic 时映射到 importMapKey = "chat_models__anthropic"，键值形如 { [modelLcName]: modelClass }；else 分支抛 Received unsupported model class when pulling prompt。命名空间键对应 lc 序列化载荷里的 import_path 段——反序列化时按它找回类。',
        concept: 'lc-provider-hub',
      },
      {
        text: 'langchain 包的 load/import_map.ts 是什么性质？',
        options: [
          '手写维护的类清单',
          '文件头标注 Auto-generated by import-map plugin. Do not edit manually——构建期自动生成',
          '运行时动态扫描 node_modules 生成',
          'langsmith 下发的远程配置',
        ],
        answer: 1,
        explain:
          'import_map.ts:1：/** Auto-generated by import-map plugin. Do not edit manually */。它导出 browser/chat_models__universal/index/load__serializable/storage__*/tools 等命名空间段，并从 @langchain/core 与主包 import 各类组装成 prompts__chat/schema__runnable 等映射表——载荷里的 lc 命名空间按这张表还原成类。',
        concept: 'lc-provider-hub',
      },
    ],
    [
      [
        'provider 包',
        'libs/providers/ 下 32 个厂商适配包，统一形态：自家 SDK dependencies + core workspace peer',
      ],
      ['Hub', 'prompt 的 push/pull 服务，存储后端是 langsmith Client.pushPrompt/pullPromptCommit'],
      ['generateModelImportMap', 'pull prompt 时把「用户传入的模型类」注册进 import map 的工厂函数'],
      ['import_map', 'lc 序列化命名空间 → 具体类的映射表（构建期自动生成），load() 还原对象的依据'],
    ],
    [
      '以为 Hub 是独立服务需要单独部署——它就是 langsmith 的 prompt 仓库，push/pull 复用 langsmith 鉴权与网络',
      'pull 时传了不支持的模型类（或忘传）还期望 load 成功——generateModelImportMap 对不认识的类直接抛错；模型类必须由调用方显式注册，载荷不含代码',
      '手动改 import_map.ts——文件头明确 Do not edit manually，它是构建插件生成的，手改会在下次构建被覆盖',
    ],
  ),
  'theory',
)
