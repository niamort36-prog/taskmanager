import { lazy, Suspense, type ComponentProps } from 'react'

// Le détail (sous-tâches, rappels, IA, pièces jointes…) est chargé à la
// première ouverture d'une tâche, pas au démarrage de l'app.
const TaskDetail = lazy(() => import('./TaskDetail').then((m) => ({ default: m.TaskDetail })))

export function LazyTaskDetail(props: ComponentProps<typeof TaskDetail>) {
  return (
    <Suspense fallback={<p className="p-4 text-muted">Chargement…</p>}>
      <TaskDetail {...props} />
    </Suspense>
  )
}
