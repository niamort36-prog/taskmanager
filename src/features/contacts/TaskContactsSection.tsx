import { useMemo, useState } from 'react'
import { Plus, Search, UserPlus, X } from 'lucide-react'
import { fold } from '@/features/tasks/filters'
import type { TaskContact } from '@/types/domain'
import { useContacts, useSaveContact, useTaskContactMutations, useTaskContacts } from './api'
import { ContactActions } from './ContactActions'
import { ContactForm } from './ContactForm'

/**
 * Contacts liés à une tâche. L'ajout se fait "en ligne" (pas de fenêtre
 * superposée) : recherche dans le carnet, ou création d'un nouveau contact.
 */
export function TaskContactsSection({ taskId }: { taskId: string }) {
  const { data: linked = [] } = useTaskContacts(taskId)
  const [mode, setMode] = useState<'idle' | 'pick' | 'create'>('idle')

  return (
    <div className="space-y-2">
      {linked.length > 0 && (
        <ul className="space-y-2">
          {linked.map((tc) => (
            <LinkedContact key={tc.contact_id} tc={tc} taskId={taskId} />
          ))}
        </ul>
      )}
      {mode === 'idle' && (
        <button
          type="button"
          onClick={() => setMode('pick')}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
        >
          <UserPlus className="size-5" /> Lier un contact
        </button>
      )}
      {mode === 'pick' && (
        <ContactPicker
          taskId={taskId}
          linkedIds={linked.map((l) => l.contact_id)}
          onClose={() => setMode('idle')}
          onCreate={() => setMode('create')}
        />
      )}
      {mode === 'create' && <CreateAndLink taskId={taskId} onDone={() => setMode('idle')} />}
    </div>
  )
}

function LinkedContact({ tc, taskId }: { tc: TaskContact; taskId: string }) {
  const { unlink, setRole } = useTaskContactMutations(taskId)
  const [role, setRoleText] = useState(tc.role_on_task)
  const c = tc.contact
  return (
    <li className="rounded-lg border border-line bg-surface-2/60 p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 px-1 pt-1">
          <div className="font-medium break-words">{c.name}</div>
          <div className="text-muted break-words">
            {[c.role, c.company].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <ContactActions contact={c} />
        <button
          type="button"
          className="tap shrink-0 text-muted"
          onClick={() => unlink.mutate(c.id)}
          aria-label={`Retirer ${c.name} de la tâche`}
        >
          <X className="size-5" />
        </button>
      </div>
      <input
        value={role}
        onChange={(e) => setRoleText(e.target.value)}
        onBlur={() => role !== tc.role_on_task && setRole.mutate({ contactId: c.id, role })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="Rôle sur cette tâche (ex. devis, maître d’ouvrage)"
        enterKeyHint="done"
        className="mt-1 min-h-11 w-full rounded-md bg-transparent px-1 placeholder:text-muted/70"
        aria-label={`Rôle de ${c.name} sur cette tâche`}
      />
    </li>
  )
}

function ContactPicker({
  taskId,
  linkedIds,
  onClose,
  onCreate,
}: {
  taskId: string
  linkedIds: string[]
  onClose: () => void
  onCreate: () => void
}) {
  const { data: contacts = [], isLoading } = useContacts()
  const { link } = useTaskContactMutations(taskId)
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const f = fold(q.trim())
    return contacts
      .filter((c) => !linkedIds.includes(c.id))
      .filter((c) => !f || fold(`${c.name} ${c.role} ${c.company} ${c.email}`).includes(f))
      .slice(0, 30)
  }, [contacts, linkedIds, q])

  return (
    <div className="space-y-2 rounded-lg border border-accent p-2">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher dans le carnet"
            className="min-h-11 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-10"
          />
        </label>
        <button type="button" className="tap rounded-lg" onClick={onClose} aria-label="Fermer">
          <X className="size-5" />
        </button>
      </div>
      {isLoading && <p className="px-1 text-muted">Chargement…</p>}
      <ul className="max-h-72 overflow-y-auto">
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                link.mutate({ contactId: c.id })
                onClose()
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1 text-left active:bg-surface-2"
            >
              <Plus className="size-5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                {(c.role || c.company) && (
                  <span className="block truncate text-muted">{[c.role, c.company].filter(Boolean).join(' · ')}</span>
                )}
              </span>
            </button>
          </li>
        ))}
        {!isLoading && !results.length && (
          <li className="px-2 py-1 text-muted">{contacts.length ? 'Aucun résultat.' : 'Carnet vide.'}</li>
        )}
      </ul>
      <button
        type="button"
        onClick={onCreate}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-surface-2 font-medium"
      >
        <UserPlus className="size-5" /> Nouveau contact
      </button>
    </div>
  )
}

function CreateAndLink({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const save = useSaveContact()
  const { link } = useTaskContactMutations(taskId)
  return (
    <div className="rounded-lg border border-accent p-3">
      <ContactForm
        submitLabel="Créer et lier"
        busy={save.isPending}
        error={save.error?.message}
        onCancel={onDone}
        onSubmit={async (input) => {
          const c = await save.mutateAsync({ input })
          link.mutate({ contactId: c.id })
          onDone()
        }}
      />
    </div>
  )
}
