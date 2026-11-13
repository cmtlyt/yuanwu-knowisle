# 00025 · useRequiredCourse 类型收窄（多课程页面类型报错修复）

- 日期：2026-11-13
- 关联：`docs/00024-rxjs-course-multicourse`（多课程架构）、`app/composables/use-course.ts`

## 目标

用户指出 `app/pages/courses/[slug]/index.vue` 第 9/10 行类型报错：

```
类型 "CourseEntry | undefined" 的参数不能赋给类型 "CourseEntry" 的参数。
不能将类型 "undefined" 分配给类型 "CourseEntry"
```

根因不在 index.vue 本身：`useRequiredCourse()` 内部已 404 拦截（`course` / `data` 为空即 `throw`），但**返回类型**仍是 `useCourse()` 的 `ComputedRef<CourseEntry | undefined>`，未把「必然非 undefined」这一保证反映到类型上。7 个消费页面（index / dashboard / design / teacher / lessons/[id] / settings / review）在 `learning.stateOf(course.value)` / `learning.engineOf(course.value)` 处都会报同一类错误，template 里的 `course!.title` 非空断言也是同一根因的 workaround。

## 变更（app/composables/use-course.ts）

- 导出收窄后返回类型：

  ```ts
  export type RequiredCourseContext = ReturnType<typeof useCourse> & {
    course: ComputedRef<CourseEntry>
    data: ComputedRef<EffectCourseData>
  }
  ```

- `useRequiredCourse(): RequiredCourseContext`，内部用**类型守卫** `isCourseReady(ctx): ctx is RequiredCourseContext` 做 404 拦截 + 收窄，守卫通过即直接 `return ctx`，无需任何 `as` 断言。

### 为什么用类型守卫而非 `as` 断言

- `as RequiredCourseContext`（宽→窄）会触发 oxlint `no-unsafe-type-assertion` warning（实测 23→24）。
- `as unknown as RequiredCourseContext`（unknown 跳板）同样被判「unknown → 具体类型」，仍 1 条 warning。
- 类型守卫 `ctx is RequiredCourseContext` 既表达运行时事实（course/data 非 undefined 正是 404 拦截的条件），又让 TS 自动收窄——**零断言、零新增 warning、语义准确**。

## 验证（全部 exit 0）

- `pnpm typecheck`：0 error / **23 warning（回到基线，无新增）**
- `pnpm lint`：0 error / 19 warning（`use-course.ts` 零告警）
- `pnpm fmt:check`：全绿
- `pnpm verify`：双课程全绿
- `pnpm build`：成功

## 注意事项

- 修复落在 composable 层，7 个消费页面自动受益；后续可逐步去掉各页面 template 里 `course!.title` 等冗余非空断言。
- 同类「已拦截但类型未收窄」的 composable 复用此模式：显式返回类型 + 类型守卫，避免 `as` 断言引入 `no-unsafe-type-assertion`。
- 本次改动已随 `05160b3` 提交。
