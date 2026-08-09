// src/scripts/gallery.ts
// A near-fullscreen lightbox shared by every `.art` block on the page.
// Activating the main cover or any thumbnail opens it at up to ~90vw/90vh
// using the full-size asset; ArrowLeft/ArrowRight step through that record's
// images (cover first, then secondaries, wrapping); Escape or a backdrop
// click closes it.
interface GalleryItem {
  full: string
  alt: string
}

let dialog: HTMLDivElement | null = null
let dialogPanel: HTMLElement | null = null
let imgEl: HTMLImageElement | null = null
let items: GalleryItem[] = []
let index = 0
let lastFocused: HTMLElement | null = null

function isOpen(): boolean {
  return dialog?.classList.contains('is-open') ?? false
}

// The stored/served images are capped well below a modern viewport (Discogs
// never returns anything above ~600px on the long side), so "almost full
// screen" only happens if we deliberately scale the image UP past its
// natural size. Browsers won't do that from CSS max-width/max-height alone —
// those only ever shrink, never grow — so the target box (up to 90vw by
// 90vh, aspect preserved) is computed here and applied as an explicit pixel
// width/height on the <img> itself, once its natural size is known.
function fitImage(): void {
  if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return
  const maxWidth = window.innerWidth * 0.9
  const maxHeight = window.innerHeight * 0.9
  const scale = Math.min(maxWidth / imgEl.naturalWidth, maxHeight / imgEl.naturalHeight)
  imgEl.style.width = `${imgEl.naturalWidth * scale}px`
  imgEl.style.height = `${imgEl.naturalHeight * scale}px`
}

function render(): void {
  const item = items[index]
  if (!item || !imgEl) return
  imgEl.alt = item.alt
  imgEl.src = item.full
  // A cached image may not re-fire 'load', so size it immediately when possible.
  if (imgEl.complete) fitImage()
}

function step(delta: number): void {
  if (items.length === 0) return
  index = (index + delta + items.length) % items.length
  render()
}

function close(): void {
  if (!dialog || !isOpen()) return
  dialog.classList.remove('is-open')
  const toFocus = lastFocused
  lastFocused = null
  toFocus?.focus()
}

function ensureDialog(): HTMLDivElement {
  if (dialog) return dialog

  const el = document.createElement('div')
  el.className = 'lightbox'
  el.innerHTML = `
    <div class="lightbox-backdrop"></div>
    <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1">
      <button type="button" class="lightbox-close" aria-label="Close">&times;</button>
      <img class="lightbox-img" alt="" />
    </div>
  `
  document.body.appendChild(el)

  dialog = el
  dialogPanel = el.querySelector<HTMLElement>('.lightbox-dialog')
  imgEl = el.querySelector<HTMLImageElement>('.lightbox-img')

  el.querySelector('.lightbox-backdrop')?.addEventListener('click', close)
  el.querySelector('.lightbox-close')?.addEventListener('click', close)
  imgEl?.addEventListener('load', fitImage)

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowLeft') step(-1)
    else if (event.key === 'ArrowRight') step(1)
  })

  // The viewport can change size (window resize, orientation change) while
  // the lightbox is open, so the 90vw/90vh target has to be recomputed —
  // it's not something that CSS alone keeps in sync once JS owns the size.
  window.addEventListener('resize', () => {
    if (isOpen()) fitImage()
  })

  return el
}

function open(list: GalleryItem[], startIndex: number, label: string, trigger: HTMLElement): void {
  const el = ensureDialog()
  items = list
  index = startIndex
  lastFocused = trigger

  dialogPanel?.setAttribute('aria-label', label)
  render()

  el.classList.add('is-open')
  dialogPanel?.focus()
}

export function initGallery(root: ParentNode = document): void {
  for (const art of root.querySelectorAll<HTMLElement>('.art')) {
    const coverButton = art.querySelector<HTMLButtonElement>('.cover-btn')
    const thumbButtons = [...art.querySelectorAll<HTMLButtonElement>('.thumbs button')]
    const buttons = (coverButton ? [coverButton] : []).concat(thumbButtons)
    if (buttons.length === 0) continue

    const label = art.dataset.label ?? 'Photo viewer'
    const list: GalleryItem[] = buttons.map((button) => ({
      full: button.dataset.full ?? '',
      alt: button.getAttribute('aria-label') ?? label,
    }))

    buttons.forEach((button, i) => {
      button.addEventListener('click', () => open(list, i, label, button))
    })
  }
}
