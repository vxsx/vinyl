import type { ImageMetadata } from 'astro'
import { CollectionSchema, type VinylRecord } from './schema'
import collectionJson from '../../data/collection.json'
import wantlistJson from '../../data/wantlist.json'

// Parsing here means a malformed data file fails the build rather than the page.
export const collection: VinylRecord[] = CollectionSchema.parse(collectionJson)
export const wantlist: VinylRecord[] = CollectionSchema.parse(wantlistJson)

const covers = import.meta.glob<{ default: ImageMetadata }>('/src/assets/covers/*.jpg', { eager: true })
const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/*.jpg', { eager: true })

export function coverFor(file: string | null): ImageMetadata | undefined {
  if (!file) return undefined
  return covers[`/src/assets/covers/${file}`]?.default
}

export function imageFor(file: string): ImageMetadata | undefined {
  return images[`/src/assets/images/${file}`]?.default
}
