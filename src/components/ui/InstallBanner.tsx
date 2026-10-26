import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Link } from 'react-router'
import { canPromptInstall, onInstallAvailable, promptInstall } from '@/lib/installPrompt'
import { isIos, isStandalone } from '@/lib/push'

const DISMISS_KEY = 'install-banner-dismissed'

const dismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Invitation à installer l'app sur l'écran d'accueil (masquable). */
export function InstallBanner() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [hidden, setHidden] = useState(() => isStandalone() || dismissed())

  useEffect(() => {
    const off = onInstallAvailable(() => setCanPrompt(true))
    const onInstalled = () => setHidden(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      off()
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const ios = isIos()
  if (hidden || (!ios && !canPrompt)) return null

  const close = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* stockage indisponible */
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent bg-accent/10 p-3">
      {ios ? <Share className="mt-0.5 size-5 shrink-0 text-accent" /> : <Download className="mt-0.5 size-5 shrink-0 text-accent" />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Installer l’application</div>
        {ios ? (
          <p className="text-muted">
            Safari → Partager → « Sur l’écran d’accueil ». Indispensable sur iPhone pour recevoir les rappels.{' '}
            <Link to="/settings" className="text-accent underline">
              Détails
            </Link>
          </p>
        ) : (
          <button
            onClick={async () => {
              const accepted = await promptInstall()
              setCanPrompt(false)
              if (accepted) setHidden(true)
            }}
            className="mt-2 min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-fg"
          >
            Installer
          </button>
        )}
      </div>
      <button className="tap -m-2 shrink-0 text-muted" onClick={close} aria-label="Masquer">
        <X className="size-5" />
      </button>
    </div>
  )
}
