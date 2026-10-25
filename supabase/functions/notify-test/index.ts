// Envoie une notification de test à l'utilisateur connecté (bouton
// "Envoyer un test" des réglages). JWT vérifié par Supabase.
import { admin, APP_URL, json } from '../_shared/admin.ts'
import { ChannelError, sendOnChannel, type Channel } from '../_shared/channels.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Non authentifié' }, 401, cors)

  const { channel = 'push' } = (await req.json().catch(() => ({}))) as { channel?: Channel }
  const now = new Date().toISOString()
  try {
    const detail = await sendOnChannel(channel, auth.user.id, {
      title: '✅ Notifications actives',
      body: 'Vos rappels arriveront ici.',
      url: `${APP_URL}#/settings`,
      tag: 'test',
    })
    await admin.from('notification_logs').insert({
      user_id: auth.user.id, kind: 'test', occurrence_at: now, channel, status: 'sent', attempts: 1, sent_at: now,
      provider_id: detail, last_attempt_at: now,
    })
    return json({ ok: true, detail }, 200, cors)
  } catch (e) {
    const status = e instanceof ChannelError ? e.outcome : 'failed'
    await admin.from('notification_logs').insert({
      user_id: auth.user.id, kind: 'test', occurrence_at: now, channel, status, attempts: 1,
      error: (e as Error).message.slice(0, 500), last_attempt_at: now,
    })
    return json({ ok: false, error: (e as Error).message }, 200, cors)
  }
})
