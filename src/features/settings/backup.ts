/**
 * Sauvegarde complète des données de l'utilisateur :
 * - fichier JSON avec toutes les tables (restaurable plus tard) ;
 * - tableau des tâches (CSV lisible par Excel / LibreOffice / Sheets).
 * Les fichiers joints eux-mêmes restent dans Supabase Storage (seules leurs
 * informations sont incluses).
 */
import { supabase, unwrap } from '@/lib/supabase'
import { format } from 'date-fns'
import { toParis } from '@/lib/dates'
import { PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/meta'
import type { Priority, TaskStatus } from '@/types/domain'

const TABLES = [
  'settings',
  'tasks',
  'subtasks',
  'tags',
  'task_tags',
  'contacts',
  'task_contacts',
  'links',
  'attachments',
  'reminders',
  'time_entries',
  'task_templates',
] as const

const PAGE = 1000 // limite par requête de Supabase

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const page = unwrap<Record<string, unknown>[]>(await supabase.from(table).select('*').range(from, from + PAGE - 1))
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

export async function buildJsonBackup(onProgress?: (table: string) => void) {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    onProgress?.(t)
    data[t] = await fetchAll(t)
  }
  return {
    app: 'Mes tâches',
    version: __APP_VERSION__,
    exported_at: new Date().toISOString(),
    note: 'Sauvegarde complète. Les fichiers joints restent dans Supabase Storage (seules leurs informations sont ici).',
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    data,
  }
}

type Row = Record<string, unknown>

/** Champ CSV : guillemets doublés, entouré de guillemets si besoin. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Tableau des tâches (séparateur ";" et BOM : ouverture directe dans Excel en français). */
/** Date lisible par Excel (format français), en heure de Paris. */
const cellDate = (iso: string, withTime = true) => format(toParis(iso), withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy')

export function buildTasksCsv(data: Record<string, unknown[]>): string {
  const tasks = data.tasks as Row[]
  const tags = new Map((data.tags as Row[]).map((t) => [t.id, String(t.name)]))
  const tagsOf = new Map<unknown, string[]>()
  for (const tt of data.task_tags as Row[]) tagsOf.set(tt.task_id, [...(tagsOf.get(tt.task_id) ?? []), tags.get(tt.tag_id) ?? ''])
  const subs = new Map<unknown, { done: number; total: number }>()
  for (const s of data.subtasks as Row[]) {
    const c = subs.get(s.task_id) ?? { done: 0, total: 0 }
    c.total++
    if (s.done) c.done++
    subs.set(s.task_id, c)
  }
  const minutes = new Map<unknown, number>()
  for (const e of data.time_entries as Row[]) {
    if (!e.ended_at) continue
    const m = (new Date(String(e.ended_at)).getTime() - new Date(String(e.started_at)).getTime()) / 60000
    minutes.set(e.task_id, (minutes.get(e.task_id) ?? 0) + m)
  }

  const header = ['Titre', 'Statut', 'Priorité', 'Échéance', 'Adresse', 'Étiquettes', 'Sous-tâches', 'Temps passé (h)', 'Description', 'Créée le', 'Terminée le', 'Dans la corbeille']
  const lines = [header.map(cell).join(';')]
  for (const t of [...tasks].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const s = subs.get(t.id)
    lines.push(
      [
        t.title,
        STATUS_LABEL[t.status as TaskStatus] ?? t.status,
        PRIORITY_LABEL[t.priority as Priority] ?? t.priority,
        t.due_at ? cellDate(String(t.due_at), Boolean(t.due_has_time)) : '',
        t.address,
        (tagsOf.get(t.id) ?? []).join(', '),
        s ? `${s.done}/${s.total}` : '',
        minutes.get(t.id) ? (minutes.get(t.id)! / 60).toFixed(2).replace('.', ',') : '',
        t.description,
        t.created_at ? cellDate(String(t.created_at)) : '',
        t.completed_at ? cellDate(String(t.completed_at)) : '',
        t.deleted_at ? 'oui' : '',
      ]
        .map(cell)
        .join(';'),
    )
  }
  return '﻿' + lines.join('\r\n')
}

/**
 * Remet le fichier à l'utilisateur : sur téléphone, feuille de partage
 * (Enregistrer dans Fichiers, Drive, email…) ; sur PC, téléchargement.
 */
export async function deliverFile(file: File) {
  const touch = navigator.maxTouchPoints > 0
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const backupFileName = (ext: 'json' | 'csv') =>
  `mes-taches-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })}.${ext}`
