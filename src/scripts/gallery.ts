// src/scripts/gallery.ts
// Restores the approved detail-page behaviour: clicking a thumbnail swaps
// the main image. Each `.art` block on the page (there's one per detail
// page today) is wired independently so this stays safe if reused.
export function initGallery(root: ParentNode = document): void {
  for (const art of root.querySelectorAll<HTMLElement>('.art')) {
    const main = art.querySelector<HTMLImageElement>('.cover')
    const buttons = [...art.querySelectorAll<HTMLButtonElement>('.thumbs button')]
    if (!main || buttons.length === 0) continue

    for (const button of buttons) {
      button.addEventListener('click', () => {
        const full = button.dataset.full
        if (!full) return

        // Drop the responsive srcset/sizes generated for the thumbnail-sized
        // rendition so the browser doesn't ignore the swapped src in favour
        // of a stale candidate — this is a plain swap, no transition needed.
        main.removeAttribute('srcset')
        main.removeAttribute('sizes')
        main.src = full

        for (const other of buttons) other.setAttribute('aria-pressed', String(other === button))
      })
    }
  }
}
