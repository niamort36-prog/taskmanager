import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, File, FileImage, FileText, Folder, FolderPlus, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase, unwrap } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Attachment } from '@/types/domain'

const BUCKET = 'attachments'
const MAX_SIZE = 50 * 1024 * 1024 // limite de l'offre gratuite Supabase

export const formatSize = (n: number | null) => {
  if (n == null) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`
}

/** Nom de fichier sûr pour Storage (sans accents ni caractères spéciaux). */
const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(-100)

const isWebUrl = (s: string) => /^https?:\/\//i.test(s.trim())

function iconFor(a: Attachment) {
  if (a.kind === 'folder') return Folder
  if (a.mime?.startsWith('image/')) return FileImage
  if (a.mime === 'application/pdf' || a.mime?.startsWith('text/')) return FileText
  return File
}

function useAttachments(taskId: string) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const key = qk.attachments(taskId)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.history(taskId) })
  }

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap<Attachment[]>(await supabase.from('attachments').select('*').eq('task_id', taskId).order('created_at')),
  })

  /** Envoie le fichier dans Storage puis crée la ligne ; nettoie si l'une échoue. */
  const upload = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (file.size > MAX_SIZE) throw new Error(`« ${file.name} » dépasse 50 Mo.`)
      const path = `${session!.user.id}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error(up.error.message)
      const ins = await supabase.from('attachments').insert({
        task_id: taskId,
        kind: 'file',
        label: file.name,
        storage_path: path,
        mime: file.type || null,
        size: file.size,
      })
      if (ins.error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(ins.error.message)
      }
    },
    onSettled: refresh,
  })

  const addFolder = useMutation({
    mutationFn: async ({ label, location }: { label: string; location: string }) => {
      unwrap(
        await supabase
          .from('attachments')
          .insert({ task_id: taskId, kind: 'folder', label: label.trim(), location: location.trim() }),
      )
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: async (a: Attachment) => {
      if (a.storage_path) {
        const { error } = await supabase.storage.from(BUCKET).remove([a.storage_path])
        if (error) throw new Error(error.message)
      }
      unwrap(await supabase.from('attachments').delete().eq('id', a.id))
    },
    onMutate: (a) => qc.setQueryData<Attachment[]>(key, (l) => l?.filter((x) => x.id !== a.id)),
    onSettled: refresh,
  })

  return { list, upload, addFolder, remove }
}

export function AttachmentsSection({ taskId }: { taskId: string }) {
  const { list, upload, addFolder, remove } = useAttachments(taskId)
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [folderForm, setFolderForm] = useState(false)
  const [uploading, setUploading] = useState(0)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const arr = [...files]
    setUploading(arr.length)
    for (const f of arr) {
      try {
        await upload.mutateAsync(f)
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e))
      }
      setUploading((n) => n - 1)
    }
  }

  /** Ouvre un fichier via une URL signée valable 5 min. */
  const openFile = async (a: Attachment) => {
    // La fenêtre est ouverte tout de suite (sinon Safari bloque le pop-up).
    const win = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path!, 300)
    if (error || !data) {
      win?.close()
      toast(`Impossible d’ouvrir le fichier : ${error?.message ?? 'erreur inconnue'}`)
      return
    }
    if (win) win.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Chemin copié')
    } catch {
      window.prompt('Copiez le chemin :', text)
    }
  }

  return (
    <div className="space-y-2">
      {!!list.data?.length && (
        <ul className="space-y-1">
          {list.data.map((a) => {
            const Icon = iconFor(a)
            const web = a.kind === 'folder' && isWebUrl(a.location ?? '')
            return (
              <li key={a.id} className="flex items-center gap-1 rounded-lg bg-surface-2/60">
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-1 text-left"
                  onClick={() => {
                    if (a.kind === 'file') void openFile(a)
                    else if (web) window.open(a.location!, '_blank', 'noopener')
                    else void copy(a.location!)
                  }}
                >
                  <Icon className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block truncate">{a.label || a.location}</span>
                    <span className="block truncate text-muted">
                      {a.kind === 'file' ? formatSize(a.size) : a.location}
                    </span>
                  </span>
                </button>
                {a.kind === 'folder' &&
                  (web ? (
                    <a href={a.location!} target="_blank" rel="noopener noreferrer" className="tap shrink-0 text-muted" aria-label="Ouvrir">
                      <ExternalLink className="size-5" />
                    </a>
                  ) : (
                    <button type="button" className="tap shrink-0 text-muted" onClick={() => void copy(a.location!)} aria-label="Copier le chemin">
                      <Copy className="size-5" />
                    </button>
                  ))}
                <button
                  type="button"
                  className="tap shrink-0 text-muted"
                  aria-label={`Supprimer ${a.label}`}
                  onClick={() => {
                    if (a.kind === 'file' && !window.confirm(`Supprimer définitivement « ${a.label} » ?`)) return
                    remove.mutate(a)
                  }}
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {uploading > 0 && (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="size-5 animate-spin" /> Envoi de {uploading} fichier{uploading > 1 ? 's' : ''}…
        </p>
      )}

      {folderForm ? (
        <FolderForm
          onCancel={() => setFolderForm(false)}
          onSave={(v) => {
            addFolder.mutate(v)
            setFolderForm(false)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
          >
            <Paperclip className="size-5" /> Joindre un fichier
          </button>
          <button
            type="button"
            onClick={() => setFolderForm(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-4 text-muted"
          >
            <FolderPlus className="size-5" /> Dossier / chemin
          </button>
        </div>
      )}
      {/* Sur téléphone, propose aussi l'appareil photo et les fichiers. */}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {(addFolder.error || remove.error) && <p className="text-danger">{(addFolder.error || remove.error)!.message}</p>}
    </div>
  )
}

function FolderForm({ onSave, onCancel }: { onSave: (v: { label: string; location: string }) => void; onCancel: () => void }) {
  const [location, setLocation] = useState('')
  const [label, setLabel] = useState('')
  return (
    <form
      className="space-y-2 rounded-lg border border-accent p-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (location.trim()) onSave({ label, location })
      }}
    >
      <input
        autoFocus
        required
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="\\serveur\partage\chantier ou lien Drive"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3 font-mono"
        aria-label="Chemin ou lien du dossier"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Libellé (facultatif)"
        enterKeyHint="done"
        className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3"
        aria-label="Libellé du dossier"
      />
      <p className="text-muted">Un chemin réseau ne peut pas s’ouvrir depuis le navigateur : il sera copié d’un tap.</p>
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
