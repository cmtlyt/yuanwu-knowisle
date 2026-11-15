---
name: pitfall-resolver
description: 遇到任何问题必须先加载本 skill：报错、构建或门禁失败、依赖与 hook 阻断、结果不符预期、方案不确定、被用户纠正、反复试错、全新问题。按「症状 → 根因 → 处理」查库、修复回归后强制回写解决方案。关键词：troubleshooting、pitfall、known issue、报错、失败、异常、不生效、卡住、回写、TS 7 / oxlint / oxfmt / pnpm、Nuxt / Cloudflare / GitHub Actions、CDP 探针、课程数据。明细按主题在 references/ 内按需检索。
agent_created: true
---

# 问题排查与解决方案库

闭环（强制）：**任何问题 → 先加载本 skill → 查库 → 一次性修复并回归 → 回写解决方案 → 同步口径**。每条记录都是实测结论（症状 / 根因 / 已实测处理），不是猜测。

## 什么算「问题」

命令或构建失败、门禁不通过、依赖与版本冲突、hooks 或提交被拒、页面渲染与交互异常、结果不符预期、方案不确定、被用户纠正、反复试错、**全新或未收录的问题**——识别到第一时间加载本 skill，不要直接试错或凭记忆猜。

## 闭环五步

1. 加载本 skill，读下方速查表。
2. **只读取命中的 `references/*.md`**，按关键词定位章节；未命中则按主题挑最接近的文件扫一遍，再自行排查。
3. 一次性修复，重跑相关回归（顺序见 `references/verification.md`）；同一问题三次未解决就停下求助。
4. **回写（强制，最终答复之前）**：更新或新增条目；库没帮上忙也要记「查库结果 + 实际有效解法」。
5. 解法改变命令 / 配置 / 工具链时，同步 README / AGENTS.md / docs 口径，避免照旧文档再踩。

## 症状速查（主题路由；不要全量展开 references）

| 症状关键词 | 参考文件 |
|---|---|
| TS 7、typescript-eslint、oxlint type-aware、tsgolint、oxfmt 格式、pnpm 锁与 peer、lint 规则与 warning 口径 | `references/toolchain.md` |
| Nuxt 构建锁 / PID、Nitro 404 与运行时 500、hydration、composable 未定义、定时器残留、多课串数据、safe-delete 守卫 | `references/nuxt-build.md` |
| 浏览器断点、CDP 探针假阳性、抽屉与会话异步、真实端点 CORS、意图路由与模型抽检 | `references/browser-viewport.md` |
| 跨版本 API、目录化导入、草稿生成器、`Lesson.kind` 与体量闸门、题目与引用完整性、收官清理 | `references/course-content.md`（34 KB，先按关键词定位章节） |
| 检索分片落盘、上下文压缩丢数字、输出截断恢复、slug 误配、prereqs 契约 | `references/research-notes.md` |
| hooks 阻断、lint-staged 参数与 ignore、commitlint、大小写重命名、Python 模块名、VSCode 配置 | `references/git-hooks-editor.md` |
| 验证时机与顺序、临时文件与端口清理、假阳性断言、管道吞退出码 | `references/verification.md` |
| wrangler 部署、workerd、compatibilityDate、原生模块 | `references/cloudflare-deploy.md` |
| GitHub Actions 0 job、`if` 引用 secrets、哨兵值 | `references/github-actions.md` |
| 未列出的症状 / 症状不明 / 全新问题 | 按主题挑最接近文件扫一遍；解决后新增条目并补关键词 |

## 回写（强制）

- 已有同症状且解法有效：不新增，补细节才更新并注明实测日期；解法失效或有更优解：更新处理动作，旧结论标「不适用」。
- 库里没有或查库未命中：在对应主题文件末尾新增（**症状 / 根因 / 已实测处理**三要素缺一不可），写明未命中原因；主题不存在则新建 kebab-case 文件并登记速查。
- 命令要可直接复制并写预期退出码；一次性搜索结果、临时路径与个人上下文不入库（归 `.workbuddy/memory/`）。新关键词同步补进速查表与 description。

## 边界

`course-builder` 负责「怎么建课」，本 skill 负责「出问题怎么修」，任何项目同类问题都适用；course-builder 遇问题转本 skill，解决后回写，不再自带踩坑清单。
