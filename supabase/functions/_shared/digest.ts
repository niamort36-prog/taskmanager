// Gabarit de l'email de récapitulatif quotidien (tâches du jour + retards).
import { formatDueFr } from './message.ts'

export interface DigestItem {
  kind: 'task' | 'subtask'
  task_id: string
  title: string
  parent_title: string | null
  due_at: string
  due_has_time: boolean
  overdue: boolean
  priority: number
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function line(i: DigestItem, appUrl: string, now: Date) {
  const name = i.kind === 'subtask' ? `${i.title} (${i.parent_title})` : i.title
  const when = formatDueFr(i.due_at, i.due_has_time, now)
  const urgent = i.priority >= 4 ? ' — urgent' : ''
  return {
    html: `<li style="margin:4px 0"><a href="${esc(`${appUrl}#/today?task=${i.task_id}`)}" style="color:#0369a1">${esc(name)}</a> <span style="color:#555">· ${esc(when)}${urgent}</span></li>`,
    text: `- ${name} · ${when}${urgent}`,
  }
}

export function digestEmail(items: DigestItem[], appUrl: string, now = new Date()) {
  const overdue = items.filter((i) => i.overdue)
  const today = items.filter((i) => !i.overdue)
  const dateLabel = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })

  const section = (title: string, color: string, list: DigestItem[]) =>
    list.length
      ? {
          html: `<h3 style="color:${color};margin:16px 0 4px">${title} (${list.length})</h3><ul style="padding-left:20px;margin:0">${list
            .map((i) => line(i, appUrl, now).html)
            .join('')}</ul>`,
          text: `${title} (${list.length})\n${list.map((i) => line(i, appUrl, now).text).join('\n')}`,
        }
      : { html: '', text: '' }

  const a = section('En retard', '#b91c1c', overdue)
  const b = section('Aujourd’hui', '#b45309', today)
  const parts = [overdue.length && `${overdue.length} en retard`, today.length && `${today.length} aujourd’hui`].filter(Boolean)

  return {
    subject: `Votre journée : ${parts.join(', ')}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;max-width:560px">
<h2 style="margin:0 0 4px">Récapitulatif du ${esc(dateLabel)}</h2>${a.html}${b.html}
<p style="margin-top:24px"><a href="${esc(`${appUrl}#/today`)}" style="background:#0369a1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir l’application</a></p>
<p style="color:#888;font-size:13px">Désactivable dans Réglages → Récapitulatif quotidien.</p></div>`,
    text: `Récapitulatif du ${dateLabel}\n\n${[a.text, b.text].filter(Boolean).join('\n\n')}\n\n${appUrl}#/today`,
  }
}
