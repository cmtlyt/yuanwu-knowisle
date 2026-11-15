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
