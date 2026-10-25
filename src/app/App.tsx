import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useSettings, useThemeSync } from '@/features/settings/api'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TaskUiProvider } from '@/features/tasks/TaskUiContext'
import { TodayPage } from '@/features/tasks/TodayPage'
import { queryClient } from '@/lib/queryClient'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AppLayout } from './AppLayout'

// HashRouter : les URL sont du type /taskmanager/#/tasks, ce qui fonctionne
// sur GitHub Pages sans configuration serveur.
export function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <HashRouter>
            <AuthGate />
          </HashRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function AuthGate() {
  const { session, loading } = useAuth()
  const { data: settings } = useSettings(session?.user.id)
  useThemeSync(settings)

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
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  )
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
