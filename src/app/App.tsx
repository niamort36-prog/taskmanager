import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { useSettings, useThemeSync } from '@/features/settings/api'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TaskUiProvider } from '@/features/tasks/TaskUiContext'
import { TodayPage } from '@/features/tasks/TodayPage'
import { CACHE_MAX_AGE, persister, registerMutationDefaults } from '@/lib/offline'
import { queryClient } from '@/lib/queryClient'
import { refreshSubscription } from '@/lib/push'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AppLayout } from './AppLayout'

registerMutationDefaults(queryClient)

// Pages secondaires chargées à la demande : premier affichage plus rapide en 4G.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const CalendarPage = named(() => import('@/features/calendar/CalendarPage'), 'CalendarPage')
const ContactsPage = named(() => import('@/features/contacts/ContactsPage'), 'ContactsPage')
const SettingsPage = named(() => import('@/features/settings/SettingsPage'), 'SettingsPage')
const PlanPage = named(() => import('@/features/ai/PlanPage'), 'PlanPage')
const ExportPage = named(() => import('@/features/export/ExportPage'), 'ExportPage')
const TemplatesPage = named(() => import('@/features/templates/TemplatesPage'), 'TemplatesPage')
const ArchivePage = named(() => import('@/features/tasks/ArchivePages'), 'ArchivePage')
const ProjectsPage = named(() => import('@/features/projects/ProjectsPages'), 'ProjectsPage')
const ProjectPage = named(() => import('@/features/projects/ProjectsPages'), 'ProjectPage')
const TrashPage = named(() => import('@/features/tasks/ArchivePages'), 'TrashPage')

// HashRouter : les URL sont du type /taskmanager/#/tasks, ce qui fonctionne
// sur GitHub Pages sans configuration serveur.
export function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: __APP_VERSION__,
        // On enregistre aussi les modifications en attente (hors ligne).
        dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused },
      }}
      // Au démarrage, on rejoue les modifications restées en attente.
      onSuccess={() => void queryClient.resumePausedMutations()}
    >
      <AuthProvider>
        <ToastProvider>
          <HashRouter>
            <AuthGate />
          </HashRouter>
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

function AuthGate() {
  const { session, loading } = useAuth()
  const { data: settings } = useSettings(session?.user.id)
  useThemeSync(settings)
  usePushBridge(Boolean(session))

  if (loading) return <div className="min-h-dvh" aria-busy />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route
        element={
          <TaskUiProvider>
            <AppLayout />
          </TaskUiProvider>
        }
      >
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<Page><CalendarPage /></Page>} />
        <Route path="settings" element={<Page><SettingsPage /></Page>} />
        <Route path="contacts" element={<Page><ContactsPage /></Page>} />
        <Route path="plan" element={<Page><PlanPage /></Page>} />
        <Route path="export" element={<Page><ExportPage /></Page>} />
        <Route path="templates" element={<Page><TemplatesPage /></Page>} />
        <Route path="archive" element={<Page><ArchivePage /></Page>} />
        <Route path="projects" element={<Page><ProjectsPage /></Page>} />
        <Route path="projects/:id" element={<Page><ProjectPage /></Page>} />
        <Route path="trash" element={<Page><TrashPage /></Page>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  )
}

const Page = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="p-4 text-muted">Chargement…</div>}>{children}</Suspense>
)

/**
 * Lien avec le service worker : clic sur une notification alors que l'app
 * est ouverte (on navigue vers la tâche), renouvellement d'abonnement push.
 */
function usePushBridge(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !('serviceWorker' in navigator)) return
    void refreshSubscription()
    const onMessage = (e: MessageEvent<{ type?: string; url?: string }>) => {
      if (e.data?.type === 'open-url' && e.data.url) window.location.href = e.data.url
      if (e.data?.type === 'resubscribe') void refreshSubscription()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [signedIn])
}

function ConfigMissing() {
  return (
    <main className="mx-auto max-w-lg space-y-3 p-6 pt-safe">
      <h1 className="text-2xl font-bold">Configuration manquante</h1>
      <p>
        Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> ne sont pas définies.
      </p>
      <p className="text-muted">
        En local : copiez <code>.env.example</code> en <code>.env.local</code>. Sur GitHub Pages : ajoutez-les dans
        Settings → Secrets and variables → Actions → Variables, puis relancez le déploiement.
      </p>
    </main>
  )
}
