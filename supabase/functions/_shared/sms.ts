// Envoi de SMS via un fournisseur interchangeable.
// - Free Mobile (par défaut) : API gratuite, envoie UNIQUEMENT vers la ligne
//   Free Mobile du titulaire (pas de numéro à fournir).
// - Twilio : pour un autre destinataire, plus tard (payant).
// Choix : secret SMS_PROVIDER, sinon le premier fournisseur configuré.
import { ChannelError } from './errors.ts'

interface SmsProvider {
  name: string
  send(text: string): Promise<string>
}

const FREE_ERRORS: Record<number, string> = {
  400: 'paramètre manquant',
  402: 'trop de SMS envoyés en peu de temps, réessayez plus tard',
  403: 'service non activé ou identifiants incorrects (option « Notifications par SMS »)',
  500: 'erreur côté Free Mobile',
}

function freeMobile(user: string, key: string): SmsProvider {
  return {
    name: 'Free Mobile',
    async send(text) {
      // POST JSON (accepté par l'API) plutôt que GET : la clé n'apparaît pas dans l'URL.
      const res = await fetch('https://smsapi.free-mobile.fr/sendmsg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass: key, msg: text }),
      })
      await res.body?.cancel()
      if (res.status !== 200) {
        // 402 et 500 sont temporaires (relance), 400/403 viennent de la configuration.
        throw new ChannelError(`Free Mobile ${res.status} : ${FREE_ERRORS[res.status] ?? res.statusText}`, 'failed')
      }
      return 'free-mobile'
    },
  }
}

function twilio(sid: string, token: string, from: string, to: string): SmsProvider {
  return {
    name: 'Twilio',
    async send(text) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new ChannelError(`Twilio ${res.status} : ${body.message ?? res.statusText}`, 'failed')
      return `twilio:${body.sid}`
    },
  }
}

export function getSmsProvider(): SmsProvider {
  const env = (k: string) => Deno.env.get(k) ?? ''
  const choice = env('SMS_PROVIDER').toLowerCase()
  if ((choice === 'free' || !choice) && env('FREE_MOBILE_USER') && env('FREE_MOBILE_KEY'))
    return freeMobile(env('FREE_MOBILE_USER'), env('FREE_MOBILE_KEY'))
  if ((choice === 'twilio' || !choice) && env('TWILIO_ACCOUNT_SID'))
    return twilio(env('TWILIO_ACCOUNT_SID'), env('TWILIO_AUTH_TOKEN'), env('TWILIO_FROM'), env('TWILIO_TO'))
  throw new ChannelError('Aucun fournisseur SMS configuré (FREE_MOBILE_USER / FREE_MOBILE_KEY)', 'skipped')
}

/** Les SMS restent courts : titre + détail, sans lien. */
export const sendSms = (text: string) => getSmsProvider().send(text.slice(0, 480))
