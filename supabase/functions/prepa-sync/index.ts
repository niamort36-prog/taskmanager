// Import des chantiers du Suivi de prépa en tâches.
//  - pg_cron, le 1er du mois (en-tête x-cron-secret) : utilisateurs activés ;
//  - bouton "Analyser maintenant" des réglages (JWT utilisateur) : soi-même.
// Déployée avec verify_jwt = false ; l'authentification est vérifiée ici.
import { admin, json } from '../_shared/admin.ts'
import { getAiProvider } from '../_shared/ai/provider.ts'
import {
  type AiPrepa,
  buildTaskPlan,
  type Chantier,
  fetchChantiers,
  myOpenChantiers,
  parseNames,
  PREPA_APP_URL,
  prepaPrompt,
} from '../_shared/prepa.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Report {
  found: number
  created: string[]
  updated: string[]
  unchanged: number
  ignored: number
  errors: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const reply = (b: unknown, s = 200) => json(b, s, cors)

  const secret = req.headers.get('x-cron-secret')
  if (secret) {
    const { data: ok } = await admin.rpc('verify_cron_secret', { p_secret: secret })
    if (!ok) return reply({ error: 'Non autorisé' }, 401)
    const { data, error } = await admin.rpc('claim_prepa_syncs')
    if (error) return reply({ error: error.message }, 500)
    const users = (data ?? []) as { user_id: string }[]
    if (!users.length) return reply({ processed: 0 })
    const all = await fetchChantiers()
    const results = []
    for (const u of users) results.push(await syncUser(u.user_id, all).catch((e) => ({ error: (e as Error).message })))
    return reply({ processed: users.length, results })
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth?.user) return reply({ error: 'Non authentifié' }, 401)
  try {
    const report = await syncUser(auth.user.id, await fetchChantiers())
    return reply({ ok: true, report })
  } catch (e) {
    return reply({ ok: false, error: (e as Error).message })
  }
})

async function syncUser(userId: string, all: Chantier[]): Promise<Report> {
  const { data: s } = await admin.from('settings').select('prepa_team, prepa_cdt_names').eq('user_id', userId).maybeSingle()
  const names = parseNames(s?.prepa_cdt_names ?? 'Roy, Romain')
  if (!names.length) throw new Error('Indiquez votre nom de CdT dans les réglages.')
  const mine = myOpenChantiers(all, s?.prepa_team ?? 'EEL Limoges', names)
  const report: Report = { found: mine.length, created: [], updated: [], unchanged: 0, ignored: 0, errors: [] }
  if (!mine.length) return report

  const { data: imports } = await admin
    .from('prepa_imports')
    .select('chantier_id, task_id, cons_end, task:tasks(id, deleted_at, title)')
    .eq('user_id', userId)
  const byId = new Map((imports ?? []).map((i) => [i.chantier_id, i]))

  for (const { c, role } of mine) {
    const cid = String(c.id)
    try {
      const prev = byId.get(cid)
      if (prev) {
        const task = prev.task as unknown as { id: string; deleted_at: string | null; title: string } | null
        // Tâche supprimée par l'utilisateur : on ne la recrée pas.
        if (!task || task.deleted_at) {
          report.ignored++
          continue
        }
        const consEnd = c.consEnd ?? c.end ?? null
        if (consEnd && consEnd !== prev.cons_end) {
          const plan = buildTaskPlan(c, role, null)
          await admin.from('tasks').update({ due_at: plan.due_at, due_has_time: false }).eq('id', task.id)
          await admin.from('prepa_imports').update({ cons_end: consEnd, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('chantier_id', cid)
          report.updated.push(task.title)
        } else report.unchanged++
        continue
      }
      const plan = buildTaskPlan(c, role, await askAi(userId, c, role))
      const taskId = await createTask(userId, plan, c)
      await admin.from('prepa_imports').insert({ user_id: userId, chantier_id: cid, task_id: taskId, cons_end: c.consEnd ?? c.end ?? null })
      report.created.push(plan.title)
    } catch (e) {
      report.errors.push(`${c.lname ?? cid} : ${(e as Error).message}`)
    }
  }
  return report
}

/** Description et actions en plus par l'IA ; sans IA (quota, panne), la tâche est créée quand même. */
async function askAi(userId: string, c: Chantier, role: string): Promise<AiPrepa | null> {
  const { data: quota } = await admin.rpc('ai_quota', { p_user: userId })
  const q = (quota as { used: number; daily_limit: number }[] | null)?.[0]
  if (q && q.used >= q.daily_limit) return null
  try {
    const provider = await getAiProvider()
    const result = await provider.generateJson<AiPrepa>(prepaPrompt(c, role))
    await admin.from('ai_usage').insert({
      user_id: userId, feature: 'prepa', provider: provider.name, model: result.model,
      tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, ok: true,
    })
    return result.data
  } catch (e) {
    await admin.from('ai_usage').insert({
      user_id: userId, feature: 'prepa', provider: Deno.env.get('AI_PROVIDER') ?? 'gemini',
      model: Deno.env.get('GEMINI_MODEL') ?? 'gemini', ok: false, error: (e as Error).message.slice(0, 500),
    })
    return null
  }
}

async function createTask(userId: string, plan: ReturnType<typeof buildTaskPlan>, c: Chantier): Promise<string> {
  const { data: task, error } = await admin
    .from('tasks')
    .insert({
      user_id: userId, title: plan.title, description: plan.description, priority: plan.priority,
      due_at: plan.due_at, due_has_time: false, status: 'todo',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (plan.subtasks.length) {
    const { error: e } = await admin
      .from('subtasks')
      .insert(plan.subtasks.map((s, position) => ({ task_id: task.id, user_id: userId, title: s.title, due_at: s.due_at, position })))
    if (e) throw new Error(e.message)
  }
  await admin.from('links').insert({ task_id: task.id, user_id: userId, url: PREPA_APP_URL, label: `Suivi de prépa – ${c.lname ?? 'chantier'}` })

  // Étiquette "Chantier" (créée au besoin).
  let { data: tag } = await admin.from('tags').select('id').eq('user_id', userId).eq('name', 'Chantier').maybeSingle()
  if (!tag) ({ data: tag } = await admin.from('tags').insert({ user_id: userId, name: 'Chantier', color: '#f97316' }).select('id').single())
  if (tag) await admin.from('task_tags').insert({ task_id: task.id, tag_id: tag.id, user_id: userId })
  return task.id
}
