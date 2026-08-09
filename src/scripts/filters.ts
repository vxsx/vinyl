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

  for (const chip of document.querySelectorAll<HTMLButtonElement>('.chip')) {
    chip.addEventListener('click', () => {
      const facet = chip.dataset.facet as 'genre' | 'decade'
      const value = chip.dataset.value ?? ''
      const active = selected[facet].has(value)

      if (active) selected[facet].delete(value)
      else selected[facet].add(value)

      chip.setAttribute('aria-pressed', String(!active))
      apply()
    })
  }

  search?.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    apply()
  })
}
