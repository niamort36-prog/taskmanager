import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'

export type AiAction = 'draft_email' | 'reply_email' | 'next_steps' | 'breakdown' | 'plan' | 'parse_task'
export type Tone = 'formel' | 'neutre' | 'direct'
export type EmailKind = 'relance' | 'demande_info' | 'reponse' | 'libre'

export interface AiQuota {
  used: number
  daily_limit: number
}

export interface EmailDraft {
  subject: string
  body: string
}

export interface StepSuggestion {
  title: string
  due_in_days: number | null
}

interface AiPayload {
  action: AiAction
  task_id?: string
  contact_id?: string | null
  kind?: EmailKind
  tone?: Tone
  instructions?: string
  received?: string
  horizon?: 'today' | 'week'
  context?: string
  text?: string
}

/** Tâche extraite d'une phrase par l'IA (action parse_task). */
export interface ParsedTask {
  title: string
  description: string
  priority: 1 | 2 | 3 | 4
  due_at: string | null
  due_has_time: boolean
  reminder: { mode: 'absolute'; remind_at: string } | { mode: 'relative'; offset_minutes: number } | null
  contact: { id: string; name: string } | null
  subtasks: string[]
}

const quotaKey = ['ai-quota'] as const

/** Appels du jour / limite (lu en base, la limite est appliquée côté serveur). */
export const useAiQuota = () =>
  useQuery({
    queryKey: quotaKey,
    queryFn: async () => unwrap<AiQuota[]>(await supabase.rpc('ai_quota'))[0] ?? { used: 0, daily_limit: 50 },
    staleTime: 60_000,
  })

export function useInvokeAi() {
  const qc = useQueryClient()
  return async function invokeAi<T>(payload: AiPayload): Promise<T> {
    const { data, error } = await supabase.functions.invoke<{ data: T; quota?: AiQuota; error?: string }>('ai', { body: payload })
    if (error) {
      // Message d'erreur renvoyé par la fonction (quota atteint, clé absente…).
      let message = error.message
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json().catch(() => null)
        if (body?.error) message = body.error
        if (body?.quota) qc.setQueryData(quotaKey, body.quota)
      }
      throw new Error(message)
    }
    if (data?.quota) qc.setQueryData(quotaKey, data.quota)
    if (!data?.data) throw new Error(data?.error ?? 'Réponse vide')
    return data.data
  }
}
