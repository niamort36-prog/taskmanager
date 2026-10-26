// Abonnement agenda : GET /functions/v1/calendar?token=<lien secret>
// Lu par Google Agenda, l'app Calendrier de l'iPhone, Outlook… (pas de JWT :
// le jeton secret de l'utilisateur sert d'authentification ; verify_jwt = false).
import { admin, APP_URL } from '../_shared/admin.ts'
import { buildIcs, type IcsTask } from '../_shared/ics.ts'

const DONE_DAYS = 30

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Lien invalide', { status: 404 })

  const { data: s } = await admin.from('settings').select('user_id').eq('calendar_token', token).maybeSingle()
  if (!s) return new Response('Lien invalide ou désactivé', { status: 404 })

  const since = new Date(Date.now() - DONE_DAYS * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('tasks')
    .select('id, title, description, address, status, priority, due_at, due_has_time, updated_at')
    .eq('user_id', s.user_id)
    .is('deleted_at', null)
    .not('due_at', 'is', null)
    .or(`status.neq.done,completed_at.gte.${since}`)
    .order('due_at')
    .limit(2000)
  if (error) return new Response(error.message, { status: 500 })

  return new Response(buildIcs((data ?? []) as IcsTask[], APP_URL), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="mes-taches.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  })
})
