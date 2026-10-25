/**
 * Toute la logique de dates passe par ce module.
 * Stockage : ISO UTC (timestamptz). Affichage et calculs : Europe/Paris.
 * Une échéance "journée entière" est stockée à 23:59:59.999 heure de Paris.
 */
import { TZDate, tz } from '@date-fns/tz'
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  isSameDay,
  nextMonday,
  set,
} from 'date-fns'
import { fr } from 'date-fns/locale'

export const TZ = 'Europe/Paris'
export const inTz = tz(TZ)
const opts = { in: inTz, locale: fr }

export interface Due {
  due_at: string | null
  due_has_time: boolean
}

export const nowParis = () => TZDate.tz(TZ)
export const toParis = (iso: string) => new TZDate(iso, TZ)

/** Échéance "journée entière" pour le jour de `d` (heure de Paris). */
export function allDayDue(d: Date): Due {
  return { due_at: endOfDay(d, { in: inTz }).toISOString(), due_has_time: false }
}

/** Échéance à une heure précise du jour de `d` (heure de Paris). */
export function timedDue(d: Date, hours: number, minutes = 0): Due {
  const v = set(d, { hours, minutes, seconds: 0, milliseconds: 0 }, { in: inTz })
  return { due_at: v.toISOString(), due_has_time: true }
}

export interface DateShortcut {
  label: string
  value: Due
}

/** Raccourcis en un tap : "Ce soir", "Demain 8h", "Lundi", "+1 semaine". */
export function dateShortcuts(now: Date = nowParis()): DateShortcut[] {
  const list: DateShortcut[] = []
  const hour = new TZDate(now.getTime(), TZ).getHours()
  if (hour < 19) list.push({ label: 'Ce soir', value: timedDue(now, 19) })
  else if (hour < 22) list.push({ label: 'Ce soir', value: timedDue(now, 22) })
  list.push({ label: "Aujourd'hui", value: allDayDue(now) })
  list.push({ label: 'Demain 8h', value: timedDue(addDays(now, 1, { in: inTz }), 8) })
  list.push({ label: 'Lundi', value: allDayDue(nextMonday(now, { in: inTz })) })
  list.push({ label: '+1 semaine', value: allDayDue(addDays(now, 7, { in: inTz })) })
  return list
}

/** Options de report (glisser à gauche). Conserve l'heure si l'échéance en avait une. */
export function postponeOptions(current: Due, now: Date = nowParis()): DateShortcut[] {
  const keep = (day: Date): Due => {
    if (current.due_at && current.due_has_time) {
      const c = toParis(current.due_at)
      return timedDue(day, c.getHours(), c.getMinutes())
    }
    return allDayDue(day)
  }
  // "+1 semaine" part de l'échéance actuelle si elle existe et n'est pas dépassée.
  const base = current.due_at && toParis(current.due_at).getTime() > now.getTime() ? toParis(current.due_at) : now
  const options = [
    { label: 'Demain', value: keep(addDays(now, 1, { in: inTz })) },
    { label: 'Semaine prochaine', value: keep(nextMonday(now, { in: inTz })) },
    { label: '+1 semaine', value: keep(addDays(base, 7, { in: inTz })) },
  ]
  // Le dimanche, "semaine prochaine" = demain : on évite le doublon.
  return options.filter((o, i) => options.findIndex((p) => p.value.due_at === o.value.due_at) === i)
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** État visuel d'une échéance : en retard / aujourd'hui / bientôt (< 48 h) / plus tard. */
export function dueState(due_at: string | null, now: Date = nowParis()): DueState {
  if (!due_at) return 'none'
  const due = toParis(due_at)
  if (due.getTime() < now.getTime()) return 'overdue'
  if (isSameDay(due, now, { in: inTz })) return 'today'
  if (due.getTime() - now.getTime() < 48 * 3600_000) return 'soon'
  return 'later'
}

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'none'

/**
 * Rangement pour la vue "Aujourd'hui". "week" = les 7 jours suivants (glissant),
 * pour que le dimanche soir on voie bien les tâches de lundi.
 */
export function dueBucket(due_at: string | null, now: Date = nowParis()): Bucket {
  const s = dueState(due_at, now)
  if (s === 'none' || s === 'overdue' || s === 'today') return s
  const due = toParis(due_at!)
  return due.getTime() <= endOfDay(addDays(now, 7, { in: inTz }), { in: inTz }).getTime() ? 'week' : 'later'
}

/** Libellé court et lisible : "Aujourd'hui 14:00", "Demain", "lundi", "3 nov.". */
export function formatDue(due_at: string, hasTime: boolean, now: Date = nowParis()): string {
  const due = toParis(due_at)
  const diff = differenceInCalendarDays(due, now, { in: inTz })
  const time = hasTime ? ' ' + format(due, 'HH:mm', opts) : ''
  if (diff === 0) return "Aujourd'hui" + time
  if (diff === 1) return 'Demain' + time
  if (diff === -1) return 'Hier' + time
  if (diff > 1 && diff < 7) return format(due, 'EEEE', opts) + time
  const sameYear = due.getFullYear() === new TZDate(now.getTime(), TZ).getFullYear()
  return format(due, sameYear ? 'd MMM' : 'd MMM yyyy', opts) + time
}

export const formatDateTime = (iso: string) => format(toParis(iso), "d MMM yyyy 'à' HH:mm", opts)
export const formatDayTitle = (d: Date) => format(d, 'EEEE d MMMM', opts)
export const formatMonthTitle = (d: Date) => format(d, 'MMMM yyyy', opts)
export const dayKey = (d: Date | string) =>
  format(typeof d === 'string' ? toParis(d) : d, 'yyyy-MM-dd', opts)

/** Inverse de dayKey : midi heure de Paris du jour "yyyy-MM-dd". */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new TZDate(y, m - 1, d, 12, 0, TZ)
}

/** Valeur pour <input type="date"> ou <input type="datetime-local">. */
export function toInputValue(iso: string, withTime: boolean): string {
  return format(toParis(iso), withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd', opts)
}

/** Inverse de toInputValue : la saisie est interprétée en heure de Paris. */
export function fromInputValue(value: string, withTime: boolean): Due | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  if (!m) return null
  const day = new TZDate(+m[1], +m[2] - 1, +m[3], TZ)
  if (withTime && m[4]) return timedDue(day, +m[4], +m[5])
  return allDayDue(day)
}
