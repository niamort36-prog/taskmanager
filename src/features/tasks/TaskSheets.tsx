/**
 * Feuilles et barres globales liées aux tâches :
 * saisie rapide, report, actions groupées, détail (mobile).
 */
import { useState } from 'react'
import { CalendarClock, Check, Plus, Trash2, X } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { DateChips } from '@/components/ui/DueField'
import { useToast } from '@/components/ui/Toast'
import { formatDue, fromInputValue, postponeOptions, type Due } from '@/lib/dates'
import { useCreateTask, useTasks } from './api'
import { TaskDetail } from './TaskDetail'
import { useTaskUi } from './TaskUiContext'
import { useTaskActions } from './useTaskActions'

/** Saisie rapide : un titre suffit, le reste plus tard. */
export function QuickAddSheet() {
  const ui = useTaskUi()
  const create = useCreateTask()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<Due>({ due_at: null, due_has_time: false })

  const close = () => {
    ui.setQuickAddOpen(false)
    setTitle('')
    setDue({ due_at: null, due_has_time: false })
  }

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    const task = await create.mutateAsync({ title: t, ...due })
    close()
    toast('Tâche ajoutée', { label: 'Ouvrir', onClick: () => ui.openTask(task.id) })
  }

  return (
    <BottomSheet open={ui.quickAddOpen} onClose={close} title="Nouvelle tâche">
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Que faut-il faire ?"
          enterKeyHint="send"
          maxLength={500}
          className="min-h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-lg"
          aria-label="Titre de la tâche"
        />
        <DateChips onPick={setDue} current={due} />
        <div className="flex min-h-11 items-center gap-3">
          <span className="flex-1 text-muted">
            {due.due_at ? `Échéance : ${formatDue(due.due_at, due.due_has_time)}` : 'Sans échéance'}
          </span>
          {due.due_at && (
            <button type="button" className="tap text-muted" onClick={() => setDue({ due_at: null, due_has_time: false })} aria-label="Retirer l’échéance">
              <X className="size-5" />
            </button>
          )}
        </div>
        {create.error && <p className="text-danger">{create.error.message}</p>}
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50"
        >
          Ajouter
        </button>
      </form>
    </BottomSheet>
  )
}

/** Reporter une ou plusieurs tâches : demain, semaine prochaine, date au choix. */
export function PostponeSheet() {
  const ui = useTaskUi()
  const { data } = useTasks()
  const { apply } = useTaskActions()
  const toast = useToast()
  const ids = ui.postponeIds ?? []
  const single = ids.length === 1 ? data?.find((t) => t.id === ids[0]) : undefined
  const current: Due = single ?? { due_at: null, due_has_time: false }

  const choose = (d: Due) => {
    apply(ids, d)
    ui.closePostpone()
    ui.clearSelection()
    if (d.due_at) toast(`Reporté à ${formatDue(d.due_at, d.due_has_time).toLowerCase()}`)
  }

  const options = postponeOptions(current)

  return (
    <BottomSheet open={ids.length > 0} onClose={ui.closePostpone} title="Reporter">
      <div className="space-y-3 p-4">
        <h2 className="text-lg font-semibold">Reporter {ids.length > 1 ? `${ids.length} tâches` : 'la tâche'}</h2>
        {options.map((o) => (
          <button
            key={o.label}
            className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4"
            onClick={() => choose(o.value)}
          >
            <span className="font-medium">{o.label}</span>
            <span className="text-muted">{o.value.due_at && formatDue(o.value.due_at, o.value.due_has_time)}</span>
          </button>
        ))}
        <label className="block space-y-1">
          <span className="text-muted">Date au choix</span>
          <input
            type="date"
            className="min-h-12 w-full rounded-xl border border-line bg-surface-2 px-4"
            onChange={(e) => {
              const d = fromInputValue(e.target.value, false)
              if (d) choose(d)
            }}
          />
        </label>
      </div>
    </BottomSheet>
  )
}

/** Barre d'actions groupées, visible pendant une sélection multiple. */
export function BulkActionBar() {
  const ui = useTaskUi()
  const { complete, remove } = useTaskActions()
  if (!ui.selecting) return null
  const ids = [...ui.selected]
  const done = () => ui.clearSelection()

  return (
    <div className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-1 rounded-2xl border border-line bg-surface p-1 shadow-2xl lg:bottom-4">
      <button className="tap" onClick={done} aria-label="Annuler la sélection">
        <X className="size-6" />
      </button>
      <span className="flex-1 font-semibold">{ids.length} sélectionnée{ids.length > 1 ? 's' : ''}</span>
      <button className="tap rounded-lg px-2 text-success" onClick={() => (complete(ids), done())} aria-label="Terminer">
        <Check className="size-6" />
      </button>
      <button className="tap rounded-lg px-2 text-accent" onClick={() => ui.openPostpone(ids)} aria-label="Reporter">
        <CalendarClock className="size-6" />
      </button>
      <button className="tap rounded-lg px-2 text-danger" onClick={() => (remove(ids), done())} aria-label="Supprimer">
        <Trash2 className="size-6" />
      </button>
    </div>
  )
}

/** Bouton flottant "+" (mobile), au-dessus de la barre du bas, côté pouce. */
export function Fab() {
  const ui = useTaskUi()
  if (ui.selecting) return null
  return (
    <button
      onClick={() => ui.setQuickAddOpen(true)}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-xl active:scale-95"
      aria-label="Nouvelle tâche"
    >
      <Plus className="size-8" strokeWidth={2.5} />
    </button>
  )
}

/** Détail en bottom sheet plein écran (mobile). */
export function TaskDetailSheet() {
  const ui = useTaskUi()
  return (
    <BottomSheet open={Boolean(ui.openTaskId)} onClose={ui.closeTask} title="Détail de la tâche" full>
      {ui.openTaskId && <TaskDetail taskId={ui.openTaskId} onClose={ui.closeTask} variant="sheet" />}
    </BottomSheet>
  )
}
