<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const { data: doc } = await useAsyncData(`doc:${slug.value}`, () =>
  queryCollection('docs').path(`/docs/${slug.value}`).first(),
)
if (!doc.value) throw createError({ statusCode: 404, statusMessage: '文档不存在' })
</script>

<template>
  <div class="card">
    <div class="crumb"><NuxtLink to="/">知识岛</NuxtLink><span>/</span><span>课程文档</span></div>
    <article class="prose-doc">
      <ContentRenderer v-if="doc" :value="doc" />
    </article>
  </div>
</template>
