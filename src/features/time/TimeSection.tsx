import { useEffect, useState } from 'react'
import { Play, Plus, Square, Timer, Trash2 } from 'lucide-react'
import { useTaskUi } from '@/features/tasks/TaskUiContext'
import { formatDateTime } from '@/lib/dates'
import { formatClock, formatMinutes, minutesOf, useRunningTimer, useTaskTime, useTimeMutations, type TimeEntry } from './api'

/** Fait avancer l'affichage du chronomètre chaque seconde. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

const PRESETS = [15, 30, 60, 120, 240]

/** Dans le détail d'une tâche : chronomètre, total et saisies. */
export function TimeSection({ taskId }: { taskId: string }) {
  const { data: entries = [] } = useTaskTime(taskId)
  const { data: running } = useRunningTimer()
  const { start, stop, addManual, remove } = useTimeMutations()
  const [adding, setAdding] = useState(false)
  const [minutes, setMinutes] = useState(60)
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)

  const runningHere = running && running.task_id === taskId ? running : null
  const now = useNow(Boolean(runningHere))
  const total = entries.reduce((sum, e) => sum + minutesOf(e, now), 0)
  const done = entries.filter((e) => e.ended_at)
  const visible = showAll ? done : done.slice(0, 5)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {runningHere ? (
          <button
            type="button"
            onClick={() => stop.mutate({ entry: runningHere })}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger font-semibold text-white"
          >
            <Square className="size-5" fill="currentColor" />
            Arrêter · {formatClock(now - new Date(runningHere.started_at).getTime())}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => start.mutate(taskId)}
            disabled={start.isPending}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-success font-semibold text-bg disabled:opacity-50"
          >
            <Play className="size-5" fill="currentColor" />
            {running ? 'Démarrer ici (arrête l’autre)' : 'Démarrer le chrono'}
          </button>
        )}
        <div className="shrink-0 text-right">
          <div className="text-sm text-muted">Total</div>
          <div className="font-semibold">{formatMinutes(total)}</div>
        </div>
      </div>

      {adding ? (
        <form
          className="space-y-2 rounded-lg border border-accent p-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (minutes > 0) addManual.mutate({ taskId, minutes, day: new Date(), note: note.trim() })
            setAdding(false)
            setNote('')
          }}
        >
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`min-h-11 rounded-full border px-4 ${minutes === m ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'}`}
              >
                {formatMinutes(m)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span>Durée</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
              className="min-h-11 w-24 rounded-lg border border-line bg-surface-2 px-3"
            />
            <span>minutes, aujourd’hui</span>
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (facultatif)"
            className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
          />
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-accent-fg">
              Ajouter {formatMinutes(minutes)}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-lg border border-line px-4">
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
        >
          <Plus className="size-5" /> Saisir du temps
        </button>
      )}

      {done.length > 0 && (
        <ul className="space-y-1">
          {visible.map((e) => (
            <EntryRow key={e.id} entry={e} onDelete={() => remove.mutate(e)} />
          ))}
          {done.length > 5 && (
            <li>
              <button type="button" onClick={() => setShowAll(!showAll)} className="min-h-11 text-muted underline">
                {showAll ? 'Réduire' : `Voir les ${done.length} saisies`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function EntryRow({ entry: e, onDelete }: { entry: TimeEntry; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface-2/60 pl-3">
      <Timer className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1 py-1">
        <span className="font-medium">{formatMinutes(minutesOf(e))}</span>
        <span className="text-muted"> · {formatDateTime(e.started_at)}</span>
        {e.note && <span className="block truncate text-muted">{e.note}</span>}
      </div>
      <button
        type="button"
        className="tap shrink-0 text-muted"
        onClick={() => window.confirm('Supprimer cette saisie de temps ?') && onDelete()}
        aria-label="Supprimer la saisie"
      >
        <Trash2 className="size-5" />
      </button>
    </li>
  )
}

/** Bandeau visible partout tant qu'un chronomètre tourne. */
export function RunningTimerBar() {
  const { data: running } = useRunningTimer()
  const { stop } = useTimeMutations()
  const ui = useTaskUi()
  const now = useNow(Boolean(running))
  if (!running) return null
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 bg-success/15 px-3 py-1 pt-safe text-success">
      <button type="button" onClick={() => ui.openTask(running.task_id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
        <Timer className="size-5 shrink-0 animate-pulse" />
        <span className="font-mono font-semibold">{formatClock(now - new Date(running.started_at).getTime())}</span>
        <span className="truncate">{running.task?.title}</span>
      </button>
      <button
        type="button"
        onClick={() => stop.mutate({ entry: running })}
        className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-danger px-3 font-semibold text-white"
      >
        <Square className="size-4" fill="currentColor" /> Arrêter
      </button>
    </div>
  )
}
