# 验证纪律与门禁顺序

## 通用纪律

- 每完成一个模块**立即验**，不堆积未验证代码；不通过不得进入下一阶段。
- 失败先读完整错误定位根因，一次性修复后**重跑全部**回归，不逐个补丁试；同一问题三次未解决就停下求助。
- 断言不得把「元素缺失」「没抛异常」当通过；失败必须可复现、比具体值。
- 收尾清理临时脚本 / 探针 / 截图 / 临时服务；服务用独立端口，跑完即关，不重启用户在用的预览。
- 只读探查用 `GIT_INDEX_FILE` 临时索引、系统临时目录临时配置，不污染真实索引与仓库。
- **回归通过后回写知识库**：最终答复前更新或新增条目（症状 / 根因 / 已实测处理）；查库未命中也补记有效解法与新关键词；未回写视为任务未完成。

## 本仓库门禁顺序

「快 → 慢」，任一失败即停并先查本 skill：

```bash
pnpm fmt:check          # 格式一致性（含 .workbuddy/skills/ 下的代码文件）
pnpm lint               # oxlint 快速规则：0 errors
pnpm typecheck          # --type-aware --type-check：0 errors
pnpm verify             # 内容一致性 + 学情引擎全轨迹
pnpm build              # Nuxt 生产构建（cloudflare_module 预设 → .output）
pnpm exec wrangler --cwd .output dev --port 3199
python scripts/smoke.py --base http://127.0.0.1:3199
```

提交前 hooks 只跑 `oxfmt` + `oxlint`（暂存文件）与 commitlint；`typecheck` / `verify` / `build` 不在 hook 内，由手动或 CI 承担。

数据层单独验（逐门跑；`pnpm verify` 已动态扫描 `app/data/*-course/` 全量；传**目录**即可，脚本自动补 `index.ts`）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course app/lib/widgets
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/rxjs-course app/lib/widgets
```

## 全量验证清单（课程 / 站点级交付）

1. **语法与类型**：`fmt:check` / `lint` / `typecheck`。
2. **数据一致性**：`check-course.mjs`（引用、答案索引、前置顺序、widget 映射、版本锁定）。
3. **引擎冒烟**：空状态与完整轨迹、遗忘 / 复习 / 导出导入、多课程隔离。
4. **构建**：`pnpm build`，无新增错误。
5. **路由冒烟**：每条 SSR 路由返回预期状态码与关键标记；未知路由 404。
6. **客户端渲染**：逐课时页检查演练挂载、无未捕获异常。
7. **真实视口**：CDP `Emulation.setDeviceMetricsOverride`，查 `scrollWidth`、`getBoundingClientRect()` 越界、导航可见性、触控尺寸。
8. **交互冒烟**：真实点击跳转、抽屉开合、答题写 localStorage 与反馈、主题切换、图表 / 文档渲染。
9. **视觉复核**：截图检查对齐、溢出、对比度。
10. **清理**：删临时脚本 / 探针 / 截图，关临时服务。

## 记录回归结果

- 写清命令、退出码与关键数字（如 `lint 0 errors / 19 warnings`、`11 条 SSR 路由 + 13 组视口`），不要只写「通过」。
- 已知限制与预期警告单列（无初始提交跳过 stash、Nuxt Nitro 警告、既有 unmet peer），避免反复排查。

## 管道吞掉退出码（假阳性回归）

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm verify 2>&1 \| tail -6 && echo ALL GREEN` 明明打印 `❌ 校验失败 1 项`，后续仍执行输出「全绿」 | Bash 管道退出码默认取**最后命令**（`tail` 恒 0），`&&` 继续，失败被吞 | 回归脚本开头 `set -o pipefail`；或输出重定向临时文件再单独取 `$?`。不要 `\| tail` 拼 `&&` 判成功 |

## 删除模块 / 资源后的清单残留

| 症状 | 根因 | 处理 |
|---|---|---|
| 移除 Nuxt Content 与 `content/` 后 `pnpm verify` 静态资源段报 `✗ content/docs/effect-course-design.md`、`校验失败 1 项`退出 1；`smoke.py` 的 ROUTES 还期望 200 | `scripts/verify-course.mjs` 静态资源数组、`scripts/smoke.py` ROUTES 硬编码被删资源 | 删除资源时清**全部**存在性断言与引用（verify 清单、smoke ROUTES、skill 文档、README 路由表、页面链接），重跑 `verify` / `smoke` / `build`；「删文件」类任务固定收尾项 |

## 临时文件在 Git Bash 与 Windows Node 间路径不一致

| 症状 | 根因 | 处理 |
|---|---|---|
| `curl -o /tmp/ssr-L01.html` 写成功、`wc -c` 有字节，紧接着 Windows `node -e` 读 `/tmp/ssr-L01.html` 报 `ENOENT: no such file or directory, open 'D:\tmp\ssr-L01.html'` | Git Bash `/tmp` 映射 MSYS 临时目录，Windows Node 把 `/tmp` 解析为**当前盘根目录** `D:\tmp`；shell 内建与 Node 文件系统视图不同 | 抽查**不落临时文件**：`curl -sS --noproxy '*' -w '\n__HTTP__%{http_code}\n' "<url>" \| node -e '...从 process.stdin 读...'`，HTML 管道给 Node；确需落盘用 `process.env.TEMP` 拼绝对路径，两侧同一变量。`curl` 访问 127.0.0.1 加 `--noproxy '*'`，否则代理转走。落地 `docs/00089`（SSR 抽查） |
