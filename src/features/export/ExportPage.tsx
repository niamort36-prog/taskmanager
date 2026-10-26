import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Copy, Printer, Share2 } from 'lucide-react'
import { Link } from 'react-router'
import { formatMinutes, useTimeTotals } from '@/features/time/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { useTasks } from '@/features/tasks/api'
import type { TaskFilters } from '@/features/tasks/filters'
import { useTagMap } from '@/features/tasks/TaskList'
import { formatDue, nowParis } from '@/lib/dates'
import { supabase, unwrap } from '@/lib/supabase'
import type { Tag } from '@/types/domain'
import {
  exportText,
  GROUP_LABEL,
  groupTasks,
  metaLine,
  plainNotes,
  SCOPE_LABEL,
  selectTasks,
  type ExportExtras,
  type ExportGroup,
  type ExportOptions,
  type GroupBy,
  type Scope,
} from './buildExport'

const OPTIONS_KEY = 'export.options'
const DEFAULTS: ExportOptions = { scope: 'open', groupBy: 'due', subtasks: true, description: true, notes: false, contacts: false, time: false }

function loadOptions(): ExportOptions {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') }
    if (!(saved.groupBy in GROUP_LABEL)) saved.groupBy = 'due'
    return saved
  } catch {
    return DEFAULTS
  }
}

/** Filtres de la page "Toutes les tâches" (mémorisés pour la session). */
function listFilters(): TaskFilters | null {
  try {
    const raw = sessionStorage.getItem('tasks.filters')
    return raw ? (JSON.parse(raw) as TaskFilters) : null
  } catch {
    return null
  }
}

/** Sous-tâches complètes et contacts de toutes les tâches (une seule requête). */
function useExportExtras(enabled: boolean) {
  return useQuery({
    queryKey: ['export-extras', 2],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = unwrap<
        {
          id: string
          subtasks: { title: string; done: boolean; due_at: string | null; position: number }[]
          task_contacts: { role_on_task: string; contact: { name: string; role: string; phone: string; email: string } | null }[]
        }[]
      >(
        await supabase
          .from('tasks')
          .select('id, subtasks(title, done, due_at, position), task_contacts(role_on_task, contact:contacts(name, role, phone, email))')
          .is('deleted_at', null),
      )
      // Objet simple (et non Map) : le cache hors ligne est enregistré en JSON.
      return Object.fromEntries(
        rows.map((r): [string, ExportExtras] => [
          r.id,
          {
            subtasks: [...r.subtasks].sort((a, b) => a.position - b.position),
            contacts: r.task_contacts
              .filter((tc) => tc.contact)
              .map((tc) => ({ ...tc.contact!, role: tc.role_on_task || tc.contact!.role })),
          },
        ]),
      ) as Record<string, ExportExtras>
    },
  })
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 ${on ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'}`

/** Export lisible des tâches : aperçu, impression / PDF, partage. */
export function ExportPage() {
  const toast = useToast()
  // isPending (et non isLoading) : vrai aussi pendant la relecture du cache local.
  const { data: tasks = [], isPending } = useTasks()
  const tags = useTagMap()
  const [o, setO] = useState<ExportOptions>(loadOptions)
  const needExtras = o.subtasks || o.contacts
  const { data: extras } = useExportExtras(needExtras)

  useEffect(() => {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(o))
    } catch {
      /* stockage indisponible */
    }
  }, [o])

  const set = (patch: Partial<ExportOptions>) => setO((cur) => ({ ...cur, ...patch }))

  const { data: totals } = useTimeTotals(o.time ? tasks.map((t) => t.id) : [], o.time)

  const groups = useMemo(() => {
    const selected = selectTasks(tasks, o.scope, listFilters()).map((t) => ({ ...t, extras: extras?.[t.id], minutes: totals?.[t.id] }))
    return groupTasks(selected, o.groupBy, tags)
  }, [tasks, o.scope, o.groupBy, extras, tags, totals])

  const count = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id))).size
  const title = `Mes tâches — ${SCOPE_LABEL[o.scope].toLowerCase()} — ${nowParis().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`

  const text = () => exportText(groups, o, tags, title)

  const share = async () => {
    const t = text()
    if (navigator.share) {
      try {
        await navigator.share({ title, text: t })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return // partage annulé
      }
    }
    await copy(t)
  }

  const copy = async (t = text()) => {
    try {
      await navigator.clipboard.writeText(t)
      toast('Liste copiée')
    } catch {
      toast('Copie impossible sur ce navigateur')
    }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Exporter"
          actions={
            <Link to="/tasks" className="tap rounded-lg" aria-label="Retour aux tâches">
              <ChevronLeft className="size-6" />
            </Link>
          }
        />
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <section className="no-print space-y-4 rounded-xl border border-line bg-surface p-3">
          <fieldset>
            <legend className="mb-2 font-semibold">Contenu</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                <button key={s} className={chip(o.scope === s)} onClick={() => set({ scope: s })}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-semibold">Regrouper par</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <button key={g} className={chip(o.groupBy === g)} onClick={() => set({ groupBy: g })}>
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-semibold">Inclure</legend>
            <div className="grid grid-cols-2 gap-x-3">
              {(
                [
                  ['subtasks', 'Sous-tâches'],
                  ['description', 'Descriptions'],
                  ['notes', 'Notes'],
                  ['contacts', 'Contacts (tél.)'],
                  ['time', 'Temps passé'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={o[k]}
                    onChange={(e) => set({ [k]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => window.print()}
              disabled={!count}
              className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-accent px-2 font-semibold text-accent-fg disabled:opacity-50"
            >
              <Printer className="size-5" />
              Imprimer / PDF
            </button>
            <button
              onClick={() => void share()}
              disabled={!count}
              className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-accent px-2 text-accent disabled:opacity-50"
            >
              <Share2 className="size-5" />
              Partager
            </button>
            <button
              onClick={() => void copy()}
              disabled={!count}
              className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-line px-2 disabled:opacity-50"
            >
              <Copy className="size-5" />
              Copier
            </button>
          </div>
          <p className="text-muted">
            « Imprimer / PDF » ouvre l’impression du téléphone ou du PC : choisissez une imprimante ou « Enregistrer en PDF ».
            « Partager » envoie la liste en texte (SMS, WhatsApp, email…).
          </p>
        </section>

        {isPending ? (
          <p className="text-muted">Chargement…</p>
        ) : (
          <PrintSheet title={title} groups={groups} count={count} options={o} tags={tags} />
        )}
      </div>
    </>
  )
}

/** La "feuille" : noir sur blanc, quel que soit le thème, c'est elle qui est imprimée. */
function PrintSheet({
  title,
  groups,
  count,
  options: o,
  tags,
}: {
  title: string
  groups: ExportGroup[]
  count: number
  options: ExportOptions
  tags: Map<string, Tag>
}) {
  // Chaque tâche comptée une fois, même si elle figure dans plusieurs groupes (étiquettes).
  const totalMinutes = [...new Map(groups.flatMap((g) => g.tasks).map((t) => [t.id, t.minutes ?? 0])).values()].reduce((a, b) => a + b, 0)
  return (
    <article id="print-area" className="print-sheet rounded-xl bg-white p-5 text-[#111] shadow-lg">
      <header className="mb-4 border-b-2 border-[#111] pb-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-[#555]">
          {count} tâche{count > 1 ? 's' : ''} · regroupées par {GROUP_LABEL[o.groupBy].toLowerCase()}
        </p>
      </header>
      {!groups.length && <p className="text-[#555]">Aucune tâche pour ce choix.</p>}
      {groups.map((g) => (
        <section key={g.title} className="mb-5">
          <h2 className="mb-2 border-b border-[#ccc] pb-1 text-lg font-bold">
            {g.title} <span className="font-normal text-[#666]">({g.tasks.length})</span>
          </h2>
          <ul className="space-y-3">
            {g.tasks.map((t) => {
              const meta = metaLine(t, tags)
              return (
                <li key={`${g.title}-${t.id}`} className="print-item flex gap-2">
                  <span aria-hidden className="mt-0.5 shrink-0 text-lg leading-none">
                    {t.status === 'done' ? '☑' : '☐'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${t.status === 'done' ? 'text-[#777] line-through' : ''}`}>{t.title}</div>
                    {(meta || (o.time && !!t.minutes)) && (
                      <div className="text-sm text-[#555]">
                        {meta}
                        {o.time && !!t.minutes && `${meta ? ' · ' : ''}⏱ ${formatMinutes(t.minutes)}`}
                      </div>
                    )}
                    {t.address && <div className="text-sm text-[#333]">📍 {t.address}</div>}
                    {o.description && t.description.trim() && <p className="mt-1 whitespace-pre-line">{t.description.trim()}</p>}
                    {o.subtasks && !!t.extras?.subtasks.length && (
                      <ul className="mt-1 space-y-0.5">
                        {t.extras.subtasks.map((s, i) => (
                          <li key={i} className={s.done ? 'text-[#777] line-through' : ''}>
                            {s.done ? '☑' : '☐'} {s.title}
                            {s.due_at && <span className="text-sm text-[#666]"> ({formatDue(s.due_at, false).toLowerCase()})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {o.contacts && !!t.extras?.contacts.length && (
                      <ul className="mt-1 text-sm">
                        {t.extras.contacts.map((c, i) => (
                          <li key={i}>
                            👤 {c.name}
                            {c.role && ` (${c.role})`}
                            {c.phone && ` — ${c.phone}`}
                            {c.email && ` — ${c.email}`}
                          </li>
                        ))}
                      </ul>
                    )}
                    {o.notes && t.notes_md.trim() && (
                      <p className="mt-1 border-l-2 border-[#ccc] pl-2 text-sm whitespace-pre-line text-[#333]">{plainNotes(t.notes_md)}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {o.time && totalMinutes > 0 && (
        <p className="mt-4 border-t-2 border-[#111] pt-2 text-right font-bold">Temps total : {formatMinutes(totalMinutes)}</p>
      )}
    </article>
  )
}
