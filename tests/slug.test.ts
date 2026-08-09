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

  it('resolves three-way collision with counter logic', () => {
    // Exact counterexample from the brief: base "foo-200" collides with a suffixed slug
    const slugs = assignSlugs([
      { id: 555, primaryArtist: '', title: 'foo 200' },
      { id: 111, primaryArtist: '', title: 'foo' },
      { id: 200, primaryArtist: '', title: 'foo' },
    ])
    expect(slugs.get(555)).toBe('foo-200')
    expect(slugs.get(111)).toBe('foo')
    expect(slugs.get(200)).toBe('foo-200-2')
    expect(new Set(slugs.values()).size).toBe(3)
  })

  it('increments counter when base and base-id both collide', () => {
    // base "test", base-id "test-2", and base-id-2 collision forces counter
    const slugs = assignSlugs([
      { id: 1, primaryArtist: '', title: 'test' },
      { id: 2, primaryArtist: '', title: 'test' },
      { id: 20, primaryArtist: '', title: 'test 2' },
    ])
    expect(slugs.get(1)).toBe('test')
    expect(slugs.get(2)).toBe('test-2')
    expect(slugs.get(20)).toBe('test-2-20')
    expect(new Set(slugs.values()).size).toBe(3)
  })

  it('truncates base before appending suffix to stay within MAX_LENGTH', () => {
    // Create a collision with a very long base
    const longTitle = 'a'.repeat(100) // Will be slugified to 80 chars of 'a's
    const slugs = assignSlugs([
      { id: 1, primaryArtist: '', title: longTitle },
      { id: 9999, primaryArtist: '', title: longTitle },
    ])
    const slug1 = slugs.get(1)
    const slug9999 = slugs.get(9999)
    expect(slug1).toBe('a'.repeat(80))
    expect(slug9999).toBeDefined()
    expect(slug9999!.length).toBeLessThanOrEqual(80)
    expect(slug9999!.endsWith('-')).toBe(false)
    expect(new Set(slugs.values()).size).toBe(2)
  })
})
