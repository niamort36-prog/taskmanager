import { useMemo } from 'react'
import { Link } from 'react-router'
import { Sparkles } from 'lucide-react'
import { InstallBanner } from '@/components/ui/InstallBanner'
import { PageHeader } from '@/components/ui/PageHeader'
import { dueBucket, formatDayTitle, nowParis } from '@/lib/dates'
import { useTasks } from './api'
import { sortTasks } from './filters'
import { ErrorBox, LoadingList, TaskSection } from './TaskList'

/** Vue "Aujourd'hui" : en retard, aujourd'hui, 7 prochains jours. */
export function TodayPage() {
  const { data, isLoading, error } = useTasks()

  const groups = useMemo(() => {
    const now = nowParis()
    const open = sortTasks((data ?? []).filter((t) => t.status !== 'done'))
    return {
      overdue: open.filter((t) => dueBucket(t.due_at, now) === 'overdue'),
      today: open.filter((t) => dueBucket(t.due_at, now) === 'today'),
      week: open.filter((t) => dueBucket(t.due_at, now) === 'week'),
    }
  }, [data])

  const empty = !groups.overdue.length && !groups.today.length && !groups.week.length

  return (
    <>
      <PageHeader
        title={formatDayTitle(nowParis())}
        actions={
          <Link
            to="/plan"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent px-3 font-medium text-accent"
          >
            <Sparkles className="size-5" /> Plan IA
          </Link>
        }
      />
      <div className="space-y-6 p-4">
        <InstallBanner />
        {isLoading && <LoadingList />}
        {error && <ErrorBox error={error} />}
        <TaskSection title="En retard" tasks={groups.overdue} tone="danger" />
        <TaskSection title="Aujourd'hui" tasks={groups.today} tone="warning" />
        <TaskSection title="7 prochains jours" tasks={groups.week} />
        {!isLoading && !error && empty && (
          <p className="py-12 text-center text-muted">
            Rien d'urgent cette semaine.
            <br />
            Touchez « + » pour ajouter une tâche.
          </p>
        )}
      </div>
    </>
  )
}
