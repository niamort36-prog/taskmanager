import { useRef, useState } from 'react'
import { useDrag } from '@use-gesture/react'
import { Check, CalendarClock, ListChecks } from 'lucide-react'
import type { Tag, TaskListItem } from '@/types/domain'
import { DueBadge } from './DueBadge'
import { PRIORITY_DOT, STATUS_CLASS, STATUS_LABEL } from './meta'
import { useTaskUi } from './TaskUiContext'
import { useTaskActions } from './useTaskActions'

const SWIPE_THRESHOLD = 96 // px à parcourir pour valider le geste
const LONG_PRESS_MS = 450

/**
 * Ligne de tâche tactile :
 * - tap : ouvre le détail (ou sélectionne en mode sélection) ;
 * - glisser à droite : terminer ; à gauche : reporter ;
 * - appui long : sélection multiple.
 */
export function TaskRow({ task, tags }: { task: TaskListItem; tags: Map<string, Tag> }) {
  const ui = useTaskUi()
  const actions = useTaskActions()
  const [dx, setDx] = useState(0)
  const pressTimer = useRef<number | undefined>(undefined)
  const longPressed = useRef(false)
  const selected = ui.selected.has(task.id)
  const done = task.status === 'done'

  const cancelLongPress = () => window.clearTimeout(pressTimer.current)

  // Appui long : démarré sur le pointerdown natif, annulé dès que le doigt bouge.
  const startLongPress = () => {
    longPressed.current = false
    cancelLongPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      navigator.vibrate?.(15)
      ui.toggleSelected(task.id)
      setDx(0)
    }, LONG_PRESS_MS)
  }

  // NB : avec filterTaps, use-gesture ne fournit ni `first` ni `last` pour un tap ;
  // on s'appuie donc uniquement sur `tap` et `down`.
  const bind = useDrag(
    ({ tap, down, movement: [mx, my] }) => {
      if (Math.abs(mx) > 8 || Math.abs(my) > 8) cancelLongPress()

      if (tap) {
        cancelLongPress()
        if (longPressed.current) return
        if (ui.selecting) ui.toggleSelected(task.id)
        else ui.openTask(task.id)
        return
      }
      if (down) {
        if (!ui.selecting && !longPressed.current) setDx(mx)
        return
      }
      // Doigt relevé après un glissement
      cancelLongPress()
      setDx(0)
      if (longPressed.current || ui.selecting) return
      if (mx > SWIPE_THRESHOLD) actions.toggleDone(task)
      else if (mx < -SWIPE_THRESHOLD) ui.openPostpone([task.id])
    },
    { axis: 'x', filterTaps: true },
  )
  const gesture = bind()

  const tagList = task.tag_ids.map((id) => tags.get(id)).filter((t): t is Tag => Boolean(t))

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Fond révélé pendant le glissement */}
      <div className="absolute inset-0 flex items-center justify-between px-5 font-semibold" aria-hidden>
        <span className={`flex items-center gap-2 text-success ${dx > 20 ? 'opacity-100' : 'opacity-0'}`}>
          <Check className="size-6" /> {done ? 'Rouvrir' : 'Terminer'}
        </span>
        <span className={`flex items-center gap-2 text-accent ${dx < -20 ? 'opacity-100' : 'opacity-0'}`}>
          Reporter <CalendarClock className="size-6" />
        </span>
      </div>

      <div
        {...gesture}
        onPointerDown={(e) => {
          startLongPress()
          gesture.onPointerDown?.(e)
        }}
        onPointerCancel={(e) => {
          cancelLongPress()
          gesture.onPointerCancel?.(e)
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="button"
        tabIndex={0}
        aria-pressed={ui.selecting ? selected : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ui.selecting ? ui.toggleSelected(task.id) : ui.openTask(task.id)
        }}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 180ms ease-out' : 'none' }}
        className={`relative flex touch-pan-y select-none items-start gap-3 border bg-surface p-3 ${
          selected ? 'border-accent ring-2 ring-accent' : 'border-line'
        } ${ui.openTaskId === task.id ? 'bg-surface-2' : ''} rounded-xl`}
      >
        {/* Case à cocher : zone tactile 44x44, ne déclenche pas l'ouverture */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (ui.selecting) ui.toggleSelected(task.id)
            else actions.toggleDone(task)
          }}
          className="tap -m-1 shrink-0"
          aria-label={done ? 'Marquer comme non terminée' : 'Marquer comme terminée'}
        >
          <span
            className={`flex size-7 items-center justify-center rounded-full border-2 ${
              done || selected ? 'border-success bg-success text-bg' : 'border-muted'
            }`}
          >
            {(done || selected) && <Check className="size-5" strokeWidth={3} />}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className={`mt-2 size-2.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} aria-hidden />
            <span className={`break-words font-medium ${done ? 'text-muted line-through' : ''}`}>{task.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <DueBadge due_at={task.due_at} hasTime={task.due_has_time} done={done} />
            {task.status !== 'todo' && task.status !== 'done' && (
              <span className={`rounded-md px-1.5 py-0.5 ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
            )}
            {task.subtask_total > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-4" aria-hidden />
                {task.subtask_done}/{task.subtask_total}
              </span>
            )}
            {tagList.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </li>
  )
}
