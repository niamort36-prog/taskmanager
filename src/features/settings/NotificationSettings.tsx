import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellRing, CheckCircle2, CircleSlash, Loader2, Share, XCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { CHANNEL_LABEL } from '@/features/reminders/describe'
import { formatDateTime } from '@/lib/dates'
import { disablePush, enablePush, getPushStatus, isIos, sendTestNotification, type PushStatus } from '@/lib/push'
import { qk } from '@/lib/queryClient'
import { supabase, unwrap } from '@/lib/supabase'
import type { NotificationLog, Settings } from '@/types/domain'
import { useUpdateSettings } from './api'

const card = 'rounded-xl border border-line bg-surface p-3'

export function NotificationSettings({ settings }: { settings: Settings | undefined }) {
  return (
    <div className="space-y-3">
      <PushDeviceCard />
      <ChannelsCard settings={settings} />
      <DigestCard settings={settings} />
      <DndCard settings={settings} />
      <LogCard />
    </div>
  )
}

/** Activation du push sur CET appareil (un abonnement par navigateur). */
function PushDeviceCard() {
  const toast = useToast()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => void getPushStatus().then(setStatus), [])
  useEffect(refresh, [refresh])

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true)
    try {
      const res = await fn()
      if (okMsg) toast(typeof res === 'string' ? `${okMsg} (${res})` : okMsg)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-accent" /> Notifications push sur cet appareil
      </div>

      {status === null && <p className="text-muted">Vérification…</p>}
      {status === 'unsupported' && <p className="text-muted">Ce navigateur ne gère pas les notifications push.</p>}
      {status === 'not-configured' && (
        <p className="text-warning">Clé VAPID publique absente de ce build : le push n’est pas encore configuré.</p>
      )}
      {status === 'denied' && (
        <p className="text-warning">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (icône à gauche de
          l’adresse, ou Réglages du téléphone), puis revenez ici.
        </p>
      )}
      {status === 'ios-install' && <IosInstallHelp />}

      {(status === 'off' || status === 'on') && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 ${status === 'on' ? 'text-success' : 'text-muted'}`}>
            {status === 'on' ? <CheckCircle2 className="size-5" /> : <CircleSlash className="size-5" />}
            {status === 'on' ? 'Activées' : 'Désactivées'}
          </span>
          <span className="flex-1" />
          {status === 'off' ? (
            <button
              disabled={busy}
              onClick={() => run(enablePush, 'Notifications activées')}
              className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-fg disabled:opacity-50"
            >
              Activer
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                onClick={() => run(() => sendTestNotification('push'), 'Test envoyé')}
                className="min-h-11 rounded-lg border border-accent px-4 text-accent disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : 'Envoyer un test'}
              </button>
              <button disabled={busy} onClick={() => run(disablePush, 'Désactivées sur cet appareil')} className="min-h-11 rounded-lg border border-line px-4">
                Désactiver
              </button>
            </>
          )}
        </div>
      )}
      {!isIos() && status === 'off' && (
        <p className="text-muted">Astuce : installez l’app (menu ⋮ → « Installer l’application ») pour des notifications plus fiables.</p>
      )}
    </div>
  )
}

/** Sur iPhone, le push n'existe que pour une app ajoutée à l'écran d'accueil. */
export function IosInstallHelp() {
  return (
    <div className="space-y-2">
      <p>Sur iPhone, les notifications ne fonctionnent qu’avec l’app installée sur l’écran d’accueil :</p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>
          Dans Safari, touchez <Share className="inline size-5 align-text-bottom" aria-label="Partager" /> (Partager) ;
        </li>
        <li>choisissez « Sur l’écran d’accueil », puis « Ajouter » ;</li>
        <li>ouvrez l’app depuis sa nouvelle icône, reconnectez-vous, puis revenez dans Réglages pour activer les notifications.</li>
      </ol>
      <p className="text-muted">iOS 16.4 ou plus récent est nécessaire.</p>
    </div>
  )
}

function Toggle({ on, onChange, label, disabled, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <label className={`flex min-h-11 items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-[var(--accent)]"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1">
        {label}
        {hint && <span className="block text-muted">{hint}</span>}
      </span>
    </label>
  )
}

function ChannelsCard({ settings }: { settings: Settings | undefined }) {
  const update = useUpdateSettings()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [testing, setTesting] = useState<'email' | 'sms' | null>(null)
  useEffect(() => setEmail(settings?.notify_email ?? ''), [settings?.notify_email])
  if (!settings) return null

  const saveEmail = () => {
    const v = email.trim()
    if (v === (settings.notify_email ?? '')) return
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast('Adresse email invalide')
    // Sans adresse, le canal email est coupé.
    update.mutate(v ? { notify_email: v } : { notify_email: null, email_enabled: false, digest_enabled: false })
  }

  const test = async (channel: 'email' | 'sms') => {
    setTesting(channel)
    try {
      await sendTestNotification(channel)
      toast(channel === 'email' ? 'Email de test envoyé' : 'SMS de test envoyé')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setTesting(null)
    }
  }

  const testBtn = (channel: 'email' | 'sms', enabled: boolean) =>
    enabled && (
      <button
        disabled={testing !== null}
        onClick={() => void test(channel)}
        className="min-h-11 shrink-0 rounded-lg border border-accent px-3 text-accent disabled:opacity-50"
      >
        {testing === channel ? <Loader2 className="size-5 animate-spin" /> : 'Tester'}
      </button>
    )

  return (
    <div className={`${card} space-y-1`}>
      <div className="mb-1 font-semibold">Canaux autorisés</div>
      <Toggle label="Notifications push" on={settings.push_enabled} onChange={(v) => update.mutate({ push_enabled: v })} />

      <label className="block space-y-1 pt-2">
        <span>Adresse pour les emails</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={saveEmail}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="vous@exemple.fr"
          className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
        />
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Toggle
            label="Email"
            on={settings.email_enabled}
            disabled={!settings.notify_email}
            hint={settings.notify_email ? undefined : 'Renseignez d’abord une adresse'}
            onChange={(v) => update.mutate({ email_enabled: v })}
          />
        </div>
        {testBtn('email', settings.email_enabled)}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Toggle
            label="SMS (Free Mobile)"
            on={settings.sms_enabled}
            hint="Envoyé sur votre propre ligne Free Mobile"
            onChange={(v) => update.mutate({ sms_enabled: v })}
          />
        </div>
        {testBtn('sms', settings.sms_enabled)}
      </div>
    </div>
  )
}

/** Récapitulatif quotidien par email (tâches du jour + retards). */
function DigestCard({ settings }: { settings: Settings | undefined }) {
  const update = useUpdateSettings()
  const [time, setTime] = useState('')
  useEffect(() => setTime(settings?.digest_time?.slice(0, 5) ?? '07:30'), [settings?.digest_time])
  if (!settings) return null
  const possible = settings.email_enabled && Boolean(settings.notify_email)
  return (
    <div className={`${card} space-y-2`}>
      <Toggle
        label="Récapitulatif quotidien par email"
        on={settings.digest_enabled && possible}
        disabled={!possible}
        hint={possible ? 'Tâches du jour et retards, une fois par jour (rien n’est envoyé s’il n’y a rien).' : 'Activez d’abord le canal email.'}
        onChange={(v) => update.mutate({ digest_enabled: v })}
      />
      {settings.digest_enabled && possible && (
        <label className="flex items-center gap-2">
          <span>Heure d’envoi</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => time && time !== settings.digest_time?.slice(0, 5) && update.mutate({ digest_time: time })}
            className="min-h-11 rounded-lg border border-line bg-surface-2 px-3"
          />
        </label>
      )}
    </div>
  )
}

function DndCard({ settings }: { settings: Settings | undefined }) {
  const update = useUpdateSettings()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  useEffect(() => {
    setStart(settings?.dnd_start?.slice(0, 5) ?? '')
    setEnd(settings?.dnd_end?.slice(0, 5) ?? '')
  }, [settings?.dnd_start, settings?.dnd_end])
  if (!settings) return null

  const save = (s: string, e: string) => update.mutate({ dnd_start: s || null, dnd_end: e || null })
  const active = Boolean(settings.dnd_start && settings.dnd_end)

  return (
    <div className={`${card} space-y-2`}>
      <div className="font-semibold">Ne pas déranger</div>
      <p className="text-muted">Pendant cette plage, les rappels attendent sa fin (sauf ceux marqués « envoyer quand même »).</p>
      <div className="flex flex-wrap items-center gap-2">
        <span>De</span>
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => save(start, end)}
          className="min-h-11 rounded-lg border border-line bg-surface-2 px-3"
          aria-label="Début de la plage ne pas déranger"
        />
        <span>à</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => save(start, end)}
          className="min-h-11 rounded-lg border border-line bg-surface-2 px-3"
          aria-label="Fin de la plage ne pas déranger"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {!active && (
          <button
            className="min-h-11 rounded-lg border border-line px-4"
            onClick={() => {
              setStart('22:00')
              setEnd('07:00')
              save('22:00', '07:00')
            }}
          >
            22:00 → 07:00
          </button>
        )}
        {active && (
          <button className="min-h-11 rounded-lg border border-line px-4" onClick={() => save('', '')}>
            Désactiver
          </button>
        )}
      </div>
    </div>
  )
}

const STATUS_ICON = {
  sent: <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Envoyé" />,
  failed: <XCircle className="size-5 shrink-0 text-danger" aria-label="Échec" />,
  skipped: <CircleSlash className="size-5 shrink-0 text-muted" aria-label="Ignoré" />,
  sending: <Loader2 className="size-5 shrink-0 animate-spin text-muted" aria-label="En cours" />,
}

/** Derniers envois (journal tenu côté serveur). */
function LogCard() {
  const { data, isLoading } = useQuery({
    queryKey: qk.notificationLogs,
    queryFn: async () =>
      unwrap<(NotificationLog & { task: { title: string } | null })[]>(
        await supabase
          .from('notification_logs')
          .select('*, task:tasks(title)')
          .order('created_at', { ascending: false })
          .limit(20),
      ),
  })
  return (
    <details className={card}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold">Journal des envois</summary>
      {isLoading && <p className="text-muted">Chargement…</p>}
      {data && !data.length && <p className="text-muted">Aucun envoi pour l’instant.</p>}
      <ul className="mt-2 space-y-2">
        {data?.map((l) => (
          <li key={l.id} className="flex gap-2">
            {STATUS_ICON[l.status]}
            <div className="min-w-0">
              <div className="break-words">
                {l.kind === 'test' ? 'Test' : (l.task?.title ?? 'Tâche supprimée')} · {CHANNEL_LABEL[l.channel]}
              </div>
              <div className="text-sm text-muted">
                {formatDateTime(l.sent_at ?? l.created_at)}
                {l.error && ` — ${l.error}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
