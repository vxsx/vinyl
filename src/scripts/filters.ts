// src/scripts/filters.ts
import { foldDiacritics } from '../lib/facets'
import { readState, stateKey, writeState, type FilterState } from './filter-state'

// The scroll offset is only final at the moment the page is left, so as well
// as saving on every filter change there has to be a save on the way out.
// Both hooks below live on document/window, which survive a view-transition
// navigation — so they are bound exactly once and each initFilters() swaps in
// the saver belonging to the page currently on screen. A page with no grid
// (the wishlist while it's empty) clears it, so leaving that page can't
// overwrite another page's entry with this page's scroll offset.
let saveCurrentPage: (() => void) | null = null
let exitHooksBound = false

function bindExitHooks(): void {
  if (exitHooksBound) return
  exitHooksBound = true

  // Client-side navigation away — link click or Back button alike. Fires on
  // the outgoing document while its scroll offset is still the live one, and
  // before the router has touched the URL for a forward navigation. (On a
  // Back/Forward traversal `location` has already moved on, which is why the
  // saver closes over the key captured at init instead of reading it here.)
  document.addEventListener('astro:before-preparation', () => saveCurrentPage?.())
  // Full unload — hard reload, or a link out of the site. No Astro event fires
  // for those, and pagehide covers the bfcache case that beforeunload doesn't.
  window.addEventListener('pagehide', () => saveCurrentPage?.())
}

export function initFilters(): void {
  bindExitHooks()

  const grid = document.getElementById('grid')
  if (!grid) {
    // No grid on this page: the empty wishlist, and every record detail page
    // (this runs from a document-level astro:page-load listener that outlives
    // the page that registered it). Nothing to restore, and crucially nothing
    // that may still answer for the previous page's state.
    saveCurrentPage = null
    return
  }
  // Guard against astro:page-load re-running this against DOM that's already
  // wired up — without it, a second call double-binds every chip/search
  // listener and toggles cancel each other out.
  if (grid.dataset.filtersBound) return
  grid.dataset.filtersBound = 'true'

  const sleeves = [...grid.querySelectorAll<HTMLElement>('.sleeve')]
  const shown = document.getElementById('shown')
  const noMatches = document.getElementById('no-matches')
  const search = document.getElementById('q') as HTMLInputElement | null
  const clearBtn = document.querySelector<HTMLButtonElement>('.q-clear')

  const selected: Record<'genre' | 'decade', Set<string>> = { genre: new Set(), decade: new Set() }
  let query = ''

  const key = stateKey(location.pathname)
  const stored = readState(key)

  // `scroll` is overridable for the one caller that runs before the restored
  // offset has been applied — at that point window.scrollY is still 0 and
  // reading it would persist a top-of-page position over the real one.
  function persist(scroll = Math.round(window.scrollY)): void {
    const state: FilterState = {
      genre: [...selected.genre],
      decade: [...selected.decade],
      // The raw input value, not the folded `query` — restoring has to put
      // back exactly what was typed, diacritics and casing included.
      query: search?.value ?? '',
      scroll,
    }
    writeState(key, state)
  }
  saveCurrentPage = persist

  function apply(): void {
    let visible = 0

    for (const sleeve of sleeves) {
      const genres = (sleeve.dataset.genres ?? '').split('|').filter(Boolean)
      const matchesGenre = selected.genre.size === 0 || genres.some((g) => selected.genre.has(g))
      const matchesDecade = selected.decade.size === 0 || selected.decade.has(sleeve.dataset.decade ?? '')
      const matchesQuery = query === '' || (sleeve.dataset.search ?? '').includes(query)
      const match = matchesGenre && matchesDecade && matchesQuery

      sleeve.classList.toggle('is-hidden', !match)
      if (match) visible++
    }

    if (shown) shown.textContent = String(visible)
    if (noMatches) noMatches.hidden = visible !== 0
  }

  for (const chip of document.querySelectorAll<HTMLButtonElement>('.filters .chip')) {
    const facet = chip.dataset.facet
    if (facet !== 'genre' && facet !== 'decade') continue
    const value = chip.dataset.value ?? ''

    // Restoration walks the chips that exist rather than the stored values, so
    // a genre or decade that vanished in a re-sync simply has no chip to
    // reactivate and is silently dropped. The alternative — trusting the
    // stored list — would leave the page filtered by a value with no visible
    // control to switch back off.
    if (stored?.[facet].includes(value)) {
      selected[facet].add(value)
      chip.setAttribute('aria-pressed', 'true')
    }

    chip.addEventListener('click', () => {
      const active = selected[facet].has(value)

      if (active) selected[facet].delete(value)
      else selected[facet].add(value)

      chip.setAttribute('aria-pressed', String(!active))
      apply()
      persist()
    })
  }

  // Debounced so the aria-live count doesn't announce on every keystroke.
  // Chip clicks stay synchronous — they're discrete actions, not a stream.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined

  function updateClearVisibility(): void {
    if (clearBtn) clearBtn.hidden = !search?.value
  }

  function handleSearchInput(): void {
    if (!search) return
    query = foldDiacritics(search.value.trim()).toLowerCase()
    updateClearVisibility()
    persist()

    if (searchDebounce !== undefined) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(apply, 250)
  }

  if (search && stored) {
    search.value = stored.query
    query = foldDiacritics(stored.query.trim()).toLowerCase()
  }

  // WebKit fires 'search' (not 'input') when the native clear (×) button is
  // clicked on a type="search" field, so both must be handled identically
  // or the held `query` can desync from the now-empty visible value. The
  // native cancel button is hidden in CSS; .q-clear (below) replaces it.
  search?.addEventListener('input', handleSearchInput)
  search?.addEventListener('search', handleSearchInput)
  updateClearVisibility()

  clearBtn?.addEventListener('click', () => {
    if (!search) return
    search.value = ''
    query = ''
    updateClearVisibility()
    if (searchDebounce !== undefined) clearTimeout(searchDebounce)
    apply()
    persist()
    search.focus()
  })

  if (stored) {
    // Only on a restore: with no stored state the server-rendered markup is
    // already the unfiltered view, count included, so there is nothing to do.
    apply()
    restoreScroll(stored.scroll)
    // Write the pruned selection straight back, so a stored value with no chip
    // left to match it stops being carried forward.
    persist(stored.scroll)
  }
}

function restoreScroll(top: number): void {
  if (top <= 0) return
  // apply() has just hidden every non-matching sleeve, which shortens the
  // document — scrolling before that reflow has landed gets clamped to the
  // wrong height, which reads as a silent no-op. Two frames (one to let the
  // pending style/layout flush run, one that lands after it) tie this to the
  // browser's actual paint instead of guessing at a timeout. The grid's boxes
  // are sized by aspect-ratio, so the final height doesn't wait on images.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top, left: 0, behavior: 'instant' })
    })
  })
}
