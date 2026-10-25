import { useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, CornerDownRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useTasks } from '@/features/tasks/api'
import { sortTasks } from '@/features/tasks/filters'
import { ErrorBox, LoadingList, TaskList } from '@/features/tasks/TaskList'
import { useTaskUi } from '@/features/tasks/TaskUiContext'
import { dateFromKey, dayKey, dueState, formatDayTitle, formatMonthTitle, inTz, nowParis } from '@/lib/dates'
import type { TaskListItem } from '@/types/domain'

type Mode = 'month' | 'agenda'

interface SubtaskDue {
  id: string
  title: string
  done: boolean
  due_at: string
  task: TaskListItem
}

interface DayItems {
  tasks: TaskListItem[]
  subtasks: SubtaskDue[]
}

/** Regroupe tâches et sous-tâches par jour d'échéance (clé yyyy-MM-dd, heure de Paris). */
function useByDay(tasks: TaskListItem[] | undefined) {
  return useMemo(() => {
    const map = new Map<string, DayItems>()
    const get = (k: string) => {
      let v = map.get(k)
      if (!v) map.set(k, (v = { tasks: [], subtasks: [] }))
      return v
    }
    for (const t of tasks ?? []) {
      if (t.due_at) get(dayKey(t.due_at)).tasks.push(t)
      for (const s of t.subtask_dues) get(dayKey(s.due_at)).subtasks.push({ ...s, task: t })
    }
    for (const v of map.values()) v.tasks = sortTasks(v.tasks)
    return map
  }, [tasks])
}

export function CalendarPage() {
  const { data, isLoading, error } = useTasks()
  const [mode, setMode] = useState<Mode>('month')
  const byDay = useByDay(data)

  return (
    <>
      <PageHeader title="Calendrier">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
          {(['month', 'agenda'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-11 rounded-lg ${mode === m ? 'bg-accent font-semibold text-accent-fg' : ''}`}
            >
              {m === 'month' ? 'Mois' : 'Agenda'}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="p-4">
        {isLoading && <LoadingList />}
        {error && <ErrorBox error={error} />}
        {data && (mode === 'month' ? <MonthView byDay={byDay} /> : <AgendaView byDay={byDay} />)}
      </div>
    </>
  )
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function MonthView({ byDay }: { byDay: Map<string, DayItems> }) {
  const today = nowParis()
  const [month, setMonth] = useState(() => startOfMonth(today, { in: inTz }))
  const [selected, setSelected] = useState(() => dayKey(today))

  const days = eachDayOfInterval(
    {
      start: startOfWeek(month, { in: inTz, weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month, { in: inTz }), { in: inTz, weekStartsOn: 1 }),
    },
    { in: inTz },
  )
  const todayKey = dayKey(today)
  const items = byDay.get(selected)

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-6 lg:space-y-0">
      <div>
        <div className="mb-2 flex items-center">
          <button className="tap rounded-lg" onClick={() => setMonth((m) => addMonths(m, -1, { in: inTz }))} aria-label="Mois précédent">
            <ChevronLeft className="size-6" />
          </button>
          <h2 className="flex-1 text-center text-lg font-semibold first-letter:uppercase">{formatMonthTitle(month)}</h2>
          <button className="tap rounded-lg" onClick={() => setMonth((m) => addMonths(m, 1, { in: inTz }))} aria-label="Mois suivant">
            <ChevronRight className="size-6" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-muted" aria-hidden>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const k = dayKey(d)
            const it = byDay.get(k)
            const open = (it?.tasks.filter((t) => t.status !== 'done').length ?? 0) + (it?.subtasks.filter((s) => !s.done).length ?? 0)
            const late = it?.tasks.some((t) => t.status !== 'done' && dueState(t.due_at) === 'overdue')
            const inMonth = isSameMonth(d, month, { in: inTz })
            return (
              <button
                key={k}
                onClick={() => setSelected(k)}
                aria-pressed={selected === k}
                aria-label={`${formatDayTitle(d)}${open ? `, ${open} échéance${open > 1 ? 's' : ''}` : ''}`}
                className={`flex min-h-12 flex-col items-center justify-center rounded-lg ${
                  selected === k ? 'bg-accent text-accent-fg' : k === todayKey ? 'border border-accent' : ''
                } ${inMonth ? '' : 'opacity-40'}`}
              >
                <span className={k === todayKey && selected !== k ? 'font-bold text-accent' : ''}>{d.getDate()}</span>
                <span className="flex h-2 gap-0.5">
                  {open > 0 && (
                    <span className={`size-1.5 rounded-full ${selected === k ? 'bg-accent-fg' : late ? 'bg-danger' : 'bg-accent'}`} />
                  )}
                  {open > 1 && <span className={`size-1.5 rounded-full ${selected === k ? 'bg-accent-fg' : 'bg-accent'}`} />}
                  {open > 2 && <span className={`size-1.5 rounded-full ${selected === k ? 'bg-accent-fg' : 'bg-accent'}`} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold first-letter:uppercase">{formatDayTitle(dateFromKey(selected))}</h2>
        <DayContent items={items} />
      </div>
    </div>
  )
}

function DayContent({ items }: { items: DayItems | undefined }) {
  const ui = useTaskUi()
  if (!items || (!items.tasks.length && !items.subtasks.length)) return <p className="text-muted">Aucune échéance.</p>
  return (
    <div className="space-y-2">
      <TaskList tasks={items.tasks} />
      {items.subtasks.length > 0 && (
        <ul className="space-y-1">
          {items.subtasks.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => ui.openTask(s.task.id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left"
              >
                <CornerDownRight className="size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className={s.done ? 'text-muted line-through' : ''}>{s.title}</span>
                  <span className="block truncate text-muted">{s.task.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Agenda : en retard, puis les 60 prochains jours ayant au moins une échéance. */
function AgendaView({ byDay }: { byDay: Map<string, DayItems> }) {
  const todayKey = dayKey(nowParis())
  const limit = dayKey(addMonths(nowParis(), 2, { in: inTz }))
  const keys = [...byDay.keys()].filter((k) => k >= todayKey && k <= limit).sort()
  const overdue = [...byDay.entries()]
    .filter(([k]) => k < todayKey)
    .flatMap(([, v]) => v.tasks.filter((t) => t.status !== 'done'))

  if (!keys.length && !overdue.length) return <p className="py-10 text-center text-muted">Aucune échéance à venir.</p>

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-danger">En retard</h2>
          <TaskList tasks={sortTasks(overdue)} />
        </section>
      )}
      {keys.map((k) => (
        <section key={k} className="space-y-2">
          <h2 className={`text-lg font-semibold first-letter:uppercase ${k === todayKey ? 'text-warning' : ''}`}>
            {formatDayTitle(dateFromKey(k))}
          </h2>
          <DayContent items={byDay.get(k)} />
        </section>
      ))}
    </div>
  )
}
