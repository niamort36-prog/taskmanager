// Données du plan d'action IA (rapport sur toutes les tâches), partagées
// entre l'Edge Function "ai" (bouton Plan IA) et "weekly-plan" (email du lundi).
import { admin } from '../admin.ts'
import { AiError } from './provider.ts'
import type { PlanTask } from './prompts.ts'

const PLAN_CATEGORIES = ['urgent', 'important', 'rapide', 'bloquee', 'plus_tard']

export interface PlanResult {
  summary: string
  priorities: { task_id: string; title: string; category: string; why: string; how: string }[]
  plan: { slot: string; actions: string[] }[]
  advice: string[]
}

/** Tâches en cours, résumées pour le rapport (150 au plus). Les identifiants
 *  sont remplacés par des références courtes T1, T2… pour le modèle. */
export async function loadPlanTasks(userId: string) {
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
export function sanitizePlan(data: unknown, byRef: Map<string, { id: string; title: string }>): PlanResult {
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
    .filter((p): p is PlanResult['priorities'][number] => p !== null)
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
