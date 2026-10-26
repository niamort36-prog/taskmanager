import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { onlineManager, useMutationState } from '@tanstack/react-query'
import { CloudOff, RefreshCw } from 'lucide-react'

export const useOnline = () =>
  useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  )

const plural = (n: number) => `${n} modification${n > 1 ? 's' : ''}`

/**
 * Bandeau "hors ligne" avec le nombre de modifications en attente, puis
 * "envoi…" au retour du réseau, jusqu'à ce que tout soit synchronisé.
 */
export function OfflineBanner() {
  const online = useOnline()
  const pending = useMutationState({ filters: { predicate: (m) => m.state.isPaused || m.state.status === 'pending' } }).length
  const [resyncing, setResyncing] = useState(false)
  const wasOnline = useRef(online)

  useEffect(() => {
    if (online && !wasOnline.current) setResyncing(true)
    wasOnline.current = online
  }, [online])
  useEffect(() => {
    if (online && pending === 0) setResyncing(false)
  }, [online, pending])

  if (online && !(resyncing && pending > 0)) return null
  return (
    <div
      role="status"
      className={`sticky top-0 z-30 flex items-center gap-2 px-4 pt-safe pb-2 font-medium ${
        online ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'
      }`}
    >
      {online ? <RefreshCw className="mt-2 size-5 shrink-0 animate-spin" /> : <CloudOff className="mt-2 size-5 shrink-0" />}
      <span className="mt-2">
        {online
          ? `Envoi de ${plural(pending)}…`
          : `Hors ligne${pending ? ` · ${plural(pending)} en attente` : ' · données enregistrées sur l’appareil'}`}
      </span>
    </div>
  )
}
