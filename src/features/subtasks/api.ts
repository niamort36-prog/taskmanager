import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Subtask, TaskDetail } from '@/types/domain'

type SubtaskPatch = Partial<Pick<Subtask, 'title' | 'done' | 'due_at' | 'position'>>

/** Mutations sur les sous-tâches d'une tâche donnée, avec mise à jour optimiste. */
export function useSubtaskMutations(taskId: string) {
  const qc = useQueryClient()

  const setSubtasks = (fn: (list: Subtask[]) => Subtask[]) =>
    qc.setQueryData<TaskDetail | null>(qk.task(taskId), (t) => (t ? { ...t, subtasks: fn(t.subtasks) } : t))

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.task(taskId) })
    qc.invalidateQueries({ queryKey: qk.tasks }) // compteurs de progression
    qc.invalidateQueries({ queryKey: qk.history(taskId) })
    qc.invalidateQueries({ queryKey: qk.reminders(taskId) })
  }

  const add = useMutation({
    mutationFn: async (title: string) => {
      const current = qc.getQueryData<TaskDetail | null>(qk.task(taskId))?.subtasks ?? []
      const position = current.length ? Math.max(...current.map((s) => s.position)) + 1 : 0
      return unwrap<Subtask>(
        await supabase.from('subtasks').insert({ task_id: taskId, title, position }).select().single(),
      )
    },
    onSuccess: (s) => setSubtasks((list) => [...list, s]),
    onSettled: refresh,
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SubtaskPatch }) => {
      unwrap(await supabase.from('subtasks').update(patch).eq('id', id))
    },
    onMutate: ({ id, patch }) => setSubtasks((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('subtasks').delete().eq('id', id))
    },
    onMutate: (id) => setSubtasks((list) => list.filter((s) => s.id !== id)),
    onSettled: refresh,
  })

  /** Réordonne : on renumérote toutes les positions (listes courtes). */
  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map(async (id, position) =>
          unwrap(await supabase.from('subtasks').update({ position }).eq('id', id)),
        ),
      )
    },
    onMutate: (orderedIds) =>
      setSubtasks((list) => {
        const byId = new Map(list.map((s) => [s.id, s]))
        return orderedIds.map((id, position) => ({ ...byId.get(id)!, position }))
      }),
    onSettled: refresh,
  })

  return { add, update, remove, reorder }
}
