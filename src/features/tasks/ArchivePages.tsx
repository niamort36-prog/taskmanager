import { useMemo, useState } from 'react'
import { ArchiveRestore, ChevronLeft, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/dates'
import type { Task } from '@/types/domain'
import { ARCHIVE_AFTER_DAYS, useArchive, useArchiveActions, useTrash } from './archive'
import { fold } from './filters'
import { useTaskUi } from './TaskUiContext'

const back = (
  <Link to="/settings" className="tap rounded-lg" aria-label="Retour aux réglages">
    <ChevronLeft className="size-6" />
  </Link>
)

function useSearch(tasks: Task[] | undefined) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const f = fold(q.trim())
    return (tasks ?? []).filter((t) => !f || fold(`${t.title} ${t.description}`).includes(f))
  }, [tasks, q])
  const input = (
    <label className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher"
        className="min-h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10"
      />
    </label>
  )
  return { list, input }
}

/** Tâches terminées depuis plus de 30 jours. */
export function ArchivePage() {
  const { data, isLoading } = useArchive()
  const { reopen } = useArchiveActions()
  const ui = useTaskUi()
  const toast = useToast()
  const { list, input } = useSearch(data)

  return (
    <>
      <PageHeader title="Archives" actions={back}>
        {input}
      </PageHeader>
      <div className="mx-auto max-w-2xl space-y-2 p-4">
        <p className="text-muted">Tâches terminées depuis plus de {ARCHIVE_AFTER_DAYS} jours, retirées de la liste principale.</p>
        {isLoading && <p className="text-muted">Chargement…</p>}
        {data && !list.length && <p className="py-8 text-center text-muted">Aucune tâche archivée.</p>}
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-1 rounded-xl border border-line bg-surface p-2">
              <button onClick={() => ui.openTask(t.id)} className="min-h-11 min-w-0 flex-1 px-1 text-left">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-sm text-muted">Terminée le {t.completed_at && formatDateTime(t.completed_at)}</span>
              </button>
              <button
                className="tap shrink-0 text-accent"
                aria-label={`Rouvrir ${t.title}`}
                onClick={() => {
                  reopen.mutate(t.id)
                  toast('Tâche rouverte')
                }}
              >
                <RotateCcw className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** Tâches supprimées : restaurer ou supprimer définitivement. */
export function TrashPage() {
  const { data, isLoading } = useTrash()
  const { restore, destroy } = useArchiveActions()
  const toast = useToast()
  const { list, input } = useSearch(data)

  const purge = (ids: string[], label: string) => {
    if (!window.confirm(`${label}\nCette action est définitive (pièces jointes comprises).`)) return
    destroy.mutate(ids, { onError: (e) => toast(`Échec : ${e.message}`) })
  }

  return (
    <>
      <PageHeader title="Corbeille" actions={back}>
        {input}
      </PageHeader>
      <div className="mx-auto max-w-2xl space-y-2 p-4">
        <p className="text-muted">
          Les tâches supprimées restent ici 30 jours, puis sont effacées automatiquement (sauf si elles ont des fichiers joints).
        </p>
        {isLoading && <p className="text-muted">Chargement…</p>}
        {data && !list.length && <p className="py-8 text-center text-muted">La corbeille est vide.</p>}
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-1 rounded-xl border border-line bg-surface p-2">
              <div className="min-w-0 flex-1 px-1">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-sm text-muted">Supprimée le {t.deleted_at && formatDateTime(t.deleted_at)}</span>
              </div>
              <button
                className="tap shrink-0 text-accent"
                aria-label={`Restaurer ${t.title}`}
                onClick={() => {
                  restore.mutate([t.id])
                  toast('Tâche restaurée')
                }}
              >
                <ArchiveRestore className="size-5" />
              </button>
              <button
                className="tap shrink-0 text-danger"
                aria-label={`Supprimer définitivement ${t.title}`}
                onClick={() => purge([t.id], `Supprimer définitivement « ${t.title} » ?`)}
              >
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
        {!!data?.length && (
          <button
            onClick={() => purge(data.map((t) => t.id), `Vider la corbeille (${data.length} tâche${data.length > 1 ? 's' : ''}) ?`)}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger text-danger"
          >
            <Trash2 className="size-5" /> Vider la corbeille
          </button>
        )}
      </div>
    </>
  )
}
