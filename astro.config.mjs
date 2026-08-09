import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://vadim.sikora.name',
  base: '/vinyl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
})
