/* Service worker : réception des notifications push et ouverture de la
   tâche au clic. (La mise en cache hors ligne arrivera en phase 6.) */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
