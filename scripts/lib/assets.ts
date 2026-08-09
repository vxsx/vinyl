// scripts/lib/assets.ts
import { mkdir, writeFile, rename, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { FetchLike } from './discogs.js'

/** Cap per record so the repo stays small as the collection grows. */
export const MAX_SECONDARY_IMAGES = 8

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
