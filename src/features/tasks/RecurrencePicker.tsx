import { WEEKDAYS_SHORT } from '@/features/reminders/describe'
import type { Recurrence } from '@/types/domain'

type Freq = Recurrence['freq']

const FREQS: [Freq | null, string][] = [
  [null, 'Jamais'],
  ['daily', 'Chaque jour'],
  ['weekly', 'Chaque semaine'],
  ['monthly', 'Chaque mois'],
  ['yearly', 'Chaque année'],
]
const UNIT: Record<Freq, string> = { daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois', yearly: 'an(s)' }

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 ${on ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'}`

/** "Chaque mois", "Toutes les 2 semaines (lun. jeu.)"… */
export function recurrenceSummary(r: Recurrence): string {
  const n = r.interval ?? 1
  const base = {
    daily: n > 1 ? `Tous les ${n} jours` : 'Chaque jour',
    weekly: n > 1 ? `Toutes les ${n} semaines` : 'Chaque semaine',
    monthly: n > 1 ? `Tous les ${n} mois` : 'Chaque mois',
    yearly: n > 1 ? `Tous les ${n} ans` : 'Chaque année',
  }[r.freq]
  const days = r.freq === 'weekly' && r.byweekday?.length ? ` (${[...r.byweekday].sort().map((d) => WEEKDAYS_SHORT[d - 1]).join(' ')})` : ''
  return base + days + (r.until ? `, jusqu’au ${new Date(`${r.until}T12:00:00`).toLocaleDateString('fr-FR')}` : '')
}

/**
 * Répétition d'une tâche : une fois terminée, la suivante est créée
 * automatiquement (voir la migration recurring_tasks).
 */
export function RecurrencePicker({ value, onChange }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void }) {
  const set = (patch: Partial<Recurrence>) => {
    if (!value) return
    const next: Recurrence = { ...value, ...patch }
    if (!next.interval || next.interval <= 1) delete next.interval
    if (!next.byweekday?.length || next.freq !== 'weekly') delete next.byweekday
    if (!next.until) delete next.until
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {FREQS.map(([f, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={(value?.freq ?? null) === f}
            className={chip((value?.freq ?? null) === f)}
            onClick={() => onChange(f ? { freq: f, ...(value?.interval ? { interval: value.interval } : {}) } : null)}
          >
            {label}
          </button>
        ))}
      </div>
      {value && (
        <div className="space-y-2 rounded-lg bg-surface-2/60 p-2">
          <label className="flex flex-wrap items-center gap-2">
            <span>Tous les</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={value.interval ?? 1}
              onChange={(e) => set({ interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
              className="min-h-11 w-20 rounded-lg border border-line bg-surface px-3"
            />
            <span>{UNIT[value.freq]}</span>
          </label>
          {value.freq === 'weekly' && (
            <div className="grid grid-cols-7 gap-1" aria-label="Jours de la semaine">
              {WEEKDAYS_SHORT.map((d, i) => {
                const iso = i + 1
                const on = value.byweekday?.includes(iso) ?? false
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ byweekday: on ? value.byweekday!.filter((x) => x !== iso) : [...(value.byweekday ?? []), iso] })}
                    className={`min-h-11 rounded-lg border ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface'}`}
                  >
                    {d.slice(0, 2)}
                  </button>
                )
              })}
            </div>
          )}
          <label className="flex flex-wrap items-center gap-2">
            <span>Jusqu’au (facultatif)</span>
            <input
              type="date"
              value={value.until ?? ''}
              onChange={(e) => set({ until: e.target.value || undefined })}
              className="min-h-11 rounded-lg border border-line bg-surface px-3"
            />
          </label>
          <p className="text-sm text-muted">
            {recurrenceSummary(value)}. Quand vous terminez la tâche, la suivante est créée automatiquement (sous-tâches remises à zéro).
          </p>
        </div>
      )}
    </div>
  )
}
