// Plan d'action IA de la semaine, envoyé par email.
// Deux usages :
//  - pg_cron, le lundi matin (en-tête x-cron-secret) : tous les utilisateurs dus ;
//  - bouton "Recevoir maintenant" des réglages (JWT utilisateur) : soi-même.
// Déployée avec verify_jwt = false ; l'authentification est vérifiée ici.
import { admin, APP_URL, json } from '../_shared/admin.ts'
import { loadPlanTasks, sanitizePlan } from '../_shared/ai/plan.ts'
import { planPrompt } from '../_shared/ai/prompts.ts'
import { getAiProvider } from '../_shared/ai/provider.ts'
import { sendEmail } from '../_shared/email.ts'
import { ChannelError } from '../_shared/errors.ts'
import { weeklyPlanEmail } from '../_shared/planEmail.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Target {
  user_id: string
  notify_email: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const reply = (b: unknown, s = 200) => json(b, s, cors)

  const secret = req.headers.get('x-cron-secret')
  if (secret) {
    const { data: ok } = await admin.rpc('verify_cron_secret', { p_secret: secret })
    if (!ok) return reply({ error: 'Non autorisé' }, 401)
    const { data, error } = await admin.rpc('claim_weekly_plans')
    if (error) return reply({ error: error.message }, 500)
    const results = await Promise.all(((data ?? []) as Target[]).map(sendPlan))
    return reply({ processed: results.length, results })
  }

  // Envoi immédiat à l'utilisateur connecté.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth?.user) return reply({ error: 'Non authentifié' }, 401)
  const { data: s } = await admin.from('settings').select('notify_email, email_enabled').eq('user_id', auth.user.id).maybeSingle()
  if (!s?.notify_email || !s.email_enabled) return reply({ ok: false, error: 'Activez d’abord le canal email et renseignez votre adresse.' })
  const { data: quota } = await admin.rpc('ai_quota', { p_user: auth.user.id })
  const q = (quota as { used: number; daily_limit: number }[] | null)?.[0]
  if (q && q.used >= q.daily_limit) return reply({ ok: false, error: `Limite IA du jour atteinte (${q.daily_limit}).` })
  const result = await sendPlan({ user_id: auth.user.id, notify_email: s.notify_email })
  return reply(result.status === 'sent' ? { ok: true } : { ok: false, error: result.error })
})

async function sendPlan(t: Target): Promise<{ user: string; status: 'sent' | 'skipped' | 'failed'; error?: string }> {
  const now = new Date().toISOString()
  const log = (status: 'sent' | 'skipped' | 'failed', extra: Record<string, unknown> = {}) =>
    admin.from('notification_logs').insert({
      user_id: t.user_id, kind: 'weekly_plan', occurrence_at: now, channel: 'email', status, attempts: 1, last_attempt_at: now, ...extra,
    })
  try {
    const { tasks, byRef } = await loadPlanTasks(t.user_id)
    if (!tasks.length) {
      await log('skipped', { error: 'Aucune tâche en cours' })
      return { user: t.user_id, status: 'skipped', error: 'Aucune tâche en cours.' }
    }
    const provider = await getAiProvider()
    const result = await provider.generateJson(planPrompt(tasks, 'week', ''))
    await admin.from('ai_usage').insert({
      user_id: t.user_id, feature: 'plan', provider: provider.name, model: result.model,
      tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, ok: true,
    })
    const mail = weeklyPlanEmail(sanitizePlan(result.data, byRef), APP_URL, tasks.length)
    const id = await sendEmail({ to: t.notify_email, ...mail })
    await log('sent', { sent_at: new Date().toISOString(), provider_id: id })
    return { user: t.user_id, status: 'sent' }
  } catch (e) {
    const status = e instanceof ChannelError ? e.outcome : 'failed'
    const error = (e as Error).message.slice(0, 500)
    await log(status, { error })
    return { user: t.user_id, status, error }
  }
}
