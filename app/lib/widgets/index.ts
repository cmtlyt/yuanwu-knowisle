// @ts-nocheck —— 机械迁移的 DOM 演练内核，由 Vue 组件 course-widget.vue 托管生命周期。
/**
 * 演练注册表唯一对外导出面。
 * 24 个演练按课程分目录、一演练一文件；W 由本文件显式聚合，取代原先的副作用式注册。
 */

import { esc } from './dom.ts'
import { triple } from './effect/triple.ts'
import { blueprint } from './effect/blueprint.ts'
import { runloop } from './effect/runloop.ts'
import { scheduler } from './effect/scheduler.ts'
import { cause } from './effect/cause.ts'
import { layer } from './effect/layer.ts'
import { scope } from './effect/scope.ts'
import { fiber } from './effect/fiber.ts'
import { concurrency } from './effect/concurrency.ts'
import { stream } from './effect/stream.ts'
import { retry } from './effect/retry.ts'
import { rxjsSource } from './rxjs/rxjs-source.ts'
import { rxColdHot } from './rxjs/rx-cold-hot.ts'
import { rxTeardown } from './rxjs/rx-teardown.ts'
import { rxObserver } from './rxjs/rx-observer.ts'
import { rxTransform } from './rxjs/rx-transform.ts'
import { rxFilter } from './rxjs/rx-filter.ts'
import { rxFlatten } from './rxjs/rx-flatten.ts'
import { rxCross } from './rxjs/rx-cross.ts'
import { rxRetry } from './rxjs/rx-retry.ts'
import { rxSubject } from './rxjs/rx-subject.ts'
import { rxShare } from './rxjs/rx-share.ts'
import { rxScheduler } from './rxjs/rx-scheduler.ts'
import { rxCombine } from './rxjs/rx-combine.ts'

const W = {
  triple,
  blueprint,
  runloop,
  scheduler,
  cause,
  layer,
  scope,
  fiber,
  concurrency,
  stream,
  retry,
  rxjsSource,
  rxColdHot,
  rxTeardown,
  rxObserver,
  rxTransform,
  rxFilter,
  rxFlatten,
  rxCross,
  rxRetry,
  rxSubject,
  rxShare,
  rxScheduler,
  rxCombine,
}

export const Widgets = {
  render(name, root, onDone) {
    if (!name || !W[name]) return function () {}
    try {
      return W[name](root, onDone)
    } catch (err) {
      root.innerHTML =
        '<div class="widget"><div class="widget-head"><h4>演练加载失败</h4><p>' +
        esc(err.message) +
        '</p></div></div>'
      return function () {}
    }
  },
  has: (name) => !!W[name],
}
