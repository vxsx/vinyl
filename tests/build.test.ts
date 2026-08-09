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
    const expected = new Set([...collection, ...wantlist].map((r) => r.slug)).size
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
    let checkedCount = 0
    for (const page of pages) {
      const html = readFileSync(page, 'utf8')

      // Check src attributes
      for (const match of html.matchAll(/src="([^"]+\.(?:avif|webp|jpg|png))"/g)) {
        const src = match[1]!
        checkedCount++
        if (src.startsWith('http')) continue
        const relative = src.replace(/^\/vinyl\//, '').replace(/^\//, '')
        if (!existsSync(join(DIST, relative))) missing.push(`${page} -> ${src}`)
      }

      // Check srcset attributes
      for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
        const srcset = match[1]!
        // srcset format: "url1 280w, url2 560w, ..."
        const urls = srcset.split(',').map((entry) => entry.trim().split(/\s+/)[0])
        for (const url of urls) {
          if (!url || url.startsWith('http')) continue
          checkedCount++
          const relative = url.replace(/^\/vinyl\//, '').replace(/^\//, '')
          if (!existsSync(join(DIST, relative))) missing.push(`${page} -> ${url}`)
        }
      }
    }
    console.log(`Checked ${checkedCount} image references`)
    expect(missing).toEqual([])
  })

  it('never ships the Discogs token', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      )
    const textFiles = walk(DIST).filter((f) => /\.(html|js|json|css)$/.test(f))

    // Layer 1: Check for the actual token value (strongest check)
    const tokenValue = process.env.DISCOGS_TOKEN
    const offenders: string[] = []
    if (tokenValue && tokenValue.length > 0) {
      for (const f of textFiles) {
        if (readFileSync(f, 'utf8').includes(tokenValue)) {
          offenders.push(f)
        }
      }
    } else {
      console.warn('[warn] DISCOGS_TOKEN env var not set — token value-level check skipped')
    }

    // Layer 2: Always-on check for literal markers
    const markerOffenders = textFiles.filter((f) => /DISCOGS_TOKEN|Discogs token=/.test(readFileSync(f, 'utf8')))
    offenders.push(...markerOffenders)

    expect(offenders).toEqual([])
  })
})
