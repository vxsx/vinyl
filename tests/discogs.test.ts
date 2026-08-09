import { describe, it, expect, vi } from 'vitest'
import { DiscogsClient, parseRetryAfter } from '../scripts/lib/discogs'

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

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => {
    const ms = parseRetryAfter('3')
    expect(ms).toBe(3000)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('defaults to 60 seconds when header is absent', () => {
    const ms = parseRetryAfter(null)
    expect(ms).toBe(60000)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('parses HTTP-date form', () => {
    const futureDate = 'Wed, 21 Oct 2026 07:28:00 GMT'
    const pastDate = Date.parse('Wed, 21 Oct 2026 07:26:00 GMT')
    const ms = parseRetryAfter(futureDate, pastDate)
    expect(ms).toBe(120000) // 2 minutes in milliseconds
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('clamps past HTTP-date to 0', () => {
    const pastDate = 'Wed, 21 Oct 2026 07:25:00 GMT'
    const now = Date.parse('Wed, 21 Oct 2026 07:26:00 GMT')
    const ms = parseRetryAfter(pastDate, now)
    expect(ms).toBe(0)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('treats garbage as fallback to 60 seconds', () => {
    const ms = parseRetryAfter('soon')
    expect(ms).toBe(60000)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('clamps huge delta-seconds to 300 seconds', () => {
    const ms = parseRetryAfter('99999')
    expect(ms).toBe(300000)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('integration: 429 with HTTP-date header calls sleep with finite value', async () => {
    // Relative to Date.now() so this test never goes stale — a literal future
    // date eventually becomes a literal past date, at which point
    // parseRetryAfter(header) (no `now` override, so it reads live Date.now())
    // correctly returns 0 and the assertion below would start failing.
    const futureDate = new Date(Date.now() + 120_000).toUTCString()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': futureDate } }))
      .mockResolvedValueOnce(jsonResponse({ id: 42 }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const client = new DiscogsClient({
      token: 'test-token',
      userAgent: 'VinylTest/1.0',
      fetchImpl,
      sleep,
      minIntervalMs: 0,
    })

    const result = await client.get<{ id: number }>('/releases/42')

    expect(result.id).toBe(42)
    expect(sleep).toHaveBeenCalledTimes(1)
    const sleepArg = sleep.mock.calls[0]![0]
    expect(Number.isFinite(sleepArg)).toBe(true)
    expect(sleepArg).toBeGreaterThan(0)
  })
})
