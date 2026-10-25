import { NavLink, Outlet } from 'react-router'
import { CalendarDays, ListTodo, Plus, Settings, Sun } from 'lucide-react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { TaskDetail } from '@/features/tasks/TaskDetail'
import { BulkActionBar, Fab, PostponeSheet, QuickAddSheet, TaskDetailSheet } from '@/features/tasks/TaskSheets'
import { useTaskUi } from '@/features/tasks/TaskUiContext'

const NAV = [
  { to: '/today', label: "Aujourd'hui", icon: Sun },
  { to: '/tasks', label: 'Tâches', icon: ListTodo },
  { to: '/calendar', label: 'Calendrier', icon: CalendarDays },
  { to: '/settings', label: 'Réglages', icon: Settings },
]

/**
 * Mise en page :
 * - mobile : contenu + barre de navigation fixe en bas + bouton "+" ;
 * - PC (≥ 1024 px) : barre latérale + liste + panneau de détail à droite.
 */
export function AppLayout() {
  const desktop = useIsDesktop()
  const ui = useTaskUi()

  return (
    <div className="flex min-h-dvh">
      {desktop && <Sidebar />}

      <main className={`min-w-0 flex-1 ${desktop ? '' : 'pb-[calc(9rem+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>

      {desktop && ui.openTaskId && (
        <aside className="sticky top-0 h-dvh w-[28rem] shrink-0 overflow-y-auto border-l border-line bg-surface pt-2">
          <TaskDetail taskId={ui.openTaskId} onClose={ui.closeTask} variant="panel" />
        </aside>
      )}

      {!desktop && (
        <>
          <BottomNav />
          <Fab />
          <TaskDetailSheet />
        </>
      )}
      <BulkActionBar />
      <QuickAddSheet />
      <PostponeSheet />
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.8125rem] ${
                  isActive ? 'font-semibold text-accent' : 'text-muted'
                }`
              }
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Sidebar() {
  const ui = useTaskUi()
  return (
    <nav className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3">
      <div className="mb-3 flex items-center gap-2 px-2 py-2 text-lg font-bold">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-8" /> Mes tâches
      </div>
      <button
        onClick={() => ui.setQuickAddOpen(true)}
        className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg"
      >
        <Plus className="size-5" /> Nouvelle tâche
      </button>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 ${isActive ? 'bg-surface-2 font-semibold text-accent' : ''}`
          }
        >
          <Icon className="size-5" aria-hidden /> {label}
        </NavLink>
      ))}
    </nav>
  )
}
