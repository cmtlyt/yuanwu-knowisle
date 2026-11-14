import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L39 = L(
  'L39',
  5,
  '写好工具 Schema：让模型「用得对」',
  12,
  2,
  ['L38'],
  ['tool-schema'],
  [
    '理解工具 Schema 是「模型正确用工具」的关键',
    '掌握用 TS 类型 + zod 校验写 Schema 的实践',
    '认识好 Schema 的特征：描述清晰、参数最小、带示例',
  ],
  [
    prose(
      'Schema 决定模型会不会用错',
      '模型靠 Schema 理解「这个工具干什么、参数怎么填」。Schema 写得好，模型用得对；写得含糊，模型就会传错参数。Schema 是工具设计的一半工作。',
    ),
    code(
      '用 zod 定义并校验工具',
      'import { z } from "zod"\n\nconst SearchWeather = z.object({\n  city: z.string().describe("城市名，如 北京、上海"),\n  date: z.string().optional().describe("日期，YYYY-MM-DD，缺省今天"),\n})\n\nfunction toToolSchema(name: string, schema: z.ZodObject<any>) {\n  return {\n    type: "function" as const,\n    function: { name, parameters: zodToJsonSchema(schema) },\n  }\n}\n\n// 执行时用同一个 schema 校验模型传来的参数\nconst args = SearchWeather.parse(JSON.parse(rawArguments))  // 不合法直接抛错',
      '关键：`zod` 定义一次，既生成给模型的 JSON Schema，又在校验模型参数时复用——单一事实来源。',
    ),
    call(
      'deep',
      '好 Schema 的三个特征',
      '① 描述清晰：用 `.describe()` 说清每个参数的语义与格式。② 参数最小：只暴露必要参数，别塞一堆用不上的。③ 带示例：在描述里给取值示例，帮模型理解边界。',
    ),
    list('Schema 的常见坑', [
      '参数名含糊：`data` / `info` 这类名字模型无从下手。',
      '缺少 required 约束：必填参数没标记，模型可能漏传。',
      '枚举没写清：`status` 不说明可选值，模型乱填。',
    ]),
    call(
      'warn',
      'Schema 与执行校验用同一份',
      '如果「给模型看的 Schema」和「执行时校验的参数」是两套，早晚会不一致。用 zod 一次定义、两处复用，从根上消除分叉。',
    ),
  ],
  null,
  [
    q(
      '为什么工具 Schema 是「工具设计的一半工作」？',
      ['Schema 决定模型能否正确理解并填写参数', 'Schema 能减少代码', 'Schema 影响性能', 'Schema 不需要维护'],
      0,
      '模型靠 Schema 理解工具与参数。',
      'tool-schema',
    ),
    q(
      '用 zod 定义工具的好处是？',
      ['性能更快', '一次定义、两处复用：生成 JSON Schema + 校验模型参数', '不用 JSON', '自动写文档'],
      1,
      '单一事实来源，消除 Schema 与校验的分叉。',
      'tool-schema',
    ),
    q(
      '好 Schema 的三个特征不包括？',
      ['描述清晰', '参数最小', '带示例', '参数越多越好'],
      3,
      '清晰、最小、带示例；参数多反而是坑。',
      'tool-schema',
    ),
  ],
  [
    ['zod', '运行时 Schema 校验库，可生成 JSON Schema'],
    ['describe()', '给字段附加语义描述，帮助模型理解'],
    ['单一事实来源', 'Schema 定义一处、生成与校验共用'],
  ],
  ['给模型的 Schema 与执行校验用两套，早晚不一致。', '参数名含糊（data/info），模型无从下手。'],
)
