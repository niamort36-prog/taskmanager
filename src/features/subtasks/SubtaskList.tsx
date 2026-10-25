import { useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, Check, GripVertical, Plus, Trash2 } from 'lucide-react'
import { fromInputValue, toInputValue } from '@/lib/dates'
import { DueBadge } from '@/features/tasks/DueBadge'
import type { Subtask } from '@/types/domain'
import { useSubtaskMutations } from './api'

/** Sous-tâches : cochables, renommables, réordonnables (poignée), échéance optionnelle. */
export function SubtaskList({ taskId, subtasks }: { taskId: string; subtasks: Subtask[] }) {
  const m = useSubtaskMutations(taskId)
  const [draft, setDraft] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const done = subtasks.filter((s) => s.done).length
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = subtasks.map((s) => s.id)
    m.reorder.mutate(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  const submit = () => {
    const title = draft.trim()
    if (!title) return
    m.add.mutate(title)
    setDraft('')
  }

  return (
    <div className="space-y-3">
      {subtasks.length > 0 && (
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted">
            {done}/{subtasks.length}
          </span>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {subtasks.map((s) => (
              <SubtaskItem key={s.id} subtask={s} m={m} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ajouter une sous-tâche"
          enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3"
        />
        <button type="submit" className="tap rounded-lg bg-accent text-accent-fg" aria-label="Ajouter la sous-tâche">
          <Plus className="size-6" />
        </button>
      </form>
    </div>
  )
}

function SubtaskItem({ subtask: s, m }: { subtask: Subtask; m: ReturnType<typeof useSubtaskMutations> }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
  })
  const [title, setTitle] = useState(s.title)
  const [editDate, setEditDate] = useState(false)

  const saveTitle = () => {
    const t = title.trim()
    if (!t) setTitle(s.title)
    else if (t !== s.title) m.update.mutate({ id: s.id, patch: { title: t } })
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg bg-surface-2/60 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      <div className="flex items-center">
        {/* data-vaul-no-drag : sinon la bottom sheet se déplace avec la sous-tâche */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          data-vaul-no-drag
          className="tap shrink-0 cursor-grab touch-none text-muted"
          aria-label="Déplacer"
        >
          <GripVertical className="size-5" />
        </button>
        <button
          className="tap shrink-0"
          onClick={() => m.update.mutate({ id: s.id, patch: { done: !s.done } })}
          aria-label={s.done ? 'Décocher' : 'Cocher'}
        >
          <span
            className={`flex size-6 items-center justify-center rounded-md border-2 ${
              s.done ? 'border-success bg-success text-bg' : 'border-muted'
            }`}
          >
            {s.done && <Check className="size-4" strokeWidth={3} />}
          </span>
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          enterKeyHint="done"
          className={`min-h-11 min-w-0 flex-1 bg-transparent px-1 ${s.done ? 'text-muted line-through' : ''}`}
          aria-label="Titre de la sous-tâche"
        />
        <button
          className={`tap shrink-0 ${s.due_at ? 'text-accent' : 'text-muted'}`}
          onClick={() => setEditDate((v) => !v)}
          aria-label="Échéance de la sous-tâche"
        >
          <CalendarDays className="size-5" />
        </button>
        <button className="tap shrink-0 text-muted" onClick={() => m.remove.mutate(s.id)} aria-label="Supprimer la sous-tâche">
          <Trash2 className="size-5" />
        </button>
      </div>
      {(editDate || s.due_at) && (
        <div className="flex items-center gap-2 pr-2 pb-2 pl-24">
          {editDate ? (
            <input
              type="date"
              className="min-h-11 rounded-lg border border-line bg-surface px-2"
              value={s.due_at ? toInputValue(s.due_at, false) : ''}
              onChange={(e) =>
                m.update.mutate({ id: s.id, patch: { due_at: fromInputValue(e.target.value, false)?.due_at ?? null } })
              }
              onBlur={() => setEditDate(false)}
              autoFocus
            />
          ) : (
            <DueBadge due_at={s.due_at} hasTime={false} done={s.done} />
          )}
        </div>
      )}
    </li>
  )
}
