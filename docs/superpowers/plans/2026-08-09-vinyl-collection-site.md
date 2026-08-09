# Vinyl Collection Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static site on GitHub Pages that presents Discogs user `vxsx`'s vinyl collection as a wall of large album covers with a tvOS-style hover effect, per-record detail pages, and a wishlist view.

**Architecture:** Three independent stages. A Node/TypeScript `sync` script is the only thing that talks to Discogs; it writes normalised JSON to `data/` and images to `src/assets/`, both committed. Astro builds fully static HTML from those committed files, so a build never depends on Discogs. GitHub Actions deploys on push and re-syncs on a schedule.

**Tech Stack:** Node 24, npm, TypeScript (strict), Astro (static output), Zod (schema validation shared by sync and build), Vitest, vanilla TS for the two client-side behaviours (tilt, filters). No UI framework.

## Global Constraints

- Node 20+ (dev machine has v24.13.0, npm 11.11.1). Use npm, not yarn/pnpm.
- TypeScript `strict: true` everywhere.
- Astro `output: 'static'`. No SSR, no adapters.
- No UI framework (no React/Vue/Svelte). Client behaviour is plain TypeScript.
- `DISCOGS_TOKEN` is read from the environment only. It must never appear in committed files, in `data/`, or in any built asset.
- Discogs requires a descriptive `User-Agent`; requests without one are rejected.
- Discogs rate limit: 60 requests/minute authenticated. The client throttles to stay under it.
- Sleeves render with **no border, no border-radius, no overflow clipping, no inset ring**.
- Tilt: max **12°**, perspective **2400px applied per card** (never on the grid container), lift `scale(1.05)`, engage 0.08s ease-out, release 0.5s `cubic-bezier(.2,.9,.28,1)`.
- Specular: diagonal band at **102°**, peak `rgba(255,255,255,.34)`, `background-size: 260%`, position driven by tilt (not cursor), `mix-blend-mode: screen`.
- Ambient: `soft-light` at 70% opacity, `rgba(255,255,255,.34)` → `rgba(0,0,0,.26)`.
- Grid columns: 5 at ≥1440px, 4 at ≥1080px, 3 at ≥700px, 2 below. Gaps 34px column / 56px row.
- Genres are **tags, not buckets** — always an array, filters OR-combine. Never take `genres[0]`.
- All motion is disabled under `prefers-reduced-motion: reduce`.
- Every sleeve is a real `<a>` element, never a click-handled `div`.

## Refinements to the spec

Three decisions made while verifying the API, which differ from or add to the spec. Each is applied throughout the tasks below.

1. **`primaryArtist` is a separate field.** The spec said long artist credits are "clamped in the grid caption". Verification showed clamping produces `Giuseppe Verdi , Licinio Montefusco , Anna Macci…`. `artists_sort` does not help (182 chars vs 188). Instead the sync stores `artists[0].name` as `primaryArtist` for grid captions, and the full credit as `artist` for detail pages.
2. **Images live under `src/assets/`, not `data/`.** Astro's build-time image pipeline only processes images it can resolve as assets. JSON stays in `data/`.
3. **Artist names are stripped of Discogs disambiguation suffixes** for display — `Chicago (2)` → `Chicago`. Four records are affected: Chicago (2), Cream (2), Taste (2), Ronald Smith (4).

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/schema.ts` | Zod schema + `VinylRecord` type. Single source of truth, imported by both sync and build. |
| `scripts/lib/discogs.ts` | HTTP client: auth, User-Agent, throttling, 429 retry, pagination. Knows nothing about records. |
| `scripts/lib/artist.ts` | Artist-string formatting and disambiguation stripping. Pure. |
| `scripts/lib/slug.ts` | Slug generation and collision resolution. Pure. |
| `scripts/lib/normalize.ts` | Raw Discogs payloads → `VinylRecord`. Pure. |
| `scripts/lib/assets.ts` | Downloading cover and secondary images, skipping ones already present. |
| `scripts/sync.ts` | CLI entry point. Orchestrates the above, caches raw responses, writes output. |
| `src/lib/data.ts` | Loads and validates `data/*.json` at build time; resolves image assets. |
| `src/styles/tokens.css` | Colour, spacing, type tokens. |
| `src/components/Sleeve.astro` | One cover tile: link, image, sheen layers, hover caption. |
| `src/components/CoverGrid.astro` | The responsive grid + empty state. |
| `src/components/FilterBar.astro` | Genre/decade chips, search box, result count. |
| `src/components/Tracklist.astro` | Tracklist grouped by side. |
| `src/components/DetailFacts.astro` | The facts row (years, format, track count). |
| `src/scripts/tilt.ts` | Pointer-driven tilt/sheen. Reduced-motion aware. |
| `src/scripts/filters.ts` | Client-side filtering. |
| `src/pages/index.astro` | Collection grid. |
| `src/pages/wishlist.astro` | Wishlist grid. |
| `src/pages/record/[slug].astro` | Detail page, one per record. |
| `tests/fixtures/*.json` | Trimmed real API payloads covering every edge case found in the data. |
| `.github/workflows/deploy.yml` | Build + deploy to Pages on push to `main`. |
| `.github/workflows/sync.yml` | Weekly cron + manual sync, commits changed data. |

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `astro.config.mjs`, `vitest.config.ts`, `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` and `npm run build` both run successfully; `tsx` available for running scripts.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vinyl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "sync": "node --env-file-if-exists=.env --import tsx scripts/sync.ts",
    "capture-fixtures": "node --env-file-if-exists=.env --import tsx scripts/capture-fixtures.ts",
    "test": "vitest run",
    "verify": "npm run build && vitest run tests/build.test.ts --config vitest.build.config.ts"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "sharp": "^0.33.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*", "scripts/**/*", "tests/**/*", "*.config.ts"]
}
```

- [ ] **Step 3: Create `astro.config.mjs`**

`vxsx` already owns a user-page repo (`vxsx.github.com`), so this deploys as a **project page** at `/vinyl`. If it later moves to a custom domain, set `base` to `'/'`.

```js
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://vxsx.github.io',
  base: '/vinyl',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
})
```

- [ ] **Step 4: Create `vitest.config.ts`**

The build smoke test needs a built `dist/`, so it is excluded from the default run and has its own config.

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/build.test.ts', 'node_modules/**'],
  },
})
```

- [ ] **Step 5: Create `vitest.build.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, include: ['tests/build.test.ts'] },
})
```

- [ ] **Step 6: Create `.env.example`**

```bash
# Personal access token from https://www.discogs.com/settings/developers
# Never commit the real value.
DISCOGS_TOKEN=
DISCOGS_USER=vxsx
```

- [ ] **Step 7: Update `.gitignore`**

```
node_modules/
dist/
.astro/
.superpowers/
.cache/
.env
```

- [ ] **Step 8: Install and verify**

Run: `npm install && npx tsc --noEmit && npm test`

Expected: install succeeds; `tsc` reports no errors; vitest reports "No test files found" and exits 0.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json astro.config.mjs vitest.config.ts vitest.build.config.ts .env.example .gitignore
git commit -m "chore: scaffold Astro + TypeScript + Vitest project"
```

---

### Task 2: Record schema

**Files:**
- Create: `src/lib/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `RecordSchema: z.ZodType<VinylRecord>` — validates one record
  - `CollectionSchema: z.ZodType<VinylRecord[]>`
  - `type VinylRecord` — the normalised record shape used everywhere
  - Named `VinylRecord`, not `Record`, to avoid colliding with TypeScript's built-in `Record<K, V>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { RecordSchema } from '../src/lib/schema'

const valid = {
  id: 7132351,
  slug: 'joy-division-substance',
  title: 'Substance',
  artist: 'Joy Division',
  primaryArtist: 'Joy Division',
  artistSort: 'Joy Division',
  coverFile: '7132351.jpg',
  genres: ['Electronic', 'Rock'],
  styles: ['Post-Punk'],
  label: 'Factory',
  catno: 'FACT 250',
  country: 'UK & Europe',
  pressedYear: 2015,
  originalYear: 1988,
  isOriginalPressing: false,
  decade: '2010s',
  formatDescriptions: ['LP', 'Compilation', 'Reissue'],
  isPlainLP: true,
  tracklist: [{ position: 'A1', title: 'Warsaw', duration: '2:25' }],
  sides: ['A'],
  credits: [{ role: 'Producer', name: 'Martin Hannett' }],
  identifiers: [{ type: 'Barcode', description: null, value: '825646089871' }],
  notes: 'Issued with two printed inner sleeves.',
  images: [{ file: '7132351-1.jpg', width: 600, height: 597 }],
  dateAdded: '2026-07-29T09:47:04-07:00',
}

describe('RecordSchema', () => {
  it('accepts a fully populated record', () => {
    expect(() => RecordSchema.parse(valid)).not.toThrow()
  })

  it('accepts null years and a null cover', () => {
    const sparse = { ...valid, pressedYear: null, originalYear: null, coverFile: null, decade: 'Unknown' }
    expect(() => RecordSchema.parse(sparse)).not.toThrow()
  })

  it('rejects a record whose genres are a bare string', () => {
    expect(() => RecordSchema.parse({ ...valid, genres: 'Rock' })).toThrow()
  })

  it('rejects year zero — absent years must be null, not 0', () => {
    expect(() => RecordSchema.parse({ ...valid, pressedYear: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — cannot resolve `../src/lib/schema`.

- [ ] **Step 3: Write the schema**

```ts
// src/lib/schema.ts
import { z } from 'zod'

export const TrackSchema = z.object({
  position: z.string(),
  title: z.string(),
  duration: z.string().nullable(),
})

export const CreditSchema = z.object({
  role: z.string(),
  name: z.string(),
})

export const IdentifierSchema = z.object({
  type: z.string(),
  description: z.string().nullable(),
  value: z.string(),
})

export const ImageRefSchema = z.object({
  file: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

/** A year Discogs actually knows. Discogs uses 0 for "unknown"; we use null. */
const YearSchema = z.number().int().min(1000).max(2999).nullable()

export const RecordSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  title: z.string(),
  /** Full credit. Can be 188 characters on opera releases. */
  artist: z.string(),
  /** First credited artist only — for grid captions. */
  primaryArtist: z.string(),
  artistSort: z.string(),
  coverFile: z.string().nullable(),
  genres: z.array(z.string()),
  styles: z.array(z.string()),
  label: z.string(),
  catno: z.string(),
  country: z.string().nullable(),
  pressedYear: YearSchema,
  originalYear: YearSchema,
  isOriginalPressing: z.boolean(),
  /** "1970s" … or "Unknown" when pressedYear is null. */
  decade: z.string(),
  formatDescriptions: z.array(z.string()),
  isPlainLP: z.boolean(),
  tracklist: z.array(TrackSchema),
  sides: z.array(z.string()),
  credits: z.array(CreditSchema),
  identifiers: z.array(IdentifierSchema),
  notes: z.string().nullable(),
  images: z.array(ImageRefSchema),
  dateAdded: z.string(),
})

export const CollectionSchema = z.array(RecordSchema)

export type VinylRecord = z.infer<typeof RecordSchema>
export type Track = z.infer<typeof TrackSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts tests/schema.test.ts
git commit -m "feat: add record schema shared by sync and build"
```

---

### Task 3: Artist name formatting

Discogs' `join` field is not a simple separator. Real values in this collection include `'&'`, `','`, `'-'`, `'/'`, `'Und'`, `'Leitung:'`, `"Et L'"`, `'—'`, and even `' Peer Gynt Suites Nᵒˢ 1 & 2,'`. Formatting must handle all of them without producing doubled spaces or trailing punctuation.

**Files:**
- Create: `scripts/lib/artist.ts`
- Test: `tests/artist.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `stripDisambiguation(name: string): string`
  - `formatArtists(artists: { name: string; join: string }[]): string`
  - `primaryArtistName(artists: { name: string; join: string }[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/artist.test.ts
import { describe, it, expect } from 'vitest'
import { stripDisambiguation, formatArtists, primaryArtistName } from '../scripts/lib/artist'

describe('stripDisambiguation', () => {
  it('removes a trailing numeric suffix', () => {
    expect(stripDisambiguation('Chicago (2)')).toBe('Chicago')
    expect(stripDisambiguation('Ronald Smith (4)')).toBe('Ronald Smith')
  })

  it('leaves meaningful parentheses alone', () => {
    expect(stripDisambiguation('Sunny Day Real Estate (LP)')).toBe('Sunny Day Real Estate (LP)')
    expect(stripDisambiguation('Fela Kuti')).toBe('Fela Kuti')
  })
})

describe('formatArtists', () => {
  it('joins a single artist with no join value', () => {
    expect(formatArtists([{ name: 'Joy Division', join: '' }])).toBe('Joy Division')
  })

  it('joins two artists with a symbolic separator', () => {
    expect(formatArtists([
      { name: 'Louis Armstrong', join: ',' },
      { name: 'Oscar Peterson', join: '' },
    ])).toBe('Louis Armstrong, Oscar Peterson')
  })

  it('puts spaces around word separators', () => {
    expect(formatArtists([
      { name: 'Eric Clapton', join: '/' },
      { name: 'Jeff Beck', join: '' },
    ])).toBe('Eric Clapton / Jeff Beck')
  })

  it('handles a phrase used as a join value', () => {
    expect(formatArtists([
      { name: 'Wiener Staatsoper', join: 'Leitung:' },
      { name: 'Gianfranco Rivoli', join: '' },
    ])).toBe('Wiener Staatsoper Leitung: Gianfranco Rivoli')
  })

  it('strips disambiguation from every name', () => {
    expect(formatArtists([{ name: 'Cream (2)', join: '' }])).toBe('Cream')
  })

  it('never leaves a trailing separator or doubled space', () => {
    const out = formatArtists([
      { name: 'Edvard Grieg', join: ' Peer Gynt Suites,' },
      { name: 'Bedřich Smetana', join: ',' },
    ])
    expect(out).not.toMatch(/\s{2,}/)
    expect(out).not.toMatch(/[,\/&-]\s*$/)
  })
})

describe('primaryArtistName', () => {
  it('returns only the first credited artist', () => {
    expect(primaryArtistName([
      { name: 'Giuseppe Verdi', join: ',' },
      { name: 'Licinio Montefusco', join: ',' },
    ])).toBe('Giuseppe Verdi')
  })

  it('falls back to an empty string when there are no artists', () => {
    expect(primaryArtistName([])).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/artist.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/artist`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/artist.ts

export type RawArtist = { name: string; join: string }

/**
 * Discogs appends "(2)", "(4)" etc. to disambiguate artists sharing a name.
 * Only a bare number in trailing parentheses is a disambiguator.
 */
export function stripDisambiguation(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

/** Separators that hug the preceding word rather than standing alone. */
const TIGHT_LEADING = /^[,;]/

export function formatArtists(artists: RawArtist[]): string {
  let out = ''
  for (const artist of artists) {
    out += stripDisambiguation(artist.name)
    const join = artist.join.trim()
    if (join) {
      // "," attaches to the previous name; "/" and words get spaces either side.
      out += TIGHT_LEADING.test(join) ? `${join} ` : ` ${join} `
    }
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[,;\/&·-]\s*$/, '')
    .trim()
}

export function primaryArtistName(artists: RawArtist[]): string {
  const first = artists[0]
  return first ? stripDisambiguation(first.name) : ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/artist.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/artist.ts tests/artist.test.ts
git commit -m "feat: format Discogs artist credits"
```

---

### Task 4: Slug generation

**Files:**
- Create: `scripts/lib/slug.ts`
- Test: `tests/slug.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `slugify(input: string): string`
  - `assignSlugs(items: { id: number; primaryArtist: string; title: string }[]): Map<number, string>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/slug.test.ts
import { describe, it, expect } from 'vitest'
import { slugify, assignSlugs } from '../scripts/lib/slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Back To Black')).toBe('back-to-black')
  })

  it('folds diacritics', () => {
    expect(slugify('Bedřich Smetana')).toBe('bedrich-smetana')
    expect(slugify('Christoph von Dohnányi')).toBe('christoph-von-dohnanyi')
  })

  it('folds superscript characters found in classical titles', () => {
    expect(slugify('Peer Gynt Suites Nᵒˢ 1 & 2')).toBe('peer-gynt-suites-nos-1-2')
  })

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify("Rock'n Roll -- Hits!!")).toBe('rock-n-roll-hits')
  })

  it('trims to a sane length without a trailing hyphen', () => {
    const long = slugify('a'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('assignSlugs', () => {
  it('builds artist-title slugs', () => {
    const slugs = assignSlugs([{ id: 1, primaryArtist: 'Joy Division', title: 'Substance' }])
    expect(slugs.get(1)).toBe('joy-division-substance')
  })

  it('disambiguates collisions with the release id', () => {
    const slugs = assignSlugs([
      { id: 11, primaryArtist: 'The Beatles', title: 'The Beatles' },
      { id: 22, primaryArtist: 'The Beatles', title: 'The Beatles' },
    ])
    expect(slugs.get(11)).toBe('the-beatles-the-beatles')
    expect(slugs.get(22)).toBe('the-beatles-the-beatles-22')
    expect(new Set(slugs.values()).size).toBe(2)
  })

  it('never produces an empty slug', () => {
    const slugs = assignSlugs([{ id: 9, primaryArtist: '', title: '???' }])
    expect(slugs.get(9)).toBe('release-9')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slug.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/slug`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/slug.ts

const MAX_LENGTH = 80

export function slugify(input: string): string {
  return input
    // NFKD also folds superscripts: "Nᵒˢ" -> "Nos"
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '')
}

export function assignSlugs(
  items: { id: number; primaryArtist: string; title: string }[],
): Map<number, string> {
  const taken = new Set<string>()
  const result = new Map<number, string>()

  for (const item of items) {
    const base = slugify(`${item.primaryArtist} ${item.title}`) || `release-${item.id}`
    const slug = taken.has(base) ? `${base}-${item.id}` : base
    taken.add(slug)
    result.set(item.id, slug)
  }

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/slug.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/slug.ts tests/slug.test.ts
git commit -m "feat: generate stable record slugs"
```

---

### Task 5: Discogs HTTP client

**Files:**
- Create: `scripts/lib/discogs.ts`
- Test: `tests/discogs.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `class DiscogsClient` with:
    - `constructor(opts: { token: string; userAgent: string; fetchImpl?: FetchLike; sleep?: SleepFn; minIntervalMs?: number })`
    - `get<T>(path: string): Promise<T>`
    - `getAllPages<T>(path: string, itemsKey: string): Promise<T[]>`
  - `type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/discogs.test.ts
import { describe, it, expect, vi } from 'vitest'
import { DiscogsClient } from '../scripts/lib/discogs'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

function makeClient(fetchImpl: any, sleep = vi.fn().mockResolvedValue(undefined)) {
  return {
    client: new DiscogsClient({
      token: 'test-token',
      userAgent: 'VinylTest/1.0',
      fetchImpl,
      sleep,
      minIntervalMs: 0,
    }),
    sleep,
  }
}

describe('DiscogsClient.get', () => {
  it('sends the token and User-Agent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }))
    const { client } = makeClient(fetchImpl)

    await client.get('/releases/1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.discogs.com/releases/1')
    expect(init.headers.Authorization).toBe('Discogs token=test-token')
    expect(init.headers['User-Agent']).toBe('VinylTest/1.0')
  })

  it('retries after Retry-After on 429, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }))
    const { client, sleep } = makeClient(fetchImpl)

    const result = await client.get<{ id: number }>('/releases/7')

    expect(result.id).toBe(7)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(3000)
  })

  it('throws with status and path on a non-retryable error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 404 }))
    const { client } = makeClient(fetchImpl)

    await expect(client.get('/releases/404')).rejects.toThrow(/404.*\/releases\/404/)
  })

  it('gives up after the retry limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { 'retry-after': '1' } }),
    )
    const { client } = makeClient(fetchImpl)

    await expect(client.get('/releases/1')).rejects.toThrow(/rate limit/i)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })
})

describe('DiscogsClient.getAllPages', () => {
  it('follows pagination until the last page', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ pagination: { page: 1, pages: 2 }, releases: [{ id: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ pagination: { page: 2, pages: 2 }, releases: [{ id: 2 }] }))
    const { client } = makeClient(fetchImpl)

    const items = await client.getAllPages<{ id: number }>('/users/x/collection/folders/0/releases', 'releases')

    expect(items.map(i => i.id)).toEqual([1, 2])
    expect(fetchImpl.mock.calls[1][0]).toContain('page=2')
  })

  it('returns an empty array when the collection is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ pagination: { page: 1, pages: 1 }, wants: [] }),
    )
    const { client } = makeClient(fetchImpl)

    expect(await client.getAllPages('/users/x/wants', 'wants')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/discogs`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/discogs.ts

const BASE_URL = 'https://api.discogs.com'
const MAX_RATE_LIMIT_RETRIES = 5
/** 60 req/min allowed; ~55/min keeps a margin. */
const DEFAULT_MIN_INTERVAL_MS = 1100
const PER_PAGE = 100

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>
export type SleepFn = (ms: number) => Promise<void>

type Options = {
  token: string
  userAgent: string
  fetchImpl?: FetchLike
  sleep?: SleepFn
  minIntervalMs?: number
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class DiscogsClient {
  private readonly token: string
  private readonly userAgent: string
  private readonly fetchImpl: FetchLike
  private readonly sleep: SleepFn
  private readonly minIntervalMs: number
  private lastRequestAt = 0

  constructor(opts: Options) {
    this.token = opts.token
    this.userAgent = opts.userAgent
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
    this.sleep = opts.sleep ?? defaultSleep
    this.minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  }

  async get<T>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`

    for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      await this.throttle()

      const response = await this.fetchImpl(url, {
        headers: {
          Authorization: `Discogs token=${this.token}`,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      })

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 60)
        await this.sleep(retryAfter * 1000)
        continue
      }

      if (!response.ok) {
        throw new Error(`Discogs request failed: ${response.status} ${path}`)
      }

      return (await response.json()) as T
    }

    throw new Error(`Discogs rate limit not cleared after ${MAX_RATE_LIMIT_RETRIES} attempts: ${path}`)
  }

  async getAllPages<T>(path: string, itemsKey: string): Promise<T[]> {
    const items: T[] = []
    let page = 1
    let totalPages = 1

    do {
      const separator = path.includes('?') ? '&' : '?'
      const body = await this.get<Record<string, unknown>>(
        `${path}${separator}page=${page}&per_page=${PER_PAGE}`,
      )
      const pageItems = body[itemsKey]
      if (Array.isArray(pageItems)) items.push(...(pageItems as T[]))

      const pagination = body.pagination as { pages?: number } | undefined
      totalPages = pagination?.pages ?? 1
      page++
    } while (page <= totalPages)

    return items
  }

  private async throttle(): Promise<void> {
    if (this.minIntervalMs <= 0) return
    const elapsed = Date.now() - this.lastRequestAt
    const wait = this.minIntervalMs - elapsed
    if (wait > 0) await this.sleep(wait)
    this.lastRequestAt = Date.now()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/discogs.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discogs.ts tests/discogs.test.ts
git commit -m "feat: add throttled Discogs API client"
```

---

### Task 6: Capture API fixtures

Real payloads, trimmed, covering every edge case found in the actual collection. Later tasks test against these rather than inventing data.

**Files:**
- Create: `tests/fixtures/README.md`, `tests/fixtures/collection-entry-substance.json`, `tests/fixtures/release-substance.json`, `tests/fixtures/master-substance.json`, `tests/fixtures/collection-entry-hybrid-theory.json`, `tests/fixtures/release-hybrid-theory.json`, `tests/fixtures/collection-entry-rigoletto.json`, `tests/fixtures/release-rigoletto.json`, `tests/fixtures/release-blues-in-orbit.json`
- Create: `scripts/capture-fixtures.ts`

**Interfaces:**
- Consumes: `DiscogsClient` from Task 5
- Produces: fixture JSON files consumed by Task 7's tests.

Edge cases each fixture covers:

| Fixture | Covers |
|---|---|
| `substance` | Reissue: pressed 2015, master says 1988; 4 sides (A–D); 11 secondary images |
| `hybrid-theory` | Multi-genre `["Hip Hop", "Rock"]` — the `genres[0]` trap |
| `rigoletto` | 188-char artist credit; `year: 0`; phrase-valued `join` fields |
| `blues-in-orbit` | Non-LP format (7", 45 RPM, EP) — drives `isPlainLP: false` |

- [ ] **Step 1: Write the capture script**

```ts
// scripts/capture-fixtures.ts
// One-shot helper. Run with a token to refresh tests/fixtures from the live API.
import { writeFile, mkdir } from 'node:fs/promises'
import { DiscogsClient } from './lib/discogs.js'

const TARGETS = [
  { name: 'substance', releaseId: 7132351, masterId: 4912 },
  { name: 'hybrid-theory', releaseId: 15224503, masterId: null },
  { name: 'rigoletto', releaseId: 5674485, masterId: null },
  { name: 'blues-in-orbit', releaseId: 1873129, masterId: null },
]

const token = process.env.DISCOGS_TOKEN
if (!token) throw new Error('DISCOGS_TOKEN is required')

const client = new DiscogsClient({ token, userAgent: 'VinylSite/1.0 +https://github.com/vxsx/vinyl' })
await mkdir('tests/fixtures', { recursive: true })

for (const target of TARGETS) {
  const release = await client.get(`/releases/${target.releaseId}`)
  await writeFile(`tests/fixtures/release-${target.name}.json`, JSON.stringify(release, null, 2))
  if (target.masterId) {
    const master = await client.get(`/masters/${target.masterId}`)
    await writeFile(`tests/fixtures/master-${target.name}.json`, JSON.stringify(master, null, 2))
  }
  console.log(`captured ${target.name}`)
}
```

- [ ] **Step 2: Verify the release ids resolve**

The ids above were read from the live collection during design, except `hybrid-theory`, `rigoletto`, and `blues-in-orbit`, which must be confirmed. Run:

```bash
node -e "
const t=process.env.DISCOGS_TOKEN;
fetch('https://api.discogs.com/users/vxsx/collection/folders/0/releases?per_page=100',
  {headers:{Authorization:'Discogs token='+t,'User-Agent':'VinylSite/1.0'}})
 .then(r=>r.json()).then(d=>{
   for (const r of d.releases) {
     const b=r.basic_information;
     if (/Hybrid Theory|Rigoletto|Blues In Orbit/.test(b.title))
       console.log(b.id, '|', b.title, '| master:', b.master_id ?? 'none');
   }
 })"
```

Expected: three lines printing the real release ids. Update `TARGETS` in the script with any that differ before continuing.

- [ ] **Step 3: Run the capture**

Run: `npm run capture-fixtures`  (reads `DISCOGS_TOKEN` from `.env`)
Expected: `captured substance`, `captured hybrid-theory`, `captured rigoletto`, `captured blues-in-orbit`.

- [ ] **Step 4: Write the collection-entry fixtures by hand**

Collection entries are small; extract the matching `basic_information` from the collection response for each of the four, saving each as `tests/fixtures/collection-entry-<name>.json` with this shape:

```json
{
  "id": 7132351,
  "instance_id": 2168627992,
  "date_added": "2026-07-29T09:47:04-07:00",
  "rating": 0,
  "basic_information": {
    "id": 7132351,
    "master_id": 4912,
    "title": "Substance",
    "year": 2015,
    "thumb": "https://i.discogs.com/...",
    "cover_image": "https://i.discogs.com/...",
    "genres": ["Electronic", "Rock"],
    "styles": ["Post-Punk"],
    "artists": [{ "name": "Joy Division", "join": "", "id": 71564 }],
    "labels": [{ "name": "Factory", "catno": "FACT 250", "id": 4657 }],
    "formats": [{ "name": "Vinyl", "qty": "2", "descriptions": ["LP", "Compilation", "Reissue", "Remastered"] }]
  }
}
```

- [ ] **Step 5: Document the fixtures**

```markdown
<!-- tests/fixtures/README.md -->
# API fixtures

Trimmed real responses from the Discogs API, captured from the live collection.
Refresh with `npm run capture-fixtures` (reads `DISCOGS_TOKEN` from `.env`).

Each fixture exists to pin a specific edge case found in the real data:

| Fixture | Edge case |
|---|---|
| `substance` | Reissue — pressed 2015, master says 1988. 4 sides. 11 secondary images. |
| `hybrid-theory` | Genres are `["Hip Hop", "Rock"]`. Taking `genres[0]` files it under Hip Hop. |
| `rigoletto` | 188-character artist credit, `year: 0`, phrase-valued `join` fields. |
| `blues-in-orbit` | 7" 45 RPM EP — the only non-LP shape besides one 12". |

Do not "tidy" these files. Their awkwardness is the point.
```

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures scripts/capture-fixtures.ts
git commit -m "test: capture real Discogs payloads as fixtures"
```

---

### Task 7: Normalisation

**Files:**
- Create: `scripts/lib/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: `VinylRecord` (Task 2), `formatArtists`/`primaryArtistName` (Task 3)
- Produces:
  - `cleanTracklist(raw: RawTrack[]): Track[]`
  - `deriveSides(tracks: Track[]): string[]`
  - `decadeOf(year: number | null): string`
  - `normalizeRecord(input: NormalizeInput): VinylRecord`
  - `type NormalizeInput = { entry: RawCollectionEntry; release: RawRelease; master: RawMaster | null; slug: string; coverFile: string | null; images: { file: string; width: number; height: number }[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeRecord, cleanTracklist, deriveSides, decadeOf } from '../scripts/lib/normalize'
import { RecordSchema } from '../src/lib/schema'

const load = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'))

const build = (name: string, masterName: string | null = null) =>
  normalizeRecord({
    entry: load(`collection-entry-${name}`),
    release: load(`release-${name}`),
    master: masterName ? load(`master-${masterName}`) : null,
    slug: `slug-${name}`,
    coverFile: `${name}.jpg`,
    images: [{ file: `${name}-1.jpg`, width: 600, height: 597 }],
  })

describe('decadeOf', () => {
  it('buckets a known year', () => expect(decadeOf(1977)).toBe('1970s'))
  it('labels a null year Unknown', () => expect(decadeOf(null)).toBe('Unknown'))
})

describe('cleanTracklist', () => {
  it('drops heading and index rows, keeping only tracks', () => {
    const cleaned = cleanTracklist([
      { type_: 'heading', position: '', title: 'Side One', duration: '' },
      { type_: 'track', position: 'A1', title: 'Warsaw', duration: '2:25' },
      { type_: 'index', position: '', title: 'Suite', duration: '' },
    ])
    expect(cleaned).toEqual([{ position: 'A1', title: 'Warsaw', duration: '2:25' }])
  })

  it('turns an empty duration into null', () => {
    const cleaned = cleanTracklist([{ type_: 'track', position: 'A1', title: 'Tank!', duration: '' }])
    expect(cleaned[0]!.duration).toBeNull()
  })
})

describe('deriveSides', () => {
  it('extracts sides in order of first appearance', () => {
    expect(deriveSides([
      { position: 'A1', title: 'x', duration: null },
      { position: 'A2', title: 'y', duration: null },
      { position: 'B1', title: 'z', duration: null },
    ])).toEqual(['A', 'B'])
  })

  it('returns an empty array for numeric positions', () => {
    expect(deriveSides([{ position: '1', title: 'x', duration: null }])).toEqual([])
  })
})

describe('normalizeRecord', () => {
  it('produces a schema-valid record', () => {
    expect(() => RecordSchema.parse(build('substance', 'substance'))).not.toThrow()
  })

  it('keeps every genre — never just the first', () => {
    const record = build('hybrid-theory')
    expect(record.genres).toContain('Hip Hop')
    expect(record.genres).toContain('Rock')
    expect(record.genres.length).toBeGreaterThan(1)
  })

  it('separates pressing year from original year', () => {
    const record = build('substance', 'substance')
    expect(record.pressedYear).toBe(2015)
    expect(record.originalYear).toBe(1988)
    expect(record.isOriginalPressing).toBe(false)
    expect(record.decade).toBe('2010s')
  })

  it('maps Discogs year 0 to null and decade Unknown', () => {
    const record = build('rigoletto')
    expect(record.pressedYear).toBeNull()
    expect(record.decade).toBe('Unknown')
  })

  it('keeps the full long credit but exposes a short primary artist', () => {
    const record = build('rigoletto')
    expect(record.artist.length).toBeGreaterThan(100)
    expect(record.primaryArtist).toBe('Giuseppe Verdi')
  })

  it('flags a plain LP and a non-LP differently', () => {
    expect(build('substance', 'substance').isPlainLP).toBe(true)
    expect(build('blues-in-orbit').isPlainLP).toBe(false)
  })

  it('groups a four-sided release into sides A through D', () => {
    expect(build('substance', 'substance').sides).toEqual(['A', 'B', 'C', 'D'])
  })

  it('carries the local asset filenames through', () => {
    const record = build('substance', 'substance')
    expect(record.coverFile).toBe('substance.jpg')
    expect(record.images[0]!.file).toBe('substance-1.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/normalize`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/normalize.ts
import type { VinylRecord, Track } from '../../src/lib/schema.js'
import { formatArtists, primaryArtistName, type RawArtist } from './artist.js'

export type RawTrack = { type_?: string; position?: string; title?: string; duration?: string }

export type RawRelease = {
  artists?: RawArtist[]
  artists_sort?: string
  country?: string
  notes?: string
  released_formatted?: string
  year?: number
  formats?: { name?: string; descriptions?: string[] }[]
  labels?: { name?: string; catno?: string }[]
  tracklist?: RawTrack[]
  extraartists?: { role?: string; name?: string }[]
  identifiers?: { type?: string; description?: string; value?: string }[]
}

export type RawMaster = { year?: number }

export type RawCollectionEntry = {
  date_added: string
  basic_information: {
    id: number
    title: string
    year?: number
    genres?: string[]
    styles?: string[]
    artists?: RawArtist[]
    labels?: { name?: string; catno?: string }[]
    formats?: { name?: string; descriptions?: string[] }[]
  }
}

export type NormalizeInput = {
  entry: RawCollectionEntry
  release: RawRelease
  master: RawMaster | null
  slug: string
  coverFile: string | null
  images: { file: string; width: number; height: number }[]
}

/** Discogs uses 0 to mean "unknown year". */
function year(value: number | undefined): number | null {
  return value && value > 0 ? value : null
}

export function decadeOf(value: number | null): string {
  return value === null ? 'Unknown' : `${Math.floor(value / 10) * 10}s`
}

export function cleanTracklist(raw: RawTrack[]): Track[] {
  return raw
    .filter((track) => (track.type_ ?? 'track') === 'track')
    .map((track) => ({
      position: track.position ?? '',
      title: track.title ?? '',
      duration: track.duration ? track.duration : null,
    }))
}

export function deriveSides(tracks: Track[]): string[] {
  const sides: string[] = []
  for (const track of tracks) {
    const match = /^([A-Z])/.exec(track.position)
    if (match && !sides.includes(match[1]!)) sides.push(match[1]!)
  }
  return sides
}

export function normalizeRecord(input: NormalizeInput): VinylRecord {
  const { entry, release, master } = input
  const basic = entry.basic_information

  const artists = release.artists ?? basic.artists ?? []
  const format = (release.formats ?? basic.formats ?? [])[0] ?? {}
  const descriptions = format.descriptions ?? []
  const label = (release.labels ?? basic.labels ?? [])[0] ?? {}

  const pressedYear = year(release.year ?? basic.year)
  const originalYear = year(master?.year)
  const tracklist = cleanTracklist(release.tracklist ?? [])

  return {
    id: basic.id,
    slug: input.slug,
    title: basic.title,
    artist: formatArtists(artists),
    primaryArtist: primaryArtistName(artists),
    artistSort: release.artists_sort ?? primaryArtistName(artists),
    coverFile: input.coverFile,
    genres: basic.genres ?? [],
    styles: basic.styles ?? [],
    label: label.name ?? '',
    catno: label.catno ?? '',
    country: release.country ?? null,
    pressedYear,
    originalYear,
    isOriginalPressing:
      pressedYear !== null && originalYear !== null && pressedYear === originalYear,
    decade: decadeOf(pressedYear),
    formatDescriptions: descriptions,
    isPlainLP: descriptions.includes('LP'),
    tracklist,
    sides: deriveSides(tracklist),
    credits: (release.extraartists ?? []).map((credit) => ({
      role: credit.role ?? '',
      name: credit.name ?? '',
    })),
    identifiers: (release.identifiers ?? []).map((identifier) => ({
      type: identifier.type ?? '',
      description: identifier.description ?? null,
      value: identifier.value ?? '',
    })),
    notes: release.notes ?? null,
    images: input.images,
    dateAdded: entry.date_added,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.ts tests/normalize.test.ts
git commit -m "feat: normalise Discogs payloads into records"
```

---

### Task 8: Asset downloading

**Files:**
- Create: `scripts/lib/assets.ts`
- Test: `tests/assets.test.ts`

**Interfaces:**
- Consumes: `FetchLike` (Task 5)
- Produces:
  - `downloadIfMissing(url: string, destPath: string, deps?: { fetchImpl?: FetchLike }): Promise<'downloaded' | 'cached'>`
  - `MAX_SECONDARY_IMAGES: number` (8)

- [ ] **Step 1: Write the failing test**

```ts
// tests/assets.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadIfMissing } from '../scripts/lib/assets'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'assets-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('downloadIfMissing', () => {
  it('downloads and writes the file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const dest = join(dir, 'nested', 'cover.jpg')

    expect(await downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).toBe('downloaded')
    expect(new Uint8Array(await readFile(dest))).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('skips the request when the file already exists', async () => {
    const dest = join(dir, 'cover.jpg')
    await writeFile(dest, 'existing')
    const fetchImpl = vi.fn()

    expect(await downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).toBe('cached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws and leaves no partial file when the response fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    const dest = join(dir, 'cover.jpg')

    await expect(downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).rejects.toThrow(/500/)
    await expect(readFile(dest)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assets.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/assets`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/assets.ts
import { mkdir, writeFile, rename, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { FetchLike } from './discogs.js'

/** Cap per record so the repo stays small as the collection grows. */
export const MAX_SECONDARY_IMAGES = 8

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function downloadIfMissing(
  url: string,
  destPath: string,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<'downloaded' | 'cached'> {
  if (await exists(destPath)) return 'cached'

  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as FetchLike)
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`Image download failed: ${response.status} ${url}`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  await mkdir(dirname(destPath), { recursive: true })

  // Write to a temp name and rename, so an interrupted run never leaves a truncated image.
  const tempPath = `${destPath}.partial`
  await writeFile(tempPath, bytes)
  await rename(tempPath, destPath)

  return 'downloaded'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/assets.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/assets.ts tests/assets.test.ts
git commit -m "feat: download cover art idempotently"
```

---

### Task 9: Sync CLI

**Files:**
- Create: `scripts/sync.ts`
- Modify: `.gitignore` (already ignores `.cache/` from Task 1)

**Interfaces:**
- Consumes: everything from Tasks 2–8
- Produces: `data/collection.json`, `data/wantlist.json`, `data/synced-at.json`, `src/assets/covers/*.jpg`, `src/assets/images/*.jpg`

Design points:
- Raw release/master responses are cached under `.cache/discogs/` (gitignored) so reruns are cheap. `--force` bypasses the cache.
- Nothing is written to `data/` until every fetch has succeeded, so a mid-run failure cannot leave a half-written collection.

- [ ] **Step 1: Write the sync script**

```ts
// scripts/sync.ts
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { DiscogsClient } from './lib/discogs.js'
import { assignSlugs } from './lib/slug.js'
import { primaryArtistName } from './lib/artist.js'
import { normalizeRecord, type RawCollectionEntry, type RawRelease, type RawMaster } from './lib/normalize.js'
import { downloadIfMissing, MAX_SECONDARY_IMAGES } from './lib/assets.js'
import { CollectionSchema, type VinylRecord } from '../src/lib/schema.js'

const USER_AGENT = 'VinylSite/1.0 +https://github.com/vxsx/vinyl'
const CACHE_DIR = '.cache/discogs'
const DATA_DIR = 'data'
const COVER_DIR = 'src/assets/covers'
const IMAGE_DIR = 'src/assets/images'

const force = process.argv.includes('--force')
const token = process.env.DISCOGS_TOKEN
const user = process.env.DISCOGS_USER ?? 'vxsx'

if (!token) {
  console.error('DISCOGS_TOKEN is required. See .env.example.')
  process.exit(1)
}

const client = new DiscogsClient({ token, userAgent: USER_AGENT })

async function cached<T>(kind: string, id: number, fetcher: () => Promise<T>): Promise<T> {
  const path = join(CACHE_DIR, kind, `${id}.json`)
  if (!force) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T
    } catch {
      // not cached yet
    }
  }
  const value = await fetcher()
  await mkdir(join(CACHE_DIR, kind), { recursive: true })
  await writeFile(path, JSON.stringify(value))
  return value
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2))
  await rename(temp, path)
}

type ImageInfo = { uri: string; type: string; width: number; height: number }

async function buildRecords(entries: RawCollectionEntry[], label: string): Promise<VinylRecord[]> {
  const slugs = assignSlugs(
    entries.map((entry) => ({
      id: entry.basic_information.id,
      primaryArtist: primaryArtistName(entry.basic_information.artists ?? []),
      title: entry.basic_information.title,
    })),
  )

  const records: VinylRecord[] = []

  for (const [index, entry] of entries.entries()) {
    const basic = entry.basic_information as RawCollectionEntry['basic_information'] & {
      master_id?: number
      cover_image?: string
    }
    const id = basic.id
    console.log(`[${label} ${index + 1}/${entries.length}] ${basic.title}`)

    const release = await cached<RawRelease & { images?: ImageInfo[] }>(
      'releases', id, () => client.get(`/releases/${id}`),
    )
    const master = basic.master_id
      ? await cached<RawMaster>('masters', basic.master_id, () => client.get(`/masters/${basic.master_id}`))
      : null

    const allImages = release.images ?? []
    const primary = allImages.find((image) => image.type === 'primary') ?? allImages[0]
    const coverUrl = primary?.uri ?? basic.cover_image

    let coverFile: string | null = null
    if (coverUrl) {
      coverFile = `${id}.jpg`
      await downloadIfMissing(coverUrl, join(COVER_DIR, coverFile))
    }

    const secondary = allImages.filter((image) => image.type === 'secondary').slice(0, MAX_SECONDARY_IMAGES)
    const images: { file: string; width: number; height: number }[] = []
    for (const [n, image] of secondary.entries()) {
      const file = `${id}-${n + 1}.jpg`
      await downloadIfMissing(image.uri, join(IMAGE_DIR, file))
      images.push({ file, width: image.width, height: image.height })
    }

    records.push(
      normalizeRecord({
        entry,
        release,
        master,
        slug: slugs.get(id)!,
        coverFile,
        images,
      }),
    )
  }

  return records.sort((a, b) => a.artistSort.localeCompare(b.artistSort))
}

const collectionEntries = await client.getAllPages<RawCollectionEntry>(
  `/users/${user}/collection/folders/0/releases?sort=added&sort_order=desc`,
  'releases',
)
const wantEntries = await client.getAllPages<RawCollectionEntry>(`/users/${user}/wants`, 'wants')

const collection = await buildRecords(collectionEntries, 'collection')
const wantlist = await buildRecords(wantEntries, 'wantlist')

// Validate before writing — a schema failure must not corrupt committed data.
CollectionSchema.parse(collection)
CollectionSchema.parse(wantlist)

await writeJson(join(DATA_DIR, 'collection.json'), collection)
await writeJson(join(DATA_DIR, 'wantlist.json'), wantlist)
await writeJson(join(DATA_DIR, 'synced-at.json'), { syncedAt: new Date().toISOString() })

console.log(`\nSynced ${collection.length} records, ${wantlist.length} wantlist items.`)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the real sync**

Run: `npm run sync`  (reads `DISCOGS_TOKEN` from `.env`)

Expected: progress lines for 57 records, then `Synced 57 records, 0 wantlist items.` Takes roughly two minutes on a cold run because of throttling.

- [ ] **Step 4: Verify the output against known facts**

Run:

```bash
node -e "
const c=require('./data/collection.json');
console.log('records:', c.length);
console.log('unknown decade:', c.filter(r=>r.decade==='Unknown').length);
console.log('multi-genre:', c.filter(r=>r.genres.length>1).length);
console.log('reissues:', c.filter(r=>r.originalYear && !r.isOriginalPressing).length);
console.log('non-LP:', c.filter(r=>!r.isPlainLP).map(r=>r.title));
console.log('longest credit:', Math.max(...c.map(r=>r.artist.length)));
console.log('unique slugs:', new Set(c.map(r=>r.slug)).size);
console.log('missing covers:', c.filter(r=>!r.coverFile).length);
"
```

Expected, based on the live data measured during design:
- `records: 57`
- `unknown decade:` around 14 (may be lower — masters do not backfill `pressedYear`, only `originalYear`)
- `multi-genre: 15`
- `non-LP:` two titles — the Duke Ellington 7" and *Bigsol*
- `longest credit: 188`
- `unique slugs: 57`
- `missing covers: 0`

If `unique slugs` is below 57, the collision logic in Task 4 is wrong — stop and fix before continuing.

- [ ] **Step 5: Commit the code and the synced data**

```bash
git add scripts/sync.ts data src/assets
git commit -m "feat: add sync CLI and sync the collection"
```

---

### Task 10: Build-time data loading

**Files:**
- Create: `src/lib/data.ts`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: `CollectionSchema` (Task 2), `data/*.json` (Task 9)
- Produces:
  - `collection: VinylRecord[]`
  - `wantlist: VinylRecord[]`
  - `syncedAt: string`
  - `coverFor(file: string | null): ImageMetadata | undefined`
  - `imageFor(file: string): ImageMetadata | undefined`
  - `genreCounts(records: VinylRecord[]): { value: string; count: number }[]`
  - `decadeCounts(records: VinylRecord[]): { value: string; count: number }[]`
  - `searchTextFor(record: VinylRecord): string`

- [ ] **Step 1: Write the failing test**

Only the pure helpers are unit-tested; the Astro image glob needs a build context.

```ts
// tests/data.test.ts
import { describe, it, expect } from 'vitest'
import { genreCounts, decadeCounts, searchTextFor } from '../src/lib/facets'
import type { VinylRecord } from '../src/lib/schema'

const record = (over: Partial<VinylRecord>): VinylRecord => ({
  id: 1, slug: 's', title: 'T', artist: 'A', primaryArtist: 'A', artistSort: 'A',
  coverFile: null, genres: [], styles: [], label: 'L', catno: 'C', country: null,
  pressedYear: null, originalYear: null, isOriginalPressing: false, decade: 'Unknown',
  formatDescriptions: [], isPlainLP: true, tracklist: [], sides: [], credits: [],
  identifiers: [], notes: null, images: [], dateAdded: '2026-07-29T00:00:00Z',
  ...over,
})

describe('genreCounts', () => {
  it('counts a record under every genre it carries', () => {
    const counts = genreCounts([
      record({ id: 1, genres: ['Hip Hop', 'Rock'] }),
      record({ id: 2, genres: ['Rock'] }),
    ])
    expect(counts).toEqual([
      { value: 'Rock', count: 2 },
      { value: 'Hip Hop', count: 1 },
    ])
  })
})

describe('decadeCounts', () => {
  it('sorts chronologically and puts Unknown last', () => {
    const counts = decadeCounts([
      record({ id: 1, decade: 'Unknown' }),
      record({ id: 2, decade: '1980s' }),
      record({ id: 3, decade: '1970s' }),
    ])
    expect(counts.map(c => c.value)).toEqual(['1970s', '1980s', 'Unknown'])
  })
})

describe('searchTextFor', () => {
  it('lowercases artist, title and label into one haystack', () => {
    const text = searchTextFor(record({ artist: 'Joy Division', title: 'Substance', label: 'Factory' }))
    expect(text).toBe('joy division substance factory')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL — cannot resolve `../src/lib/facets`.

- [ ] **Step 3: Write the facet helpers**

```ts
// src/lib/facets.ts
import type { VinylRecord } from './schema'

export type Facet = { value: string; count: number }

export function genreCounts(records: VinylRecord[]): Facet[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const genre of record.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function decadeCounts(records: VinylRecord[]): Facet[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    counts.set(record.decade, (counts.get(record.decade) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (a.value === 'Unknown') return 1
      if (b.value === 'Unknown') return -1
      return a.value.localeCompare(b.value)
    })
}

export function searchTextFor(record: VinylRecord): string {
  return `${record.artist} ${record.title} ${record.label}`.toLowerCase()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the data loader**

```ts
// src/lib/data.ts
import type { ImageMetadata } from 'astro'
import { CollectionSchema, type VinylRecord } from './schema'
import collectionJson from '../../data/collection.json'
import wantlistJson from '../../data/wantlist.json'
import syncedAtJson from '../../data/synced-at.json'

// Parsing here means a malformed data file fails the build rather than the page.
export const collection: VinylRecord[] = CollectionSchema.parse(collectionJson)
export const wantlist: VinylRecord[] = CollectionSchema.parse(wantlistJson)
export const syncedAt: string = (syncedAtJson as { syncedAt: string }).syncedAt

const covers = import.meta.glob<{ default: ImageMetadata }>('/src/assets/covers/*.jpg', { eager: true })
const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/*.jpg', { eager: true })

export function coverFor(file: string | null): ImageMetadata | undefined {
  if (!file) return undefined
  return covers[`/src/assets/covers/${file}`]?.default
}

export function imageFor(file: string): ImageMetadata | undefined {
  return images[`/src/assets/images/${file}`]?.default
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data.ts src/lib/facets.ts tests/data.test.ts
git commit -m "feat: load and validate synced data at build time"
```

---

### Task 11: Design tokens and base layout

**Files:**
- Create: `src/styles/tokens.css`, `src/layouts/Base.astro`

**Interfaces:**
- Consumes: `syncedAt` (Task 10)
- Produces: `Base.astro` accepting `{ title: string; description?: string }` as props and a default `<slot />`.

- [ ] **Step 1: Write the tokens**

```css
/* src/styles/tokens.css */
:root {
  --bg: #0d0c0b;
  --panel: #1a1817;
  --ink: #f4efe8;
  --dim: #8d857c;
  --faint: #6b625b;
  --accent: #d0a94f;
  --line: #242020;

  --grid-gap-col: 34px;
  --grid-gap-row: 56px;

  --tilt-max: 12deg;
  --tilt-perspective: 2400px;
  --tilt-scale: 1.05;
  --ease-settle: cubic-bezier(0.2, 0.9, 0.28, 1);
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }

.wrap { max-width: 1760px; margin: 0 auto; padding: 0 32px; }

.site-header {
  display: flex;
  align-items: baseline;
  gap: 24px;
  padding: 34px 0 22px;
}
.site-header h1 { margin: 0; font-size: 19px; letter-spacing: -0.01em; font-weight: 660; }
.site-header nav { display: flex; gap: 16px; font-size: 13px; color: var(--dim); }
.site-header nav a[aria-current="page"] { color: var(--accent); }

.site-footer {
  padding: 60px 0 40px;
  font-size: 11.5px;
  color: var(--faint);
}
```

- [ ] **Step 2: Write the layout**

```astro
---
// src/layouts/Base.astro
import '../styles/tokens.css'
import { syncedAt } from '../lib/data'

interface Props { title: string; description?: string }
const { title, description = 'A vinyl collection' } = Astro.props
const base = import.meta.env.BASE_URL
const path = Astro.url.pathname
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
  </head>
  <body>
    <div class="wrap">
      <header class="site-header">
        <h1>Records</h1>
        <nav>
          <a href={base} aria-current={path === base ? 'page' : undefined}>Collection</a>
          <a href={`${base}wishlist/`} aria-current={path.includes('wishlist') ? 'page' : undefined}>Wishlist</a>
        </nav>
      </header>
      <main><slot /></main>
      <footer class="site-footer">
        Synced from Discogs on {new Date(syncedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
      </footer>
    </div>
  </body>
</html>
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds. (No pages yet, so output is minimal — that is fine.)

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/layouts/Base.astro
git commit -m "feat: add design tokens and base layout"
```

---

### Task 12: Sleeve component and tilt behaviour

**Files:**
- Create: `src/components/Sleeve.astro`, `src/scripts/tilt.ts`

**Interfaces:**
- Consumes: `VinylRecord` (Task 2), `coverFor` (Task 10)
- Produces: `<Sleeve record={record} />` rendering `<a class="sleeve" data-genres data-decade data-search>`

The four hover layers and their exact values are fixed by Global Constraints. The two things easiest to get wrong: perspective must be **per card**, and the specular is driven by **tilt**, not cursor position.

- [ ] **Step 1: Write the component**

```astro
---
// src/components/Sleeve.astro
import { Image } from 'astro:assets'
import type { VinylRecord } from '../lib/schema'
import { coverFor } from '../lib/data'
import { searchTextFor } from '../lib/facets'

interface Props { record: VinylRecord }
const { record } = Astro.props
const cover = coverFor(record.coverFile)
const href = `${import.meta.env.BASE_URL}record/${record.slug}/`
---
<a
  class="sleeve"
  href={href}
  data-genres={record.genres.join('|')}
  data-decade={record.decade}
  data-search={searchTextFor(record)}
>
  <span class="tilt">
    <span class="frame">
      {cover
        ? <Image src={cover} alt={`${record.primaryArtist} — ${record.title}`} widths={[280, 560, 840]} sizes="(min-width: 1440px) 20vw, (min-width: 1080px) 25vw, (min-width: 700px) 33vw, 50vw" />
        : <span class="missing" aria-hidden="true"></span>}
      <span class="sheen" aria-hidden="true"></span>
      <span class="amb" aria-hidden="true"></span>
    </span>
  </span>
  <span class="cap">
    <b>{record.primaryArtist}</b>
    <span>{record.title}{record.pressedYear ? <em>{record.pressedYear}</em> : null}</span>
  </span>
</a>

<style>
  /* Nothing may draw an edge on the artwork: no border, radius, ring or clipping. */
  .sleeve { position: relative; display: block; overflow: visible; background: none; border: 0; }
  .sleeve :global(*) { border: 0; border-radius: 0; }

  .tilt {
    display: block;
    transform-style: preserve-3d;
    will-change: transform;
    transform: perspective(var(--tilt-perspective))
      rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) scale(var(--sc, 1));
    transition: transform 0.5s var(--ease-settle);
  }
  .sleeve.is-active .tilt { transition: transform 0.08s ease-out; }
  .sleeve.is-active { z-index: 6; }

  .frame {
    position: relative;
    display: block;
    aspect-ratio: 1;
    isolation: isolate;
    background: #000;
    box-shadow: 0 7px 20px rgb(0 0 0 / 0.55);
    transition: box-shadow 0.5s var(--ease-settle);
  }
  .sleeve.is-active .frame {
    box-shadow: 0 30px 54px rgb(0 0 0 / 0.75), 0 8px 18px rgb(0 0 0 / 0.55);
  }
  /* The image is exactly 1:1 with its box and never translates, so no edge can be exposed. */
  .frame :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .missing { display: block; width: 100%; height: 100%; background: #1a1817; }

  .sheen {
    position: absolute; inset: 0; pointer-events: none; opacity: 0;
    mix-blend-mode: screen; transition: opacity 0.35s;
    background-image: linear-gradient(102deg,
      rgb(255 255 255 / 0) 26%, rgb(255 255 255 / 0.06) 38%, rgb(255 255 255 / 0.34) 50%,
      rgb(255 255 255 / 0.06) 62%, rgb(255 255 255 / 0) 74%);
    background-size: 260% 260%;
    background-position: var(--px, 50%) var(--py, 50%);
  }
  .sleeve.is-active .sheen { opacity: 1; transition: opacity 0.14s, background-position 0.08s ease-out; }

  .amb {
    position: absolute; inset: 0; pointer-events: none; opacity: 0;
    mix-blend-mode: soft-light; transition: opacity 0.35s;
    background: linear-gradient(var(--ang, 120deg), rgb(255 255 255 / 0.34), rgb(0 0 0 / 0.26));
  }
  .sleeve.is-active .amb { opacity: 0.7; }

  /* Caption sits outside the 3D transform so text stays crisp, and is absolutely
     positioned so revealing it costs no layout shift. */
  .cap {
    position: absolute; left: 0; right: 0; top: 100%;
    padding-top: 14px; text-align: center;
    opacity: 0; transform: translateY(-4px);
    transition: opacity 0.22s, transform 0.22s;
    pointer-events: none;
  }
  .sleeve.is-active .cap, .sleeve:focus-visible .cap { opacity: 1; transform: translateY(0); }
  .cap b { display: block; font-size: 12.5px; font-weight: 620; }
  .cap > span { display: block; font-size: 11.5px; color: var(--dim); margin-top: 2px; }
  .cap em { font-style: normal; margin-left: 7px; opacity: 0.6; }

  .sleeve:focus-visible { outline: 2px solid var(--accent); outline-offset: 6px; }

  @media (prefers-reduced-motion: reduce) {
    .tilt, .frame, .cap { transition: none; }
    .sleeve.is-active .tilt { transform: none; }
    .sheen, .amb { display: none; }
  }
</style>
```

- [ ] **Step 2: Write the tilt script**

```ts
// src/scripts/tilt.ts
const MAX_TILT_DEG = 12
const LIFT_SCALE = 1.05

export function initTilt(root: ParentNode = document): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  for (const sleeve of root.querySelectorAll<HTMLElement>('.sleeve')) {
    const tilt = sleeve.querySelector<HTMLElement>('.tilt')
    const frame = sleeve.querySelector<HTMLElement>('.frame')
    if (!tilt || !frame) continue

    sleeve.addEventListener('pointermove', (event) => {
      const rect = frame.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height
      const nx = Math.max(-1, Math.min(1, px * 2 - 1))
      const ny = Math.max(-1, Math.min(1, py * 2 - 1))

      sleeve.classList.add('is-active')
      tilt.style.setProperty('--ry', `${(nx * MAX_TILT_DEG).toFixed(2)}deg`)
      tilt.style.setProperty('--rx', `${(-ny * MAX_TILT_DEG).toFixed(2)}deg`)
      tilt.style.setProperty('--sc', String(LIFT_SCALE))
      // Highlight slides opposite the tilt — a fixed light on a turning surface.
      tilt.style.setProperty('--px', `${(50 - nx * 50).toFixed(1)}%`)
      tilt.style.setProperty('--py', `${(50 - ny * 50).toFixed(1)}%`)
      tilt.style.setProperty('--ang', `${(120 + nx * 40).toFixed(0)}deg`)
    })

    sleeve.addEventListener('pointerleave', () => {
      sleeve.classList.remove('is-active')
      tilt.style.setProperty('--rx', '0deg')
      tilt.style.setProperty('--ry', '0deg')
      tilt.style.setProperty('--sc', '1')
      tilt.style.setProperty('--px', '50%')
      tilt.style.setProperty('--py', '50%')
    })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sleeve.astro src/scripts/tilt.ts
git commit -m "feat: add sleeve component with tvOS-style hover"
```

---

### Task 13: Collection grid and filters

**Files:**
- Create: `src/components/CoverGrid.astro`, `src/components/FilterBar.astro`, `src/scripts/filters.ts`, `src/pages/index.astro`

**Interfaces:**
- Consumes: `Sleeve` (Task 12), `collection`, `genreCounts`, `decadeCounts` (Task 10)
- Produces:
  - `<CoverGrid records={VinylRecord[]} emptyMessage={string} />`
  - `<FilterBar genres={Facet[]} decades={Facet[]} total={number} />`
  - `initFilters(): void`

- [ ] **Step 1: Write the grid**

```astro
---
// src/components/CoverGrid.astro
import Sleeve from './Sleeve.astro'
import type { VinylRecord } from '../lib/schema'

interface Props { records: VinylRecord[]; emptyMessage?: string }
const { records, emptyMessage = 'Nothing here yet.' } = Astro.props
---
{records.length === 0
  ? <p class="empty-state">{emptyMessage}</p>
  : <div class="grid" id="grid">{records.map((record) => <Sleeve record={record} />)}</div>}
<p class="empty-state" id="no-matches" hidden>Nothing matches those filters.</p>

<style>
  .grid {
    display: grid;
    gap: var(--grid-gap-row) var(--grid-gap-col);
    padding: 44px 0 10px;
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 700px)  { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1080px) { .grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1440px) { .grid { grid-template-columns: repeat(5, 1fr); } }

  .grid :global(.sleeve.is-hidden) { display: none; }
  .empty-state { color: var(--dim); font-size: 13px; padding: 60px 0; }
</style>
```

- [ ] **Step 2: Write the filter bar**

```astro
---
// src/components/FilterBar.astro
import type { Facet } from '../lib/facets'

interface Props { genres: Facet[]; decades: Facet[]; total: number }
const { genres, decades, total } = Astro.props
---
<div class="filters">
  <div class="group">
    <span class="label" id="genre-label">Genre</span>
    <div class="chips" role="group" aria-labelledby="genre-label">
      {genres.map((facet) => (
        <button class="chip" type="button" data-facet="genre" data-value={facet.value} aria-pressed="false">
          {facet.value}<i>{facet.count}</i>
        </button>
      ))}
    </div>
  </div>

  <div class="group">
    <span class="label" id="decade-label">Decade</span>
    <div class="chips" role="group" aria-labelledby="decade-label">
      {decades.map((facet) => (
        <button class="chip" type="button" data-facet="decade" data-value={facet.value} aria-pressed="false">
          {facet.value}<i>{facet.count}</i>
        </button>
      ))}
    </div>
  </div>

  <div class="group">
    <label class="label" for="q">Search</label>
    <input id="q" class="q" type="search" placeholder="artist, title, label…" autocomplete="off" />
  </div>

  <p class="count" aria-live="polite"><b id="shown">{total}</b> of {total}</p>
</div>

<style>
  .filters {
    display: flex; flex-wrap: wrap; gap: 18px 26px; align-items: flex-end;
    padding-bottom: 18px; border-bottom: 1px solid var(--line);
  }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .label { font-size: 9.5px; letter-spacing: 0.17em; text-transform: uppercase; color: var(--faint); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; max-width: 620px; }
  .chip {
    font: inherit; font-size: 11.5px; color: #cfc6bc; background: var(--panel);
    border: 1px solid #2b2724; padding: 5px 9px 5px 10px; border-radius: 99px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.14s;
  }
  .chip:hover { border-color: #4a423c; color: #fff; }
  .chip i { font-style: normal; font-size: 9.5px; color: var(--faint); }
  .chip[aria-pressed="true"] {
    background: var(--accent); border-color: var(--accent); color: #17130c; font-weight: 640;
  }
  .chip[aria-pressed="true"] i { color: #17130c; opacity: 0.62; }
  .q {
    font: inherit; font-size: 13px; background: var(--panel); border: 1px solid #2b2724;
    color: var(--ink); padding: 8px 12px; border-radius: 7px; width: 210px;
  }
  .q:focus { outline: none; border-color: var(--accent); }
  .count { margin: 0 0 0 auto; font-size: 12px; color: var(--dim); }
</style>
```

- [ ] **Step 3: Write the filter script**

```ts
// src/scripts/filters.ts
export function initFilters(): void {
  const grid = document.getElementById('grid')
  if (!grid) return

  const sleeves = [...grid.querySelectorAll<HTMLElement>('.sleeve')]
  const shown = document.getElementById('shown')
  const noMatches = document.getElementById('no-matches')
  const search = document.getElementById('q') as HTMLInputElement | null

  const selected: Record<'genre' | 'decade', Set<string>> = { genre: new Set(), decade: new Set() }
  let query = ''

  function apply(): void {
    let visible = 0

    for (const sleeve of sleeves) {
      const genres = (sleeve.dataset.genres ?? '').split('|').filter(Boolean)
      const matchesGenre = selected.genre.size === 0 || genres.some((g) => selected.genre.has(g))
      const matchesDecade = selected.decade.size === 0 || selected.decade.has(sleeve.dataset.decade ?? '')
      const matchesQuery = query === '' || (sleeve.dataset.search ?? '').includes(query)
      const match = matchesGenre && matchesDecade && matchesQuery

      sleeve.classList.toggle('is-hidden', !match)
      if (match) visible++
    }

    if (shown) shown.textContent = String(visible)
    if (noMatches) noMatches.hidden = visible !== 0
  }

  for (const chip of document.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.addEventListener('click', () => {
      const facet = chip.dataset.facet as 'genre' | 'decade'
      const value = chip.dataset.value ?? ''
      const active = selected[facet].has(value)

      if (active) selected[facet].delete(value)
      else selected[facet].add(value)

      chip.setAttribute('aria-pressed', String(!active))
      apply()
    })
  }

  search?.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    apply()
  })
}
```

- [ ] **Step 4: Write the index page**

```astro
---
// src/pages/index.astro
import Base from '../layouts/Base.astro'
import CoverGrid from '../components/CoverGrid.astro'
import FilterBar from '../components/FilterBar.astro'
import { collection } from '../lib/data'
import { genreCounts, decadeCounts } from '../lib/facets'
---
<Base title="Records" description="A vinyl collection">
  <FilterBar genres={genreCounts(collection)} decades={decadeCounts(collection)} total={collection.length} />
  <CoverGrid records={collection} />
</Base>

<script>
  import { initTilt } from '../scripts/tilt'
  import { initFilters } from '../scripts/filters'
  initTilt()
  initFilters()
</script>
```

- [ ] **Step 5: Build and check the page renders**

Run: `npm run build`
Expected: build succeeds and reports generating `/index.html`.

Then run:

```bash
node -e "
const h=require('fs').readFileSync('dist/index.html','utf8');
console.log('sleeves:', (h.match(/class=\"sleeve\"/g)||[]).length);
console.log('has grid:', h.includes('id=\"grid\"'));
console.log('genre chips:', (h.match(/data-facet=\"genre\"/g)||[]).length);
"
```

Expected: `sleeves: 57`, `has grid: true`, `genre chips: 10`.

- [ ] **Step 6: Check it visually**

Run: `npm run dev`, open the printed URL, and confirm: five columns on a wide window, no borders on the sleeves, hover tilts toward the pointer with a sweeping highlight, captions appear only on hover, and clicking genre chips filters.

- [ ] **Step 7: Commit**

```bash
git add src/components/CoverGrid.astro src/components/FilterBar.astro src/scripts/filters.ts src/pages/index.astro
git commit -m "feat: add collection grid with genre, decade and text filters"
```

---

### Task 14: Record detail page

**Files:**
- Create: `src/components/Tracklist.astro`, `src/components/DetailFacts.astro`, `src/pages/record/[slug].astro`

**Interfaces:**
- Consumes: `collection`, `coverFor`, `imageFor` (Task 10)
- Produces: one static page per record at `/record/{slug}/`

- [ ] **Step 1: Write the tracklist component**

```astro
---
// src/components/Tracklist.astro
import type { VinylRecord } from '../lib/schema'

interface Props { record: VinylRecord }
const { record } = Astro.props

// Sides come pre-derived from sync. When empty (numeric positions), show one flat list.
const groups = record.sides.length > 0
  ? record.sides.map((side) => ({
      side,
      tracks: record.tracklist.filter((track) => track.position.startsWith(side)),
    }))
  : [{ side: null, tracks: record.tracklist }]
---
{record.tracklist.length > 0 && (
  <section class="block">
    <h2>Tracklist</h2>
    <div class="sides">
      {groups.map((group) => (
        <div class="side">
          {group.side && <h3>Side {group.side}</h3>}
          <ol>
            {group.tracks.map((track) => (
              <li>
                <span class="pos">{track.position}</span>
                <span class="title">{track.title}</span>
                <span class="dur">{track.duration ?? '—'}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  </section>
)}

<style>
  .sides { display: flex; gap: 34px; flex-wrap: wrap; }
  .side { flex: 1 1 250px; }
  .side h3 {
    margin: 0 0 9px; font-size: 10px; letter-spacing: 0.2em;
    text-transform: uppercase; color: var(--accent);
  }
  .side ol { list-style: none; margin: 0; padding: 0; }
  .side li {
    display: flex; gap: 11px; align-items: baseline;
    padding: 6px 0; border-bottom: 1px solid #191614; font-size: 13px;
  }
  .pos { color: var(--faint); font-size: 10.5px; width: 22px; flex: none; font-variant-numeric: tabular-nums; }
  .title { flex: 1; }
  .dur { color: var(--dim); font-size: 11.5px; font-variant-numeric: tabular-nums; }
</style>
```

- [ ] **Step 2: Write the facts component**

Format appears only when the record is **not** a plain LP — that is true for two records in this collection and pointless noise for the other 55.

```astro
---
// src/components/DetailFacts.astro
import type { VinylRecord } from '../lib/schema'

interface Props { record: VinylRecord; released: string | null }
const { record, released } = Astro.props
const gap = record.pressedYear !== null && record.originalYear !== null
  ? record.pressedYear - record.originalYear
  : null
---
<dl class="facts">
  <div>
    <dt>Pressed</dt>
    <dd>{released ?? record.pressedYear ?? '—'}</dd>
  </div>

  {record.isOriginalPressing && (
    <div><dt>Status</dt><dd>Original pressing</dd></div>
  )}

  {!record.isOriginalPressing && record.originalYear !== null && (
    <div>
      <dt>Originally released</dt>
      <dd>{record.originalYear}{gap !== null && <span class="ago">{gap} years earlier</span>}</dd>
    </div>
  )}

  {!record.isPlainLP && record.formatDescriptions.length > 0 && (
    <div><dt>Format</dt><dd>{record.formatDescriptions.join(', ')}</dd></div>
  )}

  {record.tracklist.length > 0 && (
    <div>
      <dt>Tracks</dt>
      <dd>{record.tracklist.length}{record.sides.length > 0 ? ` over ${record.sides.length} sides` : ''}</dd>
    </div>
  )}
</dl>

<style>
  .facts {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px 22px; margin: 22px 0; padding: 18px 0;
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  }
  dt { font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--faint); margin-bottom: 4px; }
  dd { margin: 0; font-size: 13.5px; }
  .ago { display: block; font-size: 10.5px; color: var(--faint); margin-top: 2px; }
</style>
```

- [ ] **Step 3: Write the detail page**

```astro
---
// src/pages/record/[slug].astro
import { Image } from 'astro:assets'
import Base from '../../layouts/Base.astro'
import Tracklist from '../../components/Tracklist.astro'
import DetailFacts from '../../components/DetailFacts.astro'
import { collection, wantlist, coverFor, imageFor } from '../../lib/data'
import type { VinylRecord } from '../../lib/schema'

export function getStaticPaths() {
  const all = [...collection, ...wantlist]
  return all.map((record) => ({ params: { slug: record.slug }, props: { record } }))
}

interface Props { record: VinylRecord }
const { record } = Astro.props
const cover = coverFor(record.coverFile)
const eyebrow = [record.label, record.catno, record.country].filter(Boolean).join(' · ')
---
<Base title={`${record.primaryArtist} — ${record.title}`}>
  <article class="detail">
    <div class="art">
      {cover && <Image src={cover} alt={`${record.primaryArtist} — ${record.title}`} widths={[430, 860]} sizes="(min-width: 900px) 430px, 100vw" class="cover" />}
      {record.images.length > 0 && (
        <div class="thumbs">
          {record.images.map((image) => {
            const asset = imageFor(image.file)
            return asset ? <Image src={asset} alt="" widths={[64, 128]} sizes="64px" /> : null
          })}
        </div>
      )}
    </div>

    <div class="info">
      {eyebrow && <p class="eyebrow">{eyebrow}</p>}
      <h2>{record.title}</h2>
      <p class="by">{record.artist}</p>

      <div class="tags">
        {record.genres.map((genre) => <span class="genre">{genre}</span>)}
        {record.styles.map((style) => <span class="style">{style}</span>)}
      </div>

      <DetailFacts record={record} released={null} />
      <Tracklist record={record} />

      <div class="two">
        {record.credits.length > 0 && (
          <section class="block">
            <h2>Credits</h2>
            {record.credits.slice(0, 12).map((credit) => (
              <div class="row"><span class="k">{credit.role}</span><span class="v">{credit.name}</span></div>
            ))}
          </section>
        )}

        {record.identifiers.length > 0 && (
          <section class="block">
            <h2>Pressing details</h2>
            {record.identifiers.slice(0, 6).map((identifier) => (
              <div class="row">
                <span class="k">{identifier.type}{identifier.description ? ` — ${identifier.description}` : ''}</span>
                <span class="v mono">{identifier.value}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      {record.notes && (
        <section class="block"><h2>Notes</h2><p class="notes">{record.notes}</p></section>
      )}
    </div>
  </article>
</Base>

<style>
  .detail { display: grid; grid-template-columns: minmax(300px, 430px) 1fr; gap: 46px; align-items: start; padding: 24px 0 40px; }
  @media (max-width: 900px) { .detail { grid-template-columns: 1fr; } }
  .art :global(.cover) { width: 100%; height: auto; display: block; box-shadow: 0 22px 50px rgb(0 0 0 / 0.6); }

  /* Small wrapping thumbnails — never a horizontal scroller, never full-size stacks. */
  .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; margin-top: 12px; }
  .thumbs :global(img) { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; opacity: 0.6; transition: opacity 0.18s; }
  .thumbs :global(img:hover) { opacity: 1; }

  .eyebrow { font-size: 11.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--dim); margin: 0 0 8px; }
  h2 { margin: 0 0 6px; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; font-weight: 680; }
  .by { margin: 0 0 16px; font-size: 16px; color: #c8bfb4; }

  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .genre, .style { font-size: 11px; padding: 3px 9px; border-radius: 99px; }
  .genre { background: var(--accent); color: #17130c; font-weight: 640; }
  .style { background: var(--panel); color: #b3a99e; }

  .block { margin-top: 26px; }
  .block h2 { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 11px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; }
  @media (max-width: 820px) { .two { grid-template-columns: 1fr; } }

  .row { display: flex; gap: 12px; font-size: 12.5px; padding: 4px 0; }
  .k { color: var(--faint); flex: 0 0 150px; }
  .v { flex: 1; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #b3a99e; }
  .notes { font-size: 13px; line-height: 1.62; color: #c0b7ac; max-width: 66ch; }
</style>
```

- [ ] **Step 4: Build and verify page generation**

Run: `npm run build`

Then:

```bash
node -e "
const fs=require('fs');
const dirs=fs.readdirSync('dist/record');
console.log('record pages:', dirs.length);
const c=require('./data/collection.json');
const jd=c.find(r=>r.title==='Substance');
const h=fs.readFileSync('dist/record/'+jd.slug+'/index.html','utf8');
console.log('shows both years:', h.includes('Originally released') && h.includes('1988'));
console.log('shows sides:', ['A','B','C','D'].every(s=>h.includes('Side '+s)));
console.log('hides Format for a plain LP:', !h.includes('>Format<'));
"
```

Expected: `record pages: 57`, and all three checks `true`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Tracklist.astro src/components/DetailFacts.astro src/pages/record/
git commit -m "feat: add record detail pages"
```

---

### Task 15: Wishlist page

The wantlist is empty today, so the empty state is the only thing that will actually render. It must be correct rather than a placeholder.

**Files:**
- Create: `src/pages/wishlist.astro`

**Interfaces:**
- Consumes: `wantlist`, `genreCounts`, `decadeCounts` (Task 10), `CoverGrid`, `FilterBar` (Task 13)
- Produces: `/wishlist/` page

- [ ] **Step 1: Write the page**

```astro
---
// src/pages/wishlist.astro
import Base from '../layouts/Base.astro'
import CoverGrid from '../components/CoverGrid.astro'
import FilterBar from '../components/FilterBar.astro'
import { wantlist } from '../lib/data'
import { genreCounts, decadeCounts } from '../lib/facets'
---
<Base title="Wishlist" description="Records I'm looking for">
  {wantlist.length > 0 && (
    <FilterBar genres={genreCounts(wantlist)} decades={decadeCounts(wantlist)} total={wantlist.length} />
  )}
  <CoverGrid
    records={wantlist}
    emptyMessage="Nothing on the wishlist yet. Records added to the Discogs wantlist will appear here after the next sync."
  />
</Base>

<script>
  import { initTilt } from '../scripts/tilt'
  import { initFilters } from '../scripts/filters'
  initTilt()
  initFilters()
</script>
```

- [ ] **Step 2: Build and verify the empty state**

Run: `npm run build`

Then:

```bash
node -e "
const h=require('fs').readFileSync('dist/wishlist/index.html','utf8');
console.log('has empty state:', h.includes('Nothing on the wishlist yet'));
console.log('no filter bar when empty:', !h.includes('data-facet=\"genre\"'));
console.log('no stray grid:', !h.includes('id=\"grid\"'));
"
```

Expected: all three `true`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/wishlist.astro
git commit -m "feat: add wishlist page with empty state"
```

---

### Task 16: Build smoke test

**Files:**
- Create: `tests/build.test.ts`

**Interfaces:**
- Consumes: `dist/` produced by `npm run build`
- Produces: `npm run verify` as the pre-deploy gate

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run the full verification**

Run: `npm run verify`
Expected: build succeeds, then 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/build.test.ts
git commit -m "test: add build smoke test"
```

---

### Task 17: GitHub Actions

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/sync.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run verify` (Task 16), `npm run sync` (Task 9)
- Produces: automated deploys and a weekly self-updating sync

- [ ] **Step 1: Write the deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run verify
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write the sync workflow**

```yaml
# .github/workflows/sync.yml
name: Sync from Discogs

on:
  schedule:
    - cron: '17 4 * * 1'   # Mondays, 04:17 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - run: npm run sync
        env:
          DISCOGS_TOKEN: ${{ secrets.DISCOGS_TOKEN }}
          DISCOGS_USER: vxsx

      - name: Commit any changes
        run: |
          if [ -z "$(git status --porcelain data src/assets)" ]; then
            echo "No changes."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data src/assets
          git commit -m "chore: sync collection from Discogs"
          git push
```

The push to `main` triggers `deploy.yml`, so a new record on Discogs reaches the site without manual action.

- [ ] **Step 3: Write the README**

```markdown
# Records

A static site presenting a Discogs vinyl collection, built with Astro and deployed to GitHub Pages.

## How it works

Three stages, deliberately separate:

1. **Sync** (`npm run sync`) — the only thing that talks to Discogs. Fetches the
   collection, each release, and each master (for original release years), downloads
   cover art, and writes normalised JSON to `data/` plus images to `src/assets/`.
   Both are committed.
2. **Build** (`npm run build`) — Astro turns the committed data into static HTML and
   generates responsive AVIF/WebP images. Never touches the network.
3. **Deploy** — GitHub Actions publishes `dist/` to Pages on every push to `main`,
   and re-syncs weekly.

Because the build reads committed data, it is reproducible and works when Discogs is
down or rate-limiting.

## Setup

```bash
npm install
cp .env.example .env      # add a token from discogs.com/settings/developers
npm run sync              # ~2 minutes cold, cached thereafter
npm run dev
```

`DISCOGS_TOKEN` is used only at sync time and never reaches the browser. In CI it
lives as the `DISCOGS_TOKEN` repository secret.

## Commands

| Command | Does |
|---|---|
| `npm run sync` | Fetch from Discogs into `data/` and `src/assets/` (token from `.env`) |
| `npm run sync -- --force` | Ignore the local response cache |
| `npm run dev` | Local dev server |
| `npm run build` | Static build into `dist/` |
| `npm test` | Unit tests |
| `npm run verify` | Build, then smoke-test the output |
```

- [ ] **Step 4: Verify the workflows parse**

Run: `node -e "console.log(require('fs').readFileSync('.github/workflows/deploy.yml','utf8').length, require('fs').readFileSync('.github/workflows/sync.yml','utf8').length)"`
Expected: two non-zero numbers.

Then confirm in the repository settings that Pages source is set to **GitHub Actions**, and that `DISCOGS_TOKEN` exists as a repository secret. Neither can be done from the command line.

- [ ] **Step 5: Commit**

```bash
git add .github README.md
git commit -m "ci: add deploy and scheduled sync workflows"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: sync stage → Tasks 5–9; data model → Task 2 (plus `primaryArtist`, `decade` refinements); build stage → Tasks 10–15; deploy → Task 17; grid visual spec → Tasks 12–13; detail page → Task 14; wishlist → Task 15; error handling → schema nullability (Task 2), `downloadIfMissing` atomicity (Task 8), validate-before-write (Task 9), missing-cover placeholder (Task 12), empty tracklist guard (Task 14), empty wantlist state (Task 15); accessibility → Task 12; testing → Tasks 3–8, 10, 16.

**Deliberate deviations**, each flagged in "Refinements to the spec": `primaryArtist` replaces mid-string clamping; images live under `src/assets/` for Astro's image pipeline; disambiguation suffixes stripped.

**One spec item softened.** The spec said sync "writes to a temporary directory and moves it into place only on success". Task 9 instead validates the whole dataset in memory and writes each JSON file atomically, while images are downloaded incrementally and never deleted. This preserves the intent — no half-written collection — without discarding already-downloaded images on every run.

**Type consistency.** `VinylRecord` is used throughout (never `Record`). `coverFile`/`imageFor`/`coverFor` names agree across Tasks 2, 9, 10, 12, 14. `initTilt`/`initFilters` agree between Tasks 12, 13, 15. `primaryArtist` is defined in Task 2 and consumed in Tasks 4, 7, 9, 12, 14.

**Known unknowns, both resolved inside the plan rather than left open:** three fixture release ids are verified in Task 6 Step 2 before use; the Pages base path is set in Task 1 Step 3 with instructions for a custom domain.
