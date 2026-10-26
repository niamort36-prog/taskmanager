import { useState } from 'react'
import { Database, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/dates'
import { backupFileName, buildJsonBackup, buildTasksCsv, deliverFile } from './backup'

const LAST_KEY = 'backup.last'

const readLast = () => {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

/** Réglages → Données : sauvegarde complète (JSON) et tableau des tâches (CSV). */
export function BackupCard() {
  const toast = useToast()
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const [step, setStep] = useState('')
  const [last, setLast] = useState(readLast)

  const run = async (kind: 'json' | 'csv') => {
    setBusy(kind)
    try {
      const backup = await buildJsonBackup(setStep)
      const file =
        kind === 'json'
          ? new File([JSON.stringify(backup, null, 2)], backupFileName('json'), { type: 'application/json' })
          : new File([buildTasksCsv(backup.data)], backupFileName('csv'), { type: 'text/csv;charset=utf-8' })
      await deliverFile(file)
      const now = new Date().toISOString()
      try {
        localStorage.setItem(LAST_KEY, now)
      } catch {
        /* ignore */
      }
      setLast(now)
      const n = backup.counts.tasks
      toast(kind === 'json' ? `Sauvegarde prête (${n} tâches)` : `Tableau prêt (${n} tâches)`)
    } catch (e) {
      toast(`Sauvegarde impossible : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
      setStep('')
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="font-semibold">Sauvegarder mes données</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void run('json')}
          disabled={busy !== null}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-accent px-2 text-accent disabled:opacity-50"
        >
          {busy === 'json' ? <Loader2 className="size-5 animate-spin" /> : <Database className="size-5" />}
          Fichier complet
        </button>
        <button
          onClick={() => void run('csv')}
          disabled={busy !== null}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-line px-2 disabled:opacity-50"
        >
          {busy === 'csv' ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
          Tableau Excel
        </button>
      </div>
      <p className="text-sm text-muted">
        {busy
          ? `Lecture : ${step}…`
          : 'Fichier complet : tout (tâches, sous-tâches, contacts, rappels, temps passé, modèles). Tableau : une ligne par tâche, à ouvrir dans Excel. Les fichiers joints restent stockés en ligne.'}
      </p>
      {last && !busy && <p className="text-sm text-muted">Dernière sauvegarde sur cet appareil : {formatDateTime(last)}</p>}
    </div>
  )
}
