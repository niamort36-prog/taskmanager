import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryClient'
import { supabase, unwrap } from '@/lib/supabase'

export interface Project {
  id: string
  name: string
  address: string
  color: string
  notes: string
  archived: boolean
  created_at: string
}

export type ProjectInput = Pick<Project, 'name' | 'address' | 'color' | 'notes'>

export const PROJECT_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#64748b']

const key = ['projects'] as const

export const useProjects = () =>
  useQuery({
    queryKey: key,
    queryFn: async () => unwrap<Project[]>(await supabase.from('projects').select('*').order('name')),
    staleTime: 5 * 60_000,
  })

export function useProjectMap(): Map<string, Project> {
  const { data } = useProjects()
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data])
}

export function useProjectMutations() {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.tasks })
  }

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<ProjectInput> & { archived?: boolean } }) => {
      const row = { ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) }
      return id
        ? unwrap<Project>(await supabase.from('projects').update(row).eq('id', id).select().single())
        : unwrap<Project>(await supabase.from('projects').insert(row).select().single())
    },
    onSuccess: (p) => qc.setQueryData<Project[]>(key, (l) => (l?.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...(l ?? []), p])),
    onSettled: refresh,
  })

  /** Supprime le chantier ; ses tâches restent, "sans chantier". */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('projects').delete().eq('id', id))
    },
    onMutate: (id) => qc.setQueryData<Project[]>(key, (l) => l?.filter((p) => p.id !== id)),
    onSettled: refresh,
  })

  return { save, remove }
}

/** Liens d'itinéraire (ouvrent l'app de navigation du téléphone). */
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
export const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
