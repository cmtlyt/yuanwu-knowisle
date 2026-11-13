# 00026 · 动态课时密度 + 面向完整性驱动题目数（两门课程重构 + skill 同步）

- 日期：2026-11-13
- 关联：`docs/00024-rxjs-course-multicourse`（多课程架构落地）、`app/data/effect-course.ts`、`app/data/rxjs-course.ts`、`.workbuddy/skills/course-builder/`、`.workbuddy/skills/pitfall-resolver/`

## 目标

用户对 00024 的固定 `6×4=24 课` 约定提出质疑：

> 「我理解课时数/概念/题目等等应该根据知识复杂度动态变化，而不是限制数量。」

并进一步澄清两条核心原则：

1. **课时密度动态化**——入门阶段概念少课时可少，核心/难阶段概念密课时可多；`6×4=24` 只是经验起点，不是硬约束。
2. **面向完整性驱动题目数**——题目数由「该课涉及各知识点要讲透的各面向是否全覆盖」决定，单知识点面向多就多出题，面向少就少出题；**换角度补题是常态手段，与难度高低、weight 大小无关**。明确反模式：
   - ❌ 按难度一刀切（高难度 +1 题）
   - ❌ 把「题数 = 概念数」当下限/上限
   - ❌ 用 weight 决定题数

用户要求把上述规则同步进课程创建 skill，并重新审核两门课程的题目。

## 变更

### 一、Effect 课程重构（`app/data/effect-course.ts`，随 `fd70ffa` 提交）

- 课时 24 → **26**（S0 3 / S1 4 / S2 5 / S3 5 / S4 5 / S5 4）
- 概念 26 → **27**（新增 `channel` 通信原语，stage 4 / weight 3 / prereq `concurrency`）
- 题目 48 → **59**（覆盖驱动）
- 结构调整：
  - 合并旧 L01 + L03 → 新 L01「动机与起步」（concepts: `[program-value, runners]`）
  - 新增 L12「Cause 诊断实战」（cause + recovery，3 题）
  - 新增 L17「多 Layer 组合与资源竞争」（layer + layer-graph + scope，3 题）
  - 新增 L22「中断语义与 Channel」（concurrency + channel，3 题）
  - L07 补 `gen` 覆盖题、L08 补 `runners` 覆盖题
- 重编号采用**单遍映射替换**（old→new 映射表一次过：L04→L03 … L24→L26，共 50 处），避免级联错位。

### 二、RxJS 课程面向完整性补题（`app/data/rxjs-course.ts`，随 `fd70ffa` 提交）

- 数字从首次交付 24/26/48 → **26/28/69**
- 改写 3 道「同面向重复」题为缺失面向补题：
  - L14 `c-retry` 第 3 题：「retry(3) 执行次数」→「非幂等写 + retry → 重复扣款陷阱」
  - L17 `c-subject` 第 3 题：「后订阅者收到什么」→「complete() 之后 next() 被忽略（终止语义）」
  - L24 `c-combine` 第 3 题：「withLatestFrom 配置值」→「combineLatest 某源无初始值 → 静默」
- 修复 12 道 quiz 第 3 题的**字符串下标坍缩** bug（顶格 topic 行缺尾逗号 + 无缩进，被 JS 解析成 `q('topic'['options'],…)`）

### 三、动态数量原则同步进 course-builder skill（随 `03f42fd` 提交）

- `SKILL.md`：quiz 段改为「题目数由知识点要讲透的各面向决定…换角度补题是常态手段，与难度/weight 无关」
- `references/data-model.md`：新增「数量动态化原则」表（数量 → 决定因素 → 反模式），标注「这些数字是按复杂度落出来的结果，不是目标或下限」
- `references/workflow.md`：
  - Stage 2「6 阶段×4 课=24 课」标记为**经验起点而非硬约束**
  - Stage 2 验收升级为**双向覆盖审计**（每个知识点面向全覆盖 + 无孤儿概念 + 无固定 N 题约束）
  - Stage 3 第 5 步：题目由「知识点要讲透的各面向」驱动（列 definition/trap/selection/boundary/confusion，每面向 ≥1 题）

### 四、pitfall-resolver 回写（随 `03f42fd` 提交）

- `references/course-content.md` 新增：
  - 「批量脚本补第 N 题后顶格漏逗号致字符串下标坍缩」
  - 「题目密度：覆盖驱动，不按难度一刀切」
  - 「重编号技巧（课时 id 全局调整）」——单遍映射替换
- `SKILL.md` 索引补关键词行
- `references/nuxt-build.md` / `verification.md` 微调

### 五、verify-course.mjs 正确率自洽化（随 `81b54a7` 提交）

- 把硬编码 `o.accuracy === 75` 换成**模拟轨迹自洽计算**：
  ```js
  const simTotal   = C.LESSONS.reduce((n, l) => n + l.quiz.length, 0)
  const simCorrect = C.LESSONS.reduce((n, l, i) => (i % 4 !== 0 ? n + l.quiz.length : n), 0)
  const expectedAccuracy = simTotal ? Math.round((simCorrect / simTotal) * 100) : 0
  ```
- 即 `i%4!==0` 的课全对、其余全错，正确率由「每课对错分布 × 各课题数」推得，不写死魔法数字；课时/题数变化时自动跟随。

## 验证（全部 exit 0）

- `pnpm fmt:check` / `pnpm lint`（0 error）/ `pnpm typecheck`（0 error）全绿
- `pnpm verify`：双课程全绿——effect 71% / rxjs 74%（自洽计算值）
- `pnpm build`：成功（cloudflare_module → `.output`）

## 注意事项 / 沉淀

- **「先建 overview 再实施」**：本目录本身即此规则的产物。自本任务起，**所有任务必须先在 `docs/NNNNN-<task>/overview.md` 写下目标与变更计划，审核通过后再动手**（见 AGENTS.md 门禁约定）。
- 00024 中首次交付的 24/26/48 数字已失效，其 overview 已标注「以 00026 为准」；00024 的「未提交」字样与 00025 的同类字样均随本次提交修正为对应 commit。
- 面向完整性补题与动态课时密度是**常态手段**，后续新课程直接按此原则设计，不再套用固定课时/题目数。
