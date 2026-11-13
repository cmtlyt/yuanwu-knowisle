# Nuxt / SSR / 构建

## 构建与环境

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm build` 报构建锁已存在、指向某个 PID | 上次构建异常退出留下残留锁；PID 可能已被系统复用给别的进程（实测复用为 chrome），「进程还在」不等于「锁有效」 | 先查该 PID 是否确为 Nuxt 进程；确认是残留锁后用 `NUXT_IGNORE_LOCK=1 pnpm build` 绕过一次，非代码问题，不要改构建配置 |
| 运行时新增的探针 HTML / 静态文件返回 404 | Nitro 生产服务器启动时快照了静态文件清单 | 在服务启动**之前**写入 public 探针，或让冒烟脚本自己托管服务器；更推荐改用 CDP 直接注入检查 |
| 构建通过但运行时 500 | 构建不校验模板里未定义的自动导入变量 | 必跑 HTTP 路由冒烟 + 客户端渲染冒烟，不能只依赖 `pnpm build` |
| Nuxt 4.6.4 构建报 Nitro 内部模块解析警告 | 框架自身问题，基线构建即存在 | 记录为已知限制，不作为改动失败的判据；不要为消警告去改依赖 |
| 临时预览服务端口冲突 / 干扰用户正在用的服务 | 复用了默认 3000/3100 端口 | 临时服务用独立端口（如 3199），`PORT=3199 node .output/server/index.mjs`，跑完立即关闭 |

## SSR / hydration / 自动导入

| 症状 | 根因 | 处理 |
|---|---|---|
| 首屏内容与客户端不一致、hydration 警告 | SSR 阶段读 localStorage | `useState` 存默认态保首屏一致，`onMounted` 再载入真实档案；学情引擎做成 `createAnalytics(course, storageKey)` 工厂 |
| 改文件名后某处 composable 变成未定义 | 调用点依赖框架「按文件名猜自动导入名」 | 全部改显式 import；改名后全局搜旧路径与旧标识符 |
| 链接按钮错位 / 下划线 / 对齐异常 | 原 CSS 只写 `.btn` / `.nav button`，框架链接渲染成 `<a>` | 选择器扩到 `.nav a`、`.lesson-item`、`.brand`；`.btn` 补 `display: inline-flex; text-decoration: none` |
| 演练切换课时后定时器还在跑 | DOM 内核没托管生命周期 | 每个演练返回 `cleanup()`；宿主 `onMounted` 挂载、`onBeforeUnmount` 清理；切换课时用 `:key` 强制重建 |
| 35KB 演练内核重写后出现交互回归 | 把命令式 SVG / 定时器逻辑硬改成声明式组件 | 机械转 ESM + 宿主组件托管，交互 100% 保留，不要整体重写 |
| 多门课学情串数据 | 引擎直接引用全局课程对象与固定 storage key | `createAnalytics(course, key)` 工厂用闭包捕获；`storageKey` 带版本号（如 `knowisle:effect-ts:v1`） |
| 旧应用进度在新站看不到 | 不同源的 localStorage key | 设置页提供 JSON 导入导出，并明确告知用户需手动迁移；不做隐式迁移 |
| 未知课程 slug / 课时 id 渲染成空白页 | 缺 404 守卫 | composable 层做 SSR 安全的 404 守卫，页面不硬编码课时列表 |

## 内容与文档渲染

| 症状 | 根因 | 处理 |
|---|---|---|
| Nuxt Content 文档不出现在路由 | 缺 frontmatter 或集合配置不匹配 | 迁移长篇说明书时补 frontmatter；确认 `content.config.ts` 的集合定义与路径（本项目自 00017 起已移除 Nuxt Content，此条仅适用于仍使用它的项目） |
| 文档里的代码示例高亮后插入 HTML 触发 XSS 风险 | `v-html` 内容未受控 | 高亮只处理受信任的静态数据；用户输入展示统一 `esc()` 转义 |

## 冒烟回归顺序

`pnpm verify`（内容 + 引擎）→ `pnpm build` → 起独立端口生产服务 → `python scripts/smoke.py --base http://127.0.0.1:3199`（SSR 路由 / 客户端渲染 / 真实视口）→ 关闭服务。实测基线：11 条 SSR 路由、3 页客户端渲染、13 组视口。
