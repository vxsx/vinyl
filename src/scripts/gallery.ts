// A near-fullscreen lightbox shared by every `.art` block on the page.
// Activating the main cover or any thumbnail opens it at up to ~90vw/90vh
// using the full-size asset; ArrowLeft/ArrowRight, the visible prev/next
// buttons, or a horizontal swipe step through that record's images (cover
// first, then secondaries, wrapping); Escape or a backdrop click closes it.
interface GalleryItem {
  full: string
  alt: string
}

// How far a finger must travel sideways before it counts as a swipe rather
// than a tap that wandered. Horizontal dominance is required on top of this,
// so a long vertical drag can never clear the bar by accident.
const SWIPE_MIN_PX = 50

let dialog: HTMLDivElement | null = null
let dialogPanel: HTMLElement | null = null
let imgEl: HTMLImageElement | null = null
let prevBtn: HTMLButtonElement | null = null
let nextBtn: HTMLButtonElement | null = null
let items: GalleryItem[] = []
let index = 0
let lastFocused: HTMLElement | null = null

// The keydown/resize listeners below are bound to `document`/`window`, which
// (unlike the lightbox's own markup) survive a view-transition navigation —
// so they must only ever be attached once, or Escape/ArrowLeft/ArrowRight
// and the resize refit would each fire once per past navigation.
let globalListenersBound = false

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
  if (items.length <= 1) return
  index = (index + delta + items.length) % items.length
  if (imgEl) {
    // Restart the crossfade animation even if the previous step's is still
    // playing — remove then force a reflow before re-adding the class.
    imgEl.classList.remove('is-switching')
    void imgEl.offsetWidth
    imgEl.classList.add('is-switching')
  }
  render()
}

// Horizontal swipe as the touch equivalent of the prev/next buttons — same
// step(), so the same crossfade and the same wrap at either end.
//
// The listeners are passive and never call preventDefault(): what keeps the
// browser from stealing a sideways drag is the image's `touch-action: pan-y
// pinch-zoom` (declared alongside the rest of the lightbox CSS in
// pages/record/[slug].astro), which gives up horizontal panning on this one
// element only. Page scrolling is left alone everywhere, here included.
function bindSwipe(img: HTMLImageElement): void {
  let startX = 0
  let startY = 0
  let tracking = false

  img.addEventListener(
    'touchstart',
    (event) => {
      // A second finger means a pinch, not a swipe. Abandon the gesture rather
      // than letting whichever touch survives decide a direction.
      tracking = event.touches.length === 1
      const touch = event.touches[0]
      if (!tracking || !touch) return
      startX = touch.clientX
      startY = touch.clientY
    },
    { passive: true },
  )

  img.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 1) tracking = false
    },
    { passive: true },
  )

  img.addEventListener(
    'touchend',
    (event) => {
      if (!tracking) return
      tracking = false
      const touch = event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      // Deliberate sideways travel only: far enough to be a swipe, and more
      // horizontal than vertical so a drag down the page is never misread.
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return
      // Left drags the next image in from the right, as the strip would move.
      step(dx < 0 ? 1 : -1)
    },
    { passive: true },
  )

  img.addEventListener(
    'touchcancel',
    () => {
      tracking = false
    },
    { passive: true },
  )
}

function close(): void {
  if (!dialog || !isOpen()) return
  dialog.classList.remove('is-open')
  const toFocus = lastFocused
  lastFocused = null
  toFocus?.focus()
}

function ensureDialog(): HTMLDivElement {
  // A view-transition navigation swaps the whole document body, which
  // silently detaches this element (it was appended imperatively, not
  // declared in any page template) — the cached reference then points at a
  // node that's no longer on screen. Rebuild it whenever that's happened.
  if (dialog && dialog.isConnected) return dialog

  const el = document.createElement('div')
  el.className = 'lightbox'
  el.innerHTML = `
    <div class="lightbox-backdrop"></div>
    <button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous photo">&lsaquo;</button>
    <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1">
      <button type="button" class="lightbox-close" aria-label="Close">&times;</button>
      <img class="lightbox-img" alt="" />
    </div>
    <button type="button" class="lightbox-nav lightbox-next" aria-label="Next photo">&rsaquo;</button>
  `
  document.body.appendChild(el)

  dialog = el
  dialogPanel = el.querySelector<HTMLElement>('.lightbox-dialog')
  imgEl = el.querySelector<HTMLImageElement>('.lightbox-img')
  prevBtn = el.querySelector<HTMLButtonElement>('.lightbox-prev')
  nextBtn = el.querySelector<HTMLButtonElement>('.lightbox-next')

  el.querySelector('.lightbox-backdrop')?.addEventListener('click', close)
  el.querySelector('.lightbox-close')?.addEventListener('click', close)
  prevBtn?.addEventListener('click', () => step(-1))
  nextBtn?.addEventListener('click', () => step(1))
  imgEl?.addEventListener('load', fitImage)
  // Bound here, not in initGallery: this element is rebuilt from scratch on
  // every navigation that detaches it, so each image gets its listeners exactly
  // once and there is nothing to double-bind.
  if (imgEl) bindSwipe(imgEl)

  if (!globalListenersBound) {
    globalListenersBound = true

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
  }

  return el
}

function open(list: GalleryItem[], startIndex: number, label: string, trigger: HTMLElement): void {
  const el = ensureDialog()
  items = list
  index = startIndex
  lastFocused = trigger

  dialogPanel?.setAttribute('aria-label', label)
  const showNav = items.length > 1
  prevBtn?.toggleAttribute('hidden', !showNav)
  nextBtn?.toggleAttribute('hidden', !showNav)
  imgEl?.classList.remove('is-switching')
  render()

  el.classList.add('is-open')
  dialogPanel?.focus()
}

export function initGallery(root: ParentNode = document): void {
  for (const art of root.querySelectorAll<HTMLElement>('.art')) {
    // Idempotency guard — see the comment on the same pattern in tilt.ts.
    if (art.dataset.galleryBound) continue
    art.dataset.galleryBound = 'true'

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
