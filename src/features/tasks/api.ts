/**
 * Accès aux données des tâches (Supabase + cache TanStack Query).
 * Les mutations sont "optimistes" : l'écran est mis à jour immédiatement,
 * puis resynchronisé avec le serveur.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { mk, type TaskCreateVars, type TaskUpdateVars } from '@/lib/offline'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Task, TaskDetail, TaskListItem, TaskPatch } from '@/types/domain'

type TaskRowWithRelations = Task & {
  subtasks: { id: string; title: string; done: boolean; due_at: string | null }[]
  task_tags: { tag_id: string }[]
}

function toListItem(row: TaskRowWithRelations): TaskListItem {
  const { subtasks, task_tags, ...task } = row
  return {
    ...task,
    subtask_total: subtasks.length,
    subtask_done: subtasks.filter((s) => s.done).length,
    subtask_dues: subtasks
      .filter((s): s is typeof s & { due_at: string } => Boolean(s.due_at))
      .map(({ id, title, done, due_at }) => ({ id, title, done, due_at })),
    tag_ids: task_tags.map((t) => t.tag_id),
  }
}

async function fetchTasks(): Promise<TaskListItem[]> {
  // Usage personnel : on charge toutes les tâches non supprimées et on filtre
  // côté client (rapide, et simple à mettre en cache hors ligne).
  const rows = unwrap<TaskRowWithRelations[]>(
    await supabase
      .from('tasks')
      .select('*, subtasks(id, title, done, due_at), task_tags(tag_id)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )
  return rows.map(toListItem)
}

async function fetchTask(id: string): Promise<TaskDetail | null> {
  const row = unwrap<(Task & { subtasks: TaskDetail['subtasks']; task_tags: { tag_id: string }[] }) | null>(
    await supabase.from('tasks').select('*, subtasks(*), task_tags(tag_id)').eq('id', id).maybeSingle(),
  )
  if (!row) return null
  const { task_tags, subtasks, ...task } = row
  return {
    ...task,
    subtasks: [...subtasks].sort((a, b) => a.position - b.position),
    tag_ids: task_tags.map((t) => t.tag_id),
  }
}

export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: fetchTasks })

export const useTask = (id: string | null) =>
  useQuery({ queryKey: qk.task(id ?? ''), queryFn: () => fetchTask(id!), enabled: Boolean(id) })

/** Applique un patch localement dans la liste et dans le détail. */
export function patchTaskCache(qc: QueryClient, ids: string[], patch: TaskPatch) {
  const set = new Set(ids)
  qc.setQueryData<TaskListItem[]>(qk.tasks, (list) => {
    if (!list) return list
    // Une tâche supprimée (soft delete) disparaît des listes.
    if (patch.deleted_at) return list.filter((t) => !set.has(t.id))
    return list.map((t) => (set.has(t.id) ? { ...t, ...patch } : t))
  })
  for (const id of ids) {
    qc.setQueryData<TaskDetail | null>(qk.task(id), (t) => (t ? { ...t, ...patch } : t))
  }
}

export function useUpdateTasks() {
  const qc = useQueryClient()
  // mutationFn et rafraîchissement : voir lib/offline.ts (rejouable hors ligne).
  return useMutation<void, Error, TaskUpdateVars, { previous?: TaskListItem[] }>({
    mutationKey: mk.taskUpdate,
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks })
      const previous = qc.getQueryData<TaskListItem[]>(qk.tasks)
      patchTaskCache(qc, ids, patch)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous)
    },
  })
}

/** Raccourci pour une seule tâche. */
export function useUpdateTask() {
  const m = useUpdateTasks()
  return {
    ...m,
    update: (id: string, patch: TaskPatch) => m.mutate({ ids: [id], patch }),
  }
}

export type NewTask = Omit<TaskCreateVars, 'id'>

/**
 * Création optimiste : l'identifiant est généré ici, la tâche apparaît tout de
 * suite (y compris hors ligne) et l'envoi est rejoué si besoin.
 * Renvoie l'id de la nouvelle tâche.
 */
export function useCreateTask() {
  const qc = useQueryClient()
  const m = useMutation<void, Error, TaskCreateVars>({
    mutationKey: mk.taskCreate,
    onMutate: (input) => {
      const now = new Date().toISOString()
      const task: Task = {
        user_id: '',
        description: '',
        notes_md: '',
        status: 'todo',
        priority: 2,
        due_at: null,
        due_has_time: false,
        position: 0,
        completed_at: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        ...input,
      }
      qc.setQueryData<TaskListItem[]>(qk.tasks, (list) => [
        { ...task, subtask_total: 0, subtask_done: 0, subtask_dues: [], tag_ids: [] },
        ...(list ?? []),
      ])
      qc.setQueryData<TaskDetail>(qk.task(task.id), { ...task, subtasks: [], tag_ids: [] })
    },
  })
  return {
    ...m,
    create: (input: NewTask): string => {
      const id = crypto.randomUUID()
      m.mutate({ ...input, id })
      return id
    },
  }
}
