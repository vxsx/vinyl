// src/scripts/tilt.ts
const MAX_TILT_DEG = 12
const LIFT_SCALE = 1.05

export function initTilt(root: ParentNode = document): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  for (const sleeve of root.querySelectorAll<HTMLElement>('.sleeve')) {
    const tilt = sleeve.querySelector<HTMLElement>('.tilt')
    const frame = sleeve.querySelector<HTMLElement>('.frame')
    if (!tilt || !frame) continue

    sleeve.addEventListener('pointermove', (event) => {
      const rect = frame.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height
      const nx = Math.max(-1, Math.min(1, px * 2 - 1))
      const ny = Math.max(-1, Math.min(1, py * 2 - 1))

      sleeve.classList.add('is-active')
      tilt.style.setProperty('--ry', `${(nx * MAX_TILT_DEG).toFixed(2)}deg`)
      tilt.style.setProperty('--rx', `${(-ny * MAX_TILT_DEG).toFixed(2)}deg`)
      tilt.style.setProperty('--sc', String(LIFT_SCALE))
      // Highlight slides opposite the tilt — a fixed light on a turning surface.
      tilt.style.setProperty('--px', `${(50 - nx * 50).toFixed(1)}%`)
      tilt.style.setProperty('--py', `${(50 - ny * 50).toFixed(1)}%`)
      tilt.style.setProperty('--ang', `${(120 + nx * 40).toFixed(0)}deg`)
    })

    sleeve.addEventListener('pointerleave', () => {
      sleeve.classList.remove('is-active')
      tilt.style.setProperty('--rx', '0deg')
      tilt.style.setProperty('--ry', '0deg')
      tilt.style.setProperty('--sc', '1')
      tilt.style.setProperty('--px', '50%')
      tilt.style.setProperty('--py', '50%')
    })
  }
}
