# 研究资料落盘与检索输出恢复

> 长周期研究 / 写作任务：检索结果如何可靠落盘，避免上下文压缩后丢数字与链接。实测 2026-11-15（00091 Agent Harness）。

## 1. 检索结果合并成单个大文件，用户纠正「单文件过大」

- **症状**：12 条 `WebSearch` / `WebFetch` 原始返回导出成 `raw-01.md` **238,707 字节**，用户纠正「可以多文件暂存，单文件体量过大也不好」；台账单文件 30,350 B 也难按主题取用。
- **根因**：按「批次」而非「单次检索」聚合；批次内既有 7 KB 短文也有 32 KB 结果，查阅必载整批，压缩后无法按条恢复。
- **处理**：① 改为 `research/raw/<批次>-<序号>-<来源短名>.md`，**一条检索一文件**，头部写核实日期 / 调用参数 / callId / 可信级别；台账按主题拆 `research/evidence/<批次>-<主题>.md`（可信级别 / 来源清单 / 基准事实 / 架构事实 / 待补清单）。② 单文件上限约 **32 KB**，超限按 `^## ` 切分（53.8 KB 文档切 3 片：15.7 / 26.9 / 14.9 KB）。③ **零丢失校验**：脚本逐条断言每条原文与每个台账章节完整出现在分片里，通过才删合并档。④ `research/README.md` 活索引允许追加批次行，其余分片**只新建、不改写、不追加**。⑤ 节奏固定：检索 → 立即机械导出 → 读分片提炼带来源 ID 的台账 → 下一批。
- **结果**：12 原文分片（最大 31,924 B）+ 5 台账分片（最大 11,415 B）+ 索引；238 KB 合并档移除后零丢失。批次 02/03 沿用，最大分片 26,889 B。
- **关键词**：资料暂存、上下文压缩、单文件过大、多文件分片、逐条落盘、零丢失校验、证据台账。

## 2. `WebFetch` 大输出折叠成 `<persisted-output>`，导出 transcript 只拿到占位

- **症状**：抓 `https://code.claude.com/docs/en/permissions` 返回约 53.8 KB，从 `*.jsonl` 导出的分片仅 **2,064 字节**，形如 `<persisted-output> Output too large (53.8KB). Full output saved to: C:\...\tool-results\chatcmpl-tool-8b31fc00a8a649e1.txt`，只带首 2048 字节预览。
- **根因**：超阈值时全文写到 `tool-results/<callId>.txt`，消息流只保留占位；`function_call_result.output.text` 存的是占位不是全文。
- **处理**：① 检测 `Full output saved to:\s*(\S+\.txt)`，Windows 反斜杠转 `/` 后读全文（本次 **55,105 字节**）。② 按 `^## ` 切成 <20 KB 分片，头部注明「来源为持久化文件、未改写」。③ **外层围栏用 5 个反引号**：官方原文自带 4 反引号（如 `openai/codex` README 首行），4 反引号会破坏 markdown 结构；课程数据层同样校验围栏 info-string 不含反引号。④ 抽查分片首尾，确认不是预览。
- **结果**：恢复 55,105 B，切 3 片（15,735 / 26,889 / 14,919 B），记入 `docs/00091-.../research/evidence/02-corrections.md` 第 4 节。
- **关键词**：`<persisted-output>`、`Output too large`、`Full output saved to`、`tool-results`、预览 2048 字节、五反引号围栏。

## 3. 相关但不同的边界

- 文档站是动态 SPA（如 `huggingface.co/spaces/harness-hub/harness-lens`）时 `WebFetch` 只拿 632 字符外壳（标题 / Like / Running / Fetching metadata…），**不是**折叠输出，读 `tool-results` 无用；改抓 `/raw/main/README.md` 或 `/tree/main`，或从转述该 Space 的一手公告取证。已列待补清单。
- 搜索摘要（二手）与页面抽取（模型提取）都可能失真，落盘后仍按 A/B/C 分级，关键结论升级到官方仓库 / 文档再入正文。

## 4. 按来源 slug 子串批量导出分片，前缀误配导致互相覆盖

- **症状**：批次 05/06 按「URL 含某 slug 子串」分配文件名，两类覆盖：① `06-04-hermes-docs-root.md` 被三条 Hermes 结果轮流覆盖（`'nousresearch.com/docs/'` 子串也匹配 architecture 页），`learn.chatgpt.com/docs/sandboxing.md` 因「无 slug」整体跳过；② `06-04-codex-config-md-404.md` 被 config-reference 覆盖（`codex-config` 前缀误配）。恢复时只有最后一条幸存，前几条静默丢失。
- **根因**：导出映射用「包含关系」而非「精确对应」；一条检索一文件要求 callId / URL 与文件名一一对应，子串匹配破坏不变量且覆盖静默（无报错、文件数不减）。
- **处理**：① 按 **callId 精确重写**受影响分片、按 URL 精确映射重建文件名，清 stale 文件后再登记批次。② 导出脚本自检：**文件数 = 检索条数**，任何结果找不到唯一目标即报错停止。③ 同批文档站陷阱：`developers.openai.com/codex/*` 301 重定向到 `learn.chatgpt.com/docs/*`，无 `.md` 后缀返回 404 导航壳（抓 `*.md`）；SPA 路径（如 `/docs/architecture`）从 `/docs/` 根页拿入口；中文检索返回 `[SENSITIVE_CONTENT_UNAVAILABLE]`（589 B）时换英文重查。
- **结果**：批次 05/06/07 共 44 条检索零丢失落盘；`raw/` 分片数与登记表一致。
- **关键词**：slug 误配、前缀匹配、分片覆盖、callId 精确映射、文档站 301 迁移、SPA 404 导航壳、SENSITIVE_CONTENT_UNAVAILABLE、导出自检。

## 5. 并行子代理（Agent 工具）整批 429 频率限制，取证任务全部失败

- **症状**：一次并行发 5 个 `general-purpose` 子代理做源码取证，全部返回 `429 您的使用量已超出频率限制，将在 <时刻> 重置，您也可以切换其他模型继续使用`，任务创建成功但执行失败，无部分产出。
- **根因**：平台按会话对子代理调用限频；并行多路同时触发配额，重置窗口可达数小时——干等重置会阻塞任务。
- **已实测处理**：两条路均验证有效。① **切换模型后重发**：用户切换模型后，同参数重发同一批 Agent 调用，5 个全部成功（2026-11-15，00096 取证）；② **主会话串行兜底**：不等子代理，直接在本会话用 Bash/Grep 批量提取源码签名与片段、自行落盘台账——单模块取证量（约 20 条证据）主会话完全可承载，且证据质量相同（00096 模块四~五即此路产出）。择路原则：限额消息带「切换其他模型」提示时优先①；模型不可切或仍 429 时立即转②，不要 sleep 轮询等待重置。
- **结果**：00096 五组模块取证全部完成（4 组子代理 + 1 组主会话），180 条证据落盘。
- **关键词**：429、频率限制、子代理失败、Agent 工具、并行限频、切换模型、串行兜底、取证降级。

## 6. gen-course.mjs 只支持两位课时 id（L\d{2}），≥100 课的大课会被静默过滤 + 字典序排序打乱 LESSONS

- **症状**：用草稿管线生成 ≥100 课的课程时，`L100.md` 起的草稿全部被忽略（文件过滤 `/^L\d{2}\.md$/` 与 id 校验 `/^L\d{2}$/` 都不匹配三位数）；即使放开正则，`toSorted()` 默认字典序会把 `L100` 排在 `L11` 之前，生成的 `lessons/index.ts` 顺序错乱，verify 的「课时前置必须更早」校验连锁失败。
- **根因**：skill 的生成器是按 ≤99 课假设写的；agent-course（142 课）是手写 lNN.ts 没走草稿管线，所以从未暴露。
- **已实测处理**（00096，132 课）：正则放宽为 `/^L\d{2,3}\.md$/` 与 `/^L\d{2,3}$/`（向后兼容）；排序改为 `toSorted((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))` 数值序。改动在 `.workbuddy/skills/course-builder/scripts/gen-course.mjs`。生成后必须确认输出条数 = 草稿数且尾课 id 顺序正确。
- **关键词**：gen-course、三位数 id、L100、字典序排序、lessons/index 顺序、prereqs 校验失败、草稿管线、大课。

## 7. 子代理自报「正文字数」与官方 contentStats 口径偏差约 2 倍，课程体量闸门大面积失败

- **症状**：子代理写课程草稿时自报正文 2000–3000 字，全量跑 `pnpm verify` 的 content-gate 后 100+ 课报「体量未达标：正文 800–1500/1200–3000 字」，需要整批返工。
- **根因**：闸门口径是 `contentStats().proseWords` = **汉字数 + 英文词数**（不含标点、不含代码、不含 md 结构符）；子代理通常按「含标点的总字符数」自估，偏差恰好在 2 倍上下，且不自知。
- **已实测处理**（00096，132 课）：① 让子代理用官方函数直接量草稿，一行命令：`node --experimental-strip-types -e "import('./app/lib/markdown-md.ts').then(async m=>{...contentStats(md)...})"`（md 先剥 frontmatter），按「下限+80 字」目标迭代到实测达标；② 从 content-gate 输出抓 `--only=` 缺口清单落盘，按模块分批派扩写子代理（只做增量：新增小节/扩段，frontmatter 不动、原内容不删）；③ 代码缺口同理量 `codeChars`。全量复验 353/353 达标。经验值：写课正文目标直接按「官方口径下限 ×1.15」布置，不要按字符数布置。
- **关键词**：contentStats、proseWords、体量闸门、content-gate、字数口径、汉字数、扩写、草稿自测、闸门失败。
