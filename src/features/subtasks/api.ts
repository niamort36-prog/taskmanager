import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  mk,
  type SubtaskAddVars,
  type SubtaskRemoveVars,
  type SubtaskReorderVars,
  type SubtaskUpdateVars,
} from '@/lib/offline'
import { qk } from '@/lib/queryClient'
import type { Subtask, TaskDetail, TaskListItem } from '@/types/domain'

type SubtaskPatch = SubtaskUpdateVars['patch']

/**
 * Mutations sur les sous-tâches d'une tâche, avec mise à jour optimiste.
 * Les envois sont définis dans lib/offline.ts (rejouables hors ligne).
 */
export function useSubtaskMutations(taskId: string) {
  const qc = useQueryClient()

  const setSubtasks = (fn: (list: Subtask[]) => Subtask[]) => {
    let next: Subtask[] = []
    qc.setQueryData<TaskDetail | null>(qk.task(taskId), (t) => {
      if (!t) return t
      next = fn(t.subtasks)
      return { ...t, subtasks: next }
    })
    // Compteurs de progression de la liste, à jour même hors ligne.
    qc.setQueryData<TaskListItem[]>(qk.tasks, (l) =>
      l?.map((t) =>
        t.id === taskId ? { ...t, subtask_total: next.length, subtask_done: next.filter((s) => s.done).length } : t,
      ),
    )
  }

  const nextPosition = () => {
    const current = qc.getQueryData<TaskDetail | null>(qk.task(taskId))?.subtasks ?? []
    return current.length ? Math.max(...current.map((s) => s.position)) + 1 : 0
  }

  const addRows = useMutation<void, Error, SubtaskAddVars>({
    mutationKey: mk.subtaskAdd,
    onMutate: ({ rows }) => {
      const now = new Date().toISOString()
      setSubtasks((list) => [
        ...list,
        ...rows.map((r) => ({ ...r, task_id: taskId, done: false, done_at: null, created_at: now, updated_at: now })),
      ])
    },
  })

  /** Ajoute une sous-tâche (identifiant généré ici : utilisable hors ligne). */
  const add = {
    mutate: (title: string) =>
      addRows.mutate({ taskId, rows: [{ id: crypto.randomUUID(), title, due_at: null, position: nextPosition() }] }),
  }

  /** Ajout groupé (suggestions de l'assistant), positions consécutives. */
  const addMany = {
    isPending: addRows.isPending,
    mutateAsync: async (items: { title: string; due_at?: string | null }[]) => {
      const start = nextPosition()
      const rows = items.map((it, i) => ({ id: crypto.randomUUID(), title: it.title, due_at: it.due_at ?? null, position: start + i }))
      // Hors ligne, l'envoi est mis en attente : on ne bloque pas l'interface.
      addRows.mutate({ taskId, rows })
    },
  }

  const updateM = useMutation<void, Error, SubtaskUpdateVars>({
    mutationKey: mk.subtaskUpdate,
    onMutate: ({ id, patch }) => setSubtasks((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))),
  })
  const update = { mutate: ({ id, patch }: { id: string; patch: SubtaskPatch }) => updateM.mutate({ taskId, id, patch }) }

  const removeM = useMutation<void, Error, SubtaskRemoveVars>({
    mutationKey: mk.subtaskRemove,
    onMutate: ({ id }) => setSubtasks((list) => list.filter((s) => s.id !== id)),
  })
  const remove = { mutate: (id: string) => removeM.mutate({ taskId, id }) }

  const reorderM = useMutation<void, Error, SubtaskReorderVars>({
    mutationKey: mk.subtaskReorder,
    onMutate: ({ orderedIds }) =>
      setSubtasks((list) => {
        const byId = new Map(list.map((s) => [s.id, s]))
        return orderedIds.map((id, position) => ({ ...byId.get(id)!, position }))
      }),
  })
  const reorder = { mutate: (orderedIds: string[]) => reorderM.mutate({ taskId, orderedIds }) }

  return { add, addMany, update, remove, reorder }
}
