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
/** Apostrophes that elide onto the next name. */
const ENDING_APOSTROPHE = /['']$/

export function formatArtists(artists: RawArtist[]): string {
  let out = ''
  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i]
    if (!artist) continue
    out += stripDisambiguation(artist.name)
    // Only append the join if there's a next artist
    const join = artist.join.trim()
    if (join && i < artists.length - 1) {
      // "," attaches to the previous name; apostrophes elide to the next; others get spaces both sides.
      if (TIGHT_LEADING.test(join)) {
        out += `${join} `
      } else if (ENDING_APOSTROPHE.test(join)) {
        out += ` ${join}`
      } else {
        out += ` ${join} `
      }
    }
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function primaryArtistName(artists: RawArtist[]): string {
  const first = artists[0]
  return first ? stripDisambiguation(first.name) : ''
}
