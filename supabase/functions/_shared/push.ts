// Envoi Web Push (protocole standard + clés VAPID) vers tous les appareils
// abonnés d'un utilisateur. Les abonnements expirés (404/410) sont supprimés.
import webpush from 'npm:web-push@3.6.7'
import { admin, APP_URL } from './admin.ts'
import { ChannelError } from './errors.ts'

export interface PushPayload {
  title: string
  body: string
  /** URL ouverte au clic sur la notification. */
  url: string
  /** Une notification avec le même tag remplace la précédente. */
  tag?: string
}

let configured = false
function configure() {
  if (configured) return
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) throw new ChannelError('Clés VAPID absentes des secrets Supabase', 'failed')
  // Le "subject" identifie l'expéditeur auprès des services push (Google, Apple, Mozilla).
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? APP_URL, pub, priv)
  configured = true
}

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<string> {
  configure()
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw new ChannelError(error.message, 'failed')
  if (!subs?.length) throw new ChannelError('Aucun appareil abonné aux notifications push', 'skipped')

  const errors: string[] = []
  let sent = 0
  await Promise.all(
    (subs as Subscription[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 3600, urgency: 'high', topic: payload.tag?.slice(0, 32).replace(/[^\w-]/g, '') },
        )
        sent++
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Abonnement expiré ou révoqué par l'utilisateur.
          await admin.from('push_subscriptions').delete().eq('id', s.id)
          errors.push('abonnement expiré supprimé')
        } else {
          errors.push(`${status ?? ''} ${(e as Error).message}`.trim())
        }
      }
    }),
  )
  if (!sent) throw new ChannelError(errors.join(' ; ') || 'Échec de l’envoi push', 'failed')
  return `${sent}/${subs.length} appareil(s)`
}
