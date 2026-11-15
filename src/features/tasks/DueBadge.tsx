import { AlarmClock, CalendarDays, CornerDownRight } from 'lucide-react'
import { dueState, formatDue } from '@/lib/dates'
import { subtaskHasTime, type SubtaskDue } from './subtaskDues'

const CLASS = {
  overdue: 'bg-danger/15 text-danger font-semibold',
  today: 'bg-warning/15 text-warning font-semibold',
  soon: 'bg-accent/15 text-accent',
  later: 'text-muted',
  none: '',
} as const

/** Indicateur visuel de deadline : rouge en retard, orange aujourd'hui, bleu < 48 h. */
export function DueBadge({ due_at, hasTime, done }: { due_at: string | null; hasTime: boolean; done?: boolean }) {
  if (!due_at) return null
  const state = done ? 'later' : dueState(due_at)
  const Icon = state === 'overdue' ? AlarmClock : CalendarDays
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${CLASS[state]}`}>
      <Icon className="size-4" aria-hidden />
      {state === 'overdue' && <span className="sr-only">En retard :</span>}
      {formatDue(due_at, hasTime)}
    </span>
  )
}

/**
 * Sous-tâche urgente (en retard, aujourd'hui, < 48 h) affichée sur la ligne de
 * sa tâche, aux couleurs du DueBadge ; "+N" s'il y en a d'autres.
 */
export function SubtaskDueBadge({ subtasks }: { subtasks: SubtaskDue[] }) {
  const [first] = subtasks
  if (!first) return null
  const state = dueState(first.due_at)
  const more = subtasks.length - 1
  return (
    <span className={`inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 ${CLASS[state]}`}>
      <CornerDownRight className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="sr-only">Sous-tâche{state === 'overdue' ? ' en retard' : ''} :</span>
      <span className="min-w-0 break-words">
        {first.title}
        <span className="whitespace-nowrap"> · {formatDue(first.due_at, subtaskHasTime(first.due_at))}</span>
        {more > 0 && <span className="whitespace-nowrap"> +{more}</span>}
      </span>
    </span>
  )
}
