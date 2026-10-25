// Edge Function appelée chaque minute par pg_cron (via pg_net) lorsqu'il y a
// des rappels échus. Protégée par un secret partagé (en-tête x-cron-secret)
// stocké dans Supabase Vault : déployée avec verify_jwt = false.
import { admin, json } from '../_shared/admin.ts'
import { ChannelError, sendOnChannel, type Channel } from '../_shared/channels.ts'
import { reminderMessage, type ReminderRow } from '../_shared/message.ts'

interface ClaimedRow extends ReminderRow {
  log_id: number
  user_id: string
  channel: Channel
  attempts: number
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-cron-secret') ?? ''
  const { data: authorized, error: authError } = await admin.rpc('verify_cron_secret', { p_secret: secret })
  if (authError) return json({ error: authError.message }, 500)
  if (!authorized) return json({ error: 'Non autorisé' }, 401)

  // Réservation atomique : chaque ligne n'est renvoyée qu'à un seul appel.
  const { data, error } = await admin.rpc('claim_due_notifications', { p_limit: 50 })
  if (error) return json({ error: error.message }, 500)
  const rows = (data ?? []) as ClaimedRow[]

  const results = await Promise.all(rows.map(processRow))
  const summary = results.reduce<Record<string, number>>((acc, s) => ((acc[s] = (acc[s] ?? 0) + 1), acc), {})
  console.log(`send-reminders : ${rows.length} envoi(s)`, summary)
  return json({ processed: rows.length, ...summary })
})

async function processRow(row: ClaimedRow): Promise<'sent' | 'failed' | 'skipped'> {
  const now = new Date().toISOString()
  try {
    const providerId = await sendOnChannel(row.channel, row.user_id, reminderMessage(row))
    await admin
      .from('notification_logs')
      .update({ status: 'sent', sent_at: now, attempts: row.attempts + 1, error: null, provider_id: providerId, last_attempt_at: now })
      .eq('id', row.log_id)
    return 'sent'
  } catch (e) {
    const outcome = e instanceof ChannelError ? e.outcome : 'failed'
    await admin
      .from('notification_logs')
      .update({ status: outcome, attempts: row.attempts + 1, error: (e as Error).message.slice(0, 500), last_attempt_at: now })
      .eq('id', row.log_id)
    return outcome
  }
}
