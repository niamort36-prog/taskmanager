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
    due_at: null, due_has_time: false, position: 0, completed_at: null, deleted_at: null,
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
}
const t0 = db.tasks[1].id
db.subtasks.push(
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Vérifier les métrés', done: true, due_at: null, position: 0, created_at: iso(-1), updated_at: iso(-1) },
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Demander 3 devis', done: false, due_at: iso(28), position: 1, created_at: iso(-1), updated_at: iso(-1) },
  { id: uuid(), task_id: t0, user_id: USER_ID, title: 'Valider avec le client', done: false, due_at: null, position: 2, created_at: iso(-1), updated_at: iso(-1) },
)
db.task_tags.push({ task_id: t0, tag_id: tags[0].id, user_id: USER_ID }, { task_id: db.tasks[2].id, tag_id: tags[1].id, user_id: USER_ID })

const DEFAULTS: Record<string, () => Row> = {
  tasks: () => task(''),
  subtasks: () => ({ id: uuid(), user_id: USER_ID, done: false, done_at: null, due_at: null, position: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  tags: () => ({ id: uuid(), user_id: USER_ID, color: '#64748b' }),
  task_tags: () => ({ user_id: USER_ID }),
  settings: () => ({ user_id: USER_ID, theme: 'dark', timezone: 'Europe/Paris', push_enabled: true, email_enabled: false, sms_enabled: false, notify_email: null, dnd_start: null, dnd_end: null, digest_enabled: false, digest_time: '07:30', ai_daily_limit: 50 }),
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
  if (table !== 'tasks') return row
  const out = { ...row }
  if (select.includes('subtasks')) out.subtasks = db.subtasks.filter((s) => s.task_id === row.id)
  if (select.includes('task_tags')) out.task_tags = db.task_tags.filter((t) => t.task_id === row.id)
  return out
}

function onWrite(table: string, row: Row, before?: Row) {
  row.updated_at = new Date().toISOString()
  if (table === 'tasks' && row.status !== before?.status) row.completed_at = row.status === 'done' ? new Date().toISOString() : null
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
      const key = url.searchParams.get('on_conflict')
      if (key && rows.some((r) => r[key] === input[key])) {
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
    if (url.pathname.includes('/rest/v1/')) return handle(url, init)
    if (url.pathname.includes('/auth/v1/')) return json({})
    return realFetch(input, init)
  }
  console.info('[mock] Backend de démonstration actif')
}
