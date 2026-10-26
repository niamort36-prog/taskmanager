/**
 * MODE DÉMO (développement uniquement, activé par VITE_MOCK=1).
 * Simule en mémoire le sous-ensemble de l'API REST Supabase utilisé par l'app,
 * avec une session factice : permet de tester l'interface sans backend.
 * Ce fichier n'est jamais inclus dans le build de production.
 */
const USER_ID = '00000000-0000-0000-0000-000000000001'
type Row = Record<string, unknown>

const now = Date.now()
const iso = (offsetH: number) => new Date(now + offsetH * 3600_000).toISOString()
const uuid = () => crypto.randomUUID()

const tags: Row[] = [
  { id: uuid(), user_id: USER_ID, name: 'Chantier', color: '#f97316' },
  { id: uuid(), user_id: USER_ID, name: 'Admin', color: '#0ea5e9' },
]

function task(title: string, extra: Row = {}): Row {
  return {
    id: uuid(), user_id: USER_ID, title, description: '', notes_md: '', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, position: 0, completed_at: null, deleted_at: null, address: '', recurrence: null, next_task_id: null,
    created_at: iso(-48), updated_at: iso(-48), ...extra,
  }
}

const db: Record<string, Row[]> = {
  tasks: [
    task('Relancer le plombier pour le devis', { due_at: iso(-26), priority: 4, due_has_time: true }),
    task('Commander les plaques de plâtre', { due_at: iso(3), due_has_time: true, status: 'in_progress', priority: 3 }),
    task('Envoyer la facture à M. Martin', { due_at: iso(5) }),
    task('Réunion de chantier rue Victor Hugo', { due_at: iso(50), due_has_time: true, status: 'blocked' }),
    task('Renouveler l’assurance décennale', { due_at: iso(24 * 12), priority: 3 }),
    task('Ranger le dépôt', {}),
    task('Payer l’URSSAF', { status: 'done', completed_at: iso(-3) }),
  ],
  subtasks: [],
  tags,
  task_tags: [],
  settings: [],
  task_history: [],
  contacts: [
    { id: uuid(), user_id: USER_ID, name: 'Jean Dupuis', role: 'Plombier', company: 'Dupuis & Fils', phone: '06 12 34 56 78', email: 'jean@exemple.fr', notes: '', created_at: iso(-100), updated_at: iso(-100) },
    { id: uuid(), user_id: USER_ID, name: 'Claire Martin', role: 'Cliente', company: '', phone: '07 00 00 00 00', email: '', notes: '', created_at: iso(-100), updated_at: iso(-100) },
    ...['Émilie Bernard', 'Antoine Roux', 'Bruno Petit', 'Céline Moreau', 'David Laurent', 'Hugo Simon', 'Inès Michel', 'Karim Lefèvre', 'Léa Garcia', 'Nicolas Faure', 'Paul André', 'Sophie Mercier', 'Thomas Blanc', 'Yann Guerin', '3D Bâtiment'].map((name) => ({
      id: uuid(), user_id: USER_ID, name, role: 'Artisan', company: '', phone: '06 00 00 00 00', email: '', notes: '', created_at: iso(-100), updated_at: iso(-100),
    })),
  ],
  task_contacts: [],
  links: [],
  attachments: [],
  reminders: [],
  task_templates: [],
  time_entries: [],
  push_subscriptions: [],
  notification_logs: [],
}
const t0 = db.tasks[1].id
// Adresses d'exemple (itinéraire)
db.tasks[1].address = '12 rue de la République, 69002 Lyon'
db.tasks[3].address = '8 rue Victor Hugo, 69002 Lyon'
db.subtasks.push(
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Vérifier les métrés', done: true, due_at: null, position: 0, created_at: iso(-1), updated_at: iso(-1) },
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Demander 3 devis', done: false, due_at: iso(28), position: 1, created_at: iso(-1), updated_at: iso(-1) },
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Valider avec le client', done: false, due_at: null, position: 2, created_at: iso(-1), updated_at: iso(-1) },
)
db.task_contacts.push({ task_id: t0, contact_id: db.contacts[0].id, user_id: USER_ID, role_on_task: 'Fournisseur', created_at: iso(-1) })
// Historique pour les statistiques : tâches terminées et temps passé sur 12 semaines.
;[5, 9, 12, 20, 30, 33, 40, 47, 52, 60, 61, 66, 75, 80].forEach((d, i) =>
  db.tasks.push(task(`Tâche terminée n°${i + 1}`, { status: 'done', created_at: iso(-24 * (d + 4)), due_at: iso(-24 * (d - (i % 3))), completed_at: iso(-24 * d) })),
)
;[1, 2, 4, 8, 9, 15, 16, 23, 29, 37, 44, 51].forEach((d, i) => {
  const start = iso(-24 * d)
  db.time_entries.push({ id: uuid(), user_id: USER_ID, task_id: db.tasks[(i % 3) + 1].id, note: '', started_at: start, ended_at: new Date(Date.parse(start) + (45 + (i % 4) * 30) * 60_000).toISOString(), created_at: start })
})
db.task_tags.push({ task_id: t0, tag_id: tags[0].id, user_id: USER_ID }, { task_id: db.tasks[2].id, tag_id: tags[1].id, user_id: USER_ID })

const DEFAULTS: Record<string, () => Row> = {
  tasks: () => task(''),
  subtasks: () => ({ id: uuid(), user_id: USER_ID, done: false, done_at: null, due_at: null, position: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  tags: () => ({ id: uuid(), user_id: USER_ID, color: '#64748b' }),
  task_tags: () => ({ user_id: USER_ID }),
  contacts: () => ({ id: uuid(), user_id: USER_ID, role: '', company: '', phone: '', email: '', notes: '', created_at: new Date().toISOString() }),
  task_contacts: () => ({ user_id: USER_ID, role_on_task: '', created_at: new Date().toISOString() }),
  links: () => ({ id: uuid(), user_id: USER_ID, label: '', position: 0, created_at: new Date().toISOString() }),
  reminders: () => ({ id: uuid(), user_id: USER_ID, subtask_id: null, remind_at: null, offset_minutes: null, recurrence: null, channels: ['push'], ignore_dnd: false, active: true, next_fire_at: null, last_fired_at: null, created_at: new Date().toISOString() }),
  push_subscriptions: () => ({ id: uuid(), user_id: USER_ID }),
  time_entries: () => ({ id: uuid(), user_id: USER_ID, note: '', started_at: new Date().toISOString(), ended_at: null, created_at: new Date().toISOString() }),
  task_templates: () => ({ id: uuid(), user_id: USER_ID, subtasks: [], created_at: new Date().toISOString() }),
  notification_logs: () => ({}),
  attachments: () => ({ id: uuid(), user_id: USER_ID, label: '', storage_path: null, location: null, mime: null, size: null, created_at: new Date().toISOString() }),
  settings: () => ({ user_id: USER_ID, theme: 'dark', timezone: 'Europe/Paris', push_enabled: true, email_enabled: false, sms_enabled: false, notify_email: null, dnd_start: null, dnd_end: null, digest_enabled: false, digest_time: '07:30', weekly_plan_enabled: false, weekly_plan_time: '07:00', last_weekly_plan_on: null, calendar_token: null, ai_daily_limit: 50 }),
}

function parseValue(v: string): unknown {
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

/** Applique les filtres PostgREST simples : eq, is, in, not.is */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'columns'].includes(key)) continue
    const [op, ...rest] = raw.split('.')
    const val = rest.join('.')
    const cell = row[key]
    if (op === 'eq' && String(cell) !== val) return false
    if (op === 'is' && cell !== parseValue(val)) return false
    if (op === 'in' && !val.replace(/[()]/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(cell))) return false
    if (op === 'not' && rest[0] === 'is' && cell === parseValue(rest[1])) return false
  }
  return true
}

function embed(table: string, row: Row, select: string): Row {
  if (table === 'notification_logs') return { ...row, task: db.tasks.find((t) => t.id === row.task_id) ?? null }
  if (table === 'task_contacts' && select.includes('contacts')) {
    return { ...row, contact: db.contacts.find((c) => c.id === row.contact_id) }
  }
  if (table !== 'tasks') return row
  const out = { ...row }
  if (select.includes('subtasks')) out.subtasks = db.subtasks.filter((s) => s.task_id === row.id)
  if (select.includes('task_tags')) out.task_tags = db.task_tags.filter((t) => t.task_id === row.id)
  if (select.includes('task_contacts'))
    out.task_contacts = db.task_contacts
      .filter((tc) => tc.task_id === row.id)
      .map((tc) => ({ ...tc, contact: db.contacts.find((c) => c.id === tc.contact_id) ?? null }))
  return out
}

function onWrite(table: string, row: Row, before?: Row) {
  row.updated_at = new Date().toISOString()
  if (table === 'tasks' && row.status !== before?.status) row.completed_at = row.status === 'done' ? new Date().toISOString() : null
  // Version simplifiée du trigger spawn_next_recurrence (occurrence suivante).
  if (table === 'tasks' && row.status === 'done' && before && before.status !== 'done' && row.recurrence && !row.next_task_id) {
    const steps: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }
    const rec = row.recurrence as { freq: string; interval?: number }
    const days = (steps[rec.freq] ?? 7) * (rec.interval ?? 1)
    const next: Row = { ...row, id: uuid(), status: 'todo', completed_at: null, next_task_id: null, created_at: new Date().toISOString() }
    if (row.due_at) next.due_at = new Date(new Date(String(row.due_at)).getTime() + days * 864e5).toISOString()
    db.tasks.push(next)
    row.next_task_id = next.id
  }
  // Version simplifiée du trigger SQL reminders_compute_next.
  if (table === 'reminders') {
    const task = db.tasks.find((t) => t.id === row.task_id)
    const due = row.subtask_id ? db.subtasks.find((s) => s.id === row.subtask_id)?.due_at : task?.due_at
    row.next_fire_at = !row.active
      ? null
      : row.mode === 'absolute'
        ? row.remind_at
        : due
          ? new Date(new Date(String(due)).getTime() + Number(row.offset_minutes) * 60000).toISOString()
          : null
  }
}

const json = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function handle(url: URL, init: RequestInit): Promise<Response> {
  const table = url.pathname.split('/rest/v1/')[1]
  const rows = db[table]
  if (!rows) return json({ message: `table inconnue ${table}` }, 404)
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const single = headers.get('Accept')?.includes('vnd.pgrst.object')
  const select = url.searchParams.get('select') ?? '*'
  const body = init.body ? JSON.parse(String(init.body)) : null
  let result: Row[] = []

  if (method === 'GET') {
    result = rows.filter((r) => matches(r, url.searchParams)).map((r) => embed(table, r, select))
  } else if (method === 'POST') {
    const ignore = headers.get('Prefer')?.includes('ignore-duplicates')
    for (const input of Array.isArray(body) ? body : [body]) {
      const keys = url.searchParams.get('on_conflict')?.split(',')
      if (keys && rows.some((r) => keys.every((k) => r[k] === input[k]))) {
        if (ignore) continue
      }
      const row = { ...DEFAULTS[table](), ...input }
      onWrite(table, row)
      rows.push(row)
      result.push(row)
    }
  } else if (method === 'PATCH') {
    for (const r of rows.filter((r) => matches(r, url.searchParams))) {
      const before = { ...r }
      Object.assign(r, body)
      onWrite(table, r, before)
      result.push(r)
    }
  } else if (method === 'DELETE') {
    const del = rows.filter((r) => matches(r, url.searchParams))
    db[table] = rows.filter((r) => !del.includes(r))
    result = del
  }

  await new Promise((r) => setTimeout(r, 120)) // latence simulée
  if (single) return result[0] ? json(result[0]) : json({ message: 'not found', code: 'PGRST116' }, 406)
  return json(result)
}

/** Réponses d'exemple de l'assistant IA (aucun appel réel en démo). */
async function mockAi(body: { action: string }) {
  await new Promise((r) => setTimeout(r, 600))
  if (body.action === 'parse_task') {
    const tomorrow9 = new Date(Date.now() + 864e5)
    tomorrow9.setHours(9, 0, 0, 0)
    return json({
      data: {
        title: 'Appeler Jean pour le devis',
        description: '',
        priority: 3,
        due_at: tomorrow9.toISOString(),
        due_has_time: true,
        reminder: { mode: 'relative', offset_minutes: -15 },
        contact: { id: db.contacts[0].id, name: String(db.contacts[0].name) },
        subtasks: ['Préparer les métrés'],
        address: '',
      },
      quota: { used: 4, daily_limit: 50 },
    })
  }
  if (body.action === 'plan') {
    const open = db.tasks.filter((t) => t.status !== 'done')
    return json({
      data: {
        summary: 'Deux urgences ce matin (une relance en retard et une commande pour demain), puis un dossier à débloquer. Le reste peut attendre la fin de semaine.',
        priorities: open.slice(0, 4).map((t, i) => ({
          task_id: t.id,
          title: t.title,
          category: ['urgent', 'urgent', 'bloquee', 'plus_tard'][i],
          why: 'Échéance proche et impact direct sur le chantier.',
          how: 'Commencez par un appel de 5 minutes, puis notez la réponse dans la tâche.',
        })),
        plan: [
          { slot: 'Maintenant', actions: ['Appelez le plombier pour le devis', 'Envoyez la facture'] },
          { slot: 'Cet après-midi', actions: ['Commandez les plaques de plâtre', 'Relancez l’architecte'] },
        ],
        advice: ['Regroupez vos appels en un seul créneau.', 'Gardez 15 minutes en fin de journée pour préparer demain.'],
        horizon: 'today',
        generated_at: new Date().toISOString(),
        task_count: open.length,
      },
      quota: { used: 3, daily_limit: 50 },
    })
  }
  if (body.action === 'draft_email' || body.action === 'reply_email')
    return json({
      data: {
        subject: 'Relance : devis plaques de plâtre',
        body: [
          'Bonjour Monsieur Dupuis,',
          '',
          'Je me permets de revenir vers vous concernant le devis pour les plaques de plâtre. Pourriez-vous me l’adresser d’ici [date] ?',
          '',
          'Je vous remercie par avance.',
          '',
          'Bien cordialement,',
        ].join(String.fromCharCode(10)),
      },
      quota: { used: 3, daily_limit: 50 },
    })
  return json({
    data: {
      steps: [
        { title: 'Appeler le fournisseur pour confirmer le stock', due_in_days: 0 },
        { title: 'Valider le devis avec le client', due_in_days: 2 },
        { title: 'Planifier la livraison sur le chantier', due_in_days: null },
      ],
    },
    quota: { used: 3, daily_limit: 50 },
  })
}

export function installMockBackend() {
  // Session factice, lue par supabase-js au démarrage (clé sb-<ref>-auth-token).
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL ?? 'https://x.supabase.co').hostname.split('.')[0]
  localStorage.setItem(
    `sb-${ref}-auth-token`,
    JSON.stringify({
      access_token: 'mock',
      refresh_token: 'mock',
      token_type: 'bearer',
      expires_in: 3600 * 24 * 365,
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
      user: { id: USER_ID, email: 'demo@exemple.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: iso(-1000) },
    }),
  )
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.endsWith('/rest/v1/rpc/rotate_calendar_token')) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
      db.settings.forEach((s) => (s.calendar_token = token))
      return json(token)
    }
    if (url.pathname.includes('/rest/v1/')) return handle(url, init)
    if (url.pathname.includes('/auth/v1/')) return json({})
    if (url.pathname.endsWith('/rest/v1/rpc/ai_quota')) return json([{ used: 2, daily_limit: 50, last_minute: 0 }])
    if (url.pathname.endsWith('/functions/v1/ai')) return mockAi(JSON.parse(String(init.body ?? '{}')))
    if (url.pathname.includes('/functions/v1/')) return json({ ok: true, detail: 'démo' })
    // Storage simulé : les fichiers ne sont pas conservés.
    if (url.pathname.includes('/storage/v1/object/sign/')) {
      // Lot d'URLs (miniatures) ou URL unique ; image d'exemple en démo.
      const body = init.body ? JSON.parse(String(init.body)) : {}
      const demo = `${import.meta.env.BASE_URL}icons/icon-512.png`
      if (Array.isArray(body.paths)) return json(body.paths.map((path: string) => ({ path, signedURL: demo, error: null })))
      return json({ signedURL: demo })
    }
    if (url.pathname.includes('/storage/v1/')) return json({ Key: 'demo', Id: uuid() })
    return realFetch(input, init)
  }
  console.info('[mock] Backend de démonstration actif')
}
