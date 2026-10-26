// Edge Function appelée par pg_cron (toutes les 5 min, via pg_net) quand un
// récapitulatif quotidien est dû. Même protection que send-reminders :
// secret partagé x-cron-secret, verify_jwt = false.
import { admin, APP_URL, json } from '../_shared/admin.ts'
import { digestEmail, type DigestItem } from '../_shared/digest.ts'
import { sendEmail } from '../_shared/email.ts'
import { ChannelError } from '../_shared/errors.ts'

interface DigestUser {
  user_id: string
  notify_email: string
  local_date: string
}

Deno.serve(async (req) => {
  const { data: authorized, error: authError } = await admin.rpc('verify_cron_secret', {
    p_secret: req.headers.get('x-cron-secret') ?? '',
  })
  if (authError) return json({ error: authError.message }, 500)
  if (!authorized) return json({ error: 'Non autorisé' }, 401)

  // Réservation atomique : un seul récapitulatif par utilisateur et par jour.
  const { data, error } = await admin.rpc('claim_due_digests')
  if (error) return json({ error: error.message }, 500)
  const users = (data ?? []) as DigestUser[]

  const results = await Promise.all(users.map(sendDigest))
  return json({ processed: users.length, results })
})

async function sendDigest(u: DigestUser): Promise<string> {
  const now = new Date().toISOString()
  const log = (status: 'sent' | 'failed' | 'skipped', extra: Record<string, unknown> = {}) =>
    admin.from('notification_logs').insert({
      user_id: u.user_id, kind: 'digest', occurrence_at: `${u.local_date}T00:00:00Z`, channel: 'email',
      status, attempts: 1, last_attempt_at: now, ...extra,
    })

  const { data: items, error } = await admin.rpc('digest_items', { p_user: u.user_id })
  if (error) {
    await log('failed', { error: error.message })
    return 'failed'
  }
  if (!items?.length) {
    await log('skipped', { error: 'Rien de prévu aujourd’hui' })
    return 'skipped'
  }
  try {
    const mail = digestEmail(items as DigestItem[], APP_URL)
    const id = await sendEmail({ to: u.notify_email, ...mail })
    await log('sent', { sent_at: now, provider_id: id })
    return 'sent'
  } catch (e) {
    const status = e instanceof ChannelError ? e.outcome : 'failed'
    await log(status, { error: (e as Error).message.slice(0, 500) })
    return status
  }
}
