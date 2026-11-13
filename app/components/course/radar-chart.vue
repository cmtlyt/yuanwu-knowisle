<script setup lang="ts">
import { esc } from '~/lib/highlight'

const props = defineProps<{ rows: Array<{ name: string; mastery: number }> }>()

const svg = computed(() => {
  const rows = props.rows
  const n = rows.length
  if (!n) return ''
  const cx = 190,
    cy = 175,
    R = 118
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
  }
  let out = ''
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const poly = rows
      .map((_, i) =>
        pt(i, R * f)
          .map((v) => v.toFixed(1))
          .join(','),
      )
      .join(' ')
    out += `<polygon points="${poly}" fill="none" stroke="currentColor" stroke-opacity="${f === 1 ? 0.35 : 0.15}" stroke-width="1"/>`
  }
  rows.forEach((_, i) => {
    const [x, y] = pt(i, R)
    out += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.18"/>`
  })
  out += `<polygon points="${rows
    .map((r, i) =>
      pt(i, R * (r.mastery / 100))
        .map((v) => v.toFixed(1))
        .join(','),
    )
    .join(' ')}" fill="#4b6fe0" fill-opacity="0.28" stroke="#4b6fe0" stroke-width="2"/>`
  rows.forEach((r, i) => {
    const [x, y] = pt(i, R * (r.mastery / 100))
    const [lx, ly] = pt(i, R + 26)
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#4b6fe0"/>`
    out += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="currentColor">${esc(r.name.slice(0, 6))}</text>`
  })
  return `<svg viewBox="0 0 380 350" style="color:var(--muted)">${out}</svg>`
})
</script>

<template>
  <div class="radar-wrap" v-html="svg" />
</template>
