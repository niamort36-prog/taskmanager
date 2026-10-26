import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { qk } from '@/lib/queryClient'
import { functionUrl, supabase, unwrap } from '@/lib/supabase'
import type { Settings } from '@/types/domain'
import { useUpdateSettings } from './api'

/**
 * Abonnement agenda : un lien secret (ICS) que Google Agenda, l'iPhone ou
 * Outlook relisent régulièrement. Les tâches avec échéance y apparaissent.
 */
export function CalendarFeedCard({ settings }: { settings: Settings | undefined }) {
  const qc = useQueryClient()
  const toast = useToast()
  const update = useUpdateSettings()
  const [busy, setBusy] = useState(false)
  if (!settings) return null

  const token = settings.calendar_token
  const https = token ? `${functionUrl('calendar')}?token=${token}` : ''
  const webcal = https.replace(/^https?:/, 'webcal:')

  const rotate = async () => {
    if (token && !confirm('Créer un nouveau lien ? L’ancien cessera de fonctionner dans les agendas déjà abonnés.')) return
    setBusy(true)
    try {
      const t = unwrap<string>(await supabase.rpc('rotate_calendar_token'))
      qc.setQueryData<Settings>(qk.settings, (s) => (s ? { ...s, calendar_token: t } : s))
      toast(token ? 'Nouveau lien créé' : 'Lien d’abonnement créé')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      toast('Lien copié')
    } catch {
      toast('Copie impossible')
    }
  }

  const btn = 'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3'

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2 font-semibold">
        <CalendarPlus className="size-5 text-accent" /> Abonnement agenda
      </div>
      <p className="text-muted">
        Vos tâches avec échéance apparaissent dans Google Agenda, le Calendrier de l’iPhone ou Outlook, et se mettent à jour
        toutes seules.
      </p>
      {!token ? (
        <button disabled={busy} onClick={() => void rotate()} className={`${btn} w-full border-accent text-accent disabled:opacity-50`}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <CalendarPlus className="size-5" />}
          Créer mon lien d’abonnement
        </button>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            <a
              href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} border-accent bg-accent font-semibold text-accent-fg`}
            >
              Ajouter à Google Agenda
            </a>
            <a href={webcal} className={`${btn} border-accent text-accent`}>
              iPhone, Mac ou Outlook
            </a>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void copy()} className={`${btn} border-line`}>
                <Copy className="size-5" /> Copier le lien
              </button>
              <button disabled={busy} onClick={() => void rotate()} className={`${btn} border-line disabled:opacity-50`}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} Nouveau lien
              </button>
            </div>
          </div>
          <p className="text-sm text-muted">
            Ce lien est personnel : toute personne qui l’a peut voir vos tâches. Google Agenda se met à jour avec un délai
            (jusqu’à quelques heures) ; l’iPhone toutes les heures environ.
          </p>
          <button
            onClick={() => confirm('Désactiver le lien ? Les agendas abonnés ne recevront plus vos tâches.') && update.mutate({ calendar_token: null })}
            className="min-h-11 text-danger"
          >
            Désactiver l’abonnement
          </button>
        </>
      )}
    </div>
  )
}
