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
