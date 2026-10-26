import { dueBucket, dueState, nowParis } from '@/lib/dates'
import type { Priority, TaskListItem, TaskStatus } from '@/types/domain'

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none'

export interface TaskFilters {
  q: string
  statuses: TaskStatus[]
  priorities: Priority[]
  tagIds: string[]
  /** Chantiers ; 'none' = tâches sans chantier. */
  projectIds: string[]
  due: DueFilter
  showDone: boolean
}

export const EMPTY_FILTERS: TaskFilters = {
  q: '',
  statuses: [],
  priorities: [],
  tagIds: [],
  projectIds: [],
  due: 'all',
  showDone: false,
}

/** Nombre de filtres actifs (hors recherche), pour le badge du bouton. */
export const activeFilterCount = (f: TaskFilters) =>
  f.statuses.length + f.priorities.length + f.tagIds.length + (f.projectIds?.length ?? 0) + (f.due !== 'all' ? 1 : 0) + (f.showDone ? 1 : 0)

/** Minuscules sans accents, pour une recherche tolérante ("echeance" trouve "échéance"). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function applyFilters(tasks: TaskListItem[], f: TaskFilters): TaskListItem[] {
  const q = fold(f.q.trim())
  const now = nowParis()
  return tasks.filter((t) => {
    if (!f.showDone && t.status === 'done' && !f.statuses.includes('done')) return false
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false
    if (f.tagIds.length && !f.tagIds.some((id) => t.tag_ids.includes(id))) return false
    if (f.projectIds?.length && !f.projectIds.includes(t.project_id ?? 'none')) return false
    if (f.due !== 'all') {
      const b = dueBucket(t.due_at, now)
      if (f.due === 'week' ? !(b === 'today' || b === 'week') : b !== f.due) return false
    }
    if (q && !fold(`${t.title} ${t.description} ${t.notes_md}`).includes(q)) return false
    return true
  })
}

/** Ordre d'affichage : non terminées d'abord, en retard, puis par échéance, puis priorité. */
export function sortTasks<T extends TaskListItem>(tasks: T[]): T[] {
  const now = nowParis()
  return [...tasks].sort((a, b) => {
    const doneA = a.status === 'done' ? 1 : 0
    const doneB = b.status === 'done' ? 1 : 0
    if (doneA !== doneB) return doneA - doneB
    const lateA = dueState(a.due_at, now) === 'overdue' ? 0 : 1
    const lateB = dueState(b.due_at, now) === 'overdue' ? 0 : 1
    if (lateA !== lateB) return lateA - lateB
    if (a.due_at !== b.due_at) {
      if (!a.due_at) return 1
      if (!b.due_at) return -1
      return a.due_at < b.due_at ? -1 : 1
    }
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.created_at < b.created_at ? 1 : -1
  })
}
