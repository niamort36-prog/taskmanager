/**
 * Préparation d'un export lisible des tâches (impression, PDF, partage) :
 * sélection, regroupement et version texte. Fonctions pures, sans UI.
 */
import { dueBucket, formatDue, nowParis } from '@/lib/dates'
import { applyFilters, sortTasks, type TaskFilters } from '@/features/tasks/filters'
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/features/tasks/meta'
import type { Tag, TaskListItem } from '@/types/domain'

export type Scope = 'open' | 'today' | 'week' | 'filters' | 'all'
export type GroupBy = 'due' | 'status' | 'priority' | 'tag'

export interface ExportOptions {
  scope: Scope
  groupBy: GroupBy
  subtasks: boolean
  description: boolean
  notes: boolean
  contacts: boolean
}

/** Détails chargés pour l'export (sous-tâches complètes, contacts). */
export interface ExportExtras {
  subtasks: { title: string; done: boolean; due_at: string | null }[]
  contacts: { name: string; role: string; phone: string; email: string }[]
}

export interface ExportTask extends TaskListItem {
  extras?: ExportExtras
}

export interface ExportGroup {
  title: string
  tasks: ExportTask[]
}

export const SCOPE_LABEL: Record<Scope, string> = {
  open: 'Tâches en cours',
  today: 'Retards et aujourd’hui',
  week: '7 prochains jours (et retards)',
  filters: 'Filtres de la liste',
  all: 'Toutes, y compris terminées',
}

export const GROUP_LABEL: Record<GroupBy, string> = {
  due: 'Échéance',
  status: 'Statut',
  priority: 'Priorité',
  tag: 'Étiquette',
}

export function selectTasks(tasks: TaskListItem[], scope: Scope, listFilters: TaskFilters | null): TaskListItem[] {
  const now = nowParis()
  const open = tasks.filter((t) => t.status !== 'done')
  switch (scope) {
    case 'all':
      return tasks
    case 'open':
      return open
    case 'today':
      return open.filter((t) => ['overdue', 'today'].includes(dueBucket(t.due_at, now)))
    case 'week':
      return open.filter((t) => ['overdue', 'today', 'week'].includes(dueBucket(t.due_at, now)))
    case 'filters':
      return listFilters ? applyFilters(tasks, listFilters) : open
  }
}

const DUE_GROUPS = [
  ['overdue', 'En retard'],
  ['today', 'Aujourd’hui'],
  ['week', '7 prochains jours'],
  ['later', 'Plus tard'],
  ['none', 'Sans échéance'],
] as const

export function groupTasks(tasks: ExportTask[], by: GroupBy, tags: Map<string, Tag>): ExportGroup[] {
  const sorted = sortTasks(tasks)
  const groups: ExportGroup[] = []
  const push = (title: string, list: ExportTask[]) => list.length && groups.push({ title, tasks: list })
  const now = nowParis()

  if (by === 'due') {
    const open = sorted.filter((t) => t.status !== 'done')
    for (const [key, title] of DUE_GROUPS) push(title, open.filter((t) => dueBucket(t.due_at, now) === key))
    push('Terminées', sorted.filter((t) => t.status === 'done'))
  } else if (by === 'status') {
    for (const s of STATUS_ORDER) push(STATUS_LABEL[s], sorted.filter((t) => t.status === s))
  } else if (by === 'priority') {
    for (const p of PRIORITIES) push(`Priorité ${PRIORITY_LABEL[p].toLowerCase()}`, sorted.filter((t) => t.priority === p))
  } else {
    // Une tâche peut apparaître sous plusieurs étiquettes.
    const named = [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    for (const tag of named) push(tag.name, sorted.filter((t) => t.tag_ids.includes(tag.id)))
    push('Sans étiquette', sorted.filter((t) => !t.tag_ids.some((id) => tags.has(id))))
  }
  return groups
}

/** Ligne de détails : échéance, priorité, statut, étiquettes. */
export function metaLine(t: ExportTask, tags: Map<string, Tag>): string {
  const parts: string[] = []
  if (t.due_at) parts.push(`échéance ${formatDue(t.due_at, t.due_has_time).toLowerCase()}`)
  if (t.priority >= 3) parts.push(`priorité ${PRIORITY_LABEL[t.priority].toLowerCase()}`)
  if (t.status !== 'todo') parts.push(STATUS_LABEL[t.status].toLowerCase())
  const tagNames = t.tag_ids.map((id) => tags.get(id)?.name).filter(Boolean)
  if (tagNames.length) parts.push(tagNames.join(', '))
  return parts.join(' · ')
}

/** Markdown simplifié en texte brut (pour l'impression et le partage). */
export const plainNotes = (md: string) =>
  md
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .replace(/^\s*[-*] \[x\]\s*/gim, '☑ ')
    .replace(/^\s*[-*] \[ \]\s*/gm, '☐ ')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim()

/** Version texte, pour un partage par SMS, WhatsApp, email… */
export function exportText(groups: ExportGroup[], o: ExportOptions, tags: Map<string, Tag>, title: string): string {
  const lines: string[] = [title, '']
  for (const g of groups) {
    lines.push(`${g.title.toUpperCase()} (${g.tasks.length})`)
    for (const t of g.tasks) {
      const meta = metaLine(t, tags)
      lines.push(`${t.status === 'done' ? '☑' : '☐'} ${t.title}${meta ? ` — ${meta}` : ''}`)
      if (o.description && t.description.trim()) lines.push(`   ${t.description.trim().replace(/\n+/g, ' ')}`)
      if (o.subtasks)
        for (const s of t.extras?.subtasks ?? [])
          lines.push(`   ${s.done ? '☑' : '☐'} ${s.title}${s.due_at ? ` (${formatDue(s.due_at, false).toLowerCase()})` : ''}`)
      if (o.contacts)
        for (const c of t.extras?.contacts ?? [])
          lines.push(`   👤 ${c.name}${c.role ? ` (${c.role})` : ''}${c.phone ? ` — ${c.phone}` : ''}`)
      if (o.notes && t.notes_md.trim()) lines.push(...plainNotes(t.notes_md).split('\n').map((l) => `   ${l}`))
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}
