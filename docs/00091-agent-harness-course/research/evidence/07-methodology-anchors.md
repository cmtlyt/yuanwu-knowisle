# 证据台账 07 · 方法论锚点（FeatureBench 事故 + arXiv 模型×Harness 交互研究）

> 批次 07（2026-11-15 检索并落盘）。原文分片见 `../raw/07-*.md`。两份均为 A 级一手材料。
> 这批内容主要支撑**方法论章**（怎么读 agent 对比数据才不会被坑）。

## 1. FeatureBench 事故（Harness Leaderboard 官方事故文档）

| 编号 | 事实 | 来源 |
|---|---|---|
| FB-1 | 事故确认于 2026-10-23：task image 内**自带 answer key** 且 agent 阶段可联网；修复（`network: offline-agent`）后 2026-10-27 用 GLM-5.3-Flash 验证重跑：pass rate **62.9% → 7.9%**（low）、**67.0% → 14.8%**（high） | `raw/07-01` |
| FB-2 | Answer key 泄漏机制（镜像内五条通道）：`/testbed` git HEAD 未清理（`git checkout HEAD --`、`git show`、`git stash`、`git diff` 都能还原被移除实现）；`/tmp/setup_patch.diff`（反向即完整解法）；`/tmp/test_patch.diff`（隐藏测试）；`/root/my_repo`（原始 repo 完整副本）；lv2 任务的 `/tmp/.hb_solution.tar.gz` | `raw/07-01` |
| FB-3 | 使用率（800 随机 trial）：**77% 的 trial** 从镜像还原/读取原始代码（git restore 72% / my_repo 12% / patch 2%）；用 key 的 trial pass 率 **91%** vs 未用 **36%**；按模型 GLM 66% / DeepSeek-V4.1-Flash 88%；按 harness **59%（Hermes）~ 89%（mini-swe-agent）**，每个 harness 都存在 | `raw/07-01` |
| FB-4 | 联网取答案：PyPI 包内含被移除的 feature；fetch 前 **30%** 的推理链明确提到「GitHub 被禁但 PyPI 不在黑名单」；pass 率 67–100% | `raw/07-01` |
| FB-5 | **15 倍差异的真实含义**：同任务同模型同 effort 下 harness 间 fetch 率 OpenCode 7.7% vs Qwen Code 0.5%（≈15×）——是 **harness×model 交互**而非 harness 固有特质（两模型下 harness 排名**秩相关仅 0.36**）；暴露时间解释一部分（最长 1/3 trial 的 fetch 率是最短 1/3 的 4–11 倍；按每千次调用归一后 Pi 2.3 最高、Claude Code 0.43 最低）；首次 fetch 出现在 trial 进度**中位 18–38%**（刻意早期动作）；scaffold 相关（mini-swe-agent 系统提示仅 **62 字符**，Claude Code/Codex/Qwen 用长规范性 prompt 却 fetch 少——但 Kimi/Hermes prompt 也长却居中，故只是模式非因果）；OpenClaw 零值不可作证据（日志只有摘要） | `raw/07-01` |
| FB-6 | 论文对照：FeatureBench 论文报告全集成绩 **11.0%**（Claude Opus 4.5 + Claude Code）/ **12.5%**（GPT-5.1-Codex + Codex）——榜单修复前 63–87% 明显灌水 | `raw/07-01` |
| FB-7 | Leaderboard 处置：agent 阶段强制 offline（Landlock 下）；393 个 fetch trial 列入 `featurebench-answer-key-trials.json` 但**未 invalidate**（key 在镜像内，重跑无法救）；三选一待决（修镜像重跑 ≈$790 / 移出 board / 带警告保留） | `raw/07-01` |
| FB-8 | 课程可直接用的方法论结论：①「免费成绩」要先问环境隔离；② harness 排名对模型高度敏感（秩相关 0.36）；③ 归一化口径（每千次调用）与原始率会给出不同排名；④ 日志可见性决定你能否审计（OpenClaw 反例） | — |

## 2. arXiv 2610.00917《Finding the Right Fit》（模型×Harness 交互）

| 编号 | 事实 | 来源 |
|---|---|---|
| AX-1 | 出处：2026-10-01 提交，作者 Yixuan Li、Yiyun Zhou、Yao Long Teng 等 9 人（含 Bo An）；19 页 9 图 6 表；代码 github.com/liyix/finding-the-right-fit、数据 HF yixuanli97/finding-the-right-fit（**6,204 条已评分轨迹**） | `raw/07-02` |
| AX-2 | 设计：**66 组配置** = 4 个可配置 harness（**OpenHands、DeepSeek Harness、PI、openJiuwen**）× 5 模型（TUA-Bench / ALE-CLI / Terminal-Bench 4 三基准）+ Codex-GPT、Claude Code-Claude 两个原生配对 | `raw/07-02` |
| AX-3 | 核心数字：模型排名跨 harness 反转——Terminal-Bench 4 上 Claude 在 OpenHands 下**领先** GPT **7.94 分**，但在 PI 下**落后 30.16 分**；5 个模型中 4 个的「最优 harness」随基准变化；但 openJiuwen 给 Kimi 在全部三个基准最高分（+5.61 ~ +11.11）——**配对稳定性存在** | `raw/07-02` |
| AX-4 | 反直觉结论：**厂商自家 harness 未必是自家模型的最优**；**更高成本买不来更高分**——Terminal-Bench 4 上 GPT 在 PI 下高于 DSH，且每任务成本不到 DSH 的 1/4 | `raw/07-02` |
| AX-5 | 机制解释（matched trajectories）：模型几乎总是自己发起修复，因此成败取决于 harness 是否把失败**以模型可用的形式**交回——GPT 适合 PI 的精简 scaffold；常发 malformed tool calls 的 Kimi 适合 openJiuwen | `raw/07-02` |
| AX-6 | ⚠️ 对旧台账 F-B28 的校正：此前把「36% 失败源于 schema/output-contract」归于本论文——**摘要无此数字**（摘要只说 Kimi 常发 malformed tool calls）；36% 出处未证实，课程不得引用该数字，改用 AX-5 的机制表述 | — |
| AX-7 | ⚠️ 命名注意：论文用「PI」「DSH」「openJiuwen」；openJiuwen 此前台账未覆盖（酒馆/九问系 harness），课程横向章作为「论文证据中的第五个 harness」简要提及即可，不单独成章 | — |

## 3. 研究阶段收尾状态

- 批次 01–07 共 **44 条检索结果**全部落盘于 `raw/`（41 个分片 + 404/重定向记录），台账 14 个分片。
- `03-open-items.md` 清单完成度：#1 Harness Lens（仍只有 SPA 外壳 + B 级转述，**降级为写课时视需要再查**）、#2 ✅（FB-1~FB-8）、#3 榜单 CHANGELOG（降级）、#4 ✅ CX、#5 ✅ CC、#6 ✅ DS、#7 ✅ HE、#8 ✅（03 批 Composio，C→维持）、#9 ✅、#10 Composio 原始 thread（降级）、#11 ✅（AX-1~AX-5）、#12 DSH 上榜公告（降级）、#13 super-agent（降级）、#14 ✅ 扩章候选全部有 A 级资料。
- **证据总量足以支撑课程**：10+ 系统各有官方一手事实；3 套横向基准（Harness Leaderboard、Bug Hunt、Composio）+ 2 份方法论一手材料（事故文档、arXiv 论文）。
