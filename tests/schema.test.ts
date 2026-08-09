import { describe, it, expect } from 'vitest'
import { RecordSchema } from '../src/lib/schema'

const valid = {
  id: 7132351,
  slug: 'joy-division-substance',
  title: 'Substance',
  artist: 'Joy Division',
  primaryArtist: 'Joy Division',
  artistSort: 'Joy Division',
  coverFile: '7132351.jpg',
  genres: ['Electronic', 'Rock'],
  styles: ['Post-Punk'],
  label: 'Factory',
  catno: 'FACT 250',
  country: 'UK & Europe',
  pressedYear: 2015,
  originalYear: 1988,
  isOriginalPressing: false,
  decade: '2010s',
  formatDescriptions: ['LP', 'Compilation', 'Reissue'],
  isPlainLP: true,
  tracklist: [{ position: 'A1', title: 'Warsaw', duration: '2:25' }],
  sides: ['A'],
  credits: [{ role: 'Producer', name: 'Martin Hannett' }],
  identifiers: [{ type: 'Barcode', description: null, value: '825646089871' }],
  notes: 'Issued with two printed inner sleeves.',
  images: [{ file: '7132351-1.jpg', width: 600, height: 597 }],
  dateAdded: '2026-07-29T09:47:04-07:00',
}

describe('RecordSchema', () => {
  it('accepts a fully populated record', () => {
    expect(() => RecordSchema.parse(valid)).not.toThrow()
  })

  it('accepts null years and a null cover', () => {
    const sparse = { ...valid, pressedYear: null, originalYear: null, coverFile: null, decade: 'Unknown' }
    expect(() => RecordSchema.parse(sparse)).not.toThrow()
  })

  it('rejects a record whose genres are a bare string', () => {
    expect(() => RecordSchema.parse({ ...valid, genres: 'Rock' })).toThrow()
  })

  it('rejects year zero — absent years must be null, not 0', () => {
    expect(() => RecordSchema.parse({ ...valid, pressedYear: 0 })).toThrow()
  })

  it('rejects originalYear zero', () => {
    expect(() => RecordSchema.parse({ ...valid, originalYear: 0 })).toThrow()
  })

  it('accepts valid decade labels matching the 19d0s/20d0s pattern', () => {
    expect(() => RecordSchema.parse({ ...valid, decade: '1970s' })).not.toThrow()
    expect(() => RecordSchema.parse({ ...valid, decade: '2010s' })).not.toThrow()
  })

  it('accepts "Unknown" for decade', () => {
    expect(() => RecordSchema.parse({ ...valid, decade: 'Unknown' })).not.toThrow()
  })

  it('rejects malformed decade values', () => {
    expect(() => RecordSchema.parse({ ...valid, decade: '197s' })).toThrow()
    expect(() => RecordSchema.parse({ ...valid, decade: '1975s' })).toThrow()
    expect(() => RecordSchema.parse({ ...valid, decade: '' })).toThrow()
    expect(() => RecordSchema.parse({ ...valid, decade: 'banana' })).toThrow()
  })
})
