import type { VinylRecord, Track } from '../../src/lib/schema.js'
import { formatArtists, primaryArtistName, type RawArtist } from './artist.js'

export type RawTrack = {
  type_?: string
  position?: string
  title?: string
  duration?: string
  /** Discogs hangs real tracks off an `index` entry (opera acts, suite movements, …). One level deep only. */
  sub_tracks?: RawTrack[]
}

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

function toTrack(raw: RawTrack): Track {
  return {
    position: raw.position ?? '',
    title: raw.title ?? '',
    duration: raw.duration ? raw.duration : null,
  }
}

/**
 * Most entries are plain tracks. Discogs also uses `type_: 'index'` to group a
 * work (an opera, a symphony, a suite) and hangs its real tracks off that
 * entry's `sub_tracks` array instead of listing them at the top level — so an
 * index entry with sub-tracks contributes those sub-tracks, not itself.
 * A bare heading, or an index with no sub-tracks, contributes nothing.
 * Only one level of sub_tracks is ever flattened; Discogs does not nest deeper.
 */
export function cleanTracklist(raw: RawTrack[]): Track[] {
  const tracks: Track[] = []
  for (const entry of raw) {
    if ((entry.type_ ?? 'track') === 'track') {
      tracks.push(toTrack(entry))
    } else if (entry.sub_tracks && entry.sub_tracks.length > 0) {
      for (const sub of entry.sub_tracks) {
        if ((sub.type_ ?? 'track') === 'track') tracks.push(toTrack(sub))
      }
    }
  }
  return tracks
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

  // `??` only falls through on null/undefined, not 0 — and Discogs uses 0 for
  // "unknown", so a release.year of 0 must fall through to basic.year too.
  // Mapping each side through year() first (which turns 0 into null) makes
  // the `??` fall through correctly in that case.
  const pressedYear = year(release.year) ?? year(basic.year)
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
