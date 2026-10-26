import type { ReactNode } from 'react'
import { useProjects } from '@/features/projects/api'
import { useTags } from '@/features/tags/api'
import type { DueFilter, TaskFilters } from './filters'
import { EMPTY_FILTERS } from './filters'
import { PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from './meta'

const DUE_LABEL: Record<DueFilter, string> = {
  all: 'Toutes',
  overdue: 'En retard',
  today: "Aujourd'hui",
  week: '7 prochains jours',
  none: 'Sans échéance',
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 ${
        on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

export function FilterPanel({ value, onChange }: { value: TaskFilters; onChange: (f: TaskFilters) => void }) {
  const { data: tags } = useTags()
  const { data: projects } = useProjects()
  const set = (patch: Partial<TaskFilters>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-5 p-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Statut</legend>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <Chip key={s} on={value.statuses.includes(s)} onClick={() => set({ statuses: toggle(value.statuses, s) })}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Priorité</legend>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              on={value.priorities.includes(p)}
              onClick={() => set({ priorities: toggle(value.priorities, p) })}
            >
              <span className={`size-2.5 rounded-full ${PRIORITY_DOT[p]}`} /> {PRIORITY_LABEL[p]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Échéance</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => (
            <Chip key={d} on={value.due === d} onClick={() => set({ due: d })}>
              {DUE_LABEL[d]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {!!projects?.length && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-semibold">Chantier</legend>
          <div className="flex flex-wrap gap-2">
            {projects
              .filter((p) => !p.archived)
              .map((p) => (
                <Chip
                  key={p.id}
                  on={(value.projectIds ?? []).includes(p.id)}
                  onClick={() => set({ projectIds: toggle(value.projectIds ?? [], p.id) })}
                >
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                </Chip>
              ))}
            <Chip on={(value.projectIds ?? []).includes('none')} onClick={() => set({ projectIds: toggle(value.projectIds ?? [], 'none') })}>
              Sans chantier
            </Chip>
          </div>
        </fieldset>
      )}

      {!!tags?.length && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-semibold">Étiquettes</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <Chip key={t.id} on={value.tagIds.includes(t.id)} onClick={() => set({ tagIds: toggle(value.tagIds, t.id) })}>
                <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={value.showDone}
          onChange={(e) => set({ showDone: e.target.checked })}
        />
        Afficher les tâches terminées
      </label>

      <button type="button" className="min-h-11 w-full rounded-xl border border-line" onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q })}>
        Réinitialiser les filtres
      </button>
    </div>
  )
}
