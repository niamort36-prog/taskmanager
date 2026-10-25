// Textes lisibles pour les rappels ("2 jours avant l'échéance", "Chaque lundi à 08:00"…).
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatDue, inTz, toParis } from '@/lib/dates'
import type { Recurrence, Reminder } from '@/types/domain'

const opts = { in: inTz, locale: fr }
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

export const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

/** -2880 -> "2 jours avant l'échéance" */
export function offsetLabel(minutes: number): string {
  const abs = Math.abs(minutes)
  if (abs === 0) return 'À l’échéance'
  let txt: string
  if (abs % 10080 === 0) txt = plural(abs / 10080, 'semaine')
  else if (abs % 1440 === 0) txt = plural(abs / 1440, 'jour')
  else if (abs % 60 === 0) txt = `${abs / 60} h`
  else txt = `${abs} min`
  return `${txt} avant l’échéance`
}

export function recurrenceLabel(rec: Recurrence, startIso: string): string {
  const start = toParis(startIso)
  const n = rec.interval ?? 1
  const time = format(start, 'HH:mm', opts)
  let txt: string
  switch (rec.freq) {
    case 'daily':
      txt = n > 1 ? `Tous les ${n} jours` : 'Tous les jours'
      break
    case 'weekly': {
      const days = (rec.byweekday?.length ? rec.byweekday : [Number(format(start, 'i', opts))])
        .slice()
        .sort()
        .map((d) => WEEKDAYS_SHORT[d - 1])
        .join(' ')
      txt = `${n > 1 ? `Toutes les ${n} semaines` : 'Chaque semaine'} (${days})`
      break
    }
    case 'monthly':
      txt = `${n > 1 ? `Tous les ${n} mois` : 'Tous les mois'} le ${format(start, 'd', opts)}`
      break
    case 'yearly':
      txt = `Chaque année le ${format(start, 'd MMMM', opts)}`
      break
  }
  const until = rec.until ? `, jusqu’au ${format(toParis(`${rec.until}T12:00:00Z`), 'd MMM yyyy', opts)}` : ''
  return `${txt} à ${time}${until}`
}

export function reminderLabel(r: Pick<Reminder, 'mode' | 'remind_at' | 'offset_minutes' | 'recurrence'>): string {
  if (r.mode === 'relative') return offsetLabel(r.offset_minutes ?? 0)
  if (r.recurrence) return recurrenceLabel(r.recurrence, r.remind_at!)
  return formatDue(r.remind_at!, true)
}

export function reminderStatus(r: Reminder): { text: string; tone: 'ok' | 'muted' } {
  if (!r.active) return { text: 'Désactivé', tone: 'muted' }
  if (r.next_fire_at) return { text: `Prochain : ${formatDue(r.next_fire_at, true).toLowerCase()}`, tone: 'ok' }
  if (r.mode === 'relative' && !r.last_fired_at) return { text: 'En attente (pas d’échéance, ou moment passé)', tone: 'muted' }
  return { text: 'Terminé', tone: 'muted' }
}

export const CHANNEL_LABEL = { push: 'Push', email: 'Email', sms: 'SMS' } as const
