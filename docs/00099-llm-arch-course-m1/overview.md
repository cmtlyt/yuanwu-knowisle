# 00099 · LLM 架构深度课 M1 模块落地（首个可验证批次）

- 分支：`feat/llm-arch-course-outline`（00098 大纲分支，00098 明确「不落地 app/data，落地另开任务」）
- 状态：**M1 十四课全量落地**（2026-11-16），全部门禁绿：`verify-course` ✓ / `pnpm verify` 四段 ✓（含体量闸门 367/367）/ `fmt:check` ✓ / lint 0 errors / typecheck 0 errors / build ✓
- 落地形态：`app/data/llm-arch-course/`（complex 4 层：`modules.ts` 11 模块 / `stages.ts` 51 阶段 / `concepts.ts` M1 14 概念 / `design.ts` / `meta.ts` / `lessons/l01-l14.ts`）；`courses.ts` 注册 `slug: 'llm-arch'`、`storageKey: 'knowisle:llm-arch:v1'`。
- 内容源：00098 的 `drafts/course-outline.md` + `m1-m7-volume-plan.md` + `m8-m11-volume-plan.md`（课数 / kind / 难度 / 前置映射），正文为按官方 contentStats 口径实写。
- 日期：2026-11-16

## 1. 目标

把 00098 大纲的 M1 模块（架构原理深挖，L01–L14）真正落地到 `app/data`，作为整门 111 课 LLM 架构深度课的**首个可验证批次**：脚手架（11 模块 / 51 阶段 / DESIGN / META / CONCEPTS 入口）+ M1 全部 14 课正文 / 代码 / 测验 / 术语 / 误区。M1 过门禁并提交后，按 M2→M11 逐模块推进（每模块一批次）。

## 2. 硬约束

1. **content-gate 体量阈值（00055 口径）**：theory 1200 词 / 400 码、framework 1500 / 1000、practice·scenario 1800 / 1500、capstone 3000 / 2500、overview 400 / 0。M1 十四课须双达标。
2. **md 模板字符串反引号转义**：正文 ` ``` ` 围栏与行内 ` `` ` 必须转义成单反斜杠+反引号（`\`\`\` ` / `` \` ``），否则 JS 模板字符串提前闭合报 SyntaxError。转义后统一跑幂等脚本归一化。
3. **verify-course 不变量**：难度 1–5 整数、stage / 概念引用有效、prereqs 指向更早课时、DESIGN 绑定、概念至少被一道题覆盖。
4. **content-gate 自洽硬校验（00058）**：practice 课 goals 必含实现类动词；标题含「实战」不能标 theory/overview；代码围栏 info-string 不能含反引号。
5. **全课 111 课连续编号**（00098 已定死）：M1=L01–L14 … M11=L103–L111；51 阶段（stage id 0–50）。prereqs 全用全课连续编号。

## 3. M1 十四课映射

| 课 | 标题 | kind | 难度 | prereqs | 概念 |
|---|---|---|---|---|---|
| L01 | 2017 Transformer 原文 block 结构 | theory | 2 | – | block-arch |
| L02 | 自回归 next-token 与三范式定位 | theory | 2 | L01 | autoreg-paradigm |
| L03 | 手写 next-token 损失 + 小语料冒烟 | practice | 2 | L02 | next-token-loss |
| L04 | 手写 QKV 注意力（公式层） | practice | 3 | L02 | qkv-attention |
| L05 | MHA→MQA→GQA 谱系与 KV 内存 | framework | 3 | L04 | multi-head |
| L06 | 手写 MHA：QKV + 缩放 + 因果 mask | practice | 3 | L04,L05 | mha-impl |
| L07 | FFN 大头：SwiGLU 与 8/3·d_model | theory | 3 | L01 | ffn |
| L08 | 残差 + 归一化：Pre/Post-Norm 与 RMSNorm | framework | 3 | L07 | norm-residual |
| L09 | 手写 RMSNorm，对照 LayerNorm | practice | 3 | L08 | rmsnorm-impl |
| L10 | 位置编码演进：RoPE / 外推 / ALiBi | framework | 3 | L04 | positional-enc |
| L11 | Capstone：组装最小 decoder-only + 谱系地图 | capstone | 4 | L03,L06,L09,L10 | m1-capstone |
| L12 | 三范式对照：enc / enc-dec / dec-only | theory | 2 | L02 | paradigm-compare |
| L13 | 逐 token 生成与 KV 缓存复用 | theory | 3 | L04,L12 | gen-kv-reuse |
| L14 | SwiGLU 门控 FFN 细节 | theory | 3 | L07 | swiglu-ffn |

## 4. 验证

- `node --experimental-strip-types scripts/verify-course.mjs` → 全部课程校验通过
- `pnpm verify`（verify-course + verify-tutor + verify-content-stats + content-gate）→ 体量闸门 367/367 课达标
- `pnpm typecheck`（oxlint type-aware）→ 0 errors（仅 10 条既有 warnings，均在无关文件）
- `pnpm lint` → 0 errors（5 条既有 warnings）
- `pnpm build`（nuxt build → wrangler）→ Build complete
- M1 十四课 content-gate `--only=L01..L14` → 14/14 双达标

## 5. 过程坑（待回写 pitfall-resolver）

1. **md 裸反引号 SyntaxError**：14 课正文的 ` ``` ` 围栏与行内 ` `` ` 未转义，JS 模板字符串提前闭合。修复：参考 effect-course 转义写法，写幂等脚本（字符码 92/96）先把 md 内反引号归一化成裸 `` ` ``、再统一转义成 `` \` ``，`od -c` 确认单反斜杠+反引号。脚本叠加跑两次易变双反斜杠（`\\``），须先归一化再转义。
2. **content-gate 代码块被剥离**：`contentStats` 把 ` ``` ` 围栏完全剥离计入 codeChars、不进 proseWords；表格管道替换为空格不计字。首测 14 课正文全不达标，需补实质正文（非堆标点）而非堆代码。
3. **capstone L11 生成代码写乱**：`next(c,0)` 无意义行；重写为干净的 greedy + `it_inv` 反转映射（`{v: k}`）。

## 6. 后续批次（M2–M11）

按 M2→M11 顺序，每模块一批次：建 `lessons/lNN.ts` → 转义 → content-gate 双达标 → verify/typecheck/build → 提交。全课 111 课、51 阶段、11 模块脚手架已就位，后续仅追加课时并扩充 concepts / stages。
