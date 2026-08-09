// src/scripts/tilt.ts
// The tvOS-style sleeve tilt, driven by mouse or finger with the same maths.
//
// The two inputs differ only in when the effect ends. A mouse hovers, so
// `pointerleave` is a dependable end. A finger has no hover state at all: it
// presses, drags and lifts, and the browser may revoke the gesture outright
// (`pointercancel`) the moment it decides the drag was really a page scroll.
// For touch, `pointerleave` arrives late — or, on a cancelled gesture, not at
// all — which is what left a sleeve stuck mid-tilt. The touch path therefore
// carries its own explicit lifecycle instead.
//
// Nothing here calls preventDefault(). The sleeve is a real <a>, and both of
// the default behaviours a finger already had — tap to open the record, drag
// vertically to scroll the page — must survive this effect untouched.

// A tap emits compatibility mouse events once the finger is already gone,
// pointermove among them. Honouring that echo would re-tilt the sleeve with no
// pointerleave ever coming to undo it, so mouse input arriving this soon after
// any touch is ignored.
const TOUCH_ECHO_MS = 700
let lastTouchAt = 0

export function initTilt(root: ParentNode = document): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const rootStyle = getComputedStyle(document.documentElement)
  const maxTiltDeg = parseFloat(rootStyle.getPropertyValue('--tilt-max')) || 12
  const liftScale = parseFloat(rootStyle.getPropertyValue('--tilt-scale')) || 1.05

  for (const sleeve of root.querySelectorAll<HTMLElement>('.sleeve')) {
    // With view transitions, astro:page-load can run this against DOM that's
    // already wired up (or run twice back to back) — skip anything already bound
    // so listeners never stack.
    if (sleeve.dataset.tiltBound) continue
    sleeve.dataset.tiltBound = 'true'

    const tilt = sleeve.querySelector<HTMLElement>('.tilt')
    const frame = sleeve.querySelector<HTMLElement>('.frame')
    if (!tilt || !frame) continue

    // The id of the finger currently steering this sleeve, or null. Holding the
    // id rather than a flag keeps a second finger — the start of a pinch, a
    // stray thumb — from taking the tilt over mid-gesture.
    let touchId: number | null = null

    const applyTilt = (clientX: number, clientY: number): void => {
      const rect = frame.getBoundingClientRect()
      const px = (clientX - rect.left) / rect.width
      const py = (clientY - rect.top) / rect.height
      const nx = Math.max(-1, Math.min(1, px * 2 - 1))
      const ny = Math.max(-1, Math.min(1, py * 2 - 1))

      sleeve.classList.add('is-active')
      tilt.style.setProperty('--ry', `${(nx * maxTiltDeg).toFixed(2)}deg`)
      tilt.style.setProperty('--rx', `${(-ny * maxTiltDeg).toFixed(2)}deg`)
      tilt.style.setProperty('--sc', String(liftScale))
      // Highlight slides opposite the tilt — a fixed light on a turning surface.
      tilt.style.setProperty('--px', `${(50 - nx * 50).toFixed(1)}%`)
      tilt.style.setProperty('--py', `${(50 - ny * 50).toFixed(1)}%`)
      tilt.style.setProperty('--ang', `${(120 + nx * 40).toFixed(0)}deg`)
    }

    const resetTilt = (): void => {
      sleeve.classList.remove('is-active')
      tilt.style.setProperty('--rx', '0deg')
      tilt.style.setProperty('--ry', '0deg')
      tilt.style.setProperty('--sc', '1')
      tilt.style.setProperty('--px', '50%')
      tilt.style.setProperty('--py', '50%')
    }

    const endTouch = (): void => {
      if (touchId === null) return
      touchId = null
      lastTouchAt = performance.now()
      resetTilt()
    }

    sleeve.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return
      lastTouchAt = performance.now()
      if (touchId !== null) return
      touchId = event.pointerId
      applyTilt(event.clientX, event.clientY)
    })

    sleeve.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse') {
        if (performance.now() - lastTouchAt < TOUCH_ECHO_MS) return
      } else {
        lastTouchAt = performance.now()
        // Only the finger that opened the gesture steers it, and only while it
        // is still down: anything else is a second finger or the tail of a
        // gesture that has already been released.
        if (event.pointerId !== touchId) return
      }
      applyTilt(event.clientX, event.clientY)
    })

    // A mouse pointerup is not an end — the cursor is still there — so only the
    // steering finger's own release counts. A second finger lifting off leaves
    // the tilt exactly where the first one has it.
    const releaseIfSteering = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' && event.pointerId === touchId) endTouch()
    }
    sleeve.addEventListener('pointerup', releaseIfSteering)
    sleeve.addEventListener('pointercancel', releaseIfSteering)

    // Belt and braces. A touch pointer that never got implicit capture delivers
    // its pointerup somewhere else entirely, whereas a touchend always targets
    // the element the gesture started on — so these are the handlers that
    // guarantee a sleeve is never left tilted, whatever the pointer events did.
    const releaseIfLastFinger = (event: TouchEvent): void => {
      if (event.touches.length === 0) endTouch()
    }
    sleeve.addEventListener('touchend', releaseIfLastFinger, { passive: true })
    sleeve.addEventListener('touchcancel', releaseIfLastFinger, { passive: true })

    sleeve.addEventListener('pointerleave', resetTilt)
  }
}
