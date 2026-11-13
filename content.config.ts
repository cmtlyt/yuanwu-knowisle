import { defineCollection, defineContentConfig, z } from '@nuxt/content'

/** 课程设计说明书等长文档走 Nuxt Content；课时内容仍是类型化 TS 数据。 */
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: 'docs/**/*.md',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    }),
  },
})
