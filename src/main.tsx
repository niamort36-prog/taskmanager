import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/installPrompt'
import { consumeShareTarget } from './lib/shareTarget'

async function start() {
  // Partage depuis une autre app (Android) : avant le routeur, qui lit l'URL.
  consumeShareTarget()
  // Mode démo (dev uniquement) : `VITE_MOCK=1 npm run dev`. Supprimé du build de prod.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') {
    const { installMockBackend } = await import('./dev/mockBackend')
    installMockBackend()
  }
  // Service worker (notifications push). Pas en mode démo.
  if (import.meta.env.VITE_MOCK !== '1') {
    const { registerServiceWorker } = await import('./lib/push')
    void registerServiceWorker()
  }
  // Import après l'installation éventuelle du mock (le client Supabase capture fetch).
  const { App } = await import('./app/App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
