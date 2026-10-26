import { Archive, ChevronRight, LayoutTemplate, LogOut, Moon, Sun, Trash2, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useSettings, useUpdateSettings } from './api'
import { BackupCard } from './BackupCard'
import { NotificationSettings } from './NotificationSettings'

export function SettingsPage() {
  const { session } = useAuth()
  const { data: settings } = useSettings(session?.user.id)
  const update = useUpdateSettings()

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="mx-auto max-w-xl space-y-6 p-4">
        <section className="space-y-2">
          <h2 className="font-semibold text-muted">Apparence</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                aria-pressed={settings?.theme === t}
                onClick={() => update.mutate({ theme: t })}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border ${
                  settings?.theme === t ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface'
                }`}
              >
                {t === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
                {t === 'dark' ? 'Sombre' : 'Clair'}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-muted">Données</h2>
          <Link
            to="/contacts"
            className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3"
          >
            <Users className="size-5 text-accent" />
            <span className="flex-1">Carnet de contacts</span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
          <Link to="/templates" className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
            <LayoutTemplate className="size-5 text-accent" />
            <span className="flex-1">Modèles de tâches</span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
          <Link to="/archive" className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
            <Archive className="size-5 text-accent" />
            <span className="flex-1">Archives (terminées depuis 30 jours)</span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
          <Link to="/trash" className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
            <Trash2 className="size-5 text-accent" />
            <span className="flex-1">Corbeille</span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
          <BackupCard />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-muted">Notifications</h2>
          <NotificationSettings settings={settings} />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-muted">Compte</h2>
          <div className="rounded-xl border border-line bg-surface p-3">{session?.user.email}</div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger text-danger"
          >
            <LogOut className="size-5" /> Se déconnecter
          </button>
        </section>

        <p className="text-center text-sm text-muted">Version {__APP_VERSION__}</p>
      </div>
    </>
  )
}
