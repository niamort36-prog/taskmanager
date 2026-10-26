/**
 * Android/Chrome propose l'installation de la PWA via "beforeinstallprompt".
 * Ce module est importé dès le démarrage (main.tsx) pour ne pas manquer
 * l'événement ; la bannière d'installation le déclenche ensuite.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
})

export const canPromptInstall = () => deferred !== null
export const onInstallAvailable = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Affiche la boîte d'installation ; renvoie true si l'utilisateur accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const choice = await deferred.userChoice
  deferred = null
  return choice.outcome === 'accepted'
}
