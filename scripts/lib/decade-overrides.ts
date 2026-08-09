import type { DecadeOverrides, VinylRecord } from '../../src/lib/schema.js'

export type OverrideOutcome = {
  records: VinylRecord[]
  /** Release ids whose decade this call actually changed the filing of. */
  appliedIds: number[]
}

/**
 * Applies the hand-written corrections in data/decade-overrides.json, AFTER
 * normalisation — so it overwrites a derived decade rather than competing with
 * the derivation.
 *
 * The record is otherwise untouched: `pressedYear`, `originalYear` and every
 * other field keep saying exactly what Discogs said. Only the facet the record
 * files under changes, plus `recordedDecade`, which is what lets the detail
 * page explain the filing instead of just looking wrong.
 */
export function applyDecadeOverrides(
  records: VinylRecord[],
  overrides: DecadeOverrides,
): OverrideOutcome {
  const appliedIds: number[] = []
  const applied = records.map((record) => {
    const override = overrides[String(record.id)]
    if (!override) return record
    appliedIds.push(record.id)
    return { ...record, decade: override.decade, recordedDecade: override.decade }
  })
  return { records: applied, appliedIds }
}

/**
 * Override keys that match no record in any of the given lists. Not an error —
 * a record can be sold — but worth naming, or the file rots unnoticed.
 */
export function unusedOverrideIds(
  overrides: DecadeOverrides,
  ...lists: VinylRecord[][]
): string[] {
  const known = new Set(lists.flat().map((record) => String(record.id)))
  return Object.keys(overrides).filter((id) => !known.has(id))
}
