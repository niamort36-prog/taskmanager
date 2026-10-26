import { useState } from 'react'
import { BookmarkPlus, LayoutTemplate, X } from 'lucide-react'
import { Link } from 'react-router'
import { useToast } from '@/components/ui/Toast'
import { useSubtaskMutations } from '@/features/subtasks/api'
import type { Subtask } from '@/types/domain'
import { useTemplateMutations, useTemplates } from './api'

/**
 * Dans le détail d'une tâche : appliquer un modèle (ajoute ses sous-tâches)
 * ou enregistrer les sous-tâches actuelles comme nouveau modèle.
 */
export function TemplatePicker({ taskId, subtasks }: { taskId: string; subtasks: Subtask[] }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const { data: templates = [], isLoading } = useTemplates()
  const { save, addExamples } = useTemplateMutations()
  const { addMany } = useSubtaskMutations(taskId)
  const toast = useToast()

  const apply = (titles: string[], label: string) => {
    // On n'ajoute pas une sous-tâche déjà présente (même titre).
    const existing = new Set(subtasks.map((s) => s.title.trim().toLowerCase()))
    const fresh = titles.filter((t) => !existing.has(t.trim().toLowerCase()))
    if (!fresh.length) return toast('Toutes ces sous-tâches sont déjà présentes')
    void addMany.mutateAsync(fresh.map((title) => ({ title })))
    toast(`Modèle « ${label} » appliqué : ${fresh.length} sous-tâche${fresh.length > 1 ? 's' : ''}`)
    setOpen(false)
  }

  const saveCurrent = async () => {
    const n = name.trim()
    if (!n) return
    await save.mutateAsync({ name: n, subtasks: subtasks.map((s) => s.title) })
    toast(`Modèle « ${n} » enregistré`)
    setNaming(false)
    setName('')
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
      >
        <LayoutTemplate className="size-5" /> Modèles
      </button>
    )

  return (
    <div className="space-y-2 rounded-lg border border-accent p-2">
      <div className="flex items-center">
        <span className="flex-1 px-1 font-medium">Appliquer un modèle</span>
        <button type="button" className="tap" onClick={() => setOpen(false)} aria-label="Fermer">
          <X className="size-5" />
        </button>
      </div>
      {isLoading && <p className="px-1 text-muted">Chargement…</p>}
      {!isLoading && !templates.length && (
        <div className="space-y-2 px-1">
          <p className="text-muted">Aucun modèle pour l’instant.</p>
          <button
            type="button"
            onClick={() => addExamples.mutate()}
            disabled={addExamples.isPending}
            className="min-h-11 w-full rounded-lg bg-surface-2 font-medium"
          >
            Créer les modèles d’exemple (chantier, devis, fin de chantier)
          </button>
        </div>
      )}
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => apply(t.subtasks, t.name)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-left active:bg-surface-2"
            >
              <span className="min-w-0 truncate font-medium">{t.name}</span>
              <span className="shrink-0 text-muted">{t.subtasks.length} étapes</span>
            </button>
          </li>
        ))}
      </ul>

      {subtasks.length > 0 &&
        (naming ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void saveCurrent()
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du modèle"
              maxLength={100}
              enterKeyHint="done"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3"
            />
            <button type="submit" className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-fg">
              OK
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line"
          >
            <BookmarkPlus className="size-5" /> Enregistrer ces sous-tâches comme modèle
          </button>
        ))}
      <Link to="/templates" className="block min-h-11 px-1 py-2 text-center text-accent underline">
        Gérer les modèles
      </Link>
    </div>
  )
}
