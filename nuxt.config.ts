// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/a11y',
    '@nuxt/content',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxt/ui',
    '@formkit/auto-animate',
    '@nuxtjs/device',
  ],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
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
