# 草稿写作契约（M3–M11，供批量写作严格遵守）

每课一个草稿文件 `<drafts-dir>/LNN.md`，格式：

```
---
{ JSON frontmatter，单行或多行均可，必须是合法 JSON }
---
（Markdown 正文）
```

## frontmatter 字段（必填，字段名严格）

```json
{
  "id": "L27",
  "stage": 12,
  "title": "课标题（不得含「实战」二字，除非 kind 是 practice/scenario/capstone/framework）",
  "difficulty": 3,
  "prereqs": ["L11"],
  "concepts": ["spmoe"],
  "goals": ["4 条学习目标"],
  "kind": "theory",
  "quiz": [
    {"text":"题干","options":["A","B","C","D"],"answer":1,"explain":"解析（引用关键数字/机制）","concept":"spmoe"}
  ],
  "terms": [["术语","释义"], ... 至少 4 组],
  "pitfalls": ["易错点 1", ... 至少 3 条]
}
```

- `goals` 恒 4 条；`concepts` 恒 1 个（取 spec.json）；`quiz` 恒 4 题；`terms` ≥4；`pitfalls` ≥3。
- **kind = practice 时 goals 至少一条含实现类动词**（实现/写出/写一个/搭/搭建/构建/跑通/调通/部署/编码/改造/接入/从零/打通/串成/产出）——spec.json 的 goals 已写好，照抄即可。
- `quiz[].concept` 必须等于该课 concepts[0]。`answer` 是 0-based 索引。`options` 4 项。
- frontmatter 里所有字符串用 ASCII 双引号，内部若出现双引号要转义为 `\"`；中文书名号/引号直接用「」《》避免转义。

## 正文 Markdown 规则（血泪教训，逐条遵守）

1. **体量下限（contentStats 口径）**：正文字数 = 汉字逐字数 + 英文整词数；代码块**完全不计入正文**（只算 codeChars，去空白字符数）。阈值：
   - theory：正文 ≥1200 词，代码 ≥400 字符
   - framework：正文 ≥1500 词，代码 ≥1000 字符
   - practice / scenario：正文 ≥1800 词，代码 ≥1500 字符
   - capstone：正文 ≥3000 词，代码 ≥2500 字符
   - **只设下限不设上限**，宁多勿少。写完后用探针核对，正文目标留 10% 余量（如 theory 写到 1300+）。
2. **代码块必须用三反引号围栏** ` ```python ` / ` ```bash ` 等；info-string 里**不能出现反引号**。代码要是**可运行、有实质逻辑**的示例（含 print/断言/数值），不是伪代码占位。codeChars 去空白后累计，多个代码块相加。
3. **正文要「实质内容」不是注水**：按 spec.json 的 `bodyGoal` 逐点展开，每点配机制解释 + 一个具体数字/公式/代码印证。用 `### 小标题` 分节（至少 4–6 个小标题）。参考已落地的 `app/data/llm-arch-course/lessons/l15.ts` 的正文写法：现象 → 机制 → 可跑代码 → 工程判据 → 提示框收尾。
4. **容器语法**：`:::deep` / `:::tip` / `:::warn` 开头 + 单独一行 `:::` 结尾，必须**成对且正确嵌套**。每课用 1–3 个容器，放在小标题前，内部可含正文但不能有未闭合。不要写 `:::tip:::tip` 这种双写。
5. **表格里的竖线**：只有真正 Markdown 表格单元格里的 `|` 才写成 `\|`（避免被 contentStats 当分隔符，也避免渲染错位）；叙述正文里**绝不写** `\|`，要用「到」「或」「幅度」等中文表达，或写裸 `|`。数值范围用 `~` 或「至」，不要用 `|`。
6. **数字与来源**：spec.json 的 `source` 标明 A/B 级。A 级数字（如 MLA 减 KV 93.3%、Mixtral 46.7B/12.9B、top-k=2、1.3B 胜 175B）可以写死；B 级值（过训练 token/参数、商用 API 价、通用 KV 量化）必须标注「第三方复算/随时间变动，不担关键结论」。arXiv 号已在 00098 B5 批次核验，直接用 spec 对应来源的号。
7. **正文不要写「本节课」「本课时」这类元叙述堆砌**；直接讲技术。可以用「上一课 LNN」「M7 的 GRPO（将在 L99 讲）」做课程内交叉引用。
8. **不要写 frontmatter 之外的 JSON 或注释**；正文里也不要出现 `---` 分隔符（会被误当 frontmatter 边界）。

## 生成与验证

写作只产出草稿 LNN.md。**不要手写 lessons/lNN.ts**——由 `gen-course.mjs` 从草稿机械生成（自动转义反引号与 `${`，避免 SyntaxError）。

验证靠 `tmp/probe-all.mjs`（按 kind 精确比对本课程课）。若某课 FAIL，按下表补足：
- 正文不足：加一个「工程判据/选型清单/常见翻车点/数值自检」实质小节（不是重复啰嗦）。
- 代码不足：加一段可跑的对照脚本/自检断言（含 print 具体数字）。

## spec 来源

- 全课映射：`docs/00101-llm-arch-course-m3-m11/spec.json`（85 课，字段即 frontmatter 取值）。
- 阶段定义：`app/data/llm-arch-course/stages.ts`。
- 参考范文：`app/data/llm-arch-course/lessons/l15.ts`（theory）、`l21.ts`（scenario）、`l24.ts`（capstone）。
