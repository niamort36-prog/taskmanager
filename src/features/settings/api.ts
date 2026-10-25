import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Settings } from '@/types/domain'

/** Charge les réglages, en créant la ligne au premier lancement. */
export function useSettings(userId: string | undefined) {
  return useQuery({
    queryKey: qk.settings,
    enabled: Boolean(userId),
    queryFn: async () => {
      unwrap(await supabase.from('settings').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }))
      return unwrap<Settings>(await supabase.from('settings').select('*').single())
    },
    staleTime: Infinity,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) =>
      unwrap<Settings>(await supabase.from('settings').update(patch).not('user_id', 'is', null).select().single()),
    onMutate: (patch) => qc.setQueryData<Settings>(qk.settings, (s) => (s ? { ...s, ...patch } : s)),
    onSuccess: (s) => qc.setQueryData(qk.settings, s),
  })
}

export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#f4f6f9')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* ignore */
  }
}

/** Synchronise le thème enregistré en base avec la page. */
export function useThemeSync(settings: Settings | undefined) {
  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])
}
