import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Lightbulb, ListOrdered, Loader2, Sparkles, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { appendText, DictationButton } from '@/components/ui/DictationButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { useTaskUi } from '@/features/tasks/TaskUiContext'
import { formatDateTime } from '@/lib/dates'
import { useAiQuota, useInvokeAi } from './api'

type Category = 'urgent' | 'important' | 'rapide' | 'bloquee' | 'plus_tard'

export interface AiPlan {
  summary: string
  priorities: { task_id: string; title: string; category: Category; why: string; how: string }[]
  plan: { slot: string; actions: string[] }[]
  advice: string[]
  horizon: 'today' | 'week'
  generated_at: string
  task_count: number
}

const CATEGORY: Record<Category, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-danger/15 text-danger' },
  important: { label: 'Important', cls: 'bg-warning/15 text-warning' },
  rapide: { label: 'Rapide', cls: 'bg-success/15 text-success' },
  bloquee: { label: 'À débloquer', cls: 'bg-accent/15 text-accent' },
  plus_tard: { label: 'Peut attendre', cls: 'bg-surface-2 text-muted' },
}

const PLAN_KEY = ['ai-plan'] as const

/** Rapport IA sur toutes les tâches : tri, priorités, plan d'action, conseils. */
export function PlanPage() {
  const qc = useQueryClient()
  const invoke = useInvokeAi()
  const { data: quota } = useAiQuota()
  // Dernier rapport conservé dans le cache (persisté : consultable hors ligne).
  const { data: plan } = useQuery<AiPlan | null>({
    queryKey: PLAN_KEY,
    queryFn: () => qc.getQueryData<AiPlan>(PLAN_KEY) ?? null,
    staleTime: Infinity,
  })
  const [horizon, setHorizon] = useState<'today' | 'week'>(plan?.horizon ?? 'today')
  const [context, setContext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await invoke<AiPlan>({ action: 'plan', horizon, context })
      qc.setQueryData(PLAN_KEY, res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Plan d’action IA"
        actions={
          <Link to="/today" className="tap rounded-lg lg:hidden" aria-label="Retour">
            <ChevronLeft className="size-6" />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-5 p-4">
        <section className="space-y-3 rounded-xl border border-line bg-surface p-3">
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(
              [
                ['today', 'Aujourd’hui'],
                ['week', '7 prochains jours'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="radio"
                aria-checked={horizon === v}
                onClick={() => setHorizon(v)}
                className={`min-h-11 rounded-lg ${horizon === v ? 'bg-accent font-semibold text-accent-fg' : ''}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Contraintes (facultatif) : ex. 3 h dispo cet après-midi"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3"
            />
            <DictationButton onText={(t) => setContext((c) => appendText(c, t))} />
          </div>
          <button
            onClick={() => void generate()}
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {busy ? 'Analyse de vos tâches…' : plan ? 'Refaire mon plan' : 'Générer mon plan'}
          </button>
          {busy && <p className="text-muted">Cela prend en général 20 à 40 secondes.</p>}
          {error && <p className="text-danger">{error}</p>}
          {quota && (
            <p className="text-sm text-muted">
              {quota.used}/{quota.daily_limit} demandes IA aujourd’hui · seuls les titres, échéances, sous-tâches et noms des contacts
              sont envoyés
            </p>
          )}
        </section>

        {plan && <PlanReport plan={plan} />}
        {!plan && !busy && (
          <p className="py-8 text-center text-muted">
            L’IA analyse toutes vos tâches en cours, les classe par priorité, explique quoi faire et comment, puis propose un plan
            d’action.
          </p>
        )}
      </div>
    </>
  )
}

function PlanReport({ plan }: { plan: AiPlan }) {
  const ui = useTaskUi()
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Plan {plan.horizon === 'today' ? 'du jour' : 'de la semaine'} · {plan.task_count} tâches analysées · {formatDateTime(plan.generated_at)}
      </p>

      <section className="rounded-xl border border-line bg-surface p-4">
        <p className="leading-relaxed">{plan.summary}</p>
      </section>

      {plan.priorities.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ListOrdered className="size-5 text-accent" /> Priorités
          </h2>
          <ol className="space-y-2">
            {plan.priorities.map((p, i) => (
              <li key={p.task_id}>
                <button
                  onClick={() => ui.openTask(p.task_id)}
                  className="w-full rounded-xl border border-line bg-surface p-3 text-left active:bg-surface-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold break-words">{p.title}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-sm ${CATEGORY[p.category].cls}`}>{CATEGORY[p.category].label}</span>
                      </div>
                      <p className="mt-1 text-muted">{p.why}</p>
                      <p className="mt-1">
                        <span className="font-medium text-accent">Comment : </span>
                        {p.how}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan.plan.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Timer className="size-5 text-accent" /> Plan d’action
          </h2>
          <ol className="space-y-3 border-l-2 border-accent/40 pl-4">
            {plan.plan.map((b, i) => (
              <li key={i}>
                <div className="font-semibold">{b.slot}</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {b.actions.map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan.advice.length > 0 && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lightbulb className="size-5 text-warning" /> Conseils
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {plan.advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
