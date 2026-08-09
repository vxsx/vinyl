// src/scripts/filters.ts
export function initFilters(): void {
  const grid = document.getElementById('grid')
  if (!grid) return

  const sleeves = [...grid.querySelectorAll<HTMLElement>('.sleeve')]
  const shown = document.getElementById('shown')
  const noMatches = document.getElementById('no-matches')
  const search = document.getElementById('q') as HTMLInputElement | null

  const selected: Record<'genre' | 'decade', Set<string>> = { genre: new Set(), decade: new Set() }
  let query = ''

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

    chip.addEventListener('click', () => {
      const value = chip.dataset.value ?? ''
      const active = selected[facet].has(value)

      if (active) selected[facet].delete(value)
      else selected[facet].add(value)

      chip.setAttribute('aria-pressed', String(!active))
      apply()
    })
  }

  // Debounced so the aria-live count doesn't announce on every keystroke.
  // Chip clicks stay synchronous — they're discrete actions, not a stream.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined

  function handleSearchInput(): void {
    if (!search) return
    query = search.value.trim().toLowerCase()

    if (searchDebounce !== undefined) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(apply, 250)
  }

  // WebKit fires 'search' (not 'input') when the native clear (×) button is
  // clicked on a type="search" field, so both must be handled identically
  // or the held `query` can desync from the now-empty visible value.
  search?.addEventListener('input', handleSearchInput)
  search?.addEventListener('search', handleSearchInput)
}
