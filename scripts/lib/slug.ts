const MAX_LENGTH = 80

export function slugify(input: string): string {
  return input
    // NFKD also folds superscripts: "Nᵒˢ" -> "Nos"
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '')
}

export function assignSlugs(
  items: { id: number; primaryArtist: string; title: string }[],
): Map<number, string> {
  const taken = new Set<string>()
  const result = new Map<number, string>()

  for (const item of items) {
    const base = slugify(`${item.primaryArtist} ${item.title}`) || `release-${item.id}`

    // Try base first, then base-id, then base-id-2, base-id-3, etc.
    let slug = base
    let counter = 1

    if (taken.has(slug)) {
      // Truncate base to ensure base-id fits within MAX_LENGTH
      const suffix = `-${item.id}`
      const maxBaseLength = Math.max(0, MAX_LENGTH - suffix.length)
      const truncatedBase = base.slice(0, maxBaseLength).replace(/-+$/, '')
      slug = `${truncatedBase}${suffix}`

      // If base-id is also taken, increment counter
      while (taken.has(slug)) {
        counter++
        const counterSuffix = `-${item.id}-${counter}`
        const maxBaseLengthForCounter = Math.max(0, MAX_LENGTH - counterSuffix.length)
        const truncatedBaseForCounter = base.slice(0, maxBaseLengthForCounter).replace(/-+$/, '')
        slug = `${truncatedBaseForCounter}${counterSuffix}`
      }
    }

    taken.add(slug)
    result.set(item.id, slug)
  }

  return result
}
