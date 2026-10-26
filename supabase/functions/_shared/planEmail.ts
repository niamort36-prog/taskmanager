// Gabarit de l'email "Plan de la semaine" (rapport IA).
import type { PlanResult } from './ai/plan.ts'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const CATEGORY: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#b91c1c' },
  important: { label: 'Important', color: '#b45309' },
  rapide: { label: 'Rapide', color: '#15803d' },
  bloquee: { label: 'À débloquer', color: '#0369a1' },
  plus_tard: { label: 'Peut attendre', color: '#555555' },
}

export function weeklyPlanEmail(plan: PlanResult, appUrl: string, taskCount: number, now = new Date()) {
  const week = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })
  const link = (id: string) => esc(`${appUrl}#/today?task=${id}`)

  const priorities = plan.priorities
    .map((p, i) => {
      const c = CATEGORY[p.category] ?? CATEGORY.important
      return `<li style="margin:0 0 12px">
  <div><strong>${i + 1}. <a href="${link(p.task_id)}" style="color:#111">${esc(p.title)}</a></strong>
  <span style="color:${c.color};font-size:13px;border:1px solid ${c.color};border-radius:6px;padding:0 6px;margin-left:4px">${c.label}</span></div>
  <div style="color:#555">${esc(p.why)}</div>
  <div><span style="color:#0369a1;font-weight:600">Comment :</span> ${esc(p.how)}</div>
</li>`
    })
    .join('')

  const timeline = plan.plan
    .map((b) => `<li style="margin:0 0 8px"><strong>${esc(b.slot)}</strong><ul style="margin:4px 0 0;padding-left:18px">${b.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></li>`)
    .join('')

  const advice = plan.advice.map((a) => `<li>${esc(a)}</li>`).join('')

  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;max-width:600px;color:#111">
<h2 style="margin:0 0 4px">Votre plan de la semaine</h2>
<p style="color:#555;margin:0 0 16px">Semaine du ${esc(week)} · ${taskCount} tâches analysées</p>
<p style="background:#f4f6f9;border-radius:8px;padding:12px;margin:0 0 16px">${esc(plan.summary)}</p>
${priorities ? `<h3 style="margin:16px 0 8px">Priorités</h3><ol style="list-style:none;padding:0;margin:0">${priorities}</ol>` : ''}
${timeline ? `<h3 style="margin:16px 0 8px">Plan d’action</h3><ol style="list-style:none;padding:0;margin:0;border-left:3px solid #0369a1;padding-left:12px">${timeline}</ol>` : ''}
${advice ? `<h3 style="margin:16px 0 8px">Conseils</h3><ul style="padding-left:18px;margin:0">${advice}</ul>` : ''}
<p style="margin-top:24px"><a href="${esc(`${appUrl}#/plan`)}" style="background:#0369a1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir l’application</a></p>
<p style="color:#888;font-size:13px">Désactivable dans Réglages → Plan de la semaine par email.</p>
</div>`

  const text = [
    `Votre plan de la semaine (${week})`,
    '',
    plan.summary,
    '',
    'PRIORITÉS',
    ...plan.priorities.map((p, i) => `${i + 1}. ${p.title} [${(CATEGORY[p.category] ?? CATEGORY.important).label}]\n   ${p.why}\n   Comment : ${p.how}`),
    '',
    'PLAN D’ACTION',
    ...plan.plan.map((b) => `${b.slot}\n${b.actions.map((a) => `  - ${a}`).join('\n')}`),
    '',
    'CONSEILS',
    ...plan.advice.map((a) => `- ${a}`),
    '',
    `${appUrl}#/plan`,
  ].join('\n')

  return { subject: `Votre plan de la semaine du ${week}`, html, text }
}
