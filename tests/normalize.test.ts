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

  it('flattens an index entry with sub_tracks into its sub-tracks, dropping the wrapper', () => {
    const cleaned = cleanTracklist([
      {
        type_: 'index',
        position: '',
        title: 'Rigoletto',
        duration: '',
        sub_tracks: [
          { type_: 'track', position: '1', title: 'Act I (beginning)', duration: '' },
          { type_: 'track', position: '2', title: 'Act I (conclusion)', duration: '' },
        ],
      },
    ])
    expect(cleaned).toEqual([
      { position: '1', title: 'Act I (beginning)', duration: null },
      { position: '2', title: 'Act I (conclusion)', duration: null },
    ])
  })

  it('drops an index entry with no sub_tracks', () => {
    const cleaned = cleanTracklist([{ type_: 'index', position: '', title: 'Suite', duration: '' }])
    expect(cleaned).toEqual([])
  })

  it('drops a heading entry even when a sibling entry has sub_tracks', () => {
    const cleaned = cleanTracklist([
      { type_: 'heading', position: '', title: 'Side One', duration: '' },
      {
        type_: 'index',
        position: '',
        title: 'Rigoletto',
        duration: '',
        sub_tracks: [{ type_: 'track', position: '1', title: 'Act I', duration: '' }],
      },
    ])
    expect(cleaned).toEqual([{ position: '1', title: 'Act I', duration: null }])
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
  })

  // A reissue is *from* the year the music came out, not the year this copy
  // was manufactured — otherwise every remaster files under the decade it was
  // reprinted in and the facet stops describing the collection.
  it('files a reissue under the decade of its original release, not its pressing', () => {
    const record = build('substance', 'substance')
    expect(record.pressedYear).toBe(2015)
    expect(record.originalYear).toBe(1988)
    expect(record.decade).toBe('1980s')
  })

  it('falls back to the pressing decade when there is no original year', () => {
    const record = build('substance')
    expect(record.originalYear).toBeNull()
    expect(record.pressedYear).toBe(2015)
    expect(record.decade).toBe('2010s')
  })

  it('maps Discogs year 0 to null and decade Unknown', () => {
    const record = build('rigoletto')
    expect(record.pressedYear).toBeNull()
    expect(record.originalYear).toBeNull()
    expect(record.decade).toBe('Unknown')
  })

  it('falls through to basic.year when release.year is 0 (Discogs "unknown")', () => {
    const record = normalizeRecord({
      entry: {
        date_added: '2026-01-01T00:00:00Z',
        basic_information: { id: 1, title: 'T', year: 1999 },
      },
      release: { year: 0 },
      master: null,
      slug: 'slug-year-fallthrough',
      coverFile: null,
      images: [],
    })
    expect(record.pressedYear).toBe(1999)
  })

  it('flattens the rigoletto index entry into its 4 real tracks, with no side letters', () => {
    const record = build('rigoletto')
    expect(record.tracklist).toHaveLength(4)
    expect(record.tracklist[0]!.title).toMatch(/^Act I \(beginning\)/)
    expect(record.sides).toEqual([])
  })

  it('leaves tracklist lengths of fixtures without sub_tracks unchanged', () => {
    expect(build('substance', 'substance').tracklist).toHaveLength(19)
    expect(build('hybrid-theory').tracklist).toHaveLength(12)
    expect(build('blues-in-orbit').tracklist).toHaveLength(4)
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

  // Extra test (not from the brief): every fixture — not just substance — must
  // produce schema-valid output. All four have a master in tests/fixtures/,
  // so exercise originalYear/isOriginalPressing derivation for each too.
  it.each(['substance', 'hybrid-theory', 'rigoletto', 'blues-in-orbit'])(
    'produces a schema-valid record for the %s fixture',
    (name) => {
      expect(() => RecordSchema.parse(build(name, name))).not.toThrow()
    },
  )
})
