/**
 * Notifications push côté navigateur : service worker, permission,
 * abonnement (clé VAPID publique) et enregistrement dans Supabase.
 */
import { supabase, unwrap } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Lancée depuis l'écran d'accueil (PWA installée). */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export type PushStatus =
  | 'unsupported' // navigateur trop ancien
  | 'ios-install' // iPhone : installer l'app sur l'écran d'accueil d'abord
  | 'not-configured' // clé VAPID absente du build
  | 'denied' // permission refusée
  | 'off' // possible, pas encore activé sur cet appareil
  | 'on'

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  } catch (e) {
    console.warn('Service worker non enregistré', e)
    return null
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function base64UrlToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Enregistre (ou met à jour) l'abonnement de cet appareil dans Supabase. */
async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  unwrap(
    await supabase.from('push_subscriptions').upsert(
      {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: 'endpoint' },
    ),
  )
}

/** Demande la permission puis abonne cet appareil. À appeler depuis un clic. */
export async function enablePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error('Clé VAPID publique absente (VITE_VAPID_PUBLIC_KEY).')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permission refusée. Autorisez les notifications dans les réglages du navigateur.')
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready)
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) }))
  await saveSubscription(sub)
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Ré-enregistre l'abonnement existant (au démarrage, ou si le navigateur l'a renouvelé). */
export async function refreshSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await saveSubscription(sub).catch(() => {})
}

export async function sendTestNotification(channel: 'push' | 'email' | 'sms' = 'push'): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; detail?: string; error?: string }>('notify-test', {
    body: { channel },
  })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.error ?? 'Échec de l’envoi')
  return data.detail ?? 'envoyé'
}
