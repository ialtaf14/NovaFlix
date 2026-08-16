import { useEffect, useRef } from 'react'

/**
 * Enables click-and-drag horizontal scrolling on a ref element.
 * Returns a ref to attach to the scrollable container.
 */
export default function useDragScroll() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0
    let velX = 0
    let lastX = 0
    let rafId = null
    let lastTime = 0

    const onMouseDown = (e) => {
      // ignore clicks on buttons/links inside the row
      if (e.target.closest('button, a, .card-action-btn')) return
      isDown = true
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
      startX = e.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
      lastX = e.pageX
      velX = 0
      lastTime = Date.now()
      cancelAnimationFrame(rafId)
    }

    const onMouseLeave = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ''
      el.style.userSelect = ''
      startMomentum()
    }

    const onMouseUp = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ''
      el.style.userSelect = ''
      startMomentum()
    }

    const onMouseMove = (e) => {
      if (!isDown) return
      e.preventDefault()
      const now = Date.now()
      const dt = now - lastTime || 1
      velX = (e.pageX - lastX) / dt * 16 // px per frame at 60fps
      lastX = e.pageX
      lastTime = now
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX) * 1.2
      el.scrollLeft = scrollLeft - walk
    }

    const startMomentum = () => {
      const decay = 0.92
      const step = () => {
        if (Math.abs(velX) < 0.5) return
        el.scrollLeft -= velX
        velX *= decay
        rafId = requestAnimationFrame(step)
      }
      rafId = requestAnimationFrame(step)
    }

    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('mousemove', onMouseMove)

    return () => {
      cancelAnimationFrame(rafId)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return ref
}
