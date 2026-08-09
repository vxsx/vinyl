import { describe, it, expect } from 'vitest'
import { genreCounts, decadeCounts, searchTextFor, foldDiacritics } from '../src/lib/facets'
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

  it('folds diacritics so an accented record matches an unaccented query', () => {
    const text = searchTextFor(record({ artist: 'Combo', title: 'Winterträume', label: 'L' }))
    expect(text).toContain(foldDiacritics('wintertraume'))
    expect(text).toContain('wintertraume')
  })
})
