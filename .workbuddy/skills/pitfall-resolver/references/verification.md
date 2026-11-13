# 验证纪律与门禁顺序

## 通用纪律

- 每完成一个模块**立即验**，不堆积未验证代码；验收不通过不得进入下一阶段。
- 失败时先读完整错误信息定位根因，一次性修复后**重跑全部**回归，不逐个补丁试。
- 同一问题连续三次未解决，停下来说明已尝试方案并请求协助。
- 断言不得把「元素缺失」「没抛异常」当成通过；失败必须是可复现的具体值比较。
- 收尾清理临时脚本、探针文件、截图与临时服务；临时服务用独立端口，跑完即关，不重启用户正在用的预览服务。
- 只读探查阶段用临时索引（`GIT_INDEX_FILE`）、临时配置（写到系统临时目录），不污染真实索引与仓库文件。
- **回归通过后回写知识库**：问题一旦解决，在给出最终答复前更新已有的解决方案条目或新增一条（症状 / 根因 / 已实测处理）。查库未命中也要补记实际有效解法与新关键词，让下次能命中；未回写视为任务未完成。

## 本仓库的门禁顺序

按「快 → 慢」执行，任一失败即停并先查本 skill：

```bash
pnpm fmt:check          # 格式一致性（含 .workbuddy/skills/ 下的代码文件）
pnpm lint               # oxlint 快速规则：0 errors
pnpm typecheck          # --type-aware --type-check：0 errors
pnpm verify             # 内容一致性 + 学情引擎全轨迹
pnpm build              # Nuxt 生产构建
PORT=3199 node .output/server/index.mjs &
python scripts/smoke.py --base http://127.0.0.1:3199
```

提交前 hooks 只跑 `oxfmt` + `oxlint`（暂存文件）与 commitlint；`typecheck` / `verify` / `build` 不在 hook 内，由手动或 CI 承担。

数据层单独验：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course.ts app/lib/widgets.ts
```

## 全量验证清单（课程 / 站点级交付）

1. **语法与类型**：`fmt:check` / `lint` / `typecheck`。
2. **数据一致性**：`check-course.mjs`（引用、答案索引、前置顺序、widget 映射、版本锁定）。
3. **引擎冒烟**：空状态与完整学习轨迹、遗忘 / 复习 / 导出导入、多课程隔离。
4. **构建**：`pnpm build`，确认无新增错误。
5. **路由冒烟**：每条 SSR 路由返回预期状态码与关键内容标记；未知路由返回 404。
6. **客户端渲染**：逐个课时页检查演练挂载、无未捕获异常。
7. **真实视口**：CDP `Emulation.setDeviceMetricsOverride`，检查 `scrollWidth`、`getBoundingClientRect()` 越界、导航可见性、触控尺寸。
8. **交互冒烟**：真实点击跳转、抽屉开合、答题写入 localStorage 与即时反馈、主题切换、图表渲染、文档渲染。
9. **视觉复核**：截图后检查对齐、溢出、对比度。
10. **清理**：删临时脚本、探针、截图，关闭临时服务。

## 记录回归结果

- 写清命令、退出码与关键数字（如 `lint 0 errors / 19 warnings`、`11 条 SSR 路由 + 13 组视口`），不要只写「通过」。
- 已知限制与预期警告单独列出（如无初始提交跳过 stash、Nuxt 自身 Nitro 警告、既有 unmet peer），避免下次被当成新故障反复排查。
