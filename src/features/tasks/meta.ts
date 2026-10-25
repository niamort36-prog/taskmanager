import type { Priority, TaskStatus } from '@/types/domain'

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  blocked: 'Bloquée',
  done: 'Terminée',
}

/** Classes Tailwind de la pastille de statut. */
export const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-surface-2 text-fg',
  in_progress: 'bg-accent/20 text-accent',
  blocked: 'bg-warning/20 text-warning',
  done: 'bg-success/20 text-success',
}

export const PRIORITIES: Priority[] = [4, 3, 2, 1]

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Basse',
  2: 'Normale',
  3: 'Haute',
  4: 'Urgente',
}

export const PRIORITY_DOT: Record<Priority, string> = {
  1: 'bg-slate-400',
  2: 'bg-sky-400',
  3: 'bg-amber-400',
  4: 'bg-red-500',
}

export const TAG_COLORS = ['#64748b', '#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#ec4899']
