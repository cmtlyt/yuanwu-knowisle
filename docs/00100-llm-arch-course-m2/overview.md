# 00100 · LLM 架构深度课 M2 模块落地（注意力机制演进）

- 分支：`feat/llm-arch-course-outline`（承接 00098 大纲 / 00099 M1，落地 M2 批次）
- 状态：**M2 十二课全量落地**（2026-11-16），全部门禁绿：`verify-course` ✓ / content-gate 379/379 ✓ / `verify-content-stats` ✓ / lint 0 errors（M2 文件）/ typecheck 0 errors（M2 文件）/ `fmt:check` ✓ / `nuxt build` ✓
- 落地形态：`app/data/llm-arch-course/`（complex 4 层）——本轮新增 `lessons/l15-l26.ts` 十二课，并扩 `concepts.ts`（M2 12 概念，stage 6–11）与 `lessons/index.ts`（聚合 L15–L26）；脚手架（modules / stages / design / meta / courses.ts 注册）沿用 00099 M1，无需改。
- 内容源：00098 的 `m1-m7-volume-plan.md`（M2 课数 / kind / 难度 / 前置映射），正文按官方 contentStats 口径实写；KV / 吞吐数字标「量级示意，随硬件/批大小变」，不锁死具体硬件。
- 日期：2026-11-16

## 1. 目标

把 00098 大纲的 M2 模块（注意力机制演进，L15–L26）落地到 `app/data`，作为 M1（00099）之后的**第二个可验证批次**：注意力家族（MHA/MQA/GQA 谱系、滑动窗口、FlashAttention、PagedAttention/vLLM/SGLang、chunked prefill、线性注意力/SSM）+ GQA 综合 capstone + KV 量化收束。M2 过门禁并提交后，按 M3→M11 逐模块推进（每模块一批次）。

## 2. 硬约束（沿用 00099 §2）

1. **content-gate 体量阈值（00055 口径）**：theory 1200 词 / 400 码、framework 1500 / 1000、practice·scenario 1800 / 1500、capstone 3000 / 2500、overview 400 / 0。M2 十二课须双达标。
2. **md 模板字符串反引号转义**：正文围栏与行内 `` ` `` 转义成单反斜杠+反引号，幂等脚本归一化后再转义。
3. **verify-course 不变量**：难度 1–5 整数、stage / 概念引用有效、prereqs 指向更早课时、DESIGN 绑定、概念至少被一道题覆盖。
4. **content-gate 自洽硬校验（00058）**：practice 课 goals 必含实现类动词（实现 / 写出 / 搭 / 跑通 / 接入…）；标题含「实战」不能标 theory/overview。
5. **全课 111 课连续编号**：M2 = L15–L26；prereqs 全用全课连续编号（M2 课前置指向 M1 的 L11/L15 等）。

## 3. M2 十二课映射

| 课 | 标题 | kind | 难度 | prereqs | 概念 | 阶段 |
|---|---|---|---|---|---|---|
| L15 | MHA → MQA → GQA：分组查询注意力的谱系 | theory | 2 | L11 | mha-mqa | stage6 |
| L16 | 手写 GQA 并实测 KV cache 内存 | framework | 3 | L15 | gqa-kv | stage6 |
| L17 | GQA uptrain：把已有 MHA 模型转成 GQA | practice | 3 | L16 | gqa-uptrain | stage6 |
| L18 | 滑动窗口 / 局部注意力与上下文扩展 | practice | 3 | L15 | sliding-window | stage7 |
| L19 | FlashAttention：IO-aware 注意力 | theory | 3 | L15 | flash-attention | stage8 |
| L20 | FlashAttention v1 / v2 / v3 演进对照 | framework | 4 | L19 | fa-v1v2v3 | stage8 |
| L21 | PagedAttention / vLLM 与 SGLang 前缀共享 | scenario | 4 | L19 | paged-attn | stage8 |
| L22 | chunked prefill 与 KV 分页调度实操 | practice | 4 | L21 | chunked-prefill | stage8 |
| L23 | 线性注意力谱系与 SSM 的边界 | framework | 4 | L19 | linear-attn | stage9 |
| L24 | 模块综合：GQA 注意力块 + vLLM 实测 KV 与吞吐 | capstone | 4 | L16,L21,L22 | m2-capstone | stage10 |
| L25 | FlashAttention 前后实测：吞吐与峰值显存 | practice | 4 | L19,L20 | fa-bench | stage11 |
| L26 | KV cache 的 INT8 / FP8 量化 | theory | 4 | L22,L25 | kv-quant | stage11 |

## 4. 验证

- `node --experimental-strip-types scripts/verify-course.mjs` → 全部课程校验通过（教师报表 26 行等不变量绿）
- `node --experimental-strip-types scripts/content-gate.mjs` → 体量闸门 379/379 课达标
- `node --experimental-strip-types tmp/probe-m2.mjs`（本课程 M2 精确探针，import LLM_ARCH_COURSE 只测 L15–L26）→ 12/12 PASS
- `node --experimental-strip-types scripts/verify-content-stats.mjs` → contentStats 口径与容器渲染自检通过
- `pnpm exec oxlint`（14 个 M2 文件）→ 0 errors；`pnpm exec oxlint --type-aware --type-check`（同 14 文件）→ 0 errors
- `pnpm exec oxfmt --check`（M2 14 文件）→ 全通过
- `pnpm build`（nuxt build → wrangler）→ Build complete in 15.8s
- 说明：仓库级 `pnpm lint` / `pnpm typecheck` 仍有 5 warnings / 2 errors，均在**与 M2 无关的既有文件**（`app/lib/analytics.ts`、`scripts/migrate-blocks-to-md.mjs`、`.workbuddy/skills/course-builder/scripts/gen-course.mjs`），本轮不动，留后续批次处理。

## 5. 过程坑（待回写 pitfall-resolver）

1. **content-gate `--only` 跨课程匹配混入其它课程同号课**：`--only=L15..L26` 会同时命中 effect/rxjs/skill 等课程的同号 L，输出 72 课混杂。修复：写 `tmp/probe-m2.mjs` 直接 `import LLM_ARCH_COURSE` 只测本课程 M2 课，得到精确缺口（比 `--only` 可靠）。
2. **md 反引号转义状态不一致（混合转义）**：L15/L16/L22 已转义、L17–L21 部分裸反引号。修复：跑 `tmp/fix-llm-m2.mjs` 幂等脚本（字符码 92/96 归一化再转义）一次归一 12 课，避免手动逐个改。
3. **`:::` 容器失衡**：补章节时消费 `:::tip` 开头、或 `:::deep` 未闭合就开新容器，导致 `:::tip:::tip` 双写 / 孤立 `:::`。修复：用 Python 栈检查脚本逐课验证开闭配对，L16/L17/L21/L23/L25/L26 已修，**L20 的 `:::tip:::tip`（行 122）为本批次最后修的一个**，修后 12/12 全 OK。
4. **Markdown 表格 `|` 与正文 `\|` 混淆**：正文里的 `\|`（CommonMark 不可转义字符，会渲染成字面反斜杠）应写裸 `|`；只有表格单元格里的 `|` 才需 `\|`。L25 表格表头 `max\|Δ\|` 被 oxlint 误报「删 `\|`」，实际表头合法——改法是把列名 `max\|Δ\|` 重命名成 `Δmax`，正文 3 处 `max\|Δ\|` 改裸 `|`，既过 lint 又不破表格。
5. **practice 课 goals 缺实现动词**：L18/L22 初版 goals 全是「写清/说明/估算/对照」，被 00058 自洽校验判为「假 practice」。修复：各补一条含实现动词的 goal（L18「写出可跑 sliding-window causal mask 脚本」、L22「搭一个可跑 chunked-prefill 开关对照脚本」），保持 course kind=practice 不降格。

## 6. 后续批次（M3–M11）

按 M3→M11 顺序，每模块一批次：M3 = MoE（L27–L36 起）。流程沿用 M2：建 `lessons/lNN.ts` → 转义 + 容器栈检查 → `tmp/probe-mN.mjs` 双达标 → verify / content-gate / typecheck / build 全绿 → 新建 `docs/00101-…/overview.md` 任务记录 → 提交。全课 111 课、51 阶段、11 模块脚手架已就位，后续仅追加课时并扩 concepts / stages。
