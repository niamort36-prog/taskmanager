import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Link2, Pencil, Trash2 } from 'lucide-react'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Link } from '@/types/domain'

/** Ajoute https:// si l'utilisateur a tapé "exemple.fr". */
export function normalizeUrl(raw: string): string {
  const u = raw.trim()
  if (!u) return u
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`
}

/** Libellé de repli : le nom de domaine. */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function useLinks(taskId: string) {
  const qc = useQueryClient()
  const key = qk.links(taskId)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.history(taskId) })
  }
  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap<Link[]>(await supabase.from('links').select('*').eq('task_id', taskId).order('position').order('created_at')),
  })
  const save = useMutation({
    mutationFn: async ({ id, url, label }: { id?: string; url: string; label: string }) => {
      const row = { url: normalizeUrl(url), label: label.trim() }
      if (id) unwrap(await supabase.from('links').update(row).eq('id', id))
      else unwrap(await supabase.from('links').insert({ ...row, task_id: taskId, position: list.data?.length ?? 0 }))
    },
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('links').delete().eq('id', id))
    },
    onMutate: (id) => qc.setQueryData<Link[]>(key, (l) => l?.filter((x) => x.id !== id)),
    onSettled: refresh,
  })
  return { list, save, remove }
}

export function LinksSection({ taskId }: { taskId: string }) {
  const { list, save, remove } = useLinks(taskId)
  const [editing, setEditing] = useState<Link | 'new' | null>(null)

  return (
    <div className="space-y-2">
      {!!list.data?.length && (
        <ul className="space-y-1">
          {list.data.map((l) =>
            editing !== 'new' && editing?.id === l.id ? (
              <li key={l.id}>
                <LinkForm initial={l} onCancel={() => setEditing(null)} onSave={(v) => (save.mutate({ id: l.id, ...v }), setEditing(null))} />
              </li>
            ) : (
              <li key={l.id} className="flex items-center gap-1 rounded-lg bg-surface-2/60">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-1"
                >
                  <ExternalLink className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block truncate">{l.label || hostOf(l.url)}</span>
                    {l.label && <span className="block truncate text-muted">{hostOf(l.url)}</span>}
                  </span>
                </a>
                <button type="button" className="tap shrink-0 text-muted" onClick={() => setEditing(l)} aria-label="Modifier le lien">
                  <Pencil className="size-5" />
                </button>
                <button type="button" className="tap shrink-0 text-muted" onClick={() => remove.mutate(l.id)} aria-label="Supprimer le lien">
                  <Trash2 className="size-5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === 'new' ? (
        <LinkForm onCancel={() => setEditing(null)} onSave={(v) => (save.mutate(v), setEditing(null))} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
        >
          <Link2 className="size-5" /> Ajouter un lien
        </button>
      )}
      {save.error && <p className="text-danger">{save.error.message}</p>}
    </div>
  )
}

function LinkForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Pick<Link, 'url' | 'label'>
  onSave: (v: { url: string; label: string }) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  return (
    // noValidate : type="url" refuserait "exemple.fr" ; on garde le clavier URL
    // et on complète nous-mêmes avec https:// (normalizeUrl).
    <form
      noValidate
      className="space-y-2 rounded-lg border border-accent p-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) onSave({ url, label })
      }}
    >
      <input
        autoFocus
        type="url"
        inputMode="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
        aria-label="Adresse du lien"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Libellé (facultatif)"
        enterKeyHint="done"
        className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
        aria-label="Libellé du lien"
      />
      <div className="flex gap-2">
        <button type="submit" className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-accent-fg">
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4">
          Annuler
        </button>
      </div>
    </form>
  )
}
