/**
 * 引擎层运行时类型守卫（00032）。
 *
 * 替代 `JSON.parse` / `Response.json()` 返回值上的 `as` 断言：解析结果先落到 `unknown`，
 * 再用 isRecord + 逐字段校验窄化；形状不符时走调用方既有的兜底分支（stale / 空文件 / parse）。
 * 这样形状错误不会被类型断言掩盖，同时保持 00029 的降级契约不变。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
