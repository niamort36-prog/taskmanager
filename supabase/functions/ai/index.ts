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
  replyEmailPrompt,
  type ContactContext,
  type EmailKind,
  type TaskContext,
  type Tone,
} from '../_shared/ai/prompts.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action = 'draft_email' | 'reply_email' | 'next_steps' | 'breakdown'
const ACTIONS: Action[] = ['draft_email', 'reply_email', 'next_steps', 'breakdown']
const PER_MINUTE = 10

interface Body {
  action: Action
  task_id?: string
  contact_id?: string | null
  kind?: EmailKind
  tone?: Tone
  instructions?: string
  received?: string
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
