// Construction du texte d'une notification de rappel (heure de Paris).
import { APP_URL } from './config.ts'

export interface NotificationMessage {
  title: string
  body: string
  url: string
  tag?: string
}

export interface ReminderRow {
  task_id: string | null
  task_title: string | null
  task_due_at: string | null
  task_due_time: boolean | null
  subtask_title: string | null
  subtask_due_at: string | null
}

const TZ = 'Europe/Paris'
const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ }) // yyyy-mm-dd
const time = (d: Date) => d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** "aujourd'hui à 14:00", "demain", "lundi 3 nov. à 08:00"… */
export function formatDueFr(iso: string, withTime: boolean, now = new Date()): string {
  const d = new Date(iso)
  const days = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(now))) / 86400000)
  const t = withTime ? ` à ${time(d)}` : ''
  if (days === 0) return `aujourd’hui${t}`
  if (days === 1) return `demain${t}`
  if (days === -1) return `hier${t}`
  return d.toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }) + t
}

export function reminderMessage(r: ReminderRow, now = new Date()): NotificationMessage {
  const title = r.subtask_title ? `${r.subtask_title}` : (r.task_title ?? 'Rappel')
  const parts: string[] = []
  if (r.subtask_title && r.task_title) parts.push(`Tâche : ${r.task_title}`)
  const due = r.subtask_due_at ?? r.task_due_at
  const dueTime = r.subtask_due_at ? false : Boolean(r.task_due_time)
  if (due) {
    const late = new Date(due).getTime() < now.getTime()
    parts.push(`${late ? 'En retard, échéance' : 'Échéance'} ${formatDueFr(due, dueTime, now)}`)
  }
  return {
    title: `⏰ ${title}`,
    body: parts.join('\n') || 'Rappel',
    url: r.task_id ? `${APP_URL}#/today?task=${r.task_id}` : APP_URL,
    tag: r.task_id ? `task-${r.task_id}` : undefined,
  }
}
