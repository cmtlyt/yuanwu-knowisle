import { L, withKind } from '../../course-builders.ts'

export const L23 = withKind(
  L(
    'L23',
    5,
    'Stream：零到多个值与背压',
    3,
    ['L21'],
    ['stream'],
    [
      '实现 Stream 的构造、变换与背压消费管线',
      '写出有界队列下生产端不被压垮的运行示例',
      '跑通「请求驱动而非推送驱动」的断言',
      '改造一段一次性数组处理为流式处理',
    ],
    `
### 一次性读进内存，导出接口 OOM 了

导出功能把查询结果读成数组再做三步变换，数据量小时一切正常，某天客户导全年数据，进程直接 OOM。第一反应是「加分页」，但分页只解决取数，三步变换仍然各自生成一个完整中间数组，峰值内存是三倍。更根本的问题是**推送驱动**：上游生产多少，下游就得接着多少，消费端没有任何话语权。Stream 把关系反过来——由下游按需请求，上游一次只给一批。这一课把「请求驱动」写成可跑的管线与断言。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 推送驱动与请求驱动的差别，背压由谁表达 | Channel 的中断收尾（L22）、Fiber 调度（L20） |
| Stream 的构造、变换、消费怎么串成有界管线 | Schedule 策略组合（L24）、STM 事务（L25） |
| 怎样用断言验证「上界生效、生产端不被压垮」 | 生产落地检查单（L26） |

### 两种驱动模型

| 维度 | 数组 / 一次性读 | Stream |
|---|---|---|
| 谁决定节奏 | 生产端，全部生成完再交出去 | 消费端，按请求量拉取 |
| 中间结果 | 每步一个完整数组，峰值成倍 | 逐元素或逐块流过，不落地 |
| 提前终止 | 已经全量生成，省不了 | take 之后上游不再被请求 |
| 内存上界 | 无 | 由缓冲区与请求批量决定 |
| 中断收尾 | 自己遍历清理 | 随作用域关闭（L22） |

第三行是最容易被低估的收益：\`take(100)\` 不只是「取前 100 条」，而是让上游**根本不必生产第 101 条**。数组版本里 \`slice(0, 100)\` 之前，全量数据早已在内存里。

### 真实写法

\`\`\` title="有界流管线" note="Stream.take 把消费上界写进管线；Stream.tap 是旁路观察，不改变流内容。"
import { Effect, Stream } from "effect"

const pipeline = Stream.range(1, 1_000_000).pipe(
  Stream.tap((n) => Effect.log("seen " + n)),
  Stream.map((n) => n * 2),
  Stream.take(100),
)

const collected = Stream.runCollect(pipeline)
\`\`\`

\`Stream.map\` 之类变换返回的是新的流描述，不是已经算好的数组；只有 \`runCollect\` 这类运行操作才真正推动数据流动。把 \`runCollect\` 放在链中间，就会把一个流重新退化成全量集合。

### 请求驱动与背压断言

\`\`\` title="有界流的最小模型" note="自包含程序，只依赖 node:assert；验证按需拉取、上界生效、峰值内存可控。"
import assert from "node:assert/strict"

type Pull<A> = (n: number) => A[]
const range = (from: number, to: number): Pull<number> => {
  let cursor = from
  return (n) => {
    const out: number[] = []
    while (out.length < n && cursor <= to) out.push(cursor++)
    return out
  }
}
const map = <A, B>(p: Pull<A>, f: (a: A) => B): Pull<B> => (n) => p(n).map(f)
const take = <A>(p: Pull<A>, limit: number): Pull<A> => {
  let left = limit
  return (n) => {
    if (left <= 0) return []
    const batch = p(Math.min(n, left))
    left -= batch.length
    return batch
  }
}

let produced = 0
const source = range(1, 1_000_000) // cursor 必须持久，否则每批都从头生产
const counted = (n: number): number[] => {
  produced += n
  return source(n)
}
const pipeline = take(map(counted, (x) => x * 2), 100)

const collect = <A>(p: Pull<A>, batchSize: number): A[] => {
  const out: A[] = []
  for (;;) {
    const batch = p(batchSize)
    if (batch.length === 0) break
    out.push(...batch)
  }
  return out
}

const result = collect(pipeline, 16)
assert.equal(result.length, 100, "上界生效")
assert.equal(result[0], 2)
assert.equal(result[99], 200)
assert.ok(produced <= 112, "上游被请求驱动，没有生成全量数据")

// 峰值内存由批量决定，与总量无关
let peak = 0
const trackedSource = range(1, 1_000_000)
const tracked = (n: number): number[] => {
  peak = Math.max(peak, n)
  return trackedSource(n)
}
collect(take(tracked, 100), 16)
assert.ok(peak <= 16, "单批不超过请求量")
console.log("t1 通过：按需拉取、上界生效、峰值与总量无关")
\`\`\`

第二条断言是这课的硬判据：如果 \`produced\` 接近一百万，说明又回到了推送驱动，换成 Stream 也只是换了个 API。最后一条断言把「内存上界」变成可测的量——**峰值由请求批量决定，而不是由数据总量决定**，这正是导出接口不再 OOM 的原因。

### 从一次性数组改造过来

\`\`\` title="全量变换改造为流式" note="自包含程序；改造前后产出一致，但中间结果个数从 3 降到 0。"
import assert from "node:assert/strict"

const before = (xs: number[]): number[] => {
  const a = xs.map((x) => x + 1)
  const b = a.map((x) => x * 2)
  return b.slice(0, 3)
}
const after = (xs: number[]): number[] => {
  const out: number[] = []
  for (const x of xs) {
    if (out.length >= 3) break
    out.push((x + 1) * 2)
  }
  return out
}
const input = Array.from({ length: 100_000 }, (_, i) => i)
assert.deepEqual(before(input), after(input))
assert.deepEqual(after(input), [2, 4, 6], "提前终止后上游不再被读取")
console.log("t2 通过：产出一致，中间数组不再落地")
\`\`\`

### 选型与排障

| 情形 | 做法 | 反例 |
|---|---|---|
| 数据量大、只需前 N 条 | take 写进管线 | 先 runCollect 再 slice |
| 需要观察但不改内容 | Stream.tap | 用 map 顺手返回日志字符串 |
| 消费端慢于生产端 | 缩小请求批量 | 无限缓冲区硬扛 |
| 中途被取消 | 交给 L22 的作用域关闭 | 在回调里自己置标志 |

:::deep

### 背压是一种契约，不是一种缓冲

很多人把背压理解成「加个队列挡一下」，这只能把 OOM 推迟，不能消除：队列无界时内存照样涨，队列有界时又得决定写满之后怎么办。请求驱动把这件事变成契约——**下游主动声明「我现在能处理多少」，上游最多给这么多**，于是速率匹配发生在协议层，而不是靠缓冲区容量硬扛。这也解释了为什么 \`take\` 必须是管线的一部分而不是事后截取：只有上界写进描述，上游才知道不必继续生产。回头看 L22 的中断收尾，两者是同一思路的两面：一个管「还要不要继续给」，一个管「不给之后怎么收干净」。

:::

:::warn

### 三个流式改造里的静默退化

第一件是把 \`runCollect\` 放在链中间，流被折成全量数组，后面再接多少 Stream 算子都救不回内存。第二件是用 \`map\` 做日志旁路并顺手返回日志字符串，流的内容被换成日志，类型检查常常放行，下游拿到一堆无关文本。第三件是缓冲区设成无限，理由是「消费者总会追上」，一旦下游是慢数据库就再也没追上过，表现与最初的 OOM 完全一样。三者都不会报错，且都只在数据量上来后显现。排查时别看代码里有没有 \`Stream\`，看 \`produced\` 与峰值批量这两个数：t1 的两条断言就是最小体检。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 上界之内产出正确 | take 没生效或变换顺序错了 |
| 上游生产量远小于总量 | 退化成推送驱动 |
| 单批不超过请求量 | 内存峰值与总量挂钩 |
| tap 不改变流内容 | 旁路被写成变换 |
| 取消后不留未处理元素 | L22 的收尾没接上 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L22 中断与 Channel | 取消时队列怎么清 | 请求驱动的消费端上界 |
| L24 Schedule | 重试策略怎么变成可组合值 | 「描述先于执行」同一思路 |
| L26 渐进落地 | 老代码怎么一步步换成流 | 产出一致、内存可控两条验收 |

### 一次导出 OOM 的排障回放

| 步骤 | 当时看到的现象 | 缺的是哪一层 |
|---|---|---|
| 看接口日志 | 请求进来后无响应，进程被重启 | 只知道总量大，不知道峰值在哪 |
| 看取数 | 数据库分批返回，看起来没问题 | 变换链把每批又拼成完整数组 |
| 看三步变换 | 每步都生成一份中间结果 | 没有请求驱动，上游推多少就得接多少 |
| 想加分页 | 只解决取数，中间数组仍是三倍 | 上界没有写进管线描述 |
| 改成 Stream.take | 上游只生产到上界就停 | 消费端第一次有了话语权 |

按倒序读最清楚：最后一步能一次修好，是因为 \`take\` 不是事后截取，而是让上游根本不必生产。前四步耗掉的时间，都花在给一个推送驱动的管线加缓冲、加分页、加内存上——**这些都是把 OOM 往后推，不是把峰值降下来**。t1 里 \`produced\` 与 \`peak\` 两个数字，正是这张表最后一步的量化形式。

### 流式改造的六项评审清单

| 检查项 | 怎么看 | 漏掉后的表现 |
|---|---|---|
| runCollect 是不是只在最末端 | 链中间有没有全量收集 | 流退化成数组，内存照涨 |
| take 是否写进管线 | 上游生产量是否远小于总量 | 提前终止省不了生产 |
| 缓冲区是否有界 | 单批是否等于请求量 | 慢下游把队列撑满 |
| tap 是否只做旁路 | 回调返回值有没有替换内容 | 下游收到日志文本 |
| 取消后队列是否清空 | produced 是否停止增长 | 接口已返回、内存还在涨 |
| 产出与旧版本是否逐字一致 | 同一组输入对比结果 | 流式改造悄悄改了语义 |

六项里前三项是内存问题，后三项是正确性与收尾问题。它们常常被分开验：压测只盯内存，功能测试只盯产出，取消路径没人测。把 t1 与 t2 的断言一起放进回归集，刚好把这三类覆盖在同一条用例里。

### 与全课收束的接缝

| 本课交付 | 最后一课怎么用 | 不允许改什么 |
|---|---|---|
| 请求驱动与内存上界 | L26 的落地路线第 6 步 | 不把 runCollect 挪到链中间 |
| 「描述先于执行」的第四次出现 | 与蓝图、指令、策略并列复盘 | 不把上界写成事后 slice |
| 产出一致性对照断言 | 新旧实现可切换、可回滚 | 不为性能牺牲结果语义 |
`,
    'stream',
    [
      {
        text: 'Stream 相对 Effect 的关键差别？',
        options: ['Stream 没有错误通道', 'Stream 可发出零到多个值', 'Stream 立即执行', 'Stream 不支持依赖'],
        answer: 1,
        explain: 'Effect 成功时恰好一个值；Stream 是 0..N 个值的时间序列。',
        concept: 'stream',
      },
      {
        text: 'pull-based 模型如何带来背压？',
        options: [
          '靠固定大小缓冲区',
          '下游按需拉取，上游不会超过消费速度',
          '靠丢弃数据',
          '靠提高生产者优先级',
        ],
        answer: 1,
        explain: '需求由下游驱动，是结构化而非补救式的流量控制。',
        concept: 'stream',
      },
    ],
    [
      ['Chunk', 'Stream 批量传输的数据块'],
      ['Sink', '流的消费者，如 runCollect / runDrain'],
    ],
    ['把无限流直接 runCollect，等价于让程序永不结束。'],
  ),
  'practice',
)
