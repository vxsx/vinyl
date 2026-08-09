// tests/build.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import collection from '../data/collection.json'
import wantlist from '../data/wantlist.json'

const DIST = 'dist'

describe('built site', () => {
  it('has an index and a wishlist page', () => {
    expect(existsSync(join(DIST, 'index.html'))).toBe(true)
    expect(existsSync(join(DIST, 'wishlist', 'index.html'))).toBe(true)
  })

  it('has one detail page per record', () => {
    const expected = collection.length + wantlist.length
    expect(readdirSync(join(DIST, 'record')).length).toBe(expected)
  })

  it('renders every record on the collection page', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8')
    expect((html.match(/class="sleeve"/g) ?? []).length).toBe(collection.length)
  })

  it('references no missing local images', () => {
    const pages = [
      join(DIST, 'index.html'),
      ...readdirSync(join(DIST, 'record')).map((slug) => join(DIST, 'record', slug, 'index.html')),
    ]

    const missing: string[] = []
    for (const page of pages) {
      const html = readFileSync(page, 'utf8')
      for (const match of html.matchAll(/src="([^"]+\.(?:avif|webp|jpg|png))"/g)) {
        const src = match[1]!
        if (src.startsWith('http')) continue
        const relative = src.replace(/^\/vinyl\//, '').replace(/^\//, '')
        if (!existsSync(join(DIST, relative))) missing.push(`${page} -> ${src}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('never ships the Discogs token', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      )
    const textFiles = walk(DIST).filter((f) => /\.(html|js|json|css)$/.test(f))
    const offenders = textFiles.filter((f) => /DISCOGS_TOKEN|Discogs token=/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
