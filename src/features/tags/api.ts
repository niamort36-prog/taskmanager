import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { mk, type TaskTagToggleVars } from '@/lib/offline'
import { qk } from '@/lib/queryClient'
import type { Tag, TaskDetail, TaskListItem } from '@/types/domain'

export const useTags = () =>
  useQuery({
    queryKey: qk.tags,
    queryFn: async () => unwrap<Tag[]>(await supabase.from('tags').select('id, name, color').order('name')),
    staleTime: 5 * 60_000,
  })

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) =>
      unwrap<Tag>(await supabase.from('tags').insert(input).select('id, name, color').single()),
    onSuccess: (tag) => qc.setQueryData<Tag[]>(qk.tags, (l) => [...(l ?? []), tag]),
  })
}

/** Ajoute ou retire une étiquette sur une tâche (rejouable hors ligne, voir lib/offline.ts). */
export function useToggleTaskTag(taskId: string) {
  const qc = useQueryClient()
  const m = useMutation<void, Error, TaskTagToggleVars>({
    mutationKey: mk.taskTagToggle,
    onMutate: ({ tagId, on }) => {
      const apply = (ids: string[]) => (on ? [...ids, tagId] : ids.filter((i) => i !== tagId))
      qc.setQueryData<TaskDetail | null>(qk.task(taskId), (t) => (t ? { ...t, tag_ids: apply(t.tag_ids) } : t))
      qc.setQueryData<TaskListItem[]>(qk.tasks, (l) =>
        l?.map((t) => (t.id === taskId ? { ...t, tag_ids: apply(t.tag_ids) } : t)),
      )
    },
  })
  return { ...m, mutate: (v: { tagId: string; on: boolean }) => m.mutate({ taskId, ...v }) }
}
