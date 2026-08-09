import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DecadeOverridesSchema } from '../src/lib/schema'
import { applyDecadeOverrides, unusedOverrideIds } from '../scripts/lib/decade-overrides'
import type { DecadeOverrides, VinylRecord } from '../src/lib/schema'

const record = (over: Partial<VinylRecord>): VinylRecord => ({
  id: 1, slug: 's', title: 'T', artist: 'A', primaryArtist: 'A', artistSort: 'A',
  coverFile: null, genres: [], styles: [], label: 'L', catno: 'C', country: null,
  pressedYear: 1984, originalYear: 1984, isOriginalPressing: true, decade: '1980s',
  recordedDecade: null, formatDescriptions: [], isPlainLP: true, tracklist: [], sides: [],
  credits: [], identifiers: [], notes: null, images: [], dateAdded: '2026-07-29T00:00:00Z',
  ...over,
})

const overrides = (value: unknown): DecadeOverrides => DecadeOverridesSchema.parse(value)

describe('DecadeOverridesSchema', () => {
  it('accepts a decade and a note keyed by a numeric release id', () => {
    expect(() =>
      overrides({ '2737750': { decade: '1930s', note: 'recorded c. 1934-1939' } }),
    ).not.toThrow()
  })

  it('rejects a decade that is not /^\\d{3}0s$/', () => {
    for (const decade of ['1935', '1930', '30s', '19300s', '1935s', 'Unknown', '']) {
      expect(() => overrides({ '1': { decade, note: 'n' } })).toThrow()
    }
  })

  it('rejects a key that is not a release id', () => {
    expect(() => overrides({ django: { decade: '1930s', note: 'n' } })).toThrow()
    expect(() => overrides({ 'django-reinhardt': { decade: '1930s', note: 'n' } })).toThrow()
  })

  it('rejects an unknown field rather than ignoring it', () => {
    expect(() => overrides({ '1': { decade: '1930s', note: 'n', year: 1935 } })).toThrow()
    // The likeliest typo of all: the right value under the wrong name.
    expect(() => overrides({ '1': { decades: '1930s', note: 'n' } })).toThrow()
  })

  it('requires a non-empty note', () => {
    expect(() => overrides({ '1': { decade: '1930s' } })).toThrow()
    expect(() => overrides({ '1': { decade: '1930s', note: '' } })).toThrow()
  })

  it('rejects a bare decade string in place of an entry', () => {
    expect(() => overrides({ '1': '1930s' })).toThrow()
  })

  it('accepts an empty file', () => {
    expect(() => overrides({})).not.toThrow()
  })
})

describe('the committed data/decade-overrides.json', () => {
  it('parses', () => {
    const raw: unknown = JSON.parse(readFileSync('data/decade-overrides.json', 'utf8'))
    expect(() => DecadeOverridesSchema.parse(raw)).not.toThrow()
  })
})

describe('applyDecadeOverrides', () => {
  it('replaces the derived decade and records why', () => {
    const { records } = applyDecadeOverrides(
      [record({ id: 2737750, decade: '1980s' })],
      overrides({ '2737750': { decade: '1930s', note: 'Quintette sides, 1934-1939' } }),
    )
    expect(records[0]!.decade).toBe('1930s')
    expect(records[0]!.recordedDecade).toBe('1930s')
  })

  it('overrides a decade of Unknown too', () => {
    const { records } = applyDecadeOverrides(
      [record({ id: 5, decade: 'Unknown', pressedYear: null, originalYear: null })],
      overrides({ '5': { decade: '1920s', note: 'n' } }),
    )
    expect(records[0]!.decade).toBe('1920s')
  })

  it('touches nothing else about the record', () => {
    const before = record({ id: 7, decade: '1980s' })
    const { records } = applyDecadeOverrides([before], overrides({ '7': { decade: '1930s', note: 'n' } }))
    const { decade: _d, recordedDecade: _r, ...restAfter } = records[0]!
    const { decade: _d2, recordedDecade: _r2, ...restBefore } = before
    expect(restAfter).toEqual(restBefore)
    // Explicitly: the years still say what Discogs said.
    expect(records[0]!.pressedYear).toBe(1984)
    expect(records[0]!.originalYear).toBe(1984)
  })

  it('leaves a record with no override alone, recordedDecade still null', () => {
    const { records, appliedIds } = applyDecadeOverrides(
      [record({ id: 99, decade: '1980s' })],
      overrides({ '2737750': { decade: '1930s', note: 'n' } }),
    )
    expect(records[0]!.decade).toBe('1980s')
    expect(records[0]!.recordedDecade).toBeNull()
    expect(appliedIds).toEqual([])
  })

  it('reports the ids it changed', () => {
    const { appliedIds } = applyDecadeOverrides(
      [record({ id: 1 }), record({ id: 2 }), record({ id: 3 })],
      overrides({ '1': { decade: '1930s', note: 'n' }, '3': { decade: '1920s', note: 'n' } }),
    )
    expect(appliedIds).toEqual([1, 3])
  })

  it('does not mutate the input array', () => {
    const input = [record({ id: 1, decade: '1980s' })]
    applyDecadeOverrides(input, overrides({ '1': { decade: '1930s', note: 'n' } }))
    expect(input[0]!.decade).toBe('1980s')
    expect(input[0]!.recordedDecade).toBeNull()
  })
})

describe('unusedOverrideIds', () => {
  it('names an override matching no record — a sold record must not rot the file', () => {
    const unused = unusedOverrideIds(
      overrides({ '1': { decade: '1930s', note: 'n' }, '404': { decade: '1920s', note: 'n' } }),
      [record({ id: 1 })],
    )
    expect(unused).toEqual(['404'])
  })

  it('counts a record found in any list as used, not just the first', () => {
    const unused = unusedOverrideIds(
      overrides({ '2': { decade: '1930s', note: 'n' } }),
      [record({ id: 1 })],
      [record({ id: 2 })],
    )
    expect(unused).toEqual([])
  })

  it('returns nothing when every override lands', () => {
    expect(
      unusedOverrideIds(overrides({ '1': { decade: '1930s', note: 'n' } }), [record({ id: 1 })]),
    ).toEqual([])
  })
})
