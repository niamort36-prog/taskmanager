import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, History, Trash2, X } from 'lucide-react'
import { DueField } from '@/components/ui/DueField'
import { AttachmentsSection } from '@/features/attachments/AttachmentsSection'
import { TaskContactsSection } from '@/features/contacts/TaskContactsSection'
import { HistoryList } from '@/features/history/HistoryList'
import { LinksSection } from '@/features/links/LinksSection'
import { RemindersSection } from '@/features/reminders/RemindersSection'
import { SubtaskList } from '@/features/subtasks/SubtaskList'
import { TagPicker } from '@/features/tags/TagPicker'
import { formatDateTime } from '@/lib/dates'
import type { TaskDetail as TaskDetailData } from '@/types/domain'
import { useTask, useUpdateTask } from './api'
import { PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from './meta'
import { NotesField } from './NotesField'
import { useTaskActions } from './useTaskActions'

/** Contenu du détail d'une tâche (utilisé en bottom sheet sur mobile, en panneau sur PC). */
export function TaskDetail({ taskId, onClose, variant }: { taskId: string; onClose: () => void; variant: 'sheet' | 'panel' }) {
  const { data: task, isLoading, error } = useTask(taskId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-2">
        <button className="tap rounded-lg" onClick={onClose} aria-label="Fermer">
          {variant === 'sheet' ? <ChevronDown className="size-7" /> : <X className="size-6" />}
        </button>
        <span className="flex-1" />
        {task && <DeleteButton task={task} onDone={onClose} />}
      </div>
      {isLoading && <p className="p-4 text-muted">Chargement…</p>}
      {error && <p className="p-4 text-danger">{String(error)}</p>}
      {!isLoading && !task && !error && <p className="p-4 text-muted">Cette tâche n’existe plus.</p>}
      {task && <TaskForm key={task.id} task={task} />}
    </div>
  )
}

function DeleteButton({ task, onDone }: { task: TaskDetailData; onDone: () => void }) {
  const { remove } = useTaskActions()
  return (
    <button
      className="tap rounded-lg text-danger"
      aria-label="Supprimer la tâche"
      onClick={() => {
        remove([task.id])
        onDone()
      }}
    >
      <Trash2 className="size-6" />
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-muted">{title}</h3>
      {children}
    </section>
  )
}

/** Textarea qui grandit avec son contenu et enregistre à la perte du focus. */
function AutoTextarea({
  value,
  onSave,
  placeholder,
  className = '',
  singleLine,
  label,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
  singleLine?: boolean
  label: string
}) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setV(value), [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    // Recalcule si la largeur change (rotation, ouverture du panneau…).
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [v])
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={v}
      rows={1}
      placeholder={placeholder}
      enterKeyHint={singleLine ? 'done' : 'enter'}
      onChange={(e) => setV(singleLine ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={() => v !== value && onSave(v)}
      className={`w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-2 hover:border-line focus:border-accent focus:outline-none ${className}`}
    />
  )
}

function TaskForm({ task }: { task: TaskDetailData }) {
  const { update } = useUpdateTask()
  const save = (patch: Parameters<typeof update>[1]) => update(task.id, patch)

  return (
    <div className="space-y-6 px-4 pt-1 pb-10">
      <AutoTextarea
        label="Titre"
        singleLine
        value={task.title}
        onSave={(title) => title.trim() && save({ title: title.trim() })}
        className="-mx-2 text-2xl font-bold"
      />

      <Section title="Statut">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              aria-pressed={task.status === s}
              onClick={() => save({ status: s })}
              className={`min-h-11 rounded-lg border ${
                task.status === s ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Priorité">
        <div className="grid grid-cols-4 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              aria-pressed={task.priority === p}
              onClick={() => save({ priority: p })}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-1 ${
                task.priority === p ? 'border-accent bg-accent/15 font-semibold' : 'border-line bg-surface-2'
              }`}
            >
              <span className={`size-2.5 shrink-0 rounded-full ${PRIORITY_DOT[p]}`} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Échéance">
        <DueField value={{ due_at: task.due_at, due_has_time: task.due_has_time }} onChange={(d) => save(d)} />
      </Section>

      <Section title="Rappels">
        <RemindersSection taskId={task.id} taskDue={task.due_at} subtasks={task.subtasks} />
      </Section>

      <Section title="Étiquettes">
        <TagPicker taskId={task.id} tagIds={task.tag_ids} />
      </Section>

      <Section title="Description">
        <AutoTextarea
          label="Description"
          value={task.description}
          onSave={(description) => save({ description })}
          placeholder="Ajouter une description…"
          className="-mx-2 min-h-11"
        />
      </Section>

      <Section title="Sous-tâches">
        <SubtaskList taskId={task.id} subtasks={task.subtasks} />
      </Section>

      <Section title="Contacts">
        <TaskContactsSection taskId={task.id} />
      </Section>

      <Section title="Liens">
        <LinksSection taskId={task.id} />
      </Section>

      <Section title="Dossiers et fichiers">
        <AttachmentsSection taskId={task.id} />
      </Section>

      <Section title="Notes">
        <NotesField value={task.notes_md} onSave={(notes_md) => save({ notes_md })} />
      </Section>

      <details className="group rounded-lg border border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-semibold text-muted">
          <History className="size-5" /> Historique
        </summary>
        <div className="px-3 pb-3">
          <HistoryList taskId={task.id} />
        </div>
      </details>

      <p className="text-sm text-muted">
        Créée le {formatDateTime(task.created_at)}
        {task.completed_at && <> · terminée le {formatDateTime(task.completed_at)}</>}
      </p>
    </div>
  )
}
