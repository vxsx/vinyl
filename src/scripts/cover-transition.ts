// src/scripts/cover-transition.ts
// One constant view-transition-name — `cover` — carries the sleeve → detail
// morph in both directions.
//
// The obvious alternative, a per-record `cover-<slug>`, cannot be styled:
// ::view-transition-group() takes a literal name and has no wildcard form, and
// the return leg is styled by the *destination* document (a grid), which has no
// way of knowing which record is flying back into it. A constant name lets one
// static rule reach the group in both directions — which is exactly what the
// z-index and the arc in tokens.css need.
//
// The price is bookkeeping. The name identifies a transition group, so two
// elements holding it when a snapshot is taken makes the browser abort the
// whole transition; exactly one element may carry it at any moment, and every
// assignment clears the previous holder first.
//
// A detail page needs none of this — it has a single cover, so it takes the
// name statically from CSS. Only grid pages, where the right sleeve out of
// fifty-odd has to be picked, are handled here.

const NAME = 'cover'

// Marks the element this module named, so the holder can be found and cleared
// again without knowing which page (or which navigation) put it there.
const MARK = 'data-cover-vt'

// Same `vinyl:` namespace as filter-state.ts, and the same reasoning for
// sessionStorage over anything longer-lived: the slug is only meaningful for
// the round trip currently in progress in this tab.
const VISITED_KEY = 'vinyl:cover:slug'

function readVisited(): string | null {
  try {
    return sessionStorage.getItem(VISITED_KEY)
  } catch {
    // Storage can be unavailable (blocked cookies, hardened privacy modes).
    // Without it the return leg simply crossfades — never an error.
    return null
  }
}

function writeVisited(slug: string): void {
  try {
    sessionStorage.setItem(VISITED_KEY, slug)
  } catch {
    // Same reasoning as readVisited.
  }
}

/** Releases the name from whichever element this module last gave it to. */
function clearName(): void {
  for (const held of document.querySelectorAll<HTMLElement>(`[${MARK}]`)) {
    held.style.removeProperty('view-transition-name')
    held.removeAttribute(MARK)
  }
}

function assignName(element: HTMLElement): void {
  clearName()
  element.setAttribute(MARK, '')
  element.style.setProperty('view-transition-name', NAME)
}

/**
 * The sleeve image for `slug`, or null when there is nothing to morph into:
 * the record is filtered out, or was never on this grid at all. Callers skip
 * naming in that case and let the plain crossfade happen.
 */
function sleeveImage(slug: string): HTMLElement | null {
  const sleeve = document.querySelector<HTMLElement>(`.sleeve[data-slug="${CSS.escape(slug)}"]`)
  const image = sleeve?.querySelector<HTMLElement>('img') ?? null
  // A filtered-out sleeve is display:none and generates no boxes, so it has
  // no geometry for the transition to aim at.
  if (!image || image.getClientRects().length === 0) return null
  return image
}

/**
 * The DOM has been replaced but the snapshot of the new state has not been
 * taken yet (that happens when the router's update callback returns), so this
 * is the window in which the destination sleeve can still claim the name.
 */
function nameDestinationSleeve(): void {
  const slug = readVisited()
  if (!slug) return
  const image = sleeveImage(slug)
  if (!image) return
  assignName(image)
}

let hooksBound = false

function bindHooks(): void {
  if (hooksBound) return
  hooksBound = true

  // Forward leg. The name has to be on the clicked sleeve before the browser
  // takes the outgoing snapshot; capture phase puts this ahead of the router's
  // own click handler without depending on listener registration order.
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented) return
      // Modified clicks open a new tab or window — this document stays put, so
      // naming anything here would only leave a stale holder behind.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const sleeve = target.closest<HTMLElement>('.sleeve[data-slug]')
      const slug = sleeve?.dataset.slug
      if (!sleeve || !slug) return

      const image = sleeve.querySelector<HTMLElement>('img')
      if (!image) return

      writeVisited(slug)
      assignName(image)
    },
    { capture: true },
  )

  // Fires while the outgoing document is still live, so this is the last point
  // at which the page being left can be identified.
  document.addEventListener('astro:before-swap', (event) => {
    // The name must survive until the animation is over — dropping it mid-flight
    // removes the group and cuts the morph short. `finished` rejects on a skipped
    // transition, and the holder still has to be released in that case.
    event.viewTransition.finished.then(clearName, clearName)

    // Only a return leg needs a sleeve named; a grid → grid move would
    // otherwise hand the name to a sleeve with nothing to morph from.
    if (!document.querySelector('.detail[data-slug]')) return

    // Subscribed here rather than once at startup so that it is guaranteed to
    // run *after* the filter restore, which binds its own astro:after-swap
    // listener on first load: listeners fire in registration order and this one
    // is always the newer. Order matters because a sleeve is measured to decide
    // whether it is on screen, and until the filters have been reapplied every
    // sleeve looks visible — including one that is about to be hidden.
    document.addEventListener('astro:after-swap', nameDestinationSleeve, { once: true })
  })
}

export function initCoverTransition(): void {
  bindHooks()

  // Recorded on arrival rather than only on click, so a detail page reached
  // without one — a shared link, a reload — still knows its own slug when it
  // is left again.
  const detail = document.querySelector<HTMLElement>('.detail[data-slug]')
  const slug = detail?.dataset.slug
  if (slug) writeVisited(slug)
}
