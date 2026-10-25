import { useState, type ReactNode } from 'react'
import { EMPTY_CONTACT, type ContactInput } from './api'

interface Props {
  initial?: Partial<ContactInput>
  submitLabel?: string
  busy?: boolean
  error?: string | null
  onSubmit: (input: ContactInput) => void
  onCancel?: () => void
  /** Boutons supplémentaires (ex. "Supprimer"). */
  extra?: ReactNode
}

const field = 'min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3'

/** Formulaire de contact, avec claviers adaptés (tel, email). */
export function ContactForm({ initial, submitLabel = 'Enregistrer', busy, error, onSubmit, onCancel, extra }: Props) {
  const [v, setV] = useState<ContactInput>({ ...EMPTY_CONTACT, ...initial })
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.name.trim()) onSubmit(v)
      }}
    >
      <label className="block space-y-1">
        <span>Nom *</span>
        <input required autoComplete="name" value={v.name} onChange={set('name')} className={field} maxLength={200} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span>Rôle / métier</span>
          <input value={v.role} onChange={set('role')} placeholder="Plombier, architecte…" className={field} />
        </label>
        <label className="block space-y-1">
          <span>Société</span>
          <input autoComplete="organization" value={v.company} onChange={set('company')} className={field} />
        </label>
      </div>
      <label className="block space-y-1">
        <span>Téléphone</span>
        <input type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} className={field} />
      </label>
      <label className="block space-y-1">
        <span>Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={v.email}
          onChange={set('email')}
          className={field}
        />
      </label>
      <label className="block space-y-1">
        <span>Notes</span>
        <textarea value={v.notes} onChange={set('notes')} rows={3} className={`${field} py-2`} />
      </label>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !v.name.trim()}
          className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-semibold text-accent-fg disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4">
            Annuler
          </button>
        )}
        {extra}
      </div>
    </form>
  )
}
