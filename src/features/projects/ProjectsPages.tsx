import { useMemo, useState } from 'react'
import { Archive, ChevronLeft, Copy, MapPin, Navigation, Pencil, Plus, Printer, Timer, Trash2 } from 'lucide-react'
import { formatMinutes, useTimeTotals } from '@/features/time/api'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { useCreateTask, useTasks } from '@/features/tasks/api'
import { sortTasks } from '@/features/tasks/filters'
import { ErrorBox, LoadingList, TaskList } from '@/features/tasks/TaskList'
import { dueState } from '@/lib/dates'
import type { TaskListItem } from '@/types/domain'
import { mapsUrl, PROJECT_COLORS, useProjectMutations, useProjects, wazeUrl, type Project, type ProjectInput } from './api'

const stats = (tasks: TaskListItem[]) => {
  const done = tasks.filter((t) => t.status === 'done').length
  const late = tasks.filter((t) => t.status !== 'done' && dueState(t.due_at) === 'overdue').length
  return { total: tasks.length, done, open: tasks.length - done, late, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 }
}

function Progress({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** Liste des chantiers en cours (et archivés, repliés). */
export function ProjectsPage() {
  const { data: projects, isLoading, error } = useProjects()
  const { data: tasks = [] } = useTasks()
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const byProject = useMemo(() => {
    const m = new Map<string, TaskListItem[]>()
    for (const t of tasks) if (t.project_id) m.set(t.project_id, [...(m.get(t.project_id) ?? []), t])
    return m
  }, [tasks])

  const active = (projects ?? []).filter((p) => !p.archived)
  const archived = (projects ?? []).filter((p) => p.archived)

  return (
    <>
      <PageHeader
        title="Chantiers"
        actions={
          <button className="tap rounded-lg text-accent" onClick={() => setCreating(true)} aria-label="Nouveau chantier">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        {creating && <ProjectForm onDone={() => setCreating(false)} />}
        {isLoading && <LoadingList />}
        {error && <ErrorBox error={error} />}
        {projects && !active.length && !creating && (
          <div className="space-y-3 py-8 text-center text-muted">
            <p>Regroupez les tâches d’un même chantier, avec son adresse et son avancement.</p>
            <button onClick={() => setCreating(true)} className="min-h-12 rounded-xl bg-accent px-5 font-semibold text-accent-fg">
              Créer un chantier
            </button>
          </div>
        )}
        <ul className="space-y-2">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} tasks={byProject.get(p.id) ?? []} />
          ))}
        </ul>
        {archived.length > 0 && (
          <div className="pt-2">
            <button onClick={() => setShowArchived(!showArchived)} className="min-h-11 text-muted underline">
              {showArchived ? 'Masquer' : 'Afficher'} les chantiers archivés ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 space-y-2 opacity-75">
                {archived.map((p) => (
                  <ProjectCard key={p.id} project={p} tasks={byProject.get(p.id) ?? []} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ProjectCard({ project: p, tasks }: { project: Project; tasks: TaskListItem[] }) {
  const s = stats(tasks)
  return (
    <li>
      <Link to={`/projects/${p.id}`} className="block space-y-2 rounded-xl border border-line bg-surface p-3 active:bg-surface-2">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
          <span className="shrink-0 text-muted">{s.pct} %</span>
        </div>
        {p.address && (
          <div className="flex items-center gap-1 text-muted">
            <MapPin className="size-4 shrink-0" />
            <span className="truncate">{p.address}</span>
          </div>
        )}
        <Progress pct={s.pct} color={p.color} />
        <div className="text-sm text-muted">
          {s.open} à faire · {s.done} terminée{s.done > 1 ? 's' : ''}
          {s.late > 0 && <span className="font-semibold text-danger"> · {s.late} en retard</span>}
        </div>
      </Link>
    </li>
  )
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const { save } = useProjectMutations()
  const [v, setV] = useState<ProjectInput>({
    name: project?.name ?? '',
    address: project?.address ?? '',
    color: project?.color ?? PROJECT_COLORS[0],
    notes: project?.notes ?? '',
  })
  const field = 'min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3'
  return (
    <form
      className="space-y-3 rounded-xl border border-accent bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.name.trim()) return
        await save.mutateAsync({ id: project?.id, input: v })
        onDone()
      }}
    >
      <input autoFocus required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Nom du chantier" className={field} maxLength={200} />
      <input
        value={v.address}
        onChange={(e) => setV({ ...v, address: e.target.value })}
        placeholder="Adresse (pour l’itinéraire)"
        autoComplete="street-address"
        className={field}
      />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
        {PROJECT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={v.color === c}
            aria-label={`Couleur ${c}`}
            onClick={() => setV({ ...v, color: c })}
            className={`tap rounded-full ${v.color === c ? 'ring-2 ring-fg' : ''}`}
          >
            <span className="size-7 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </div>
      <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Notes (code portail, interlocuteur…)" rows={2} className={`${field} py-2`} />
      {save.error && <p className="text-danger">{save.error.message}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending} className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-50">
          Enregistrer
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-line px-4">
          Annuler
        </button>
      </div>
    </form>
  )
}

/** Fiche d'un chantier : adresse, itinéraire, avancement, tâches. */
export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: projects, isLoading } = useProjects()
  const { data: allTasks = [] } = useTasks()
  const { save, remove } = useProjectMutations()
  const create = useCreateTask()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)

  const project = projects?.find((p) => p.id === id)
  const tasks = useMemo(() => sortTasks(allTasks.filter((t) => t.project_id === id)), [allTasks, id])
  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')
  const s = stats(tasks)
  const { data: totals } = useTimeTotals(tasks.map((t) => t.id))
  const projectMinutes = Object.values(totals ?? {}).reduce((a, b) => a + b, 0)

  if (isLoading) return <div className="p-4"><LoadingList /></div>
  if (!project)
    return (
      <div className="space-y-3 p-4">
        <p className="text-muted">Chantier introuvable.</p>
        <Link to="/projects" className="text-accent underline">Retour aux chantiers</Link>
      </div>
    )

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(project.address)
      toast('Adresse copiée')
    } catch {
      toast('Copie impossible')
    }
  }

  return (
    <>
      <PageHeader
        title={project.name}
        actions={
          <>
            <Link to="/projects" className="tap rounded-lg" aria-label="Retour aux chantiers">
              <ChevronLeft className="size-6" />
            </Link>
            <button className="tap rounded-lg" onClick={() => setEditing(!editing)} aria-label="Modifier le chantier">
              <Pencil className="size-5" />
            </button>
          </>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {editing && <ProjectForm project={project} onDone={() => setEditing(false)} />}

        {project.address && (
          <section className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 break-words">{project.address}</span>
              <button className="tap -m-2 shrink-0 text-muted" onClick={() => void copyAddress()} aria-label="Copier l’adresse">
                <Copy className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={mapsUrl(project.address)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-accent-fg">
                <Navigation className="size-5" /> Itinéraire
              </a>
              <a href={wazeUrl(project.address)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent text-accent">
                Waze
              </a>
            </div>
          </section>
        )}
        {project.notes && <p className="rounded-xl border border-line bg-surface p-3 whitespace-pre-line">{project.notes}</p>}

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Avancement</h2>
            <span className="text-muted">
              {s.done}/{s.total} · {s.pct} %
            </span>
          </div>
          <Progress pct={s.pct} color={project.color} />
          {s.late > 0 && <p className="font-semibold text-danger">{s.late} tâche{s.late > 1 ? 's' : ''} en retard</p>}
          {projectMinutes > 0 && (
            <p className="flex items-center gap-1 text-muted">
              <Timer className="size-4" /> Temps passé : <span className="font-semibold text-fg">{formatMinutes(projectMinutes)}</span>
            </p>
          )}
        </section>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = draft.trim()
            if (!t) return
            create.create({ title: t, project_id: project.id })
            setDraft('')
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ajouter une tâche au chantier"
            enterKeyHint="done"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3"
          />
          <button type="submit" className="tap rounded-lg bg-accent text-accent-fg" aria-label="Ajouter la tâche">
            <Plus className="size-6" />
          </button>
        </form>

        <TaskList tasks={open} empty="Aucune tâche en cours sur ce chantier." />
        {done.length > 0 && (
          <div>
            <button onClick={() => setShowDone(!showDone)} className="min-h-11 text-muted underline">
              {showDone ? 'Masquer' : 'Afficher'} les tâches terminées ({done.length})
            </button>
            {showDone && <TaskList tasks={done} />}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-2">
          <Link to={`/export?project=${project.id}`} className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-line text-sm">
            <Printer className="size-5" /> Exporter
          </Link>
          <button
            onClick={() => {
              save.mutate({ id: project.id, input: { archived: !project.archived } })
              toast(project.archived ? 'Chantier réactivé' : 'Chantier archivé')
            }}
            className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-line text-sm"
          >
            <Archive className="size-5" /> {project.archived ? 'Réactiver' : 'Archiver'}
          </button>
          <button
            onClick={() => {
              if (!window.confirm(`Supprimer le chantier « ${project.name} » ?\nSes tâches sont conservées, sans chantier.`)) return
              remove.mutate(project.id)
              navigate('/projects')
            }}
            className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-danger text-sm text-danger"
          >
            <Trash2 className="size-5" /> Supprimer
          </button>
        </div>
      </div>
    </>
  )
}
