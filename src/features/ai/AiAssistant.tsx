import { useState } from 'react'
import { Check, Copy, Loader2, Mail, Plus, Sparkles, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useTaskContacts } from '@/features/contacts/api'
import { useSubtaskMutations } from '@/features/subtasks/api'
import { addDays } from 'date-fns'
import { allDayDue, inTz, nowParis } from '@/lib/dates'
import { useAiQuota, useInvokeAi, type EmailDraft, type EmailKind, type StepSuggestion, type Tone } from './api'

type Mode = 'draft' | 'reply' | 'next' | 'breakdown'

const MODES: { id: Mode; label: string }[] = [
  { id: 'draft', label: 'Rédiger un mail' },
  { id: 'reply', label: 'Répondre à un mail' },
  { id: 'next', label: 'Prochaines étapes' },
  { id: 'breakdown', label: 'Découper la tâche' },
]

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 ${on ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'}`

const field = 'w-full rounded-lg border border-line bg-surface-2 px-3'

/** Assistant IA (Gemini via l'Edge Function "ai") dans le détail d'une tâche. */
export function AiAssistant({ taskId }: { taskId: string }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const { data: quota } = useAiQuota()

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(mode === m.id ? null : m.id)}
            className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 text-left ${
              mode === m.id ? 'border-accent bg-accent/15 font-semibold' : 'border-line bg-surface-2'
            }`}
          >
            <Sparkles className="size-5 shrink-0 text-accent" />
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'draft' && <EmailPanel taskId={taskId} reply={false} />}
      {mode === 'reply' && <EmailPanel taskId={taskId} reply />}
      {(mode === 'next' || mode === 'breakdown') && <StepsPanel key={mode} taskId={taskId} mode={mode} />}
      {quota && (
        <p className="text-sm text-muted">
          {quota.used}/{quota.daily_limit} demandes aujourd’hui · les numéros et emails des contacts ne sont jamais envoyés à l’IA
        </p>
      )}
    </div>
  )
}

function EmailPanel({ taskId, reply }: { taskId: string; reply: boolean }) {
  const invoke = useInvokeAi()
  const toast = useToast()
  const { data: contacts = [] } = useTaskContacts(taskId)
  const [contactId, setContactId] = useState<string>('')
  const [kind, setKind] = useState<EmailKind>('relance')
  const [tone, setTone] = useState<Tone>('neutre')
  const [received, setReceived] = useState('')
  const [instructions, setInstructions] = useState('')
  const [draft, setDraft] = useState<EmailDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contact = contacts.find((c) => c.contact_id === contactId)?.contact

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      setDraft(
        await invoke<EmailDraft>({
          action: reply ? 'reply_email' : 'draft_email',
          task_id: taskId,
          contact_id: contactId || null,
          kind,
          tone,
          instructions,
          received: reply ? received : undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(`${draft.body}`)
      toast('Texte copié')
    } catch {
      toast('Copie impossible : sélectionnez le texte à la main')
    }
  }

  const mailto = draft
    ? `mailto:${encodeURIComponent(contact?.email ?? '')}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : ''

  return (
    <div className="space-y-3 rounded-lg border border-accent p-3">
      {reply && (
        <label className="block space-y-1">
          <span className="font-medium">Mail reçu</span>
          <textarea
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            rows={6}
            placeholder="Collez ici le mail auquel répondre"
            className={`${field} py-2`}
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="font-medium">Destinataire</span>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={`${field} min-h-11`}>
          <option value="">{contacts.length ? 'Non précisé' : 'Aucun contact lié à la tâche'}</option>
          {contacts.map((c) => (
            <option key={c.contact_id} value={c.contact_id}>
              {c.contact.name}
              {c.role_on_task || c.contact.role ? ` — ${c.role_on_task || c.contact.role}` : ''}
            </option>
          ))}
        </select>
      </label>

      {!reply && (
        <fieldset>
          <legend className="mb-2 font-medium">Type de mail</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['relance', 'Relance'],
                ['demande_info', 'Demande d’info'],
                ['reponse', 'Point / réponse'],
                ['libre', 'Libre'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={chip(kind === v)} onClick={() => setKind(v)}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 font-medium">Ton</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['formel', 'Formel'],
              ['neutre', 'Neutre'],
              ['direct', 'Direct'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className={chip(tone === v)} onClick={() => setTone(v)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Précisions (facultatif) : ex. demander une date d’intervention"
        className={`${field} min-h-11`}
      />

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || (reply && !received.trim())}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        {draft ? 'Régénérer' : 'Générer'}
      </button>
      {error && <p className="text-danger">{error}</p>}

      {draft && (
        <div className="space-y-2">
          <input
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            className={`${field} min-h-11 font-semibold`}
            aria-label="Objet"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={12}
            className={`${field} py-2`}
            aria-label="Corps du mail"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-4">
              <Copy className="size-5" /> Copier
            </button>
            <a href={mailto} className="flex min-h-11 items-center gap-2 rounded-lg border border-accent px-4 text-accent">
              <Mail className="size-5" /> Ouvrir dans la messagerie
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function StepsPanel({ taskId, mode }: { taskId: string; mode: 'next' | 'breakdown' }) {
  const invoke = useInvokeAi()
  const toast = useToast()
  const { addMany } = useSubtaskMutations(taskId)
  const [steps, setSteps] = useState<(StepSuggestion & { added?: boolean })[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await invoke<{ steps: StepSuggestion[] }>({ action: mode === 'next' ? 'next_steps' : 'breakdown', task_id: taskId })
      setSteps(res.steps)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dueOf = (s: StepSuggestion) =>
    s.due_in_days == null ? null : allDayDue(addDays(nowParis(), s.due_in_days, { in: inTz })).due_at

  const add = async (list: StepSuggestion[]) => {
    const pending = list.filter((s) => !(s as { added?: boolean }).added)
    if (!pending.length) return
    await addMany.mutateAsync(pending.map((s) => ({ title: s.title, due_at: dueOf(s) })))
    const titles = new Set(pending.map((s) => s.title))
    setSteps((cur) => cur?.map((s) => (titles.has(s.title) ? { ...s, added: true } : s)) ?? null)
    toast(pending.length > 1 ? `${pending.length} sous-tâches ajoutées` : 'Sous-tâche ajoutée')
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent p-3">
      <p className="text-muted">
        {mode === 'next'
          ? 'L’IA propose les prochaines actions à partir de la tâche et de ses sous-tâches.'
          : 'L’IA découpe la tâche en sous-tâches concrètes, à cocher une à une.'}
      </p>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        {steps ? 'Nouvelles suggestions' : 'Suggérer'}
      </button>
      {error && <p className="text-danger">{error}</p>}

      {steps && (
        <>
          <ul className="space-y-1">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-1 rounded-lg bg-surface-2/60">
                <span className="min-w-0 flex-1 px-3 py-2 break-words">
                  {s.title}
                  {s.due_in_days != null && (
                    <span className="block text-muted">{s.due_in_days === 0 ? 'aujourd’hui' : `dans ${s.due_in_days} j`}</span>
                  )}
                </span>
                {s.added ? (
                  <span className="tap shrink-0 text-success" aria-label="Ajoutée">
                    <Check className="size-5" />
                  </span>
                ) : (
                  <>
                    <button type="button" className="tap shrink-0 text-accent" onClick={() => void add([s])} aria-label={`Ajouter « ${s.title} »`}>
                      <Plus className="size-6" />
                    </button>
                    <button
                      type="button"
                      className="tap shrink-0 text-muted"
                      onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                      aria-label="Écarter la suggestion"
                    >
                      <X className="size-5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {steps.some((s) => !s.added) && (
            <button
              type="button"
              onClick={() => void add(steps)}
              disabled={addMany.isPending}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent text-accent"
            >
              <Plus className="size-5" /> Tout ajouter aux sous-tâches
            </button>
          )}
        </>
      )}
    </div>
  )
}
