import type { VinylRecord, Track } from '../../src/lib/schema.js'
import { formatArtists, primaryArtistName, type RawArtist } from './artist.js'

export type RawTrack = { type_?: string; position?: string; title?: string; duration?: string }

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

export function cleanTracklist(raw: RawTrack[]): Track[] {
  return raw
    .filter((track) => (track.type_ ?? 'track') === 'track')
    .map((track) => ({
      position: track.position ?? '',
      title: track.title ?? '',
      duration: track.duration ? track.duration : null,
    }))
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

  const pressedYear = year(release.year ?? basic.year)
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
