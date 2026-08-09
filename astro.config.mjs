import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://vadim.sikora.name',
  base: '/vinyl',
  output: 'static',
  trailingSlash: 'always',

  // `inlineStylesheets` is the counterpart to prefetching the sleeves, not a
  // separate optimisation. `<link rel="prefetch">` fetches a document and
  // nothing inside it, so a prefetched detail page still arrived with its
  // scoped stylesheet unfetched — and the router blocks the swap on that
  // stylesheet. On a 150ms-RTT connection the first sleeve tap of a session
  // spent 280ms of its 450ms wait on that one 7kB file, every session.
  // Astro's default ('auto') left it external only because it is over the 4kB
  // inline threshold. Inlining costs ~1.6kB gzipped per detail page (269kB ->
  // 359kB if a visitor scrolls past all 57 sleeves) and removes the request.
  build: { format: 'directory', inlineStylesheets: 'always' },

  // Kept as the site-wide default because every other link on the site is a
  // bare anchor, which is the only shape Astro's tap listener can recognise —
  // it tests `event.target.tagName === "A"` with no `closest()`. The sleeves
  // wrap an <img>, so they opt into `viewport` individually; see
  // src/components/sleeve.astro.
  prefetch: { prefetchAll: true, defaultStrategy: 'tap' },
})
