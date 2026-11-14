/**
 * 课时时长推导（00052）：由 contentStats(md) 的体量指标算出课时用时。
 *
 * 设计意图：时长不是课程数据里的字段，而是正文体量的**函数**——
 * 每类指标有各自的「单位用时」，总时长 = 各项之和，并输出各指标的用时占比（shares）。
 * 因此 `Lesson` 没有 `minutes` 字段：渲染时调 `lessonMinutes(lesson)` 现算，
 * 正文一扩写，页面上显示的时长自动跟着变，不存在「声明值与内容脱节」。
 *
 * 纯函数（正则扫描 md，不读文件、不依赖 Nuxt 运行时），Node 脚本与浏览器共用：
 * 单课约 0.02 ms，全站 194 课约 5 ms，且只在页面真正用到时才算。
 */

import { contentStats, type ContentStats } from './markdown-md.ts'
import type { Lesson } from '~/types/course'

/** 每类指标的单位用时。改这里就等于改全站时长口径。 */
export const TIME_RATES = {
  /** 中文技术叙述：约 320 字/分钟（需停下来理解，慢于日常阅读）。 */
  prosePerChar: 1 / 320,
  /** 读代码：约 200 字符/分钟（≈5 行/分钟，逐行对照语义）。 */
  codePerChar: 1 / 200,
  /** 每个提示框（:::deep / :::tip / :::warn）：停下消化 0.6 分钟。 */
  perCallout: 0.6,
  /** 每道题：读题 + 思考 + 看解析 1.2 分钟。 */
  perQuiz: 1.2,
  /** 每条术语：速览 0.25 分钟。 */
  perTerm: 0.25,
  /** 每条误区：对照自查 0.5 分钟。 */
  perPitfall: 0.5,
  /**
   * 每个交互演练（widget）：读参数说明 → 动手操作 → 对照结果 ≈ 5 分钟。
   * 方差是所有项里最大的（有人玩 1 分钟、有人玩 10 分钟），取代表值；
   * 不设这项会让「正文短但全节靠交互演练」的课（effect / rxjs）被算成 7 分钟。
   */
  perWidget: 5,
} as const

/** 非正文侧的结构化字段计数（quiz / terms / pitfalls / widget 仍为结构化数据）。 */
export interface LessonCounts {
  quizCount: number
  termsCount: number
  pitfallsCount: number
  widgetCount: number
}

/** 各指标的分钟数与占比（占比之和为 1，用于解释「这节为什么是这个时长」）。 */
export interface TimeBreakdown {
  prose: number
  code: number
  callout: number
  quiz: number
  terms: number
  pitfalls: number
  widget: number
}

export interface LessonTime {
  /** 推导出的工时（分钟，四舍五入，下限 3）。 */
  minutes: number
  /** 未取整的原始总和，便于闸门做容差比较。 */
  raw: number
  breakdown: TimeBreakdown
  /** 各指标占总时长的比例（0–1），键与 breakdown 一致。 */
  shares: TimeBreakdown
}

/** 全部指标的固定顺序，用于遍历与占比计算（避免对 Object.keys 做类型断言）。 */
const KEYS: Array<keyof TimeBreakdown> = ['prose', 'code', 'callout', 'quiz', 'terms', 'pitfalls', 'widget']

/**
 * 由正文体量 + 结构化字段数推导课时时长。
 * @example estimateLessonTime(contentStats(md), { quizCount: 5, termsCount: 4, pitfallsCount: 3 })
 */
export function estimateLessonTime(stats: ContentStats, counts: LessonCounts): LessonTime {
  const breakdown: TimeBreakdown = {
    prose: stats.proseChars * TIME_RATES.prosePerChar,
    code: stats.codeChars * TIME_RATES.codePerChar,
    callout: stats.callouts * TIME_RATES.perCallout,
    quiz: counts.quizCount * TIME_RATES.perQuiz,
    terms: counts.termsCount * TIME_RATES.perTerm,
    pitfalls: counts.pitfallsCount * TIME_RATES.perPitfall,
    widget: counts.widgetCount * TIME_RATES.perWidget,
  }
  let raw = 0
  for (const k of KEYS) raw += breakdown[k]

  const shares: TimeBreakdown = {
    prose: 0,
    code: 0,
    callout: 0,
    quiz: 0,
    terms: 0,
    pitfalls: 0,
    widget: 0,
  }
  for (const k of KEYS) shares[k] = raw > 0 ? breakdown[k] / raw : 0

  return { minutes: Math.max(3, Math.round(raw)), raw, breakdown, shares }
}

/** 推导所需的课时字段：正文 + 三个结构化计数项。 */
export type LessonTimeSource = Pick<Lesson, 'md' | 'quiz' | 'terms' | 'pitfalls' | 'widget'>

/**
 * 按课时内容推导时长（页面的唯一取用入口）。
 * 刻意**不存进课程数据**：存下来就多一份可能与正文脱节的真相，
 * 而且改写正文后还得手工回头改数字。渲染时现算（单课约 0.02 ms）即可。
 */
export function lessonTime(lesson: LessonTimeSource): LessonTime {
  return estimateLessonTime(contentStats(lesson.md), {
    quizCount: lesson.quiz.length,
    termsCount: lesson.terms.length,
    pitfallsCount: lesson.pitfalls.length,
    widgetCount: lesson.widget ? 1 : 0,
  })
}

/** 只关心分钟数时的便捷封装。 */
export function lessonMinutes(lesson: LessonTimeSource): number {
  return lessonTime(lesson).minutes
}

/** 把占比渲染成一行人类可读文本，如 `正文 34% · 代码 38% · 提示 8% · 测验 14%`。 */
export function formatShares(shares: TimeBreakdown): string {
  const label: Record<keyof TimeBreakdown, string> = {
    prose: '正文',
    code: '代码',
    callout: '提示',
    quiz: '测验',
    terms: '术语',
    pitfalls: '误区',
    widget: '演练',
  }
  return KEYS.filter((k) => shares[k] > 0.005)
    .map((k) => label[k] + ' ' + Math.round(shares[k] * 100) + '%')
    .join(' · ')
}
