import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'

interface AuthState {
  session: Session | null
  loading: boolean
  /** Erreur renvoyée par un lien de connexion (lien expiré, déjà utilisé…). */
  linkError: string | null
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, linkError: null })

export const useAuth = () => useContext(AuthContext)

const AUTH_KEYS = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'provider_token',
  'code', 'error', 'error_code', 'error_description', 'sb']

/**
 * Lu dès le chargement du module, avant toute navigation : erreur éventuelle
 * d'un lien de connexion, en hash (#error=…) ou en query (?error=…).
 */
const initialLinkError = (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#\/?/, '') + '&' + window.location.search.slice(1))
  const code = params.get('error_code')
  if (!params.get('error') && !code) return null
  if (code === 'otp_expired') return 'Ce lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau.'
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'Le lien de connexion n’a pas fonctionné.'
})()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true, linkError: initialLinkError })

  useEffect(() => {
    // getSession() attend que supabase-js ait lu les jetons du lien magique.
    supabase.auth.getSession().then(({ data }) => {
      setState((s) => ({ ...s, session: data.session, loading: false }))
      cleanAuthParamsFromUrl()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({ ...s, session, loading: false, linkError: session ? null : s.linkError }))
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

/** Retire jetons et erreurs de l'URL (hash et query) une fois traités. */
function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  const hashParams = new URLSearchParams(url.hash.replace(/^#\/?/, ''))
  const dirtyHash = AUTH_KEYS.some((k) => hashParams.has(k))
  const dirtyQuery = AUTH_KEYS.some((k) => url.searchParams.has(k))
  if (!dirtyHash && !dirtyQuery) return
  AUTH_KEYS.forEach((k) => url.searchParams.delete(k))
  // Le hash contenait les jetons et non une route : on revient à l'accueil.
  const hash = dirtyHash ? '#/today' : url.hash
  window.history.replaceState(null, '', url.pathname + url.search + hash)
}
