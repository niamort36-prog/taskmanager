import { dateShortcuts, fromInputValue, toInputValue, type Due } from '@/lib/dates'

interface Props {
  value: Due
  onChange: (v: Due) => void
}

/**
 * Saisie d'échéance : raccourcis en un tap + sélecteur natif du téléphone
 * (type="date" ou "datetime-local" selon que l'heure est précisée).
 */
export function DueField({ value, onChange }: Props) {
  const withTime = value.due_has_time
  const shortcuts = dateShortcuts()

  return (
    <div className="space-y-2">
      <DateChips onPick={onChange} shortcuts={shortcuts} current={value} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          key={withTime ? 'dt' : 'd'}
          type={withTime ? 'datetime-local' : 'date'}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3"
          value={value.due_at ? toInputValue(value.due_at, withTime) : ''}
          onChange={(e) => {
            const v = fromInputValue(e.target.value, withTime)
            onChange(v ?? { due_at: null, due_has_time: false })
          }}
          aria-label="Échéance"
        />
        <label className="flex min-h-11 items-center gap-2 px-1">
          <input
            type="checkbox"
            className="size-5 accent-[var(--accent)]"
            checked={withTime}
            onChange={(e) => {
              const on = e.target.checked
              if (!value.due_at) return onChange({ due_at: null, due_has_time: on })
              // On garde le jour ; sans heure => 23:59, avec heure => 9:00 par défaut.
              const day = toInputValue(value.due_at, false)
              onChange(fromInputValue(on ? `${day}T09:00` : day, on)!)
            }}
          />
          Heure
        </label>
        {value.due_at && (
          <button
            type="button"
            className="tap rounded-lg px-3 text-muted underline"
            onClick={() => onChange({ due_at: null, due_has_time: false })}
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}

export function DateChips({
  onPick,
  shortcuts = dateShortcuts(),
  current,
}: {
  onPick: (v: Due) => void
  shortcuts?: ReturnType<typeof dateShortcuts>
  /** Échéance actuelle : le raccourci correspondant est mis en évidence. */
  current?: Due
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {shortcuts.map((s) => {
        // Comparaison par timestamp : Postgres renvoie "+00:00", toISOString() renvoie "Z".
        const on =
          Boolean(current?.due_at) &&
          new Date(current!.due_at!).getTime() === new Date(s.value.due_at!).getTime() &&
          current!.due_has_time === s.value.due_has_time
        return (
          <button
            key={s.label}
            type="button"
            aria-pressed={on}
            className={`min-h-11 rounded-full border px-4 ${
              on ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2 active:bg-line'
            }`}
            onClick={() => onPick(s.value)}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
