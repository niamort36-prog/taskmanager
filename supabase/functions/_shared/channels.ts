// Abstraction des canaux de notification : chaque canal reçoit le même
// message et délègue à son fournisseur (push VAPID, Resend/Brevo, Free/Twilio).
import { ChannelError } from './errors.ts'
import type { NotificationMessage } from './message.ts'

export { ChannelError }

export type Channel = 'push' | 'email' | 'sms'

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Envoie le message sur le canal demandé ; renvoie un identifiant / résumé fournisseur. */
export async function sendOnChannel(channel: Channel, userId: string, msg: NotificationMessage): Promise<string> {
  switch (channel) {
    case 'push': {
      const { sendPushToUser } = await import('./push.ts')
      return sendPushToUser(userId, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag })
    }
    case 'email': {
      const { admin } = await import('./admin.ts')
      const { sendEmail } = await import('./email.ts')
      const { data } = await admin.from('settings').select('notify_email').eq('user_id', userId).maybeSingle()
      if (!data?.notify_email) throw new ChannelError('Aucune adresse email dans les réglages', 'skipped')
      const subject = msg.title.replace(/^\p{Extended_Pictographic}\s*/u, '')
      const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
<h2 style="margin:0 0 8px">${escapeHtml(subject)}</h2>
<p style="white-space:pre-line;margin:0 0 16px">${escapeHtml(msg.body)}</p>
<p><a href="${escapeHtml(msg.url)}" style="background:#0369a1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir la tâche</a></p>
</div>`
      return sendEmail({ to: data.notify_email, subject: `Rappel : ${subject}`, html, text: `${subject}\n${msg.body}\n\n${msg.url}` })
    }
    case 'sms': {
      const { sendSms } = await import('./sms.ts')
      return sendSms(`${msg.title}\n${msg.body}`)
    }
  }
}
