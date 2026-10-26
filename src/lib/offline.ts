/**
 * Mode hors ligne :
 * - le cache TanStack Query est enregistré dans IndexedDB (lecture sans réseau) ;
 * - les modifications faites hors ligne sont mises en pause, enregistrées elles
 *   aussi, puis rejouées au retour du réseau, même après fermeture de l'app.
 *
 * Pour qu'une mutation puisse être rejouée après un rechargement, sa fonction
 * doit être connue sans le composant qui l'a lancée : elle est donc déclarée
 * ici via setMutationDefaults, et les hooks n'utilisent que sa clé.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { QueryClient } from '@tanstack/react-query'
import { del, get, set } from 'idb-keyval'
import { supabase, unwrap } from './supabase'
import { qk } from './queryClient'
import type { Subtask, TaskPatch } from '@/types/domain'

/** Clés des mutations rejouables hors ligne. */
export const mk = {
  taskUpdate: ['tasks', 'update'] as const,
  taskCreate: ['tasks', 'create'] as const,
  subtaskAdd: ['subtasks', 'add'] as const,
  subtaskUpdate: ['subtasks', 'update'] as const,
  subtaskRemove: ['subtasks', 'remove'] as const,
  subtaskReorder: ['subtasks', 'reorder'] as const,
  taskTagToggle: ['task-tags', 'toggle'] as const,
}

export interface TaskUpdateVars {
  ids: string[]
  patch: TaskPatch
}
export interface TaskCreateVars {
  id: string
  title: string
  due_at?: string | null
  due_has_time?: boolean
  status?: 'todo' | 'in_progress' | 'blocked' | 'done'
  priority?: 1 | 2 | 3 | 4
}
export interface SubtaskAddVars {
  taskId: string
  rows: Pick<Subtask, 'id' | 'title' | 'due_at' | 'position'>[]
}
export interface SubtaskUpdateVars {
  taskId: string
  id: string
  patch: Partial<Pick<Subtask, 'title' | 'done' | 'due_at' | 'position'>>
}
export interface SubtaskRemoveVars {
  taskId: string
  id: string
}
export interface SubtaskReorderVars {
  taskId: string
  orderedIds: string[]
}
export interface TaskTagToggleVars {
  taskId: string
  tagId: string
  on: boolean
}

/** Rafraîchit ce qui dépend d'une tâche une fois la modification envoyée. */
function refreshTask(qc: QueryClient, taskIds: string[]) {
  qc.invalidateQueries({ queryKey: qk.tasks })
  for (const id of taskIds) {
    qc.invalidateQueries({ queryKey: qk.task(id) })
    qc.invalidateQueries({ queryKey: qk.history(id) })
    qc.invalidateQueries({ queryKey: qk.reminders(id) }) // next_fire_at recalculé côté serveur
  }
}

export function registerMutationDefaults(qc: QueryClient) {
  qc.setMutationDefaults(mk.taskUpdate, {
    mutationFn: async ({ ids, patch }: TaskUpdateVars) => {
      unwrap(await supabase.from('tasks').update(patch).in('id', ids))
    },
    onSettled: (_d, _e, v: TaskUpdateVars) => refreshTask(qc, v.ids),
  })

  qc.setMutationDefaults(mk.taskCreate, {
    // L'identifiant est généré côté client : la tâche existe tout de suite,
    // même hors ligne. upsert : sans doublon si la requête est rejouée.
    mutationFn: async (input: TaskCreateVars) => {
      unwrap(await supabase.from('tasks').upsert(input, { onConflict: 'id', ignoreDuplicates: true }))
    },
    onSettled: (_d, _e, v: TaskCreateVars) => refreshTask(qc, [v.id]),
  })

  qc.setMutationDefaults(mk.subtaskAdd, {
    mutationFn: async ({ taskId, rows }: SubtaskAddVars) => {
      unwrap(
        await supabase
          .from('subtasks')
          .upsert(rows.map((r) => ({ ...r, task_id: taskId })), { onConflict: 'id', ignoreDuplicates: true }),
      )
    },
    onSettled: (_d, _e, v: SubtaskAddVars) => refreshTask(qc, [v.taskId]),
  })

  qc.setMutationDefaults(mk.subtaskUpdate, {
    mutationFn: async ({ id, patch }: SubtaskUpdateVars) => {
      unwrap(await supabase.from('subtasks').update(patch).eq('id', id))
    },
    onSettled: (_d, _e, v: SubtaskUpdateVars) => refreshTask(qc, [v.taskId]),
  })

  qc.setMutationDefaults(mk.subtaskRemove, {
    mutationFn: async ({ id }: SubtaskRemoveVars) => {
      unwrap(await supabase.from('subtasks').delete().eq('id', id))
    },
    onSettled: (_d, _e, v: SubtaskRemoveVars) => refreshTask(qc, [v.taskId]),
  })

  qc.setMutationDefaults(mk.subtaskReorder, {
    mutationFn: async ({ orderedIds }: SubtaskReorderVars) => {
      await Promise.all(
        orderedIds.map(async (id, position) => unwrap(await supabase.from('subtasks').update({ position }).eq('id', id))),
      )
    },
    onSettled: (_d, _e, v: SubtaskReorderVars) => refreshTask(qc, [v.taskId]),
  })

  qc.setMutationDefaults(mk.taskTagToggle, {
    mutationFn: async ({ taskId, tagId, on }: TaskTagToggleVars) => {
      if (on)
        unwrap(
          await supabase
            .from('task_tags')
            .upsert({ task_id: taskId, tag_id: tagId }, { onConflict: 'task_id,tag_id', ignoreDuplicates: true }),
        )
      else unwrap(await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag_id', tagId))
    },
    onSettled: (_d, _e, v: TaskTagToggleVars) => refreshTask(qc, [v.taskId]),
  })
}

/** Stockage du cache dans IndexedDB (plus de place que localStorage). */
export const persister = createAsyncStoragePersister({
  key: 'taskmanager-cache',
  throttleTime: 1000,
  storage: {
    getItem: async (k) => (await get<string>(k)) ?? null,
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
})

/** Durée de conservation du cache hors ligne. */
export const CACHE_MAX_AGE = 7 * 24 * 3600_000
