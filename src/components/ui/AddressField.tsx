import { useEffect, useState } from 'react'
import { Copy, MapPin, Navigation, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { mapsUrl, wazeUrl } from '@/lib/maps'

/** Adresse d'une tâche, avec itinéraire Google Maps / Waze et copie. */
export function AddressField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const toast = useToast()
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])

  const save = () => {
    const next = v.trim()
    if (next !== value) onSave(next)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast('Adresse copiée')
    } catch {
      toast('Copie impossible')
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Ajouter une adresse (chantier, client…)"
          autoComplete="street-address"
          enterKeyHint="done"
          maxLength={500}
          className="min-h-11 w-full rounded-lg border border-line bg-surface-2 pr-10 pl-10"
          aria-label="Adresse"
        />
        {v && (
          <button
            type="button"
            className="tap absolute top-0 right-0 text-muted"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setV('')
              onSave('')
            }}
            aria-label="Effacer l’adresse"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      {value && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <a
            href={mapsUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-accent-fg"
          >
            <Navigation className="size-5" /> Itinéraire
          </a>
          <a
            href={wazeUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-lg border border-accent text-accent"
          >
            Waze
          </a>
          <button type="button" onClick={() => void copy()} className="tap rounded-lg border border-line" aria-label="Copier l’adresse">
            <Copy className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}
