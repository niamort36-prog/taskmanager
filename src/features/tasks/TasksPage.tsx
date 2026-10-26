import { useEffect, useMemo, useState } from 'react'
import { Columns3, List, Printer, Search, SlidersHorizontal, X } from 'lucide-react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { PageHeader } from '@/components/ui/PageHeader'
import { useTasks } from './api'
import { FilterPanel } from './FilterPanel'
import { activeFilterCount, applyFilters, EMPTY_FILTERS, sortTasks, type TaskFilters } from './filters'
import { KanbanBoard } from './KanbanBoard'
import { ErrorBox, LoadingList, TaskList } from './TaskList'

type View = 'list' | 'kanban'

// Filtres et vue mémorisés pour la session (retrouvés après ouverture d'une tâche).
function useSessionState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* stockage indisponible : sans importance */
    }
  }, [key, v])
  return [v, setV] as const
}

export function TasksPage() {
  const { data, isLoading, error } = useTasks()
  const [filters, setFilters] = useSessionState<TaskFilters>('tasks.filters', EMPTY_FILTERS)
  const [{ view }, setViewState] = useSessionState<{ view: View }>('tasks.view', { view: 'list' })
  const [filtersOpen, setFiltersOpen] = useState(false)

  const visible = useMemo(() => {
    // En kanban, la colonne "Terminée" doit rester visible.
    const f = view === 'kanban' ? { ...filters, showDone: true } : filters
    return sortTasks(applyFilters(data ?? [], f))
  }, [data, filters, view])

  const count = activeFilterCount(filters)

  return (
    <>
      <PageHeader
        title="Toutes les tâches"
        actions={
          <>
            <Link to="/export" className="tap rounded-lg" aria-label="Exporter, imprimer ou partager">
              <Printer className="size-6" />
            </Link>
            <button
              className="tap rounded-lg"
              onClick={() => setViewState({ view: view === 'list' ? 'kanban' : 'list' })}
              aria-label={view === 'list' ? 'Vue kanban' : 'Vue liste'}
            >
              {view === 'list' ? <Columns3 className="size-6" /> : <List className="size-6" />}
            </button>
          </>
        }
      >
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Rechercher"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-line bg-surface pr-10 pl-10"
            />
            {filters.q && (
              <button
                className="tap absolute top-0 right-0"
                onClick={() => setFilters({ ...filters, q: '' })}
                aria-label="Effacer la recherche"
              >
                <X className="size-5" />
              </button>
            )}
          </label>
          <button
            onClick={() => setFiltersOpen(true)}
            className={`relative tap rounded-xl border px-3 ${count ? 'border-accent text-accent' : 'border-line'}`}
            aria-label={`Filtres${count ? ` (${count} actifs)` : ''}`}
          >
            <SlidersHorizontal className="size-5" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-accent text-sm text-accent-fg">
                {count}
              </span>
            )}
          </button>
        </div>
      </PageHeader>

      <div className="p-4">
        {isLoading && <LoadingList />}
        {error && <ErrorBox error={error} />}
        {data &&
          (view === 'list' ? (
            <TaskList tasks={visible} empty={data.length ? 'Aucune tâche ne correspond.' : 'Aucune tâche pour l’instant.'} />
          ) : (
            <KanbanBoard tasks={visible} />
          ))}
      </div>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtres">
        <FilterPanel value={filters} onChange={setFilters} />
      </BottomSheet>
    </>
  )
}
