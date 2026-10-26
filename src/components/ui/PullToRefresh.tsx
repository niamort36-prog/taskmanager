import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 70 // px à tirer pour déclencher

/**
 * "Tirer vers le bas pour rafraîchir" (mobile) : actif uniquement quand la
 * page est tout en haut et hors des feuilles (bottom sheets).
 */
export function PullToRefresh() {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.target as Element
      if (window.scrollY > 0 || t.closest('[data-vaul-drawer], [data-no-pull]') || e.touches.length > 1) return
      start.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      // Résistance : le contenu suit moins vite que le doigt.
      pullRef.current = Math.min(110, dy * 0.5)
      setPull(pullRef.current)
    }
    const onEnd = async () => {
      if (start.current === null) return
      start.current = null
      const triggered = pullRef.current >= THRESHOLD
      pullRef.current = 0
      setPull(0)
      if (!triggered) return
      navigator.vibrate?.(10)
      setRefreshing(true)
      await qc.refetchQueries({ type: 'active' }).catch(() => {})
      setRefreshing(false)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [qc])

  const visible = pull > 8 || refreshing
  if (!visible) return null
  const ready = pull >= THRESHOLD
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${refreshing ? 56 : Math.max(8, pull)}px)` }}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-line bg-surface shadow-lg">
        <RefreshCw
          className={`size-6 ${ready || refreshing ? 'text-accent' : 'text-muted'} ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
        <span className="sr-only">{refreshing ? 'Actualisation…' : 'Relâchez pour actualiser'}</span>
      </div>
    </div>
  )
}
