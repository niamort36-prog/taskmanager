import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useTaskUi } from '@/features/tasks/TaskUiContext'
import { supabase, unwrap } from '@/lib/supabase'
import { computeStats, formatMinutes, WEEKS, type StatEntry, type StatTask, type WeekStat } from './computeStats'

const since = () => new Date(Date.now() - (WEEKS * 7 + 7) * 86_400_000).toISOString()

function useStatsData() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const from = since()
      const [tasks, entries] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, status, due_at, due_has_time, created_at, completed_at')
          .is('deleted_at', null)
          .or(`status.neq.done,completed_at.gte.${from}`)
          .limit(5000),
        supabase.from('time_entries').select('task_id, started_at, ended_at').gte('started_at', from).limit(5000),
      ])
      return { tasks: unwrap<StatTask[]>(tasks), entries: unwrap<StatEntry[]>(entries) }
    },
  })
}

export function StatsPage() {
  const { data, isLoading, error } = useStatsData()
  const s = useMemo(() => (data ? computeStats(data.tasks, data.entries) : null), [data])

  return (
    <>
      <PageHeader title="Statistiques" />
      <div className="mx-auto max-w-xl space-y-5 p-4">
        {isLoading && <p className="text-muted">Calcul…</p>}
        {error && <p className="text-danger">{(error as Error).message}</p>}
        {s && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Terminées cette semaine" value={String(s.thisWeek.done)}>
                <Trend now={s.thisWeek.done} before={s.lastWeek.done} />
              </Tile>
              <Tile label="En retard" value={String(s.overdue)}>
                {s.overdue > 0 ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <AlertTriangle className="size-4" /> à rattraper
                  </span>
                ) : (
                  <span className="text-success">rien en retard</span>
                )}
              </Tile>
              <Tile label="Terminées à temps" value={s.onTimeRate === null ? '—' : `${s.onTimeRate} %`}>
                <span className="text-muted">{s.withDue ? `sur ${s.withDue} avec échéance` : 'aucune échéance'}</span>
              </Tile>
              <Tile label="Temps passé cette semaine" value={formatMinutes(s.thisWeek.minutes)}>
                <span className="text-muted">semaine dernière : {formatMinutes(s.lastWeek.minutes)}</span>
              </Tile>
            </div>

            <Section title="En cours">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Count label="À faire" n={s.open.todo} />
                <Count label="En cours" n={s.open.in_progress} />
                <Count label="Bloquées" n={s.open.blocked} />
              </div>
            </Section>

            <Section
              title={`Tâches terminées par semaine (${WEEKS} semaines)`}
              note={
                s.totalDone
                  ? `${s.totalDone} terminées · délai médian ${s.medianDays === 0 ? 'le jour même' : `${s.medianDays} j`} entre création et fin`
                  : 'Aucune tâche terminée sur la période.'
              }
            >
              <WeekBars
                weeks={s.weeks}
                value={(w) => w.done}
                describe={(w) => `${w.done} terminée${w.done > 1 ? 's' : ''} · ${w.created} créée${w.created > 1 ? 's' : ''}`}
                format={String}
              />
            </Section>

            <Section title="Temps passé par semaine">
              <WeekBars weeks={s.weeks} value={(w) => w.minutes / 60} describe={(w) => formatMinutes(w.minutes)} format={(h) => `${Math.round(h)} h`} />
            </Section>

            {s.topTime.length > 0 && (
              <Section title={`Où passe votre temps (${WEEKS} semaines)`}>
                <TopTime items={s.topTime} />
              </Section>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function Trend({ now, before }: { now: number; before: number }) {
  if (now === before) return <span className="inline-flex items-center gap-1 text-muted"><Minus className="size-4" /> comme la semaine dernière</span>
  const up = now > before
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      {up ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
      {up ? '+' : '−'}
      {Math.abs(now - before)} vs semaine dernière
    </span>
  )
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <div className="text-2xl font-bold tabular-nums">{n}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
      {note && <p className="text-sm text-muted">{note}</p>}
    </section>
  )
}

/**
 * Histogramme d'une seule série, une barre par semaine. Toucher une barre
 * affiche sa valeur (la semaine en cours est sélectionnée par défaut).
 */
function WeekBars({
  weeks,
  value,
  describe,
  format,
}: {
  weeks: WeekStat[]
  value: (w: WeekStat) => number
  describe: (w: WeekStat) => string
  format: (v: number) => string
}) {
  const [sel, setSel] = useState(weeks.length - 1)
  const max = Math.max(...weeks.map(value))
  const top = max > 0 ? niceCeil(max) : 1
  const w = weeks[sel]

  return (
    <div>
      <p className="min-h-6 text-sm" aria-live="polite">
        <span className="text-muted">Semaine du {w.label} : </span>
        <span className="font-semibold">{describe(w)}</span>
      </p>
      <div className="relative mt-1 flex h-36 items-stretch border-b border-line">
        <span className="pointer-events-none absolute top-0 right-0 -translate-y-1/2 bg-surface pl-1 text-xs text-muted">{format(top)}</span>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        {weeks.map((wk, i) => {
          const v = value(wk)
          return (
            <button
              key={wk.label}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`Semaine du ${wk.label} : ${describe(wk)}`}
              aria-pressed={i === sel}
              className="flex flex-1 items-end justify-center px-[1px]"
            >
              <span
                className={`w-full max-w-6 rounded-t ${i === sel ? 'bg-accent' : 'bg-accent/50'}`}
                style={{ height: v > 0 ? `max(3px, ${(v / top) * 100}%)` : 0 }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex text-xs text-muted">
        {weeks.map((wk, i) => (
          <span key={wk.label} className="flex-1 text-center">
            {(weeks.length - 1 - i) % 3 === 0 ? wk.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Arrondi "propre" du haut de l'échelle (1, 2, 5, 10, 20…). */
function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p
}

function TopTime({ items }: { items: { id: string; title: string; minutes: number }[] }) {
  const ui = useTaskUi()
  const max = items[0]?.minutes ?? 1
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => ui.openTask(it.id)} className="block min-h-11 w-full text-left">
            <div className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">{it.title}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatMinutes(it.minutes)}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-surface-2">
              <div className="h-2 rounded bg-accent" style={{ width: `${(it.minutes / max) * 100}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
