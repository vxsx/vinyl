const MAX_LENGTH = 80

export function slugify(input: string): string {
  return input
    // NFKD also folds superscripts: "Nᵒˢ" -> "Nos"
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
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
    const slug = taken.has(base) ? `${base}-${item.id}` : base
    taken.add(slug)
    result.set(item.id, slug)
  }

  return result
}
