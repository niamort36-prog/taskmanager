import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'

export interface TaskTemplate {
  id: string
  name: string
  subtasks: string[]
}

const key = ['task-templates'] as const

/** Modèles proposés au premier usage (modifiables ensuite). */
export const EXAMPLE_TEMPLATES: Omit<TaskTemplate, 'id'>[] = [
  {
    name: 'Nouveau chantier',
    subtasks: ['Visite et métré', 'Établir le devis', 'Envoyer le devis', 'Relancer le client', 'Commander les matériaux', 'Planifier l’intervention'],
  },
  {
    name: 'Devis client',
    subtasks: ['Recueillir le besoin', 'Chiffrer matériaux et main-d’œuvre', 'Rédiger le devis', 'Envoyer au client', 'Relancer sous 7 jours'],
  },
  {
    name: 'Fin de chantier',
    subtasks: ['Nettoyer et évacuer les déchets', 'Réception des travaux avec le client', 'Lever les réserves', 'Envoyer la facture', 'Relancer le paiement'],
  },
]

export const useTemplates = () =>
  useQuery({
    queryKey: key,
    queryFn: async () => unwrap<TaskTemplate[]>(await supabase.from('task_templates').select('id, name, subtasks').order('name')),
    staleTime: 5 * 60_000,
  })

export function useTemplateMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const save = useMutation({
    mutationFn: async ({ id, name, subtasks }: { id?: string; name: string; subtasks: string[] }) => {
      const row = { name: name.trim(), subtasks: subtasks.map((s) => s.trim()).filter(Boolean) }
      if (id) unwrap(await supabase.from('task_templates').update(row).eq('id', id))
      else unwrap(await supabase.from('task_templates').insert(row))
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('task_templates').delete().eq('id', id))
    },
    onMutate: (id) => qc.setQueryData<TaskTemplate[]>(key, (l) => l?.filter((t) => t.id !== id)),
    onSettled: refresh,
  })

  const addExamples = useMutation({
    mutationFn: async () => {
      unwrap(await supabase.from('task_templates').insert(EXAMPLE_TEMPLATES))
    },
    onSettled: refresh,
  })

  return { save, remove, addExamples }
}
