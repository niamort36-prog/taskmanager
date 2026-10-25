// Envoi d'emails via un fournisseur interchangeable (Resend ou Brevo).
// Choix : secret EMAIL_PROVIDER, sinon le premier fournisseur configuré.
import { ChannelError } from './errors.ts'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

interface EmailProvider {
  name: string
  send(m: EmailMessage): Promise<string>
}

/** "Mes tâches <moi@exemple.fr>" -> { name, email } */
function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { name: m[1] || 'Mes tâches', email: m[2] } : { name: 'Mes tâches', email: from.trim() }
}

/** Échec fournisseur : journalisé "failed" (relancé jusqu'à 3 fois pour un rappel). */
const httpError = (provider: string, status: number, detail: string) =>
  new ChannelError(`${provider} ${status} : ${detail}`.slice(0, 400), 'failed')

function resend(apiKey: string): EmailProvider {
  // Sans domaine vérifié, Resend n'accepte que onboarding@resend.dev et
  // n'envoie qu'à l'adresse du compte Resend (suffisant pour soi-même).
  const from = Deno.env.get('EMAIL_FROM') ?? 'Mes tâches <onboarding@resend.dev>'
  return {
    name: 'Resend',
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw httpError('Resend', res.status, body.message ?? res.statusText)
      return `resend:${body.id}`
    },
  }
}

function brevo(apiKey: string): EmailProvider {
  const from = parseFrom(Deno.env.get('EMAIL_FROM') ?? '')
  return {
    name: 'Brevo',
    async send(m) {
      if (!from.email) throw new ChannelError('EMAIL_FROM manquant (expéditeur validé chez Brevo)', 'skipped')
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: from,
          to: [{ email: m.to }],
          subject: m.subject,
          htmlContent: m.html,
          textContent: m.text,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw httpError('Brevo', res.status, body.message ?? res.statusText)
      return `brevo:${body.messageId}`
    },
  }
}

export function getEmailProvider(): EmailProvider {
  const choice = (Deno.env.get('EMAIL_PROVIDER') ?? '').toLowerCase()
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if ((choice === 'resend' || !choice) && resendKey) return resend(resendKey)
  if ((choice === 'brevo' || !choice) && brevoKey) return brevo(brevoKey)
  throw new ChannelError('Aucun fournisseur email configuré (RESEND_API_KEY ou BREVO_API_KEY)', 'skipped')
}

export const sendEmail = (m: EmailMessage) => getEmailProvider().send(m)
