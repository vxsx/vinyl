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

/**
 * Folds diacritics the same way scripts/lib/slug.ts does, so a search for
 * "wintertraume" matches a record whose title is "Winterträume". Applied to
 * both the indexed text below and the user's typed query in filters.ts.
 */
export function foldDiacritics(input: string): string {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

export function searchTextFor(record: VinylRecord): string {
  return foldDiacritics(`${record.artist} ${record.title} ${record.label}`).toLowerCase()
}
