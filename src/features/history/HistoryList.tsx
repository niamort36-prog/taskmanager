import { useQuery } from '@tanstack/react-query'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { formatDateTime, formatDue } from '@/lib/dates'
import type { HistoryEntry } from '@/types/domain'
import { PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/meta'

const FIELD_LABEL: Record<string, string> = {
  title: 'titre',
  description: 'description',
  notes_md: 'notes',
  status: 'statut',
  priority: 'priorité',
  due_at: 'échéance',
  due_has_time: 'heure d’échéance',
  deleted_at: 'suppression',
  done: 'état',
}

function formatValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v)
  if (field === 'priority') return PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL] ?? String(v)
  if (field === 'due_at' && typeof v === 'string') return formatDue(v, true)
  if (field === 'done') return v ? 'cochée' : 'décochée'
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

/** Transforme une entrée brute en phrases lisibles. */
function describe(e: HistoryEntry): string[] {
  const c = e.changes as Record<string, { old: unknown; new: unknown }>
  if (e.entity === 'tag') {
    const name = (e.changes as { name?: string }).name ?? '?'
    return [e.action === 'insert' ? `Étiquette « ${name} » ajoutée` : `Étiquette « ${name} » retirée`]
  }
  if (e.entity === 'subtask') {
    if (e.action === 'insert') return [`Sous-tâche ajoutée : ${formatValue('title', c.title?.new)}`]
    if (e.action === 'delete') return [`Sous-tâche supprimée : ${formatValue('title', c.title?.old)}`]
    return Object.entries(c).map(([k, v]) => `Sous-tâche : ${FIELD_LABEL[k] ?? k} → ${formatValue(k, v.new)}`)
  }
  if (e.action === 'insert') return ['Tâche créée']
  return Object.entries(c).map(([k, v]) => {
    if (k === 'deleted_at') return v.new ? 'Tâche supprimée' : 'Tâche restaurée'
    if (k === 'description' || k === 'notes_md') return `${FIELD_LABEL[k]} modifiée`
    return `${FIELD_LABEL[k] ?? k} : ${formatValue(k, v.old)} → ${formatValue(k, v.new)}`
  })
}

export function HistoryList({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.history(taskId),
    queryFn: async () =>
      unwrap<HistoryEntry[]>(
        await supabase
          .from('task_history')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
  })

  if (isLoading) return <p className="text-muted">Chargement…</p>
  if (!data?.length) return <p className="text-muted">Aucune modification.</p>

  return (
    <ol className="space-y-3">
      {data.map((e) => (
        <li key={e.id} className="border-l-2 border-line pl-3">
          <div className="text-sm text-muted">{formatDateTime(e.created_at)}</div>
          {describe(e).map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </li>
      ))}
    </ol>
  )
}
