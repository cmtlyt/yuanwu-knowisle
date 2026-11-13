# 00017 · 移除 Nuxt Content / image + 安装 Cloudflare 官方部署 skill

> 2026-11-13 ｜ [索引](../README.md)

## 目标

为把知识岛部署到 Cloudflare 做准备。用户确认 `@nuxt/content` 与 `@nuxt/image` 当前未使用，要求直接移除，并把 Cloudflare 官方 skill 安装到当前项目（项目级 `.workbuddy/skills/`）。**本次不做 Workers 部署配置改造**。

## 核实结果（与用户判断的差异）

- `@nuxt/image@2.2.1`：全库无 `NuxtImg` / `NuxtPicture` 引用，只在 `nuxt.config.ts` 注册，构建时会带入 `win32-x64` sharp 二进制，确属未使用。
- `@nuxt/content@3.16.2`：**实际有使用**——`app/pages/docs/[slug].vue` 用 `queryCollection('docs')` 渲染 `content/docs/effect-course-design.md`，`teacher.vue` 有 `/docs/effect-course-design` 入口，README 路由表也列了该路由。按用户「并没有使用到」的判断，连同该页面、内容与链接一并移除。
- 这些内容已在提交 `1af3d44`（`feat: 接入课程文档与静态资源`）中入库，需要时可用 `git show 1af3d44:content/docs/effect-course-design.md` 恢复。
- `better-sqlite3` **保留**：`pnpm why better-sqlite3` 显示它是 `db0@0.3.4` → `nitropack` / `unstorage` / `@nuxt/hints` / `@nuxt/fonts` 的可选 peer，并非 Nuxt Content 专属驱动，且用户只要求移除两个模块。`pnpm-lock.yaml` 中残留的 `'@nuxt/content': ^3` 只是 `@nuxt/ui` 的可选 peer 声明，属正常。

## 变更

- `package.json`：移除 `@nuxt/content`、`@nuxt/image`；`nuxt.config.ts` 的 modules 去掉两项注册，oxfmt 随后把数组压成单行。
- 删除 `content.config.ts`、`app/pages/docs/[slug].vue`、`content/docs/effect-course-design.md` 及空的 `app/pages/docs/`、`content/` 目录；`teacher.vue` 移除课程设计说明书链接。
- `scripts/verify-course.mjs` 静态资源清单、`scripts/smoke.py` 的 ROUTES 同步删掉已删资源的断言与路由。
- 文档同步：`README.md`（技术栈、路由表、目录结构、架构、文档表、skill 说明）、`AGENTS.md`（第 5 节命名示例、第 7 节内容约束、第 8 节 skill 清单、第 10 节回归纪律）、`docs/README.md`（约定说明与索引）。历史任务目录 00001 / 00015 中的 Nuxt Content 记录按约定保留不改。
- `pnpm install` 同步 `pnpm-lock.yaml`，减少 2923 行（Nuxt Content 与 image 的整棵依赖树）。

## 安装的官方 skill

来源 `https://github.com/cloudflare/skills`，浅克隆 commit `cbf893b`，Apache-2.0（许可证全文复制到 `.workbuddy/skills/cloudflare-license.md`）。复制 5 个与部署最相关的目录，保持上游原名：

| 目录 | 用途 |
|---|---|
| `frameworks-on-cloudflare` | Nuxt 等框架适配 Workers，明确要求新项目用 Workers Static Assets、不要选 Pages |
| `wrangler` | Wrangler CLI 部署与资源管理 |
| `cf-cli` | 官方 `cf` CLI，适用于尚无 Cloudflare 配置的既有项目 |
| `cloudflare-app-bootstrap` | 绑定 / secrets / 首次本地请求验证 |
| `workers-best-practices` | 生产 Workers 配置与 API 最佳实践（含 3 个 references） |

共 14 个 Markdown 文件（含 1 份许可证），无 TS / MJS / JSON，不触发 oxlint / oxfmt / lint-staged。上游 plugin manifest、斜杠命令与 `.mcp.json` 是给 Claude Code / Codex / Cursor 用的，**未复制**；WorkBuddy 只加载目录里的 `SKILL.md` 上下文。

## 过程中命中并回写的坑（pitfall-resolver 闭环）

1. `pnpm fmt:check` 两次只报单个文件（`nuxt.config.ts`、`scripts/verify-course.mjs`）：手改数组后 oxfmt 按 `printWidth: 110` 要求重新折行 → `pnpm fmt` 写回；`references/toolchain.md` 新增「手工编辑后的格式差异」条目。
2. `pnpm verify` 报 `✗ content/docs/effect-course-design.md`、`校验失败 1 项`（exit 1）：静态资源清单硬编码了已删文件；`scripts/smoke.py` 的 ROUTES 同样残留该路由 → 两处同步删除；`references/verification.md` 新增「删除模块 / 资源后的清单残留」条目。
3. `cmd | tail -6 && echo ALL GREEN` 吞掉失败退出码，制造假「全绿」 → 回归链一律 `set -o pipefail`；`references/verification.md` 新增「管道吞掉退出码」条目，`AGENTS.md` 第 10 节补上该纪律。
4. 同步口径：`SKILL.md` 速查表与 description 补关键词；`references/nuxt-build.md` 的 Nuxt Content 条目加注「本项目自 00017 起已移除」。

## 验证（命令 / 退出码 / 关键数字）

- `pnpm install` 与 `pnpm install --frozen-lockfile` 均通过（exit 0）。
- `pnpm fmt:check`：32 文件全部合规（exit 0）；`pnpm lint`：0 errors / 19 warnings，26 文件（exit 0）；`pnpm typecheck`：0 errors / 21 warnings，26 文件（exit 0）。
- `pnpm verify` 全绿（exit 0）；`check-course.mjs`（`app/data/effect-course.ts` + `app/lib/widgets.ts`）全绿（exit 0）。
- `pnpm build` 成功（11.0s，exit 0）；产物 `Σ Total size: 2.91 MB (777 kB gzip)`，移除前为 47.2 MB (20 MB gzip)。
- `python scripts/smoke.py --base http://127.0.0.1:3199`：10 条 SSR 路由（含 `/courses/nope → 404`）+ 3 页客户端渲染 + 13 组 CDP 视口全部通过（exit 0）；3199 临时服务跑完即关，未重启 3100 预览服务。
- `git status`：16 个已跟踪文件变更 + 6 个新增 skill 目录/文件；工作区无临时探针与临时服务残留。

## 注意事项

- 本次**没有**新增 `wrangler.jsonc`、没有改 `nitro.preset` / `compatibilityDate`、没有 `deploy` script、没有执行任何部署；实际 `wrangler deploy` 需要 Cloudflare 账号授权。
- 后续部署仍需把 `compatibilityDate` 从 `2025-07-15` 提到 ≥ `2025-07-17`，并评估 `@nuxt/a11y` / `@nuxt/hints` / `better-sqlite3`（db0 可选 peer）在 Workers 运行时的行为。移除 Nuxt Content 已消掉「内容数据库必须换 D1」这一最大障碍。
- 官方 skill 是静态快照，不会自动同步；升级需重新 clone 覆盖同名目录，并在新的 `docs/NNNNN-*/` 目录记录来源 commit。
- 本次未执行 `git add` / `git commit`，改动留在工作区。
