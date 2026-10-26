import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink, Trash2, X } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Attachment } from '@/types/domain'

/** URLs signées (1 h) des photos, en une seule requête. */
function useSignedUrls(photos: Attachment[]) {
  const paths = photos.map((p) => p.storage_path!).filter(Boolean)
  return useQuery({
    queryKey: ['signed-urls', ...paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    // Les URLs expirent : inutile de les garder dans le cache hors ligne.
    gcTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
      if (error) throw new Error(error.message)
      return Object.fromEntries(
        (data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl as string]),
      ) as Record<string, string>
    },
  })
}

/** Miniatures des photos d'une tâche + vue plein écran. */
export function PhotoGrid({ photos, onDelete }: { photos: Attachment[]; onDelete: (a: Attachment) => void }) {
  const { data: urls } = useSignedUrls(photos)
  const [open, setOpen] = useState<number | null>(null)

  if (!photos.length) return null
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5" aria-label="Photos">
        {photos.map((p, i) => {
          const url = urls?.[p.storage_path!]
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="block aspect-square w-full overflow-hidden rounded-lg bg-surface-2"
                aria-label={`Voir la photo ${p.label}`}
              >
                {url ? (
                  <img src={url} alt={p.label} loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <span className="block size-full animate-pulse" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {open !== null && photos[open] && (
        <Lightbox
          photos={photos}
          urls={urls ?? {}}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={(a) => {
            setOpen(null)
            onDelete(a)
          }}
        />
      )}
    </>
  )
}

function Lightbox({
  photos,
  urls,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  photos: Attachment[]
  urls: Record<string, string>
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onDelete: (a: Attachment) => void
}) {
  const p = photos[index]
  const url = urls[p.storage_path!]
  const prev = () => onIndex((index - 1 + photos.length) % photos.length)
  const next = () => onIndex((index + 1) % photos.length)
  const [startX, setStartX] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      data-vaul-no-drag
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      // Glisser horizontalement pour passer à la photo suivante.
      onTouchStart={(e) => setStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX === null || photos.length < 2) return
        const dx = e.changedTouches[0].clientX - startX
        if (dx > 60) prev()
        else if (dx < -60) next()
        setStartX(null)
      }}
    >
      <div className="flex items-center gap-1 px-2 pt-safe">
        <button className="tap" onClick={onClose} aria-label="Fermer">
          <X className="size-7" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate">{p.label}</div>
          <div className="text-sm text-white/70">{formatDateTime(p.created_at)}</div>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="tap" aria-label="Ouvrir l’original">
            <ExternalLink className="size-6" />
          </a>
        )}
        <button
          className="tap text-red-400"
          aria-label="Supprimer la photo"
          onClick={() => window.confirm('Supprimer définitivement cette photo ?') && onDelete(p)}
        >
          <Trash2 className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-safe">
        {url ? <img src={url} alt={p.label} className="max-h-full max-w-full object-contain" /> : <span>Chargement…</span>}
        {photos.length > 1 && (
          <>
            <button className="tap absolute left-1 rounded-full bg-black/40" onClick={prev} aria-label="Photo précédente">
              <ChevronLeft className="size-7" />
            </button>
            <button className="tap absolute right-1 rounded-full bg-black/40" onClick={next} aria-label="Photo suivante">
              <ChevronRight className="size-7" />
            </button>
            <span className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] rounded-full bg-black/50 px-3 py-1 text-sm">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
