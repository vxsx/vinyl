// scripts/lib/assets.ts
import { mkdir, writeFile, rename, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { FetchLike } from './discogs.js'

/** Cap per record so the repo stays small as the collection grows. */
export const MAX_SECONDARY_IMAGES = 25

export type ImageInfo = { uri: string; type: string; width: number; height: number }

/**
 * The cover is the image Discogs marks primary. A freshly submitted release
 * can have none — every image comes back "secondary" — so the first image
 * stands in, and whichever image is the cover stays out of the gallery so the
 * detail page never shows it twice.
 */
export function pickImages(all: ImageInfo[]): { cover: ImageInfo | undefined; gallery: ImageInfo[] } {
  const cover = all.find((image) => image.type === 'primary') ?? all[0]
  const gallery = all
    .filter((image) => image !== cover && image.type === 'secondary')
    .slice(0, MAX_SECONDARY_IMAGES)
  return { cover, gallery }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function downloadIfMissing(
  url: string,
  destPath: string,
  deps: { fetchImpl?: FetchLike; force?: boolean } = {},
): Promise<'downloaded' | 'cached'> {
  if (!deps.force && (await exists(destPath))) return 'cached'

  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as FetchLike)
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`Image download failed: ${response.status} ${url}`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  await mkdir(dirname(destPath), { recursive: true })

  // Write to a temp name and rename, so an interrupted run never leaves a truncated image.
  const tempPath = `${destPath}.partial`
  await writeFile(tempPath, bytes)
  await rename(tempPath, destPath)

  return 'downloaded'
}
