
const BASE_URL = 'https://api.discogs.com'
const MAX_RATE_LIMIT_RETRIES = 5
/** 60 req/min allowed; ~55/min keeps a margin. */
const DEFAULT_MIN_INTERVAL_MS = 1100
const PER_PAGE = 100

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>
export type SleepFn = (ms: number) => Promise<void>

type Options = {
  token: string
  userAgent: string
  fetchImpl?: FetchLike
  sleep?: SleepFn
  minIntervalMs?: number
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const MAX_WAIT_MS = 300000 // 5 minutes max

/**
 * Parse a Retry-After header, which can be delta-seconds (RFC 7231) or an HTTP-date (RFC 9110).
 * Returns milliseconds to wait. Always returns a finite non-negative number.
 * @param header The Retry-After header value, or null if absent
 * @param now Current timestamp in milliseconds (for testing)
 * @returns Milliseconds to wait, clamped to [0, MAX_WAIT_MS]
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number {
  if (!header) {
    // No header: default to 60 seconds
    return 60000
  }

  // Try to parse as delta-seconds (a number)
  const deltaSeconds = Number(header)
  if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
    // It's a valid finite non-negative number: treat as delta-seconds
    return Math.min(deltaSeconds * 1000, MAX_WAIT_MS)
  }

  // Try to parse as HTTP-date
  const dateMs = Date.parse(header)
  if (Number.isFinite(dateMs)) {
    // Valid HTTP-date: calculate wait time (clamped at 0 if already past)
    const waitMs = Math.max(0, dateMs - now)
    return Math.min(waitMs, MAX_WAIT_MS)
  }

  // Garbage: fall back to 60 seconds
  return 60000
}

export class DiscogsClient {
  private readonly token: string
  private readonly userAgent: string
  private readonly fetchImpl: FetchLike
  private readonly sleep: SleepFn
  private readonly minIntervalMs: number
  private lastRequestAt = 0

  constructor(opts: Options) {
    this.token = opts.token
    this.userAgent = opts.userAgent
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
    this.sleep = opts.sleep ?? defaultSleep
    this.minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  }

  async get<T>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`

    for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      await this.throttle()

      const response = await this.fetchImpl(url, {
        headers: {
          Authorization: `Discogs token=${this.token}`,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      })

      if (response.status === 429) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
        await this.sleep(retryAfterMs)
        continue
      }

      if (!response.ok) {
        throw new Error(`Discogs request failed: ${response.status} ${path}`)
      }

      return (await response.json()) as T
    }

    throw new Error(`Discogs rate limit not cleared after ${MAX_RATE_LIMIT_RETRIES} attempts: ${path}`)
  }

  async getAllPages<T>(path: string, itemsKey: string): Promise<T[]> {
    const items: T[] = []
    let page = 1
    let totalPages = 1

    do {
      const separator = path.includes('?') ? '&' : '?'
      const body = await this.get<Record<string, unknown>>(
        `${path}${separator}page=${page}&per_page=${PER_PAGE}`,
      )
      const pageItems = body[itemsKey]
      if (Array.isArray(pageItems)) items.push(...(pageItems as T[]))

      const pagination = body.pagination as { pages?: number } | undefined
      totalPages = pagination?.pages ?? 1
      page++
    } while (page <= totalPages)

    return items
  }

  private async throttle(): Promise<void> {
    if (this.minIntervalMs <= 0) return
    const elapsed = Date.now() - this.lastRequestAt
    const wait = this.minIntervalMs - elapsed
    if (wait > 0) await this.sleep(wait)
    this.lastRequestAt = Date.now()
  }
}
