import { useToast } from '@/components/ui/Toast'
import type { TaskListItem, TaskPatch } from '@/types/domain'
import { useUpdateTasks } from './api'

/** Actions courantes (terminer, supprimer, reporter) avec toast "Annuler". */
export function useTaskActions() {
  const { mutate } = useUpdateTasks()
  const toast = useToast()

  const apply = (ids: string[], patch: TaskPatch) => mutate({ ids, patch })

  return {
    apply,

    toggleDone(task: Pick<TaskListItem, 'id' | 'status' | 'recurrence'>) {
      const previous = task.status
      const next = previous === 'done' ? 'todo' : 'done'
      apply([task.id], { status: next })
      if (next === 'done') {
        toast(task.recurrence ? 'Tâche terminée · la suivante est créée' : 'Tâche terminée', {
          label: 'Annuler',
          onClick: () => apply([task.id], { status: previous }),
        })
      }
    },

    complete(ids: string[]) {
      apply(ids, { status: 'done' })
      toast(ids.length > 1 ? `${ids.length} tâches terminées` : 'Tâche terminée')
    },

    remove(ids: string[]) {
      apply(ids, { deleted_at: new Date().toISOString() })
      toast(ids.length > 1 ? `${ids.length} tâches mises à la corbeille` : 'Tâche mise à la corbeille', {
        label: 'Annuler',
        onClick: () => apply(ids, { deleted_at: null }),
      })
    },
  }
}
