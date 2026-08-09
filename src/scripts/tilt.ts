// src/scripts/tilt.ts
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

    const resetTilt = (): void => {
      sleeve.classList.remove('is-active')
      tilt.style.setProperty('--rx', '0deg')
      tilt.style.setProperty('--ry', '0deg')
      tilt.style.setProperty('--sc', '1')
      tilt.style.setProperty('--px', '50%')
      tilt.style.setProperty('--py', '50%')
    }

    sleeve.addEventListener('pointermove', (event) => {
      // Hover only. A finger has no hover state — it presses, drags and lifts —
      // and this effect is not wanted on touch, so a finger never reaches the
      // maths below however far it travels.
      if (event.pointerType === 'touch') return

      const rect = frame.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height
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
    })

    // The cursor leaving is the end of a hover, and the only end a mouse has:
    // a mouse `pointerup` still leaves the cursor on the sleeve, so it must not
    // reset anything.
    sleeve.addEventListener('pointerleave', resetTilt)

    // A finger fires no `pointerleave` at all, and a gesture the browser
    // reclaims as a scroll fires no `pointerup` either — so both ends of a
    // touch clear the sleeve outright. Nothing above tilts on touch; this is
    // what guarantees a sleeve can never be left holding a tilt some other
    // input, or a mistyped pointer, put there.
    const releaseIfTouch = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') resetTilt()
    }
    sleeve.addEventListener('pointerup', releaseIfTouch)
    sleeve.addEventListener('pointercancel', releaseIfTouch)
  }
}
