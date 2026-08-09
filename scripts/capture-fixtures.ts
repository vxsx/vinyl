// scripts/capture-fixtures.ts
// One-shot helper. Run with a token to refresh tests/fixtures from the live API.
import { writeFile, mkdir } from 'node:fs/promises'
import { DiscogsClient } from './lib/discogs.js'

const TARGETS = [
  { name: 'substance', releaseId: 7132351, masterId: 4912 },
  { name: 'hybrid-theory', releaseId: 14820313, masterId: 74519 },
  { name: 'rigoletto', releaseId: 17980264, masterId: 925420 },
  { name: 'blues-in-orbit', releaseId: 11339741, masterId: 639911 },
]

const token = process.env.DISCOGS_TOKEN
if (!token) throw new Error('DISCOGS_TOKEN is required')

const client = new DiscogsClient({ token, userAgent: 'VinylSite/1.0 +https://github.com/vxsx/vinyl' })
await mkdir('tests/fixtures', { recursive: true })

for (const target of TARGETS) {
  const release = await client.get(`/releases/${target.releaseId}`)
  await writeFile(`tests/fixtures/release-${target.name}.json`, JSON.stringify(release, null, 2))
  if (target.masterId) {
    const master = await client.get(`/masters/${target.masterId}`)
    await writeFile(`tests/fixtures/master-${target.name}.json`, JSON.stringify(master, null, 2))
  }
  console.log(`captured ${target.name}`)
}

// Collection entries must be captured verbatim from the live API rather than
// hand-transcribed, since hand-transcription is error-prone and these fixtures
// pin exact edge-case shapes for Task 7's tests.
type CollectionEntry = {
  basic_information: { id: number }
}

const collection = await client.getAllPages<CollectionEntry>(
  '/users/vxsx/collection/folders/0/releases',
  'releases',
)

for (const target of TARGETS) {
  const entry = collection.find((r) => r.basic_information.id === target.releaseId)
  if (!entry) {
    throw new Error(`No collection entry found for ${target.name} (release ${target.releaseId})`)
  }
  await writeFile(`tests/fixtures/collection-entry-${target.name}.json`, JSON.stringify(entry, null, 2))
  console.log(`captured collection-entry-${target.name}`)
}
