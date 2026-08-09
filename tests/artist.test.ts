import { describe, it, expect } from 'vitest'
import { stripDisambiguation, formatArtists, primaryArtistName } from '../scripts/lib/artist'

describe('stripDisambiguation', () => {
  it('removes a trailing numeric suffix', () => {
    expect(stripDisambiguation('Chicago (2)')).toBe('Chicago')
    expect(stripDisambiguation('Ronald Smith (4)')).toBe('Ronald Smith')
  })

  it('leaves meaningful parentheses alone', () => {
    expect(stripDisambiguation('Sunny Day Real Estate (LP)')).toBe('Sunny Day Real Estate (LP)')
    expect(stripDisambiguation('Fela Kuti')).toBe('Fela Kuti')
  })
})

describe('formatArtists', () => {
  it('joins a single artist with no join value', () => {
    expect(formatArtists([{ name: 'Joy Division', join: '' }])).toBe('Joy Division')
  })

  it('joins two artists with a symbolic separator', () => {
    expect(formatArtists([
      { name: 'Louis Armstrong', join: ',' },
      { name: 'Oscar Peterson', join: '' },
    ])).toBe('Louis Armstrong, Oscar Peterson')
  })

  it('puts spaces around word separators', () => {
    expect(formatArtists([
      { name: 'Eric Clapton', join: '/' },
      { name: 'Jeff Beck', join: '' },
    ])).toBe('Eric Clapton / Jeff Beck')
  })

  it('handles a phrase used as a join value', () => {
    expect(formatArtists([
      { name: 'Wiener Staatsoper', join: 'Leitung:' },
      { name: 'Gianfranco Rivoli', join: '' },
    ])).toBe('Wiener Staatsoper Leitung: Gianfranco Rivoli')
  })

  it('strips disambiguation from every name', () => {
    expect(formatArtists([{ name: 'Cream (2)', join: '' }])).toBe('Cream')
  })

  it('never leaves a trailing separator or doubled space', () => {
    const out = formatArtists([
      { name: 'Edvard Grieg', join: ' Peer Gynt Suites,' },
      { name: 'Bedřich Smetana', join: ',' },
    ])
    expect(out).not.toMatch(/\s{2,}/)
    expect(out).not.toMatch(/[,\/&-]\s*$/)
  })
})

describe('primaryArtistName', () => {
  it('returns only the first credited artist', () => {
    expect(primaryArtistName([
      { name: 'Giuseppe Verdi', join: ',' },
      { name: 'Licinio Montefusco', join: ',' },
    ])).toBe('Giuseppe Verdi')
  })

  it('falls back to an empty string when there are no artists', () => {
    expect(primaryArtistName([])).toBe('')
  })
})
