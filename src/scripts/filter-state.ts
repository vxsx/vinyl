// src/scripts/filter-state.ts
// Persistence for a grid page's filter selection, search text and scroll
// offset, so that leaving for a record's detail page and coming back lands on
// exactly the view that was left.
//
// Deliberately NOT in the URL: a filtered view isn't worth sharing, and
// keeping it out of the address bar means no history entry per chip click and
// no history-management code. sessionStorage also gives the right lifetime for
// free — it's per tab and per session, so a collection opened fresh in a new
// tab (or after the browser is closed) starts unfiltered by construction,
// while a round trip within the same tab is preserved.

export interface FilterState {
  genre: string[]
  decade: string[]
  query: string
  scroll: number
}

const PREFIX = 'vinyl:grid:'

/**
 * The collection and the wishlist each render their own independent filter
 * bar, so state is keyed by pathname and neither page can read or clobber the
 * other's. Trailing slashes are normalised because the same page is reachable
 * as both `/vinyl` and `/vinyl/`.
 */
export function stateKey(pathname: string): string {
  return `${PREFIX}${pathname.replace(/\/+$/, '')}/`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Returns null when nothing is stored. Anything stored but malformed (a hand
 * edited entry, or a record written by an older shape of this file) is read
 * field by field and falls back per field, so a bad value can never leave the
 * page half-restored or throw during init.
 */
export function readState(key: string): FilterState | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(key)
  } catch {
    // Storage can be unavailable (blocked cookies, hardened privacy modes).
    // Persistence is a convenience; its absence must never break filtering.
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const { genre, decade, query, scroll } = parsed as Record<string, unknown>
  return {
    genre: isStringArray(genre) ? genre : [],
    decade: isStringArray(decade) ? decade : [],
    query: typeof query === 'string' ? query : '',
    scroll: typeof scroll === 'number' && Number.isFinite(scroll) ? scroll : 0,
  }
}

export function writeState(key: string, state: FilterState): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Quota exceeded or storage unavailable — same reasoning as readState.
  }
}
