// Types métier, alignés sur supabase/migrations/*.sql.

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type Priority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  user_id: string
  title: string
  description: string
  notes_md: string
  status: TaskStatus
  priority: Priority
  due_at: string | null
  due_has_time: boolean
  position: number
  completed_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Tâche telle qu'affichée dans les listes (avec compteurs). */
export interface TaskListItem extends Task {
  subtask_total: number
  subtask_done: number
  /** Sous-tâches ayant leur propre échéance (pour le calendrier). */
  subtask_dues: { id: string; title: string; done: boolean; due_at: string }[]
  tag_ids: string[]
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  done_at: string | null
  due_at: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface TaskDetail extends Task {
  subtasks: Subtask[]
  tag_ids: string[]
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface HistoryEntry {
  id: number
  task_id: string
  entity: string
  entity_id: string | null
  action: 'insert' | 'update' | 'delete'
  changes: Record<string, unknown>
  created_at: string
}

export interface Settings {
  user_id: string
  theme: 'dark' | 'light'
  timezone: string
  push_enabled: boolean
  email_enabled: boolean
  sms_enabled: boolean
  notify_email: string | null
  dnd_start: string | null
  dnd_end: string | null
  digest_enabled: boolean
  digest_time: string
  ai_daily_limit: number
}

export type TaskPatch = Partial<
  Pick<
    Task,
    'title' | 'description' | 'notes_md' | 'status' | 'priority' | 'due_at' | 'due_has_time' | 'deleted_at' | 'position'
  >
>
