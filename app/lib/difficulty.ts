/**
 * 把课时难度渲染为 5 格点阵（如 ●●○○○）。
 *
 * 历史教训：课程数据曾把「分钟数」误填进 difficulty（如 24），
 * 模板直接 `'○'.repeat(5 - difficulty)` 抛 RangeError 导致整页白屏。
 * 这里把任意输入归一化为 1–5 整数，保证 repeat 的计数永不为负。
 */
export function difficultyDots(difficulty: number): string {
  const n = Number.isFinite(difficulty) ? Math.trunc(difficulty) : 1
  const clamped = Math.min(5, Math.max(1, n))
  return '●'.repeat(clamped) + '○'.repeat(5 - clamped)
}
