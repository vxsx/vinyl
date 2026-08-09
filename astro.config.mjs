import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://vxsx.github.io',
  base: '/vinyl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
})
