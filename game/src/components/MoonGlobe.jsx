import { useEffect, useRef } from 'react'
import { LunarGlobeGL } from '../lib/globe_gl.js'

/**
 * The v1 map screen's real WebGL lunar globe (raw WebGL, no three.js):
 * LROC WAC albedo + LOLA elevation rasters, parallax-occluded relief,
 * sun/terminator lighting, phase-lit Earth, solar corona, and a 3-tier
 * deep-space starfield — all inside one canvas.
 *
 * The globe draws centered in its canvas, so the caller shifts the moon
 * within the viewport by oversizing and offsetting the canvas with CSS.
 */
export default function MoonGlobe({ className = '', distance = 2.68, idleSpin = 0.00035 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const globe = new LunarGlobeGL(canvas, {
      onHover: () => {},
      onSelectPoint: () => {},
      onViewChange: () => {},
      sites: [],
      psrZones: [],
      quickmapFeatures: [],
    })
    globe.setLayers({ showGraticule: false, showTerminator: true })
    globe.distance = distance
    globe.resize()

    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) {
      // Slow idle rotation; dragging still works (cursor parallax + orbit).
      const tick = () => {
        globe.yaw += idleSpin
        globe.render()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const ro = new ResizeObserver(() => globe.resize())
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [distance, idleSpin])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
