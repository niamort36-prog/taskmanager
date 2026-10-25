import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Reminder } from '@/types/domain'

export type ReminderInput = Pick<
  Reminder,
  'subtask_id' | 'mode' | 'remind_at' | 'offset_minutes' | 'recurrence' | 'channels' | 'ignore_dnd'
>

export const useReminders = (taskId: string) =>
  useQuery({
    queryKey: qk.reminders(taskId),
    queryFn: async () =>
      unwrap<Reminder[]>(await supabase.from('reminders').select('*').eq('task_id', taskId).order('created_at')),
  })

export function useReminderMutations(taskId: string) {
  const qc = useQueryClient()
  const key = qk.reminders(taskId)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.history(taskId) })
  }

  // next_fire_at est calculé par la base (trigger) : on relit la ligne insérée.
  const create = useMutation({
    mutationFn: async (input: ReminderInput) =>
      unwrap<Reminder>(await supabase.from('reminders').insert({ ...input, task_id: taskId }).select().single()),
    onSuccess: (r) => qc.setQueryData<Reminder[]>(key, (l) => [...(l ?? []), r]),
    onSettled: refresh,
  })

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      unwrap<Reminder>(await supabase.from('reminders').update({ active }).eq('id', id).select().single()),
    onMutate: ({ id, active }) => qc.setQueryData<Reminder[]>(key, (l) => l?.map((r) => (r.id === id ? { ...r, active } : r))),
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('reminders').delete().eq('id', id))
    },
    onMutate: (id) => qc.setQueryData<Reminder[]>(key, (l) => l?.filter((r) => r.id !== id)),
    onSettled: refresh,
  })

  return { create, setActive, remove }
}
