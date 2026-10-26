// Génération d'un agenda iCalendar (RFC 5545) à partir des tâches.

export interface IcsTask {
  id: string
  title: string
  description: string
  address: string
  status: string
  priority: number
  due_at: string
  due_has_time: boolean
  updated_at: string
}

const TZ = 'Europe/Paris'
// Priorité de l'app (4 = urgente) -> PRIORITY iCalendar (1 = la plus haute).
const ICS_PRIORITY: Record<number, number> = { 4: 1, 3: 3, 2: 5, 1: 9 }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Coupe les lignes à 75 octets (continuation par un espace), sans casser un caractère UTF-8. */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
      size = 0
    }
    cur += ch
    size += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Date du jour (AAAAMMJJ) en heure de Paris. */
function parisDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return p.replace(/-/g, '')
}

function nextDay(yyyymmdd: string): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1))
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export function buildIcs(tasks: IcsTask[], appUrl: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mes taches//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mes tâches',
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const t of tasks) {
    const due = new Date(t.due_at)
    const done = t.status === 'done'
    const link = `${appUrl}#/today?task=${t.id}`
    const desc = [t.description.trim(), link].filter(Boolean).join('\n\n')
    lines.push('BEGIN:VEVENT', `UID:${t.id}@mes-taches`, `DTSTAMP:${utc(new Date(t.updated_at || now))}`)
    if (t.due_has_time) {
      lines.push(`DTSTART:${utc(due)}`, `DTEND:${utc(new Date(due.getTime() + 30 * 60_000))}`)
    } else {
      const day = parisDate(due)
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay(day)}`)
    }
    lines.push(
      `SUMMARY:${esc((done ? '✓ ' : '') + t.title)}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${link}`,
      `PRIORITY:${ICS_PRIORITY[t.priority] ?? 5}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
    )
    if (t.address.trim()) lines.push(`LOCATION:${esc(t.address.trim())}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
