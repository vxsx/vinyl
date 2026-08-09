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

  it('elides French apostrophes onto the next name', () => {
    expect(formatArtists([
      { name: 'Les Chanteurs', join: "Et L'" },
      { name: 'Orchestre', join: '' },
    ])).toBe("Les Chanteurs Et L'Orchestre")
  })

  it('drops a trailing em-dash join', () => {
    expect(formatArtists([
      { name: 'A', join: '—' },
      { name: 'B', join: '—' },
    ])).toBe('A — B')
  })

  it('drops a trailing Leitung: join', () => {
    expect(formatArtists([
      { name: 'A', join: 'Leitung:' },
      { name: 'B', join: 'Leitung:' },
    ])).toBe('A Leitung: B')
  })

  it('does not truncate artist names ending in hyphen', () => {
    expect(formatArtists([
      { name: 'Jay-', join: '' },
    ])).toBe('Jay-')
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
