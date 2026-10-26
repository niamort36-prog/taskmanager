import { MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { useProjects } from './api'

/** Choix du chantier d'une tâche (dans le détail). */
export function ProjectSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { data: projects = [] } = useProjects()
  const active = projects.filter((p) => !p.archived || p.id === value)
  if (!projects.length)
    return (
      <Link to="/projects" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted">
        <MapPin className="size-5" /> Créer un chantier
      </Link>
    )
  return (
    <div className="flex items-center gap-2">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3"
        aria-label="Chantier"
      >
        <option value="">Aucun chantier</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {value && (
        <Link to={`/projects/${value}`} className="tap shrink-0 rounded-lg border border-line text-accent" aria-label="Ouvrir le chantier">
          <MapPin className="size-5" />
        </Link>
      )}
    </div>
  )
}
