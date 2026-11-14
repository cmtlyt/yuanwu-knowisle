import { L } from '../../course-builders.ts'

/* ========== Stage 15 ========== */

export const L92 = L(
  'L92',
  15,
  '并发与批处理：吞吐优化',
  12,
  3,
  ['L89'],
  ['concurrency-batch'],
  ['理解并发与批处理如何提升 Agent 吞吐', '掌握「有界并发」避免打爆上游', '认识批处理的收益与延迟代价'],
  `
### 能并行的并行，能批量的批量

吞吐优化两条路：**并发**（多个独立请求同时跑）和**批处理**（把多个请求合成一批，减少往返开销）。两者都能显著提升单位时间的处理量。

\`\`\` title="有界并发 + 批处理" note="关键：并发要「有界」（limit），否则上游被突发流量打爆、触发限流。"
// ① 有界并发：限制同时进行的请求数，避免打爆上游
async function runAll(tasks: string[], limit = 5) {
  const results: string[] = []
  const queue = [...tasks]
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const t = queue.shift()!
      results.push(await agent.run(t))   // 最多 limit 个并发
    }
  })
  await Promise.all(workers)
  return results
}

// ② 批处理：把多个调用合成一批，减少往返
const batch = tasks.slice(0, 20)
const responses = await client.batch(batch)   // 一次发 20 个，而非 20 次
\`\`\`

:::deep

### 并发的两个坑

① 无界并发：同时发几百个请求，上游限流/超时，反而更慢。② 共享状态竞争：并发下写共享状态（如记忆、缓存）要加锁或原子操作，否则数据竞争。

:::

### 批处理的收益与代价

- 收益：减少往返开销、部分 provider 批处理有折扣。
- 代价：批处理有「凑批」延迟（等凑够一批才发）。
- 权衡：延迟敏感场景不宜凑太大批次。

:::warn

### 并发别打爆限流

上游模型 API 有速率限制（RPM/TPM）。并发过高会触发 429，反而拖垮吞吐。并发上限要贴着限流阈值调，并配退避重试（L10）。

:::

`,
  null,
  [
    {
      text: '吞吐优化的两条路是？',
      options: ['加密、解密', '并发（并行）与批处理（合批）', '读、写', '增、删'],
      answer: 1,
      explain: '并发 + 批处理。',
      concept: 'concurrency-batch',
    },
    {
      text: '并发要「有界」的原因是？',
      options: ['代码更短', '无界并发会打爆上游、触发限流', '更快', '省内存'],
      answer: 1,
      explain: '有界避免打爆限流。',
      concept: 'concurrency-batch',
    },
    {
      text: '批处理的「凑批」代价是？',
      options: ['更贵', '凑批延迟：要等凑够一批才发', '更快', '更省'],
      answer: 1,
      explain: '凑批有延迟。',
      concept: 'concurrency-batch',
    },
  ],
  [
    ['有界并发', '限制同时请求数，避免打爆上游'],
    ['批处理', '多个请求合成一批减少往返'],
    ['限流 RPM/TPM', '上游每分钟请求/每分钟 token 限制'],
  ],
  ['无界并发，触发上游 429 限流反而更慢。', '并发写共享状态不加锁，数据竞争。'],
)
