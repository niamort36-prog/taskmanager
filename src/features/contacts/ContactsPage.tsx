import { useMemo, useState } from 'react'
import { ChevronLeft, Search, Trash2, UserPlus } from 'lucide-react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { fold } from '@/features/tasks/filters'
import { ErrorBox, LoadingList } from '@/features/tasks/TaskList'
import type { Contact } from '@/types/domain'
import { useContacts, useDeleteContact, useSaveContact } from './api'
import { ContactActions } from './ContactActions'
import { ContactForm } from './ContactForm'

/** Carnet de contacts (accessible depuis Réglages, et la barre latérale sur PC). */
export function ContactsPage() {
  const { data: contacts, isLoading, error } = useContacts()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)

  const list = useMemo(() => {
    const f = fold(q.trim())
    return (contacts ?? []).filter((c) => !f || fold(`${c.name} ${c.role} ${c.company} ${c.email} ${c.phone}`).includes(f))
  }, [contacts, q])

  return (
    <>
      <PageHeader
        title="Contacts"
        actions={
          <>
            <Link to="/settings" className="tap rounded-lg lg:hidden" aria-label="Retour aux réglages">
              <ChevronLeft className="size-6" />
            </Link>
            <button className="tap rounded-lg text-accent" onClick={() => setEditing('new')} aria-label="Nouveau contact">
              <UserPlus className="size-6" />
            </button>
          </>
        }
      >
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un contact"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10"
          />
        </label>
      </PageHeader>

      <div className="mx-auto max-w-2xl p-4">
        {isLoading && <LoadingList />}
        {error && <ErrorBox error={error} />}
        {contacts && !list.length && (
          <p className="py-10 text-center text-muted">{contacts.length ? 'Aucun résultat.' : 'Aucun contact pour l’instant.'}</p>
        )}
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
              <button onClick={() => setEditing(c)} className="min-h-11 min-w-0 flex-1 px-1 text-left">
                <span className="block truncate font-medium">{c.name}</span>
                {(c.role || c.company) && (
                  <span className="block truncate text-muted">{[c.role, c.company].filter(Boolean).join(' · ')}</span>
                )}
              </button>
              <ContactActions contact={c} />
            </li>
          ))}
        </ul>
      </div>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title="Contact">
        {editing !== null && (
          <EditContact contact={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        )}
      </BottomSheet>
    </>
  )
}

function EditContact({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const save = useSaveContact()
  const del = useDeleteContact()
  const toast = useToast()
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-semibold">{contact ? 'Modifier le contact' : 'Nouveau contact'}</h2>
      <ContactForm
        initial={contact}
        busy={save.isPending}
        error={save.error?.message}
        onCancel={onDone}
        onSubmit={async (input) => {
          await save.mutateAsync({ id: contact?.id, input })
          onDone()
        }}
        extra={
          contact && (
            <button
              type="button"
              className="tap rounded-lg border border-danger px-3 text-danger"
              aria-label="Supprimer le contact"
              onClick={async () => {
                if (!window.confirm(`Supprimer ${contact.name} ? Il sera retiré de toutes les tâches.`)) return
                await del.mutateAsync(contact.id)
                toast('Contact supprimé')
                onDone()
              }}
            >
              <Trash2 className="size-5" />
            </button>
          )
        }
      />
    </div>
  )
}
