/**
 * "Partager vers Mes tâches" (Android) : le manifest déclare l'app comme cible
 * de partage ; Android ouvre alors /taskmanager/?title=…&text=…&url=…
 * On transforme ce partage en brouillon de tâche, puis on ouvre la saisie rapide.
 */

export interface ShareDraft {
  title: string
  link: { url: string; label: string } | null
}

const KEY = 'share.draft'
const URL_RE = /https?:\/\/[^\s<>"]+/i

export function parseShare(params: URLSearchParams): ShareDraft | null {
  const rawTitle = (params.get('title') ?? '').trim()
  const rawText = (params.get('text') ?? '').trim()
  const rawUrl = (params.get('url') ?? '').trim()
  if (!rawTitle && !rawText && !rawUrl) return null

  // Beaucoup d'apps mettent le lien dans "text" plutôt que dans "url".
  const url = rawUrl || rawText.match(URL_RE)?.[0] || rawTitle.match(URL_RE)?.[0] || ''
  const strip = (s: string) => (url ? s.replace(url, '') : s).replace(/\s+/g, ' ').trim()
  const text = strip(rawText)
  const title = strip(rawTitle)

  let host = ''
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    /* lien invalide : ignoré */
  }
  const taskTitle = (text || title || (host ? `Voir ${host}` : 'Nouvelle tâche')).slice(0, 500)
  return { title: taskTitle, link: url && host ? { url: url.slice(0, 2000), label: (title || host).slice(0, 200) } : null }
}

/** À appeler au démarrage, avant le routeur : range le partage et ouvre la saisie rapide. */
export function consumeShareTarget() {
  const draft = parseShare(new URLSearchParams(window.location.search))
  if (!draft) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* stockage indisponible : la saisie s'ouvrira vide */
  }
  window.history.replaceState(null, '', `${window.location.pathname}#/today?new=1`)
}

export function takeShareDraft(): ShareDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return raw ? (JSON.parse(raw) as ShareDraft) : null
  } catch {
    return null
  }
}
