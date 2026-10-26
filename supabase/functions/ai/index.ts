// Assistant IA : rédaction de mails, réponse à un mail, prochaines étapes,
// découpage d'une tâche. JWT utilisateur vérifié par Supabase ; contexte
// chargé côté serveur (jamais transmis tel quel par le navigateur) ;
// quota quotidien + limite de 10 appels par minute.
import { admin, json } from '../_shared/admin.ts'
import { AiError, getAiProvider, type AiRequest } from '../_shared/ai/provider.ts'
import {
  breakdownPrompt,
  draftEmailPrompt,
  nextStepsPrompt,
  planPrompt,
  replyEmailPrompt,
  type ContactContext,
  type EmailKind,
  type Horizon,
  type PlanTask,
  type TaskContext,
  type Tone,
} from '../_shared/ai/prompts.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action = 'draft_email' | 'reply_email' | 'next_steps' | 'breakdown' | 'plan'
const ACTIONS: Action[] = ['draft_email', 'reply_email', 'next_steps', 'breakdown', 'plan']
const PLAN_CATEGORIES = ['urgent', 'important', 'rapide', 'bloquee', 'plus_tard']
const PER_MINUTE = 10

interface Body {
  action: Action
  task_id?: string
  contact_id?: string | null
  kind?: EmailKind
  tone?: Tone
  instructions?: string
  received?: string
  horizon?: Horizon
  context?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const reply = (body: unknown, status = 200) => json(body, status, cors)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  const user = auth?.user
  if (!user) return reply({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || !ACTIONS.includes(body.action)) return reply({ error: 'Action inconnue' }, 400)

  // --- Quota ---
  const { data: quotaRows, error: qErr } = await admin.rpc('ai_quota', { p_user: user.id })
  if (qErr) return reply({ error: qErr.message }, 500)
  const quota = (quotaRows as { used: number; daily_limit: number; last_minute: number }[])[0] ?? { used: 0, daily_limit: 50, last_minute: 0 }
  if (quota.used >= quota.daily_limit)
    return reply({ error: `Limite quotidienne atteinte (${quota.daily_limit} demandes). Réessayez demain.`, quota }, 429)
  if (quota.last_minute >= PER_MINUTE) return reply({ error: 'Trop de demandes rapprochées, patientez une minute.', quota }, 429)

  try {
    // Rapport global : toutes les tâches en cours.
    if (body.action === 'plan') {
      const { tasks, byRef } = await loadPlanTasks(user.id)
      if (!tasks.length) return reply({ error: 'Aucune tâche en cours à analyser.' }, 400)
      const horizon: Horizon = body.horizon === 'week' ? 'week' : 'today'
      const provider = await getAiProvider()
      const result = await provider.generateJson(planPrompt(tasks, horizon, body.context ?? ''))
      await admin.from('ai_usage').insert({
        user_id: user.id, feature: 'plan', provider: provider.name, model: result.model,
        tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, ok: true,
      })
      return reply({
        data: { ...sanitizePlan(result.data, byRef), horizon, generated_at: new Date().toISOString(), task_count: tasks.length },
        quota: { ...quota, used: quota.used + 1 },
      })
    }

    const task = body.task_id ? await loadTask(body.task_id, user.id) : null
    if (body.action !== 'reply_email' && !task) return reply({ error: 'Tâche introuvable' }, 404)
    const contact = body.contact_id && body.task_id ? await loadContact(body.task_id, body.contact_id, user.id) : null
    const tone: Tone = ['formel', 'neutre', 'direct'].includes(body.tone ?? '') ? body.tone! : 'neutre'

    let request: AiRequest
    switch (body.action) {
      case 'draft_email':
        request = draftEmailPrompt(task!, contact, body.kind ?? 'libre', tone, body.instructions ?? '')
        break
      case 'reply_email':
        if (!body.received?.trim()) return reply({ error: 'Collez le mail reçu.' }, 400)
        request = replyEmailPrompt(task, contact, body.received, tone, body.instructions ?? '')
        break
      case 'next_steps':
        request = nextStepsPrompt(task!)
        break
      case 'breakdown':
      default:
        request = breakdownPrompt(task!)
        break
    }

    const provider = await getAiProvider()
    const result = await provider.generateJson(request)
    await admin.from('ai_usage').insert({
      user_id: user.id, feature: body.action, provider: provider.name, model: result.model,
      tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, ok: true,
    })
    return reply({ data: sanitize(body.action, result.data), quota: { ...quota, used: quota.used + 1 } })
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500
    const message = (e as Error).message
    await admin.from('ai_usage').insert({
      user_id: user.id, feature: body.action, provider: Deno.env.get('AI_PROVIDER') ?? 'gemini',
      model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash', ok: false, error: message.slice(0, 500),
    })
    return reply({ error: message, quota }, status)
  }
})

async function loadTask(id: string, userId: string): Promise<TaskContext | null> {
  const { data } = await admin
    .from('tasks')
    .select('title, status, priority, due_at, due_has_time, description, notes_md, user_id, subtasks(title, done, position)')
    .eq('id', id)
    .maybeSingle()
  if (!data || data.user_id !== userId) return null
  const subtasks = [...(data.subtasks ?? [])].sort((a, b) => a.position - b.position)
  return { ...data, subtasks }
}

async function loadContact(taskId: string, contactId: string, userId: string): Promise<ContactContext | null> {
  const { data } = await admin
    .from('task_contacts')
    .select('role_on_task, user_id, contact:contacts(name, role, company)')
    .eq('task_id', taskId)
    .eq('contact_id', contactId)
    .maybeSingle()
  if (!data || data.user_id !== userId || !data.contact) return null
  const c = data.contact as unknown as { name: string; role: string; company: string }
  return { name: c.name, role: c.role, company: c.company, role_on_task: data.role_on_task }
}

/** Garde-fous sur la forme de la réponse du modèle. */
function sanitize(action: Action, data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>
  if (action === 'draft_email' || action === 'reply_email') {
    return { subject: String(d.subject ?? '').slice(0, 200), body: String(d.body ?? '').slice(0, 8000) }
  }
  const steps = Array.isArray(d.steps) ? d.steps : []
  return {
    steps: steps
      .map((s: Record<string, unknown>) => ({
        title: String(s?.title ?? '').trim().slice(0, 200),
        due_in_days: Number.isInteger(s?.due_in_days) && (s.due_in_days as number) >= 0 ? (s.due_in_days as number) : null,
      }))
      .filter((s) => s.title)
      .slice(0, 10),
  }
}

/** Tâches en cours, résumées pour le rapport (150 au plus). Les identifiants
 *  sont remplacés par des références courtes T1, T2… pour le modèle. */
async function loadPlanTasks(userId: string) {
  const { data, error } = await admin
    .from('tasks')
    .select(
      'id, title, status, priority, due_at, due_has_time, description, subtasks(title, done, position), task_tags(tag:tags(name)), task_contacts(contact:contacts(name))',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .neq('status', 'done')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(150)
  if (error) throw new AiError(error.message, 500)
  const now = Date.now()
  const byRef = new Map<string, { id: string; title: string }>()
  // deno-lint-ignore no-explicit-any
  const tasks: PlanTask[] = (data ?? []).map((t: any, i: number) => {
    const ref = `T${i + 1}`
    byRef.set(ref, { id: t.id, title: t.title })
    const subs = [...(t.subtasks ?? [])].sort((a, b) => a.position - b.position)
    return {
      ref,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_at: t.due_at,
      due_has_time: t.due_has_time,
      overdue: Boolean(t.due_at && new Date(t.due_at).getTime() < now),
      description: t.description ?? '',
      tags: (t.task_tags ?? []).map((x: { tag?: { name: string } }) => x.tag?.name).filter(Boolean),
      subtasks_done: subs.filter((x) => x.done).length,
      subtasks_total: subs.length,
      next_subtasks: subs.filter((x) => !x.done).slice(0, 3).map((x) => x.title),
      // Noms uniquement : ni téléphone ni email.
      contacts: (t.task_contacts ?? []).map((x: { contact?: { name: string } }) => x.contact?.name).filter(Boolean),
    }
  })
  return { tasks, byRef }
}

/** Remplace les références par les vraies tâches et écarte tout le reste. */
function sanitizePlan(data: unknown, byRef: Map<string, { id: string; title: string }>) {
  const d = (data ?? {}) as Record<string, unknown>
  const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
  const seen = new Set<string>()
  const priorities = (Array.isArray(d.priorities) ? d.priorities : [])
    .map((p: Record<string, unknown>) => {
      const t = byRef.get(String(p?.ref ?? '').trim().toUpperCase())
      if (!t || seen.has(t.id)) return null
      seen.add(t.id)
      const category = PLAN_CATEGORIES.includes(String(p.category)) ? String(p.category) : 'important'
      return { task_id: t.id, title: t.title, category, why: str(p.why, 400), how: str(p.how, 600) }
    })
    .filter(Boolean)
    .slice(0, 20)
  // Références du modèle : "(T3)" est retiré, un "T3" seul devient le titre de la tâche.
  const deref = (s: string) =>
    s.replace(/\s*\(T\d{1,3}\)/g, '').replace(/\bT\d{1,3}\b/g, (m) => byRef.get(m)?.title ?? m)
  const plan = (Array.isArray(d.plan) ? d.plan : [])
    .map((b: Record<string, unknown>) => ({
      slot: str(b?.slot, 60),
      actions: (Array.isArray(b?.actions) ? b.actions : []).map((a: unknown) => deref(str(a, 300))).filter(Boolean).slice(0, 10),
    }))
    .filter((b: { slot: string; actions: string[] }) => b.slot && b.actions.length)
    .slice(0, 10)
  return {
    summary: deref(str(d.summary, 1200)),
    priorities,
    plan,
    advice: (Array.isArray(d.advice) ? d.advice : []).map((a: unknown) => deref(str(a, 400))).filter(Boolean).slice(0, 6),
  }
}
