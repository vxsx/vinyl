export type RawArtist = { name: string; join: string }

/**
 * Discogs appends "(2)", "(4)" etc. to disambiguate artists sharing a name.
 * Only a bare number in trailing parentheses is a disambiguator.
 */
export function stripDisambiguation(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

/** Separators that hug the preceding word rather than standing alone. */
const TIGHT_LEADING = /^[,;]/

export function formatArtists(artists: RawArtist[]): string {
  let out = ''
  for (const artist of artists) {
    out += stripDisambiguation(artist.name)
    const join = artist.join.trim()
    if (join) {
      // "," attaches to the previous name; "/" and words get spaces either side.
      out += TIGHT_LEADING.test(join) ? `${join} ` : ` ${join} `
    }
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[,;\/&·-]\s*$/, '')
    .trim()
}

export function primaryArtistName(artists: RawArtist[]): string {
  const first = artists[0]
  return first ? stripDisambiguation(first.name) : ''
}
