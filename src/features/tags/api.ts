import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
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

/** Ajoute ou retire une étiquette sur une tâche. */
export function useToggleTaskTag(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tagId, on }: { tagId: string; on: boolean }) => {
      if (on) unwrap(await supabase.from('task_tags').insert({ task_id: taskId, tag_id: tagId }))
      else unwrap(await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag_id', tagId))
    },
    onMutate: ({ tagId, on }) => {
      const apply = (ids: string[]) => (on ? [...ids, tagId] : ids.filter((i) => i !== tagId))
      qc.setQueryData<TaskDetail | null>(qk.task(taskId), (t) => (t ? { ...t, tag_ids: apply(t.tag_ids) } : t))
      qc.setQueryData<TaskListItem[]>(qk.tasks, (l) =>
        l?.map((t) => (t.id === taskId ? { ...t, tag_ids: apply(t.tag_ids) } : t)),
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.task(taskId) })
      qc.invalidateQueries({ queryKey: qk.history(taskId) })
    },
  })
}
