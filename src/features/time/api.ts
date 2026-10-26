import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'

export interface TimeEntry {
  id: string
  task_id: string
  started_at: string
  ended_at: string | null
  note: string
}

export interface RunningEntry extends TimeEntry {
  task: { title: string } | null
}

const MAX_HOURS = 24 // limite côté base (une saisie ne dépasse pas 24 h)

export const minutesOf = (e: Pick<TimeEntry, 'started_at' | 'ended_at'>, now = Date.now()) =>
  Math.max(0, Math.round(((e.ended_at ? new Date(e.ended_at).getTime() : now) - new Date(e.started_at).getTime()) / 60000))

/** 95 -> "1 h 35", 40 -> "40 min" */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Chronomètre : "1:05:09" */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const runningKey = ['time-running'] as const
export const timeKey = (taskId: string) => ['time', taskId] as const

export const useTaskTime = (taskId: string) =>
  useQuery({
    queryKey: timeKey(taskId),
    queryFn: async () =>
      unwrap<TimeEntry[]>(
        await supabase.from('time_entries').select('id, task_id, started_at, ended_at, note').eq('task_id', taskId).order('started_at', { ascending: false }),
      ),
  })

/** Chronomètre en cours (au plus un), avec le titre de sa tâche. */
export const useRunningTimer = () =>
  useQuery({
    queryKey: runningKey,
    queryFn: async () =>
      unwrap<RunningEntry | null>(
        await supabase.from('time_entries').select('id, task_id, started_at, ended_at, note, task:tasks(title)').is('ended_at', null).maybeSingle(),
      ),
    staleTime: 60_000,
  })

/** Totaux (minutes) pour un ensemble de tâches : chantier, export. */
export const useTimeTotals = (taskIds: string[], enabled = true) =>
  useQuery({
    queryKey: ['time-totals', ...taskIds],
    enabled: enabled && taskIds.length > 0,
    queryFn: async () => {
      const rows = unwrap<Pick<TimeEntry, 'task_id' | 'started_at' | 'ended_at'>[]>(
        await supabase.from('time_entries').select('task_id, started_at, ended_at').in('task_id', taskIds),
      )
      const totals: Record<string, number> = {}
      for (const r of rows) totals[r.task_id] = (totals[r.task_id] ?? 0) + minutesOf(r)
      return totals
    },
  })

export function useTimeMutations() {
  const qc = useQueryClient()
  const refresh = (taskId?: string) => {
    qc.invalidateQueries({ queryKey: runningKey })
    qc.invalidateQueries({ queryKey: ['time-totals'] })
    if (taskId) qc.invalidateQueries({ queryKey: timeKey(taskId) })
  }

  /** Arrête le chronomètre en cours (durée plafonnée à 24 h). */
  const stopEntry = async (e: Pick<TimeEntry, 'id' | 'started_at'>, endedAt = new Date()) => {
    const max = new Date(new Date(e.started_at).getTime() + MAX_HOURS * 3600_000)
    const ended = endedAt > max ? max : endedAt
    unwrap(await supabase.from('time_entries').update({ ended_at: ended.toISOString() }).eq('id', e.id))
  }

  /** Démarre sur cette tâche ; un chronomètre en cours ailleurs est d'abord arrêté. */
  const start = useMutation({
    mutationFn: async (taskId: string) => {
      const running = qc.getQueryData<RunningEntry | null>(runningKey)
      if (running) await stopEntry(running)
      unwrap(await supabase.from('time_entries').insert({ task_id: taskId }))
      return running?.task_id
    },
    onSettled: (prevTaskId, _e, taskId) => {
      refresh(taskId)
      if (prevTaskId) qc.invalidateQueries({ queryKey: timeKey(prevTaskId) })
    },
  })

  const stop = useMutation({
    mutationFn: async ({ entry, endedAt }: { entry: TimeEntry; endedAt?: Date }) => stopEntry(entry, endedAt),
    onMutate: () => qc.setQueryData(runningKey, null),
    onSettled: (_d, _e, { entry }) => refresh(entry.task_id),
  })

  /** Saisie manuelle : "j'ai passé 2 h dessus aujourd'hui". */
  const addManual = useMutation({
    mutationFn: async ({ taskId, minutes, day, note }: { taskId: string; minutes: number; day: Date; note: string }) => {
      const end = new Date(day)
      const startAt = new Date(end.getTime() - minutes * 60000)
      unwrap(await supabase.from('time_entries').insert({ task_id: taskId, started_at: startAt.toISOString(), ended_at: end.toISOString(), note }))
    },
    onSettled: (_d, _e, { taskId }) => refresh(taskId),
  })

  const remove = useMutation({
    mutationFn: async (e: TimeEntry) => {
      unwrap(await supabase.from('time_entries').delete().eq('id', e.id))
    },
    onMutate: (e) => qc.setQueryData<TimeEntry[]>(timeKey(e.task_id), (l) => l?.filter((x) => x.id !== e.id)),
    onSettled: (_d, _e, e) => refresh(e.task_id),
  })

  return { start, stop, addManual, remove }
}
