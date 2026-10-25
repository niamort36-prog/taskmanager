import { useMemo, type ReactNode } from 'react'
import { useTags } from '@/features/tags/api'
import type { Tag, TaskListItem } from '@/types/domain'
import { TaskRow } from './TaskRow'

export function useTagMap(): Map<string, Tag> {
  const { data } = useTags()
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data])
}

export function TaskList({ tasks, empty }: { tasks: TaskListItem[]; empty?: ReactNode }) {
  const tags = useTagMap()
  if (!tasks.length) return empty ? <div className="py-10 text-center text-muted">{empty}</div> : null
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} tags={tags} />
      ))}
    </ul>
  )
}

export function TaskSection({
  title,
  tasks,
  tone = 'default',
}: {
  title: string
  tasks: TaskListItem[]
  tone?: 'default' | 'danger' | 'warning'
}) {
  if (!tasks.length) return null
  const color = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg'
  return (
    <section className="space-y-2">
      <h2 className={`flex items-baseline gap-2 text-lg font-semibold ${color}`}>
        {title} <span className="text-base font-normal text-muted">{tasks.length}</span>
      </h2>
      <TaskList tasks={tasks} />
    </section>
  )
}

export function LoadingList() {
  return (
    <ul className="space-y-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
      ))}
    </ul>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <p className="rounded-xl border border-danger bg-danger/10 p-3 text-danger">
      Erreur de chargement : {error instanceof Error ? error.message : String(error)}
    </p>
  )
}
