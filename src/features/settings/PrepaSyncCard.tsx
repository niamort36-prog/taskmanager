import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HardHat, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { qk } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import type { Settings } from '@/types/domain'
import { useUpdateSettings } from './api'

interface Report {
  found: number
  created: string[]
  updated: string[]
  unchanged: number
  ignored: number
  errors: string[]
}

/**
 * Import des chantiers du Suivi de prépa : chaque chantier en cours dont on
 * est CdT devient une tâche (description, sous-tâches et dates par l'IA).
 */
export function PrepaSyncCard({ settings }: { settings: Settings | undefined }) {
  const update = useUpdateSettings()
  const toast = useToast()
  const qc = useQueryClient()
  const [names, setNames] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => setNames(settings?.prepa_cdt_names ?? ''), [settings?.prepa_cdt_names])
  if (!settings) return null

  const run = async () => {
    setBusy(true)
    setReport(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; report?: Report; error?: string }>('prepa-sync', { body: {} })
      if (error) throw new Error(error.message)
      if (!data?.ok || !data.report) throw new Error(data?.error ?? 'Analyse impossible')
      setReport(data.report)
      if (data.report.created.length || data.report.updated.length) void qc.invalidateQueries({ queryKey: qk.tasks })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2 font-semibold">
        <HardHat className="size-5 text-accent" /> Chantiers du Suivi de prépa
      </div>
      <p className="text-muted">
        Les chantiers en cours de l’équipe {settings.prepa_team} dont vous êtes CdT (ou suppléant) deviennent des tâches : description,
        fin de consignation en échéance, étapes de prépa restantes avec leurs dates butoir. Un chantier n’est importé qu’une fois.
      </p>
      <label className="block space-y-1">
        <span>Votre nom de CdT</span>
        <input
          value={names}
          onChange={(e) => setNames(e.target.value)}
          onBlur={() => names.trim() && names !== settings.prepa_cdt_names && update.mutate({ prepa_cdt_names: names.trim() })}
          placeholder="Roy, Romain"
          className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
        />
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          role="switch"
          className="size-5 accent-[var(--accent)]"
          checked={settings.prepa_enabled}
          onChange={(e) => update.mutate({ prepa_enabled: e.target.checked })}
        />
        <span className="flex-1">
          Analyse automatique chaque mois
          <span className="block text-muted">Le 1er du mois vers 6 h.</span>
        </span>
      </label>
      <button
        disabled={busy}
        onClick={() => void run()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <HardHat className="size-5" />}
        {busy ? 'Analyse des chantiers…' : 'Analyser maintenant'}
      </button>
      {report && <ReportView r={report} />}
    </div>
  )
}

function ReportView({ r }: { r: Report }) {
  if (!r.found) return <p className="text-muted">Aucun chantier en cours à votre nom.</p>
  return (
    <div className="space-y-1 rounded-lg bg-surface-2 p-3" aria-live="polite">
      <p>
        {r.found} chantier{r.found > 1 ? 's' : ''} en cours à votre nom.
      </p>
      {r.created.length > 0 && (
        <div>
          <p className="font-semibold text-success">
            {r.created.length} tâche{r.created.length > 1 ? 's' : ''} créée{r.created.length > 1 ? 's' : ''} :
          </p>
          <ul className="list-disc pl-5">
            {r.created.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {r.updated.length > 0 && <p>Fin de consignation mise à jour : {r.updated.join(', ')}</p>}
      {r.unchanged > 0 && <p className="text-muted">{r.unchanged} déjà importé{r.unchanged > 1 ? 's' : ''}, sans changement.</p>}
      {r.ignored > 0 && <p className="text-muted">{r.ignored} ignoré{r.ignored > 1 ? 's' : ''} (tâche supprimée).</p>}
      {r.errors.map((e) => (
        <p key={e} className="text-danger">
          {e}
        </p>
      ))}
    </div>
  )
}
