import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Contact, TaskContact } from '@/types/domain'

export type ContactInput = Pick<Contact, 'name' | 'role' | 'company' | 'phone' | 'email' | 'notes'>

export const EMPTY_CONTACT: ContactInput = { name: '', role: '', company: '', phone: '', email: '', notes: '' }

/** Carnet complet (usage personnel : quelques centaines de contacts au plus). */
export const useContacts = () =>
  useQuery({
    queryKey: qk.contacts,
    queryFn: async () => unwrap<Contact[]>(await supabase.from('contacts').select('*').order('name')),
    staleTime: 5 * 60_000,
  })

export function useSaveContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ContactInput }) => {
      const clean = { ...input, name: input.name.trim() }
      const q = id
        ? supabase.from('contacts').update(clean).eq('id', id)
        : supabase.from('contacts').insert(clean)
      return unwrap<Contact>(await q.select().single())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts })
      qc.invalidateQueries({ queryKey: ['task-contacts'] }) // le nom a pu changer
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('contacts').delete().eq('id', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts })
      qc.invalidateQueries({ queryKey: ['task-contacts'] })
    },
  })
}

/** Contacts liés à une tâche. */
export const useTaskContacts = (taskId: string) =>
  useQuery({
    queryKey: qk.taskContacts(taskId),
    queryFn: async () =>
      unwrap<TaskContact[]>(
        await supabase
          .from('task_contacts')
          .select('task_id, contact_id, role_on_task, contact:contacts(*)')
          .eq('task_id', taskId)
          .order('created_at'),
      ),
  })

export function useTaskContactMutations(taskId: string) {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.taskContacts(taskId) })
    qc.invalidateQueries({ queryKey: qk.history(taskId) })
  }

  const link = useMutation({
    mutationFn: async ({ contactId, role = '' }: { contactId: string; role?: string }) => {
      unwrap(await supabase.from('task_contacts').insert({ task_id: taskId, contact_id: contactId, role_on_task: role }))
    },
    onSettled: refresh,
  })

  const unlink = useMutation({
    mutationFn: async (contactId: string) => {
      unwrap(await supabase.from('task_contacts').delete().eq('task_id', taskId).eq('contact_id', contactId))
    },
    onMutate: (contactId) =>
      qc.setQueryData<TaskContact[]>(qk.taskContacts(taskId), (l) => l?.filter((c) => c.contact_id !== contactId)),
    onSettled: refresh,
  })

  const setRole = useMutation({
    mutationFn: async ({ contactId, role }: { contactId: string; role: string }) => {
      unwrap(
        await supabase
          .from('task_contacts')
          .update({ role_on_task: role })
          .eq('task_id', taskId)
          .eq('contact_id', contactId),
      )
    },
    onSettled: refresh,
  })

  return { link, unlink, setRole }
}
