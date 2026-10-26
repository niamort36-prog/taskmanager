import { createClient } from '@supabase/supabase-js'

// Seules l'URL du projet et la clé "anon" (publique) sont exposées côté front.
// Toutes les données sont protégées par les règles RLS de Postgres.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

/** Adresse publique d'une Edge Function (liens à ouvrir hors de l'app). */
export const functionUrl = (name: string) => `${(url || 'http://localhost').replace(/\/$/, '')}/functions/v1/${name}`

// `||` et non `??` : en CI, une variable absente vaut "" (chaîne vide).
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    // Flux "implicit" : le lien magique revient avec #access_token=... et
    // fonctionne quel que soit le navigateur qui l'ouvre (Gmail, Chrome,
    // Safari…). Le flux PKCE exigerait le même navigateur que la demande,
    // ce qui échoue souvent sur téléphone. Le hash est lu et nettoyé avant
    // que le HashRouter n'affiche une route (voir AuthProvider).
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Lève l'erreur Supabase si présente, sinon renvoie les données typées. */
export function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
