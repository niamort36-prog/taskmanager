/**
 * Archives (tâches terminées depuis plus de 30 jours, retirées de la liste
 * principale pour l'alléger) et corbeille (tâches supprimées).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryClient'
import { supabase, unwrap } from '@/lib/supabase'
import type { Task } from '@/types/domain'

export const ARCHIVE_AFTER_DAYS = 30
export const archiveCutoff = () => new Date(Date.now() - ARCHIVE_AFTER_DAYS * 864e5).toISOString()

const archiveKey = ['tasks-archive'] as const
const trashKey = ['tasks-trash'] as const

export const useArchive = () =>
  useQuery({
    queryKey: archiveKey,
    queryFn: async () =>
      unwrap<Task[]>(
        await supabase
          .from('tasks')
          .select('*')
          .is('deleted_at', null)
          .eq('status', 'done')
          .lt('completed_at', archiveCutoff())
          .order('completed_at', { ascending: false })
          .limit(500),
      ),
  })

export const useTrash = () =>
  useQuery({
    queryKey: trashKey,
    queryFn: async () =>
      unwrap<Task[]>(
        await supabase.from('tasks').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(500),
      ),
  })

/** Supprime définitivement des tâches, fichiers Storage compris. */
async function purge(ids: string[]) {
  if (!ids.length) return
  const files = unwrap<{ storage_path: string | null }[]>(
    await supabase.from('attachments').select('storage_path').in('task_id', ids).eq('kind', 'file'),
  )
  const paths = files.map((f) => f.storage_path).filter((p): p is string => Boolean(p))
  if (paths.length) {
    const { error } = await supabase.storage.from('attachments').remove(paths)
    if (error) throw new Error(error.message)
  }
  unwrap(await supabase.from('tasks').delete().in('id', ids))
}

export function useArchiveActions() {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: archiveKey })
    qc.invalidateQueries({ queryKey: trashKey })
    qc.invalidateQueries({ queryKey: qk.tasks })
  }

  /** Corbeille -> liste. */
  const restore = useMutation({
    mutationFn: async (ids: string[]) => {
      unwrap(await supabase.from('tasks').update({ deleted_at: null }).in('id', ids))
    },
    onMutate: (ids) => qc.setQueryData<Task[]>(trashKey, (l) => l?.filter((t) => !ids.includes(t.id))),
    onSettled: refresh,
  })

  /** Archives -> tâche rouverte (à faire). */
  const reopen = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('tasks').update({ status: 'todo' }).eq('id', id))
    },
    onMutate: (id) => qc.setQueryData<Task[]>(archiveKey, (l) => l?.filter((t) => t.id !== id)),
    onSettled: refresh,
  })

  const destroy = useMutation({
    mutationFn: purge,
    onMutate: (ids) => qc.setQueryData<Task[]>(trashKey, (l) => l?.filter((t) => !ids.includes(t.id))),
    onSettled: refresh,
  })

  return { restore, reopen, destroy }
}
