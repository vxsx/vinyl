// scripts/sync.ts
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { DiscogsClient } from './lib/discogs.js'
import { assignSlugs } from './lib/slug.js'
import { primaryArtistName } from './lib/artist.js'
import { normalizeRecord, type RawCollectionEntry, type RawRelease, type RawMaster } from './lib/normalize.js'
import { downloadIfMissing, MAX_SECONDARY_IMAGES } from './lib/assets.js'
import { applyDecadeOverrides, unusedOverrideIds } from './lib/decade-overrides.js'
import {
  CollectionSchema,
  DecadeOverridesSchema,
  type DecadeOverrides,
  type VinylRecord,
} from '../src/lib/schema.js'

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

const OVERRIDES_PATH = join(DATA_DIR, 'decade-overrides.json')

/**
 * Read before a single request goes out: a broken override file should cost a
 * second, not two minutes of fetching. Every failure mode here throws — a
 * missing file, unparseable JSON, an unknown key shape, a decade that isn't
 * one. The one thing this must never do is shrug and correct nothing.
 */
async function loadDecadeOverrides(): Promise<DecadeOverrides> {
  let raw: string
  try {
    raw = await readFile(OVERRIDES_PATH, 'utf8')
  } catch (cause) {
    throw new Error(`${OVERRIDES_PATH} is missing — it is committed alongside the data it corrects`, { cause })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(`${OVERRIDES_PATH} is not valid JSON`, { cause })
  }

  const result = DecadeOverridesSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`${OVERRIDES_PATH} is invalid:\n${issues}`)
  }
  return result.data
}

const decadeOverrides = await loadDecadeOverrides()

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

async function buildRecords(
  entries: RawCollectionEntry[],
  label: string,
  slugs: Map<number, string>,
): Promise<VinylRecord[]> {
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
      await downloadIfMissing(coverUrl, join(COVER_DIR, coverFile), { force })
    }

    const secondary = allImages.filter((image) => image.type === 'secondary').slice(0, MAX_SECONDARY_IMAGES)
    const images: { file: string; width: number; height: number }[] = []
    for (const [n, image] of secondary.entries()) {
      const file = `${id}-${n + 1}.jpg`
      await downloadIfMissing(image.uri, join(IMAGE_DIR, file), { force })
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

// Slugs must be assigned once across the UNION of both lists, deduped by
// release id first: two different releases whose artist+title slugify
// identically must not collide across collection/wantlist, and a release
// appearing in both lists must get the same slug in both. Feeding the same
// id to assignSlugs twice would make its own second pass see the first
// pass's slug as already "taken" and suffix itself — so the union is
// deduped by id BEFORE assigning, not after.
const byId = new Map<number, { id: number; primaryArtist: string; title: string }>()
for (const entry of [...collectionEntries, ...wantEntries]) {
  const basic = entry.basic_information
  byId.set(basic.id, {
    id: basic.id,
    primaryArtist: primaryArtistName(basic.artists ?? []),
    title: basic.title,
  })
}
const slugs = assignSlugs([...byId.values()])

// Overrides are applied AFTER normalisation, to both lists: a release id names
// the same record wherever it appears, and its detail page renders from either.
const collectionBuilt = await applyDecadeOverrides(
  await buildRecords(collectionEntries, 'collection', slugs),
  decadeOverrides,
)
const wantlistBuilt = await applyDecadeOverrides(
  await buildRecords(wantEntries, 'wantlist', slugs),
  decadeOverrides,
)
const collection = collectionBuilt.records
const wantlist = wantlistBuilt.records

for (const id of unusedOverrideIds(decadeOverrides, collection, wantlist)) {
  console.warn(
    `[warn] decade override for release ${id} (-> ${decadeOverrides[id]!.decade}) matches nothing in the collection or wantlist`,
  )
}

// Defensive guard: a slug collision must fail the sync loudly, not silently
// overwrite one record's page with another's at build time. A record that
// legitimately appears in both collection and wantlist shares one release id
// and (by construction above) one slug — that is NOT a collision. Only flag
// a slug claimed by two DIFFERENT release ids.
const idsBySlug = new Map<string, Set<number>>()
for (const record of [...collection, ...wantlist]) {
  const ids = idsBySlug.get(record.slug) ?? new Set<number>()
  ids.add(record.id)
  idsBySlug.set(record.slug, ids)
}
const duplicates = [...idsBySlug.entries()].filter(([, ids]) => ids.size > 1).map(([slug]) => slug)
if (duplicates.length > 0) {
  throw new Error(`Duplicate slug(s) across collection/wantlist: ${duplicates.join(', ')}`)
}

// Validate before writing — a schema failure must not corrupt committed data.
CollectionSchema.parse(collection)
CollectionSchema.parse(wantlist)

const collectionPath = join(DATA_DIR, 'collection.json')
const wantlistPath = join(DATA_DIR, 'wantlist.json')

// writeJson always serialises with the same stable JSON.stringify(value, null, 2)
// output, so a no-op sync re-writes byte-identical files — `git status` stays
// clean and the CI change-detection step (which diffs the working tree) sees
// nothing to commit, without needing a separate "did anything change" flag.
await writeJson(collectionPath, collection)
await writeJson(wantlistPath, wantlist)

const overridden = new Set([...collectionBuilt.appliedIds, ...wantlistBuilt.appliedIds]).size
console.log(
  `\nSynced ${collection.length} records, ${wantlist.length} wantlist items, ` +
    `${overridden} decade override(s) applied.`,
)
