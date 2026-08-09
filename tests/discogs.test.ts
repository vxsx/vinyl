import { describe, it, expect, vi } from 'vitest'
import { DiscogsClient } from '../scripts/lib/discogs'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

function makeClient(fetchImpl: any, sleep = vi.fn().mockResolvedValue(undefined)) {
  return {
    client: new DiscogsClient({
      token: 'test-token',
      userAgent: 'VinylTest/1.0',
      fetchImpl,
      sleep,
      minIntervalMs: 0,
    }),
    sleep,
  }
}

describe('DiscogsClient.get', () => {
  it('sends the token and User-Agent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }))
    const { client } = makeClient(fetchImpl)

    await client.get('/releases/1')

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.discogs.com/releases/1')
    expect(init.headers.Authorization).toBe('Discogs token=test-token')
    expect(init.headers['User-Agent']).toBe('VinylTest/1.0')
  })

  it('retries after Retry-After on 429, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }))
    const { client, sleep } = makeClient(fetchImpl)

    const result = await client.get<{ id: number }>('/releases/7')

    expect(result.id).toBe(7)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(3000)
  })

  it('throws with status and path on a non-retryable error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 404 }))
    const { client } = makeClient(fetchImpl)

    await expect(client.get('/releases/404')).rejects.toThrow(/404.*\/releases\/404/)
  })

  it('gives up after the retry limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { 'retry-after': '1' } }),
    )
    const { client } = makeClient(fetchImpl)

    await expect(client.get('/releases/1')).rejects.toThrow(/rate limit/i)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })
})

describe('DiscogsClient.getAllPages', () => {
  it('follows pagination until the last page', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ pagination: { page: 1, pages: 2 }, releases: [{ id: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ pagination: { page: 2, pages: 2 }, releases: [{ id: 2 }] }))
    const { client } = makeClient(fetchImpl)

    const items = await client.getAllPages<{ id: number }>('/users/x/collection/folders/0/releases', 'releases')

    expect(items.map(i => i.id)).toEqual([1, 2])
    expect(fetchImpl.mock.calls[1]![0]).toContain('page=2')
  })

  it('returns an empty array when the collection is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ pagination: { page: 1, pages: 1 }, wants: [] }),
    )
    const { client } = makeClient(fetchImpl)

    expect(await client.getAllPages('/users/x/wants', 'wants')).toEqual([])
  })
})
