import { describe, it, expect } from 'vitest'
import { slugify, assignSlugs } from '../scripts/lib/slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Back To Black')).toBe('back-to-black')
  })

  it('folds diacritics', () => {
    expect(slugify('Bedřich Smetana')).toBe('bedrich-smetana')
    expect(slugify('Christoph von Dohnányi')).toBe('christoph-von-dohnanyi')
  })

  it('folds superscript characters found in classical titles', () => {
    expect(slugify('Peer Gynt Suites Nᵒˢ 1 & 2')).toBe('peer-gynt-suites-nos-1-2')
  })

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify("Rock'n Roll -- Hits!!")).toBe('rock-n-roll-hits')
  })

  it('trims to a sane length without a trailing hyphen', () => {
    const long = slugify('a'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('assignSlugs', () => {
  it('builds artist-title slugs', () => {
    const slugs = assignSlugs([{ id: 1, primaryArtist: 'Joy Division', title: 'Substance' }])
    expect(slugs.get(1)).toBe('joy-division-substance')
  })

  it('disambiguates collisions with the release id', () => {
    const slugs = assignSlugs([
      { id: 11, primaryArtist: 'The Beatles', title: 'The Beatles' },
      { id: 22, primaryArtist: 'The Beatles', title: 'The Beatles' },
    ])
    expect(slugs.get(11)).toBe('the-beatles-the-beatles')
    expect(slugs.get(22)).toBe('the-beatles-the-beatles-22')
    expect(new Set(slugs.values()).size).toBe(2)
  })

  it('never produces an empty slug', () => {
    const slugs = assignSlugs([{ id: 9, primaryArtist: '', title: '???' }])
    expect(slugs.get(9)).toBe('release-9')
  })
})
