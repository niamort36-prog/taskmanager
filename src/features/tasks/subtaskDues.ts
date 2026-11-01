import { dueBucket, dueState, nowParis, toParis, type Bucket } from '@/lib/dates'
import type { TaskListItem } from '@/types/domain'

export type SubtaskDue = TaskListItem['subtask_dues'][number]

/** Les sous-tâches n'ont pas de case "heure" : 23:59 (heure de Paris) = journée entière. */
export function subtaskHasTime(due_at: string) {
  const d = toParis(due_at)
  return !(d.getHours() === 23 && d.getMinutes() === 59)
}

/** Sous-tâches non faites d'une tâche ouverte, triées par échéance. */
export function openSubtaskDues(task: TaskListItem): SubtaskDue[] {
  if (task.status === 'done') return []
  return task.subtask_dues.filter((s) => !s.done).sort((a, b) => a.due_at.localeCompare(b.due_at))
}

/**
 * Sous-tâches qui demandent de l'attention : en retard, aujourd'hui ou sous 48 h.
 * La plus urgente en premier.
 */
export function urgentSubtasks(task: TaskListItem, now: Date = nowParis()): SubtaskDue[] {
  return openSubtaskDues(task).filter((s) => {
    const st = dueState(s.due_at, now)
    return st === 'overdue' || st === 'today' || st === 'soon'
  })
}

const RANK: Record<Bucket, number> = { overdue: 0, today: 1, week: 2, later: 3, none: 4 }

/**
 * Rangement d'une tâche pour la vue "Aujourd'hui" : le plus urgent entre son
 * échéance et celles de ses sous-tâches non faites.
 */
export function effectiveBucket(task: TaskListItem, now: Date = nowParis()): Bucket {
  let best = dueBucket(task.due_at, now)
  for (const s of openSubtaskDues(task)) {
    const b = dueBucket(s.due_at, now)
    if (RANK[b] < RANK[best]) best = b
  }
  return best
}
