// tests/assets.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadIfMissing, pickImages, MAX_SECONDARY_IMAGES } from '../scripts/lib/assets'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'assets-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('downloadIfMissing', () => {
  it('downloads and writes the file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const dest = join(dir, 'nested', 'cover.jpg')

    expect(await downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).toBe('downloaded')
    expect(new Uint8Array(await readFile(dest))).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('skips the request when the file already exists', async () => {
    const dest = join(dir, 'cover.jpg')
    await writeFile(dest, 'existing')
    const fetchImpl = vi.fn()

    expect(await downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).toBe('cached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('re-downloads and overwrites an existing file when force is true', async () => {
    const dest = join(dir, 'cover.jpg')
    await writeFile(dest, 'stale')
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([9, 9, 9])))

    expect(await downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl, force: true })).toBe('downloaded')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(new Uint8Array(await readFile(dest))).toEqual(new Uint8Array([9, 9, 9]))
  })

  it('throws and leaves no partial file when the response fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    const dest = join(dir, 'cover.jpg')

    await expect(downloadIfMissing('https://example.test/a.jpg', dest, { fetchImpl })).rejects.toThrow(/500/)
    await expect(readFile(dest)).rejects.toThrow()
  })
})

describe('pickImages', () => {
  const img = (type: string, n: number) => ({ type, uri: `u${n}`, width: 600, height: 600 })

  it('uses the primary as cover and the secondaries as gallery', () => {
    const { cover, gallery } = pickImages([img('secondary', 1), img('primary', 2), img('secondary', 3)])
    expect(cover?.uri).toBe('u2')
    expect(gallery.map((i) => i.uri)).toEqual(['u1', 'u3'])
  })

  it('falls back to the first image as cover and keeps it out of the gallery', () => {
    const { cover, gallery } = pickImages([img('secondary', 1), img('secondary', 2), img('secondary', 3)])
    expect(cover?.uri).toBe('u1')
    expect(gallery.map((i) => i.uri)).toEqual(['u2', 'u3'])
  })

  it('caps the gallery', () => {
    const all = Array.from({ length: MAX_SECONDARY_IMAGES + 5 }, (_, n) => img('secondary', n))
    expect(pickImages(all).gallery).toHaveLength(MAX_SECONDARY_IMAGES)
  })

  it('handles no images', () => {
    expect(pickImages([])).toEqual({ cover: undefined, gallery: [] })
  })
})
