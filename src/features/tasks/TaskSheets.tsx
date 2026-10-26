/**
 * Feuilles et barres globales liées aux tâches :
 * saisie rapide, report, actions groupées, détail (mobile).
 */
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarClock, Check, ListChecks, Loader2, Plus, Sparkles, Trash2, User, X } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { appendText, DictationButton } from '@/components/ui/DictationButton'
import { DateChips } from '@/components/ui/DueField'
import { useOnline } from '@/components/ui/OfflineBanner'
import { useToast } from '@/components/ui/Toast'
import { useInvokeAi, type ParsedTask } from '@/features/ai/api'
import { offsetLabel } from '@/features/reminders/describe'
import { formatDue, fromInputValue, postponeOptions, type Due } from '@/lib/dates'
import { qk } from '@/lib/queryClient'
import { supabase, unwrap } from '@/lib/supabase'
import { useCreateTask, useTasks } from './api'
import { LazyTaskDetail as TaskDetail } from './LazyTaskDetail'
import { PRIORITY_LABEL } from './meta'
import { useTaskUi } from './TaskUiContext'
import { useTaskActions } from './useTaskActions'

/** Saisie rapide : un titre suffit, le reste plus tard (ou l'IA remplit tout). */
export function QuickAddSheet() {
  const ui = useTaskUi()
  const create = useCreateTask()
  const toast = useToast()
  const qc = useQueryClient()
  const invokeAi = useInvokeAi()
  const online = useOnline()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<Due>({ due_at: null, due_has_time: false })
  const [extras, setExtras] = useState<Extras>(NO_EXTRAS)
  const [parsing, setParsing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const close = () => {
    ui.setQuickAddOpen(false)
    setTitle('')
    setDue({ due_at: null, due_has_time: false })
    setExtras(NO_EXTRAS)
    setAiError(null)
  }

  /** Une phrase complète -> titre, échéance, rappel, contact, sous-tâches. */
  const analyse = async () => {
    setParsing(true)
    setAiError(null)
    try {
      const p = await invokeAi<ParsedTask>({ action: 'parse_task', text: title })
      setTitle(p.title)
      setDue({ due_at: p.due_at, due_has_time: p.due_has_time })
      setExtras({ priority: p.priority, description: p.description, reminder: p.reminder, contact: p.contact, subtasks: p.subtasks })
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  const submit = () => {
    const t = title.trim()
    if (!t) return
    const x = extras
    // Ajout immédiat (même hors ligne) ; l'envoi au serveur suit. Les
    // compléments proposés par l'IA sont enregistrés une fois la tâche créée.
    const id = create.create({ title: t, ...due, priority: x.priority, description: x.description || undefined }, (taskId) => {
      if (!hasAny(x)) return
      saveExtras(taskId, x, due.due_at).then(
        () => {
          qc.invalidateQueries({ queryKey: qk.task(taskId) })
          qc.invalidateQueries({ queryKey: qk.reminders(taskId) })
          qc.invalidateQueries({ queryKey: qk.taskContacts(taskId) })
          qc.invalidateQueries({ queryKey: qk.tasks })
        },
        (e) => toast(`Compléments non enregistrés : ${(e as Error).message}`),
      )
    })
    close()
    toast('Tâche ajoutée', { label: 'Ouvrir', onClick: () => ui.openTask(id) })
  }

  const words = title.trim().split(' ').filter(Boolean).length

  return (
    <BottomSheet open={ui.quickAddOpen} onClose={close} title="Nouvelle tâche">
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Que faut-il faire ?"
            enterKeyHint="send"
            maxLength={500}
            className="min-h-12 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-4 text-lg"
            aria-label="Titre de la tâche"
          />
          <DictationButton onText={(t) => setTitle((cur) => appendText(cur, t))} />
        </div>

        {words >= 3 && online && (
          <button
            type="button"
            onClick={() => void analyse()}
            disabled={parsing}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent text-accent disabled:opacity-60"
          >
            {parsing ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {parsing ? 'Analyse…' : 'Analyser la phrase avec l’IA'}
          </button>
        )}
        {!title && (
          <p className="text-sm text-muted">
            Astuce : dictez une phrase (« Rappelle-moi d’appeler Jean demain à 9 h »), puis touchez « Analyser ».
          </p>
        )}
        {aiError && <p className="text-danger">{aiError}</p>}

        {hasAny(extras) && (
          <div className="flex flex-wrap gap-2" aria-label="Proposé par l’IA">
            {extras.priority !== 2 && (
              <ExtraChip onRemove={() => setExtras({ ...extras, priority: 2 })}>
                Priorité {PRIORITY_LABEL[extras.priority].toLowerCase()}
              </ExtraChip>
            )}
            {extras.reminder && (
              <ExtraChip onRemove={() => setExtras({ ...extras, reminder: null })}>
                <Bell className="size-4" />
                {extras.reminder.mode === 'absolute'
                  ? `Rappel ${formatDue(extras.reminder.remind_at, true).toLowerCase()}`
                  : `Rappel ${offsetLabel(extras.reminder.offset_minutes).toLowerCase()}`}
              </ExtraChip>
            )}
            {extras.contact && (
              <ExtraChip onRemove={() => setExtras({ ...extras, contact: null })}>
                <User className="size-4" /> {extras.contact.name}
              </ExtraChip>
            )}
            {extras.subtasks.length > 0 && (
              <ExtraChip onRemove={() => setExtras({ ...extras, subtasks: [] })}>
                <ListChecks className="size-4" /> {extras.subtasks.length} sous-tâche{extras.subtasks.length > 1 ? 's' : ''}
              </ExtraChip>
            )}
            {extras.description && (
              <ExtraChip onRemove={() => setExtras({ ...extras, description: '' })}>Description</ExtraChip>
            )}
          </div>
        )}

        <DateChips onPick={setDue} current={due} />
        <div className="flex min-h-11 items-center gap-3">
          <span className="flex-1 text-muted">
            {due.due_at ? `Échéance : ${formatDue(due.due_at, due.due_has_time)}` : 'Sans échéance'}
          </span>
          {due.due_at && (
            <button
              type="button"
              className="tap text-muted"
              onClick={() => setDue({ due_at: null, due_has_time: false })}
              aria-label="Retirer l’échéance"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        {create.error && <p className="text-danger">{create.error.message}</p>}
        <button
          type="submit"
          disabled={!title.trim() || parsing}
          className="min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50"
        >
          Ajouter
        </button>
      </form>
    </BottomSheet>
  )
}

interface Extras {
  priority: 1 | 2 | 3 | 4
  description: string
  reminder: ParsedTask['reminder']
  contact: ParsedTask['contact']
  subtasks: string[]
}
const NO_EXTRAS: Extras = { priority: 2, description: '', reminder: null, contact: null, subtasks: [] }
const hasAny = (x: Extras) =>
  x.priority !== 2 || Boolean(x.reminder || x.contact || x.subtasks.length || x.description)

function ExtraChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent bg-accent/10 pr-1 pl-3">
      {children}
      <button type="button" onClick={onRemove} className="tap -my-2 text-muted" aria-label="Retirer">
        <X className="size-4" />
      </button>
    </span>
  )
}

/** Enregistre les compléments proposés par l'IA une fois la tâche créée. */
async function saveExtras(taskId: string, x: Extras, dueAt: string | null) {
  if (x.subtasks.length)
    unwrap(await supabase.from('subtasks').insert(x.subtasks.map((title, position) => ({ task_id: taskId, title, position }))))
  if (x.contact) unwrap(await supabase.from('task_contacts').insert({ task_id: taskId, contact_id: x.contact.id }))
  const r = x.reminder
  if (r && (r.mode === 'absolute' || dueAt))
    unwrap(
      await supabase
        .from('reminders')
        .insert(
          r.mode === 'absolute'
            ? { task_id: taskId, mode: 'absolute', remind_at: r.remind_at, channels: ['push'] }
            : { task_id: taskId, mode: 'relative', offset_minutes: r.offset_minutes, channels: ['push'] },
        ),
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
      {ui.openTaskId && (
        <ErrorBoundary resetKey={ui.openTaskId}>
          <TaskDetail taskId={ui.openTaskId} onClose={ui.closeTask} variant="sheet" />
        </ErrorBoundary>
      )}
    </BottomSheet>
  )
}
