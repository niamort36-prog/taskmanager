import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Bell, BellOff, BellPlus, Trash2 } from 'lucide-react'
import { addDays, nextMonday } from 'date-fns'
import { fromInputValue, inTz, nowParis, timedDue, toInputValue, toParis } from '@/lib/dates'
import { getPushStatus, type PushStatus } from '@/lib/push'
import type { NotifyChannel, Recurrence, Reminder, Subtask } from '@/types/domain'
import { useReminderMutations, useReminders, type ReminderInput } from './api'
import { CHANNEL_LABEL, reminderLabel, reminderStatus, WEEKDAYS_SHORT } from './describe'

interface Props {
  taskId: string
  taskDue: string | null
  subtasks: Pick<Subtask, 'id' | 'title' | 'due_at'>[]
}

/** Statut des notifications push sur cet appareil (pour afficher un conseil). */
function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  useEffect(() => {
    void getPushStatus().then(setStatus)
  }, [])
  return status
}

export function RemindersSection({ taskId, taskDue, subtasks }: Props) {
  const { data: reminders = [] } = useReminders(taskId)
  const { setActive, remove } = useReminderMutations(taskId)
  const [adding, setAdding] = useState(false)
  const push = usePushStatus()
  const subtaskTitle = (id: string | null) => subtasks.find((s) => s.id === id)?.title

  return (
    <div className="space-y-2">
      {reminders.length > 0 && (
        <ul className="space-y-1">
          {reminders.map((r) => (
            <ReminderItem
              key={r.id}
              r={r}
              target={subtaskTitle(r.subtask_id)}
              onToggle={() => setActive.mutate({ id: r.id, active: !r.active })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </ul>
      )}

      {push && push !== 'on' && reminders.some((r) => r.channels.includes('push')) && (
        <p className="rounded-lg bg-warning/10 p-2 text-warning">
          Les notifications push ne sont pas activées sur cet appareil.{' '}
          <Link to="/settings" className="underline">
            Les activer
          </Link>
        </p>
      )}

      {adding ? (
        <ReminderForm taskId={taskId} taskDue={taskDue} subtasks={subtasks} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
        >
          <BellPlus className="size-5" /> Ajouter un rappel
        </button>
      )}
    </div>
  )
}

function ReminderItem({ r, target, onToggle, onDelete }: { r: Reminder; target?: string; onToggle: () => void; onDelete: () => void }) {
  const status = reminderStatus(r)
  return (
    <li className={`flex items-center gap-1 rounded-lg bg-surface-2/60 ${r.active ? '' : 'opacity-60'}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`tap shrink-0 ${r.active ? 'text-accent' : 'text-muted'}`}
        aria-label={r.active ? 'Désactiver le rappel' : 'Réactiver le rappel'}
        aria-pressed={r.active}
      >
        {r.active ? <Bell className="size-5" /> : <BellOff className="size-5" />}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <div className="break-words">
          {target && <span className="text-muted">{target} · </span>}
          {reminderLabel(r)}
        </div>
        <div className="text-muted">
          {r.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}
          {r.ignore_dnd && ' · ignore « ne pas déranger »'}
          {' · '}
          <span className={status.tone === 'ok' ? 'text-fg' : ''}>{status.text}</span>
        </div>
      </div>
      <button type="button" className="tap shrink-0 text-muted" onClick={onDelete} aria-label="Supprimer le rappel">
        <Trash2 className="size-5" />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------

const RELATIVE_PRESETS = [0, -15, -60, -180, -1440, -2880, -10080]
const UNITS = { min: 1, h: 60, j: 1440, sem: 10080 } as const
type Unit = keyof typeof UNITS
type Repeat = 'none' | Recurrence['freq']

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 ${on ? 'border-accent bg-accent font-semibold text-accent-fg' : 'border-line bg-surface-2'}`

/** Raccourcis d'heure pour un rappel à date précise. */
function absoluteShortcuts() {
  const now = nowParis()
  const inOneHour = new Date(now.getTime() + 3600_000)
  inOneHour.setSeconds(0, 0)
  const list = [{ label: 'Dans 1 h', iso: inOneHour.toISOString() }]
  if (toParis(now.toISOString()).getHours() < 19) list.push({ label: 'Ce soir 19h', iso: timedDue(now, 19).due_at! })
  list.push({ label: 'Demain 8h', iso: timedDue(addDays(now, 1, { in: inTz }), 8).due_at! })
  list.push({ label: 'Lundi 8h', iso: timedDue(nextMonday(now, { in: inTz }), 8).due_at! })
  return list
}

function ReminderForm({ taskId, taskDue, subtasks, onDone }: Props & { onDone: () => void }) {
  const { create } = useReminderMutations(taskId)
  const [target, setTarget] = useState<string>('') // '' = la tâche, sinon id de sous-tâche
  const targetDue = target ? (subtasks.find((s) => s.id === target)?.due_at ?? null) : taskDue
  const [mode, setMode] = useState<'absolute' | 'relative'>(targetDue ? 'relative' : 'absolute')
  const [remindAt, setRemindAt] = useState<string>(() => absoluteShortcuts()[0].iso)
  const [offset, setOffset] = useState(-60)
  const [custom, setCustom] = useState<{ value: number; unit: Unit } | null>(null)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [every, setEvery] = useState(1)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [until, setUntil] = useState('')
  const [channels, setChannels] = useState<NotifyChannel[]>(['push'])
  const [ignoreDnd, setIgnoreDnd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveMode = targetDue ? mode : 'absolute'
  const effectiveOffset = custom ? -Math.abs(custom.value) * UNITS[custom.unit] : offset

  const submit = async () => {
    setError(null)
    if (!channels.length) return setError('Choisissez au moins un canal.')
    let input: ReminderInput
    if (effectiveMode === 'relative') {
      if (new Date(targetDue!).getTime() + effectiveOffset * 60_000 < Date.now())
        return setError('Ce moment est déjà passé pour l’échéance actuelle.')
      input = { subtask_id: target || null, mode: 'relative', remind_at: null, offset_minutes: effectiveOffset, recurrence: null, channels, ignore_dnd: ignoreDnd }
    } else {
      if (repeat === 'none' && new Date(remindAt).getTime() < Date.now()) return setError('Choisissez un moment dans le futur.')
      const recurrence: Recurrence | null =
        repeat === 'none'
          ? null
          : {
              freq: repeat,
              ...(every > 1 ? { interval: every } : {}),
              ...(repeat === 'weekly' && weekdays.length ? { byweekday: [...weekdays].sort() } : {}),
              ...(until ? { until } : {}),
            }
      input = { subtask_id: target || null, mode: 'absolute', remind_at: remindAt, offset_minutes: null, recurrence, channels, ignore_dnd: ignoreDnd }
    }
    try {
      await create.mutateAsync(input)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-accent p-3">
      {subtasks.length > 0 && (
        <label className="block space-y-1">
          <span className="font-medium">Pour</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
          >
            <option value="">La tâche</option>
            {subtasks.map((s) => (
              <option key={s.id} value={s.id}>
                Sous-tâche : {s.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(['relative', 'absolute'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={effectiveMode === m}
            disabled={m === 'relative' && !targetDue}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-lg px-2 disabled:opacity-40 ${effectiveMode === m ? 'bg-accent font-semibold text-accent-fg' : ''}`}
          >
            {m === 'relative' ? 'Avant l’échéance' : 'À une date'}
          </button>
        ))}
      </div>
      {!targetDue && <p className="text-muted">Pas d’échéance : seul un rappel à date précise est possible.</p>}

      {effectiveMode === 'relative' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {RELATIVE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={chip(!custom && offset === p)}
                onClick={() => {
                  setCustom(null)
                  setOffset(p)
                }}
              >
                {p === 0 ? 'À l’échéance' : offsetShort(p)}
              </button>
            ))}
            <button type="button" className={chip(Boolean(custom))} onClick={() => setCustom(custom ?? { value: 2, unit: 'h' })}>
              Autre…
            </button>
          </div>
          {custom && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={custom.value}
                onChange={(e) => setCustom({ ...custom, value: Math.max(1, Number(e.target.value) || 1) })}
                className="min-h-11 w-24 rounded-lg border border-line bg-surface-2 px-3"
                aria-label="Durée"
              />
              <select
                value={custom.unit}
                onChange={(e) => setCustom({ ...custom, unit: e.target.value as Unit })}
                className="min-h-11 rounded-lg border border-line bg-surface-2 px-3"
                aria-label="Unité"
              >
                <option value="min">minutes</option>
                <option value="h">heures</option>
                <option value="j">jours</option>
                <option value="sem">semaines</option>
              </select>
              <span>avant</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {absoluteShortcuts().map((s) => (
              <button key={s.label} type="button" className={chip(s.iso === remindAt)} onClick={() => setRemindAt(s.iso)}>
                {s.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={toInputValue(remindAt, true)}
            onChange={(e) => {
              const d = fromInputValue(e.target.value, true)
              if (d?.due_at) setRemindAt(d.due_at)
            }}
            className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
            aria-label="Date et heure du rappel"
          />

          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Répéter</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['none', 'Jamais'],
                  ['daily', 'Chaque jour'],
                  ['weekly', 'Chaque semaine'],
                  ['monthly', 'Chaque mois'],
                  ['yearly', 'Chaque année'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" className={chip(repeat === v)} onClick={() => setRepeat(v)}>
                  {label}
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <div className="space-y-2">
                <label className="flex flex-wrap items-center gap-2">
                  <span>Tous les</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    value={every}
                    onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
                    className="min-h-11 w-20 rounded-lg border border-line bg-surface-2 px-3"
                  />
                  <span>{{ daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois', yearly: 'an(s)' }[repeat]}</span>
                </label>
                {repeat === 'weekly' && (
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS_SHORT.map((d, i) => {
                      const iso = i + 1
                      const on = weekdays.includes(iso)
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== iso) : [...weekdays, iso])}
                          className={`min-h-11 rounded-lg border ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2'}`}
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
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="min-h-11 rounded-lg border border-line bg-surface-2 px-3"
                  />
                </label>
              </div>
            )}
          </fieldset>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Canaux</legend>
        <div className="flex flex-wrap gap-2">
          {(['push', 'email', 'sms'] as const).map((c) => {
            const on = channels.includes(c)
            const soon = c !== 'push'
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={soon}
                onClick={() => setChannels(on ? channels.filter((x) => x !== c) : [...channels, c])}
                className={`${chip(on)} disabled:opacity-40`}
              >
                {CHANNEL_LABEL[c]}
                {soon && ' (phase 4)'}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={ignoreDnd}
          onChange={(e) => setIgnoreDnd(e.target.checked)}
        />
        Envoyer même pendant « ne pas déranger »
      </label>

      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={create.isPending}
          className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-50"
        >
          Ajouter le rappel
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-line px-4">
          Annuler
        </button>
      </div>
    </div>
  )
}

/** -2880 -> "2 j avant" */
function offsetShort(m: number): string {
  const a = Math.abs(m)
  if (a % 10080 === 0) return `${a / 10080} sem. avant`
  if (a % 1440 === 0) return `${a / 1440} j avant`
  if (a % 60 === 0) return `${a / 60} h avant`
  return `${a} min avant`
}
