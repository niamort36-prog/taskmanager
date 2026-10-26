/* Service worker :
   - cache de l'application (ouverture sans réseau, chargement rapide en 4G) ;
   - réception des notifications push et ouverture de la tâche au clic.
   Les données (tâches…) sont mises en cache par l'app elle-même (IndexedDB). */

const SHELL = 'tm-shell-v3'
const ASSETS = 'tm-assets-v2'
const KEEP = [SHELL, ASSETS]
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/badge-96.png']
const NETWORK_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Réseau d'abord (version à jour), cache si pas de réponse en 3 s ou hors ligne. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL)
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put('./index.html', res.clone())
      return res
    })
    .catch(() => null)
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
  const fast = await Promise.race([network, timeout])
  if (fast) return fast
  const cached = await cache.match('./index.html')
  return cached ?? (await network) ?? Response.error()
}

/** Fichiers à nom unique (/assets/…-hash.js) : le cache suffit, ils ne changent jamais. */
async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) {
    cache.put(request, res.clone())
    trim(cache, 80)
  }
  return res
}

/** Garde les N entrées les plus récentes (anciennes versions de l'app). */
async function trim(cache, max) {
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Supabase et autres domaines : jamais interceptés (les données passent par l'app).
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else if (url.pathname.endsWith('.webmanifest')) {
    // Le manifest change avec les versions (partage, raccourcis) : réseau d'abord.
    event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c ?? Response.error())))
  } else if (/\.(png|svg)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((c) => c ?? fetch(request)))
  }
})

// ---------------------------------------------------------------------
// Notifications push
// ---------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Rappel', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Rappel'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Une fenêtre de l'app est déjà ouverte : on la réutilise.
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus()
          client.postMessage({ type: 'open-url', url: target })
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// L'abonnement push a été renouvelé par le navigateur : on prévient l'app.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'resubscribe' }))),
  )
})
