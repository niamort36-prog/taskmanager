import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useIsDesktop } from '@/lib/useMediaQuery'
import type { TaskListItem, TaskStatus } from '@/types/domain'
import { DueBadge } from './DueBadge'
import { PRIORITY_DOT, STATUS_LABEL, STATUS_ORDER } from './meta'
import { TaskList } from './TaskList'
import { useTaskUi } from './TaskUiContext'
import { useTaskActions } from './useTaskActions'

/**
 * Kanban par statut.
 * - Mobile : un onglet par statut (pas de défilement horizontal).
 * - Bureau : 4 colonnes, glisser-déposer une carte pour changer son statut.
 */
export function KanbanBoard({ tasks }: { tasks: TaskListItem[] }) {
  const desktop = useIsDesktop()
  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s)
  return desktop ? <DesktopBoard byStatus={byStatus} /> : <MobileBoard byStatus={byStatus} />
}

type ByStatus = (s: TaskStatus) => TaskListItem[]

function MobileBoard({ byStatus }: { byStatus: ByStatus }) {
  const [current, setCurrent] = useState<TaskStatus>('todo')
  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={current === s}
            onClick={() => setCurrent(s)}
            className={`min-h-11 rounded-lg px-1 leading-tight ${current === s ? 'bg-accent font-semibold text-accent-fg' : ''}`}
          >
            {STATUS_LABEL[s]}
            <span className="block text-sm opacity-80">{byStatus(s).length}</span>
          </button>
        ))}
      </div>
      <TaskList tasks={byStatus(current)} empty="Aucune tâche dans cette colonne." />
    </div>
  )
}

function DesktopBoard({ byStatus }: { byStatus: ByStatus }) {
  const { apply } = useTaskActions()
  // distance : un simple clic ouvre la carte, un déplacement de 6 px commence le glisser.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragEnd = (e: DragEndEvent) => {
    const status = e.over?.id as TaskStatus | undefined
    const task = e.active.data.current as TaskListItem | undefined
    if (status && task && task.status !== status) apply([task.id], { status })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-4 gap-3">
        {STATUS_ORDER.map((s) => (
          <Column key={s} status={s} tasks={byStatus(s)} />
        ))}
      </div>
    </DndContext>
  )
}

function Column({ status, tasks }: { status: TaskStatus; tasks: TaskListItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      className={`min-h-64 rounded-xl border p-2 ${isOver ? 'border-accent bg-accent/10' : 'border-line bg-surface/50'}`}
    >
      <h2 className="mb-2 flex items-baseline justify-between px-1 font-semibold">
        {STATUS_LABEL[status]} <span className="font-normal text-muted">{tasks.length}</span>
      </h2>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <Card key={t.id} task={t} />
        ))}
      </ul>
    </section>
  )
}

function Card({ task }: { task: TaskListItem }) {
  const ui = useTaskUi()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: task })
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => ui.openTask(task.id)}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`cursor-grab rounded-lg border border-line bg-surface p-3 ${isDragging ? 'z-10 shadow-xl' : ''} ${
        ui.openTaskId === task.id ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-2 size-2.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
        <span className={task.status === 'done' ? 'text-muted line-through' : ''}>{task.title}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-muted">
        <DueBadge due_at={task.due_at} hasTime={task.due_has_time} done={task.status === 'done'} />
        {task.subtask_total > 0 && (
          <span>
            {task.subtask_done}/{task.subtask_total}
          </span>
        )}
      </div>
    </li>
  )
}
