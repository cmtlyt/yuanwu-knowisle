# 课程内容 / 数据迁移 / 学情引擎

源自交互式课程构建的实测踩坑；流程与数据契约见 `course-builder` skill，这里只记「出问题时怎么修」。

## 版本与内容

| 症状 | 根因 | 处理 |
|---|---|---|
| 课程正文里的 API 在最新版根本不存在 | 按记忆或旧博客规划，没查 npm dist-tags 与当前文档树 | 强制「先核实版本、再规划」：交叉 npm registry `latest` / `dist-tags`、官方发布公告、当前文档入口；把差异清单写进设计文档，正文只用 `META.version` 对应 API |
| 跨版本 API 混用（旧名与新名同时出现） | 边写边补资料 | 先抓全核心抽象再动笔；每课标注版本口径；版本信息只存 `META`，正文不散落硬编码版本号 |
| 迁移后内容丢失 | 手抄大体量数据（60KB+） | 写一次性脚本做机械转换（IIFE → ESM、全局变量 → 工厂闭包），转完做语法与首尾结构核对，再删脚本；**不要手抄** |
| 新增课时后地图 / 侧栏 / 报表没出现 | 视图层硬编码了课时列表 | 内容数据层做唯一内容源，视图只消费数据；新增课时 = 往 `LESSONS` 追加一项并在 `CONCEPTS` 登记 |

## 引用完整性

| 症状 | 根因 | 处理 |
|---|---|---|
| 测验归因定位不到薄弱点 | `quiz[].concept` 指向不存在的概念 ID | 用自检脚本做自动校验：阶段 / 概念 / 前置 / 题目概念 / widget 标识 / 答案索引，任何悬空引用都让脚本失败 |
| 答案索引越界 | `answer` 不在 `options` 的 0-based 范围内 | 自检断言 `Number.isInteger(answer) && answer >= 0 && answer < options.length` |
| 学习路径出现环或前置排在后面 | DAG 未校验 | 自检同时检查「课时前置顺序单调」「概念前置不跨到后续阶段」「两类依赖无环」 |

通用自检脚本（接受数据模块与可选演练模块路径）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course.ts app/lib/widgets.ts
```

退出码 0 = 全绿，1 = 有失败项，2 = 参数错误。脚本只读数据，不写文件。**注意**：它是通用数据校验，与项目自带的 `pnpm verify`（内容一致性 + 学情引擎全轨迹）是互补关系，两者都要跑。

## 学情引擎

| 症状 | 根因 | 处理 |
|---|---|---|
| 导出导入后档案不一致 | `importState` 没校验版本 / 没做深拷贝 | `importState` 校验版本字段并拒绝非法备份；断言 `overall(importState(exportState(s)))` 与原始一致 |
| 30 天未复习的概念没进复习队列 | 遗忘公式或阈值写错 | `retention = exp(-Δt / max(0.5, stability))`，队列取 `total > 0 && retention < 0.82`，按 retention 升序 |
| 另一门课的进度被串改 | 全局课程对象 / 固定 storage key | 工厂闭包捕获 `course` 与 `storageKey`，并断言另一 key 的引擎进度为 0 |
| 教师报表行数忽多忽少 | 报表遍历了运行时动态集合 | 断言报表行数恒等于课时数 |

## 演练

| 症状 | 根因 | 处理 |
|---|---|---|
| 所有 widget 标识都能解析，但切课后定时器还在跑 | 只验了映射、没验生命周期 | 每个演练返回 `cleanup()` 回收定时器 / 监听 / RAF；宿主 `onMounted` 挂载、`onBeforeUnmount` 清理 |
| 用户把演练当成真实运行时 | 没标注边界 | 明确写「原理模拟」，真实代码指向官方 Playground |
