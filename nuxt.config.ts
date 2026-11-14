// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/a11y', '@nuxt/hints', '@nuxt/ui', '@formkit/auto-animate', '@nuxtjs/device'],
  compatibilityDate: '2026-11-13',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  // 00032：Nuxt 生成的 .nuxt/tsconfig.*.json 默认已是 target ESNext，但生成目录被忽略。
  // 这里显式固化意图，只设 target 不覆盖 lib（app / server 各自的 lib 由 Nuxt 分别生成）。
  typescript: {
    tsConfig: { compilerOptions: { target: 'ESNext' } },
  },
  // Vite 8 默认 baseline-widely-available 会降级较新语法；放开以允许最新 JS 特性。
  vite: {
    build: { target: 'esnext' },
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  app: {
    head: {
      title: '源悟的知识岛 · 交互式课程',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content: '源悟的知识岛：以课程为单位的交互式学习空间，首门课程为 Effect 4.1.4 深度课',
        },
        { name: 'theme-color', content: '#f5f7fb', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#10151f', media: '(prefers-color-scheme: dark)' },
      ],
    },
  },
})
