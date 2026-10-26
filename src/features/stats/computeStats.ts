/** Calcul des statistiques (pur, testable) : semaines du lundi, heure de Paris. */
import { addWeeks, differenceInCalendarDays, endOfDay, format, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { inTz, toParis } from '@/lib/dates'

export const WEEKS = 12

export interface StatTask {
  id: string
  title: string
  status: string
  due_at: string | null
  due_has_time: boolean
  created_at: string
  completed_at: string | null
}

export interface StatEntry {
  task_id: string
  started_at: string
  ended_at: string | null
}

export interface WeekStat {
  start: Date
  label: string
  done: number
  created: number
  minutes: number
}

const opts = { in: inTz, locale: fr, weekStartsOn: 1 as const }
const weekStart = (d: Date | string) => startOfWeek(typeof d === 'string' ? toParis(d) : d, opts)

export function computeStats(tasks: StatTask[], entries: StatEntry[], now: Date = new Date()) {
  const first = addWeeks(weekStart(now), -(WEEKS - 1))
  const weeks: WeekStat[] = Array.from({ length: WEEKS }, (_, i) => {
    const start = addWeeks(first, i)
    return { start, label: format(start, 'd/MM', opts), done: 0, created: 0, minutes: 0 }
  })
  const indexOf = (iso: string) => {
    const i = Math.round((weekStart(iso).getTime() - first.getTime()) / (7 * 86_400_000))
    return i >= 0 && i < WEEKS ? i : -1
  }

  let onTime = 0
  let withDue = 0
  const leadDays: number[] = []
  for (const t of tasks) {
    const c = indexOf(t.created_at)
    if (c >= 0) weeks[c].created++
    if (t.status !== 'done' || !t.completed_at) continue
    const d = indexOf(t.completed_at)
    if (d < 0) continue
    weeks[d].done++
    leadDays.push(Math.max(0, differenceInCalendarDays(toParis(t.completed_at), toParis(t.created_at))))
    if (t.due_at) {
      withDue++
      // Une échéance "journée entière" laisse jusqu'à minuit.
      const limit = t.due_has_time ? new Date(t.due_at) : endOfDay(toParis(t.due_at))
      if (new Date(t.completed_at) <= limit) onTime++
    }
  }

  const byTask = new Map<string, number>()
  for (const e of entries) {
    if (!e.ended_at) continue
    const m = Math.max(0, (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60_000)
    const i = indexOf(e.started_at)
    if (i < 0) continue
    weeks[i].minutes += m
    byTask.set(e.task_id, (byTask.get(e.task_id) ?? 0) + m)
  }
  const titles = new Map(tasks.map((t) => [t.id, t.title]))
  const topTime = [...byTask]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, minutes]) => ({ id, title: titles.get(id) ?? 'Tâche archivée', minutes }))

  const open = tasks.filter((t) => t.status !== 'done')
  const nowMs = now.getTime()
  const overdue = open.filter((t) => t.due_at && (t.due_has_time ? new Date(t.due_at) : endOfDay(toParis(t.due_at))).getTime() < nowMs).length
  const sorted = [...leadDays].sort((a, b) => a - b)

  return {
    weeks,
    thisWeek: weeks[WEEKS - 1],
    lastWeek: weeks[WEEKS - 2],
    overdue,
    open: {
      todo: open.filter((t) => t.status === 'todo').length,
      in_progress: open.filter((t) => t.status === 'in_progress').length,
      blocked: open.filter((t) => t.status === 'blocked').length,
    },
    onTimeRate: withDue ? Math.round((onTime / withDue) * 100) : null,
    withDue,
    medianDays: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    totalDone: leadDays.length,
    topTime,
  }
}

export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60)
  const r = Math.round(m % 60)
  return h ? (r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`) : `${r} min`
}
