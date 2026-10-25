// Client Supabase "service_role" : contourne la RLS, à n'utiliser que
// dans les Edge Functions (jamais côté navigateur).
import { createClient } from 'npm:@supabase/supabase-js@2'

export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export { APP_URL } from './config.ts'

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
