// Abstraction des canaux de notification. Chaque canal reçoit le même
// message ; la phase 4 branchera l'email (Resend/Brevo) et le SMS
// (Free Mobile/Twilio) ici, sans toucher au reste.
import { ChannelError } from './errors.ts'
import type { NotificationMessage } from './message.ts'

export { ChannelError }

export type Channel = 'push' | 'email' | 'sms'

/** Envoie le message sur le canal demandé ; renvoie un identifiant / résumé fournisseur. */
export async function sendOnChannel(channel: Channel, userId: string, msg: NotificationMessage): Promise<string> {
  switch (channel) {
    case 'push': {
      const { sendPushToUser } = await import('./push.ts')
      return sendPushToUser(userId, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag })
    }
    case 'email':
    case 'sms':
      throw new ChannelError('Canal disponible à partir de la phase 4', 'skipped')
  }
}
