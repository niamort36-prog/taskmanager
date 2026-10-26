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
  /** Adresse (chantier, client…) pour l'itinéraire ; chaîne vide si aucune. */
  address: string
  /** Répétition : une fois terminée, la tâche suivante est créée par la base. */
  recurrence: Recurrence | null
  next_task_id: string | null
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
  weekly_plan_enabled: boolean
  weekly_plan_time: string
  last_weekly_plan_on: string | null
  ai_daily_limit: number
}

export type TaskPatch = Partial<
  Pick<
    Task,
    'title' | 'description' | 'notes_md' | 'status' | 'priority' | 'due_at' | 'due_has_time' | 'deleted_at' | 'position' | 'address' | 'recurrence'
  >
>

export interface Contact {
  id: string
  name: string
  role: string
  company: string
  phone: string
  email: string
  notes: string
  created_at: string
  updated_at: string
}

/** Contact lié à une tâche, avec son rôle sur cette tâche. */
export interface TaskContact {
  task_id: string
  contact_id: string
  role_on_task: string
  contact: Contact
}

export interface Link {
  id: string
  task_id: string
  url: string
  label: string
  position: number
  created_at: string
}

export interface Attachment {
  id: string
  task_id: string
  kind: 'file' | 'folder'
  label: string
  storage_path: string | null
  location: string | null
  mime: string | null
  size: number | null
  created_at: string
}

export type NotifyChannel = 'push' | 'email' | 'sms'

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  /** Jours ISO (1 = lundi … 7 = dimanche), pour freq = weekly. */
  byweekday?: number[]
  /** Date de fin incluse (yyyy-MM-dd). */
  until?: string
}

export interface Reminder {
  id: string
  task_id: string
  subtask_id: string | null
  mode: 'absolute' | 'relative'
  remind_at: string | null
  offset_minutes: number | null
  recurrence: Recurrence | null
  channels: NotifyChannel[]
  ignore_dnd: boolean
  active: boolean
  next_fire_at: string | null
  last_fired_at: string | null
  created_at: string
}

export interface NotificationLog {
  id: number
  reminder_id: string | null
  task_id: string | null
  kind: 'reminder' | 'digest' | 'test' | 'weekly_plan'
  occurrence_at: string
  channel: NotifyChannel
  status: 'sending' | 'sent' | 'failed' | 'skipped'
  attempts: number
  error: string | null
  sent_at: string | null
  created_at: string
}
