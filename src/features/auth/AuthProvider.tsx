import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'

interface AuthState {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    // getSession() échange aussi le ?code=... du lien magique (flux PKCE).
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false })
      cleanAuthParamsFromUrl()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false })
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

/** Retire ?code=... de l'URL une fois la session établie. */
function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  if (url.searchParams.has('code') || url.searchParams.has('error_description')) {
    url.searchParams.delete('code')
    url.searchParams.delete('error')
    url.searchParams.delete('error_code')
    url.searchParams.delete('error_description')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
}
