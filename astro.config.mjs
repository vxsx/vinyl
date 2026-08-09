import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://vadim.sikora.name',
  base: '/vinyl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },

  // Kept as the site-wide default because every other link on the site is a
  // bare anchor, which is the only shape Astro's tap listener can recognise —
  // it tests `event.target.tagName === "A"` with no `closest()`. The sleeves
  // wrap an <img>, so they opt into `viewport` individually; see
  // src/components/sleeve.astro.
  prefetch: { prefetchAll: true, defaultStrategy: 'tap' },
})
