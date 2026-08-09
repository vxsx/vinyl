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
  /** Decade of originalYear, falling back to pressedYear; "Unknown" when both are null. */
  decade: z.union([z.string().regex(/^\d{3}0s$/), z.literal('Unknown')]),
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
