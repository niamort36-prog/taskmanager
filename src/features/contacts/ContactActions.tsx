import { Mail, MessageSquare, Phone } from 'lucide-react'
import type { Contact } from '@/types/domain'

/** Garde chiffres et "+" pour les liens tel: / sms:. */
const dialable = (phone: string) => phone.replace(/[^\d+]/g, '')

const btn = 'tap rounded-lg border border-line bg-surface-2 text-accent'

/** Boutons d'action directe : appeler, SMS, email (tel:, sms:, mailto:). */
export function ContactActions({ contact }: { contact: Pick<Contact, 'name' | 'phone' | 'email'> }) {
  const tel = dialable(contact.phone)
  return (
    <div className="flex gap-1">
      {tel && (
        <>
          <a href={`tel:${tel}`} className={btn} aria-label={`Appeler ${contact.name}`}>
            <Phone className="size-5" />
          </a>
          <a href={`sms:${tel}`} className={btn} aria-label={`SMS à ${contact.name}`}>
            <MessageSquare className="size-5" />
          </a>
        </>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`} className={btn} aria-label={`Email à ${contact.name}`}>
          <Mail className="size-5" />
        </a>
      )}
    </div>
  )
}
