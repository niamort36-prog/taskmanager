import { AlarmClock, CalendarDays } from 'lucide-react'
import { dueState, formatDue } from '@/lib/dates'

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
