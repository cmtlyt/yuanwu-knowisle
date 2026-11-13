/*
 * 学情分析引擎 —— 与视图、内容完全解耦
 * 模型：概念级掌握度 = 近期表现 + 历史正确率 + 记忆保持度 + 练习覆盖
 *       记忆保持度用艾宾浩斯式指数遗忘 R = e^(-Δt / S)，S 随成功复习增长
 */
// @ts-nocheck —— 机械迁移的纯计算内核；类型在 ~/types/course 与 composable 边界声明。
import type { EffectCourseData } from '~/types/course'

const storage = {
  getItem(k) {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem(k, v) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(k, v)
    } catch {
      /* 隐私模式退化为内存态 */
    }
  },
  removeItem(k) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(k)
    } catch {
      /* noop */
    }
  },
}

/** 每门课程一个独立引擎实例： COURSE / KEY 由闭包捕获，天然支持多课程学情隔离。 */
export function createAnalytics(course: EffectCourseData, storageKey: string) {
  const COURSE = course
  const KEY = storageKey
  const DAY = 86400000
  const MAX_ATTEMPTS = 600

  const todayKey = (ts) => {
    const d = new Date(ts || Date.now())
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-')
  }

  function defaultState() {
    return {
      version: 1,
      profile: { name: '', dailyGoal: 25, startDate: todayKey(), theme: 'light' },
      lessons: {},
      concepts: {},
      attempts: [],
      sessions: {},
      reviewHistory: [],
      lastActive: Date.now(),
    }
  }

  let memoryFallback = null

  function load() {
    let raw = null
    try {
      raw = storage.getItem(KEY)
    } catch (e) {
      raw = null
    }
    if (!raw && memoryFallback) return memoryFallback
    let parsed
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch (e) {
      parsed = null
    }
    const base = defaultState()
    if (!parsed || parsed.version !== 1) return base
    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...(parsed.profile || {}) },
      lessons: parsed.lessons || {},
      concepts: parsed.concepts || {},
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      sessions: parsed.sessions || {},
      reviewHistory: parsed.reviewHistory || [],
    }
  }

  function save(state) {
    memoryFallback = state
    try {
      storage.setItem(KEY, JSON.stringify(state))
    } catch (e) {
      /* 隐私模式下退化为内存态 */
    }
    return state
  }

  function reset() {
    const s = defaultState()
    try {
      storage.removeItem(KEY)
    } catch (e) {
      /* noop */
    }
    return save(s)
  }

  function lessonState(state, id) {
    if (!state.lessons[id]) {
      state.lessons[id] = { visited: 0, seconds: 0, quiz: {}, widgetDone: false, completedAt: null }
    }
    return state.lessons[id]
  }

  function conceptState(state, id) {
    if (!state.concepts[id]) {
      state.concepts[id] = { stability: 1.0, lastReview: null, correct: 0, wrong: 0, reps: 0 }
    }
    return state.concepts[id]
  }

  function sessionFor(state, ts) {
    const k = todayKey(ts)
    if (!state.sessions[k]) state.sessions[k] = { seconds: 0, quizzes: 0, lessons: 0 }
    return state.sessions[k]
  }

  /* ---------------- 事件采集 ---------------- */
  function visitLesson(state, id) {
    const l = lessonState(state, id)
    l.visited += 1
    l.lastVisited = Date.now()
    state.lastActive = Date.now()
    return save(state)
  }

  function addStudySeconds(state, seconds) {
    if (!seconds || seconds <= 0 || seconds > 3600) return state
    const s = sessionFor(state)
    s.seconds += Math.round(seconds)
    state.lastActive = Date.now()
    return save(state)
  }

  function recordAttempt(state, lessonId, qIndex, correct, concept, isReview) {
    const ts = Date.now()
    const l = lessonState(state, lessonId)
    const qKey = String(qIndex)
    if (!l.quiz[qKey]) l.quiz[qKey] = { tries: 0, correct: 0, lastTs: ts, lastCorrect: null }
    const q = l.quiz[qKey]
    q.tries += 1
    if (correct) q.correct += 1
    q.lastTs = ts
    q.lastCorrect = !!correct

    state.attempts.push({ ts, lessonId, qIndex, correct: !!correct, concept, review: !!isReview })
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts = state.attempts.slice(-MAX_ATTEMPTS)

    const cs = conceptState(state, concept)
    const retention = cs.lastReview ? Math.exp(-(ts - cs.lastReview) / (cs.stability * DAY)) : 1
    if (correct) {
      cs.correct += 1
      cs.stability = Math.min(90, cs.stability * (1 + 0.8 * (1 - retention)) + 0.6)
    } else {
      cs.wrong += 1
      cs.stability = Math.max(0.5, cs.stability * 0.55)
    }
    cs.reps += 1
    cs.lastReview = ts

    const s = sessionFor(state, ts)
    s.quizzes += 1
    if (isReview) {
      state.reviewHistory.push({ ts, concept, correct: !!correct })
      if (state.reviewHistory.length > 400) state.reviewHistory = state.reviewHistory.slice(-400)
    }
    state.lastActive = ts
    return save(state)
  }

  function markWidgetDone(state, lessonId) {
    lessonState(state, lessonId).widgetDone = true
    return save(state)
  }

  function completeLesson(state, lessonId) {
    const l = lessonState(state, lessonId)
    if (!l.completedAt) {
      l.completedAt = Date.now()
      sessionFor(state, l.completedAt).lessons += 1
    }
    state.lastActive = Date.now()
    return save(state)
  }

  /* ---------------- 掌握度计算 ---------------- */
  function conceptStats(state, cid, now) {
    const t = now || Date.now()
    const cs = state.concepts[cid] || { stability: 1.0, lastReview: null, correct: 0, wrong: 0, reps: 0 }
    const attempts = state.attempts.filter((a) => a.concept === cid)
    const total = attempts.length
    const correct = attempts.filter((a) => a.correct).length

    if (total === 0 && cs.reps === 0) {
      return {
        cid,
        total: 0,
        correct: 0,
        accuracy: 0,
        recent: 0,
        retention: 0,
        exposure: 0,
        mastery: 0,
        status: 'unlearned',
        stability: cs.stability,
        lastReview: null,
        daysSince: null,
      }
    }

    const accuracy = (correct + 1) / (total + 2)
    const recentAttempts = attempts.slice(-5)
    let num = 0,
      den = 0
    recentAttempts.forEach((a) => {
      const ageDays = Math.max(0, (t - a.ts) / DAY)
      const w = Math.exp(-ageDays / 14)
      num += (a.correct ? 1 : 0) * w
      den += w
    })
    const recent = den > 0 ? num / den : accuracy

    const daysSince = cs.lastReview ? Math.max(0, (t - cs.lastReview) / DAY) : 0
    const retention = cs.lastReview ? Math.exp(-daysSince / Math.max(0.5, cs.stability)) : 0
    const exposure = Math.min(1, total / 4)

    const mastery = Math.round(100 * (0.3 * recent + 0.2 * accuracy + 0.25 * retention + 0.25 * exposure))
    const clamped = Math.max(0, Math.min(100, mastery))
    const status = clamped >= 80 ? 'solid' : clamped >= 60 ? 'developing' : 'weak'
    return {
      cid,
      total,
      correct,
      accuracy,
      recent,
      retention,
      exposure,
      mastery: clamped,
      status,
      stability: cs.stability,
      lastReview: cs.lastReview,
      daysSince: cs.lastReview ? Number(daysSince.toFixed(1)) : null,
    }
  }

  function conceptMap(state, now) {
    const out = {}
    COURSE.CONCEPTS.forEach((c) => {
      out[c.id] = conceptStats(state, c.id, now)
    })
    return out
  }

  function stageMastery(state, stageId, cmap) {
    const map = cmap || conceptMap(state)
    const cs = COURSE.CONCEPTS.filter((c) => c.stage === stageId)
    if (!cs.length) return 0
    const learned = cs.filter((c) => map[c.id].total > 0)
    const covered = cs.length
    const sum = cs.reduce((acc, c) => acc + map[c.id].mastery * c.weight, 0)
    const wsum = cs.reduce((acc, c) => acc + c.weight, 0)
    return { overall: Math.round(sum / wsum), learned: learned.length, total: covered }
  }

  function overall(state) {
    const cmap = conceptMap(state)
    const lessons = COURSE.LESSONS
    const done = lessons.filter((l) => state.lessons[l.id] && state.lessons[l.id].completedAt)
    const attempts = state.attempts
    const correct = attempts.filter((a) => a.correct).length
    const totalSeconds = Object.values(state.sessions).reduce((a, s) => a + (s.seconds || 0), 0)
    const stageRows = COURSE.STAGES.map((s) => ({
      ...s,
      mastery: stageMastery(state, s.id, cmap).overall,
      ...stageMastery(state, s.id, cmap),
      done: done.filter((l) => l.stage === s.id).length,
      lessonCount: lessons.filter((l) => l.stage === s.id).length,
    }))
    const weighted = COURSE.CONCEPTS.reduce((acc, c) => acc + cmap[c.id].mastery * c.weight, 0)
    const wsum = COURSE.CONCEPTS.reduce((acc, c) => acc + c.weight, 0)
    return {
      doneCount: done.length,
      lessonCount: lessons.length,
      progress: Math.round((done.length / lessons.length) * 100),
      quizTotal: attempts.length,
      accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
      minutes: Math.round(totalSeconds / 60),
      streak: streak(state),
      mastery: Math.round(weighted / wsum),
      stageRows,
      cmap,
    }
  }

  function streak(state) {
    const keys = Object.keys(state.sessions).filter(
      (k) => (state.sessions[k].seconds || 0) > 0 || (state.sessions[k].quizzes || 0) > 0,
    )
    if (!keys.length) return 0
    const set = new Set(keys)
    let n = 0
    const d = new Date()
    // 今天没学也允许从昨天起算
    if (!set.has(todayKey(d.getTime()))) d.setDate(d.getDate() - 1)
    for (let i = 0; i < 400; i++) {
      if (!set.has(todayKey(d.getTime()))) break
      n += 1
      d.setDate(d.getDate() - 1)
    }
    return n
  }

  function timeline(state, days) {
    const n = days || 14
    const out = []
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(d.getTime() - i * DAY)
      const k = todayKey(day.getTime())
      const s = state.sessions[k] || {}
      out.push({
        date: k,
        label: String(day.getMonth() + 1) + '/' + String(day.getDate()),
        minutes: Math.round((s.seconds || 0) / 60),
        quizzes: s.quizzes || 0,
        lessons: s.lessons || 0,
      })
    }
    return out
  }

  /* ---------------- 诊断与推荐 ---------------- */
  function conceptById(id) {
    return COURSE.CONCEPTS.find((c) => c.id === id)
  }

  function lessonForConcept(cid) {
    return COURSE.LESSONS.find((l) => l.concepts.indexOf(cid) >= 0)
  }

  function reviewQueue(state) {
    const cmap = conceptMap(state)
    return COURSE.CONCEPTS.map((c) => ({ concept: c, stat: cmap[c.id] }))
      .filter((r) => r.stat.total > 0 && r.stat.retention < 0.82)
      .sort((a, b) => a.stat.retention - b.stat.retention)
      .map((r) => ({
        cid: r.concept.id,
        name: r.concept.name,
        stage: r.concept.stage,
        retention: Math.round(r.stat.retention * 100),
        mastery: r.stat.mastery,
        lessonId: (lessonForConcept(r.concept.id) || {}).id,
        reason: r.stat.retention < 0.5 ? '记忆明显衰退' : '建议巩固',
      }))
  }

  function diagnose(state) {
    const cmap = conceptMap(state)
    const weak = COURSE.CONCEPTS.map((c) => ({ concept: c, stat: cmap[c.id] }))
      .filter((r) => r.stat.total > 0 && r.stat.mastery < 68)
      .sort((a, b) => a.stat.mastery - b.stat.mastery)
    return weak.slice(0, 6).map((r) => {
      const c = r.concept,
        s = r.stat
      let cause, action
      const gaps = (c.prereqs || []).filter((p) => cmap[p] && cmap[p].mastery < 70)
      if (gaps.length) {
        cause = '前置缺口：' + gaps.map((g) => (conceptById(g) || {}).name || g).join('、') + ' 尚未巩固'
        action = '先回到前置课时重做测验，再回来练本概念'
      } else if (s.retention < 0.6 && s.accuracy >= 0.65) {
        cause = '遗忘型：当时答对，但间隔太久未复习'
        action = '加入今日复习队列，答对后记忆稳定度会显著延长'
      } else if (s.accuracy < 0.6) {
        cause = '误解型：反复答错，概念模型可能建错了'
        action = '重读该课「常见误区」，再用交互演练逐步验证'
      } else {
        cause = '练习不足：样本量偏少，掌握度尚未稳定'
        action = '再做 2-3 道该概念的题，或重跑交互演练'
      }
      return {
        cid: c.id,
        name: c.name,
        stage: c.stage,
        mastery: s.mastery,
        accuracy: Math.round(s.accuracy * 100),
        cause,
        action,
        lessonId: (lessonForConcept(c.id) || {}).id,
      }
    })
  }

  function recommend(state) {
    const reviews = reviewQueue(state)
    const doneIds = new Set(
      COURSE.LESSONS.filter((l) => state.lessons[l.id] && state.lessons[l.id].completedAt).map((l) => l.id),
    )
    let next = null
    for (const l of COURSE.LESSONS) {
      if (doneIds.has(l.id)) continue
      const missing = l.prereqs.filter((p) => !doneIds.has(p))
      next = { lesson: l, missing }
      break
    }
    const prereqBlocked = next && next.missing.length > 0
    return {
      next,
      prereqBlocked,
      reviewCount: reviews.length,
      advice:
        reviews.length >= 3
          ? '有 ' + reviews.length + ' 个概念进入遗忘区，建议先花 5 分钟复习，再推进新课。'
          : prereqBlocked
            ? '下一课的前置课时还没完成，建议按顺序补齐，路径会更省力。'
            : next
              ? '继续推进：' + next.lesson.title
              : '全部课时已完成，进入长期复习与实战阶段。',
    }
  }

  /* ---------------- 教师 / 课程质量视图 ---------------- */
  function teacherReport(state) {
    return COURSE.LESSONS.map((l) => {
      const ls = state.lessons[l.id]
      const attempts = state.attempts.filter((a) => a.lessonId === l.id)
      const correct = attempts.filter((a) => a.correct).length
      const quizKeys = ls ? Object.keys(ls.quiz) : []
      const retries = quizKeys.reduce((acc, k) => acc + Math.max(0, (ls.quiz[k].tries || 0) - 1), 0)
      const rate = attempts.length ? correct / attempts.length : null
      return {
        id: l.id,
        title: l.title,
        stage: l.stage,
        visited: ls ? ls.visited : 0,
        seconds: ls ? ls.seconds : 0,
        completed: !!(ls && ls.completedAt),
        widgetDone: !!(ls && ls.widgetDone),
        attempts: attempts.length,
        accuracy: rate === null ? null : Math.round(rate * 100),
        retries,
        flag: rate !== null && rate < 0.55 && attempts.length >= 3 ? '题目或讲解需修订' : null,
      }
    })
  }

  function exportState(state) {
    return JSON.stringify(
      { ...state, exportedAt: new Date().toISOString(), courseVersion: COURSE.META.version },
      null,
      2,
    )
  }

  function importState(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json
    if (!parsed || parsed.version !== 1 || !parsed.lessons || !parsed.concepts) {
      throw new Error('文件格式不匹配：需要本课程的 v1 学情备份')
    }
    return save({
      ...defaultState(),
      ...parsed,
      profile: { ...defaultState().profile, ...(parsed.profile || {}) },
    })
  }

  return {
    KEY,
    defaultState,
    load,
    save,
    reset,
    lessonState,
    visitLesson,
    addStudySeconds,
    recordAttempt,
    markWidgetDone,
    completeLesson,
    conceptStats,
    conceptMap,
    stageMastery,
    overall,
    streak,
    timeline,
    reviewQueue,
    diagnose,
    recommend,
    teacherReport,
    exportState,
    importState,
  }
}
