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

/** A decade label: three digits, a zero, an "s" — "1930s", "2020s". */
export const DecadeLabelSchema = z.string().regex(/^\d{3}0s$/)

export const RecordSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  title: z.string().min(1),
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
  /**
   * Decade of originalYear, falling back to pressedYear; "Unknown" when both
   * are null — unless data/decade-overrides.json overrides it outright.
   */
  decade: z.union([DecadeLabelSchema, z.literal('Unknown')]),
  /**
   * The decade the music was RECORDED, set only where an override supplied it.
   * null everywhere else: Discogs stamps a compilation's own issue date on both
   * the pressing and the master, so a recording period is not derivable — it
   * exists only in prose, and only a human can read it out.
   */
  recordedDecade: DecadeLabelSchema.nullable(),
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

/**
 * One hand-written correction from data/decade-overrides.json.
 *
 * A decade, never a year: for a compilation of sides cut across 1934-1939 a
 * single year would be false precision. `note` is for the human who wrote the
 * entry — the recording span, and why it could not be derived.
 *
 * .strict() is deliberate. A typo'd field name has to fail the sync rather
 * than parse cleanly and quietly correct nothing.
 */
export const DecadeOverrideSchema = z
  .object({
    decade: DecadeLabelSchema,
    note: z.string().min(1),
  })
  .strict()

/**
 * The whole override file: Discogs release id (as a string, since JSON keys are
 * strings) to correction. Release ids are stable across re-syncs; slugs are
 * derived from artist and title and are not.
 */
export const DecadeOverridesSchema = z.record(
  z.string().regex(/^\d+$/),
  DecadeOverrideSchema,
)

export type VinylRecord = z.infer<typeof RecordSchema>
export type Track = z.infer<typeof TrackSchema>
export type DecadeOverride = z.infer<typeof DecadeOverrideSchema>
export type DecadeOverrides = z.infer<typeof DecadeOverridesSchema>
