import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'

const MarkdownView = lazy(() => import('./MarkdownView'))

/**
 * Notes libres en Markdown : aperçu par défaut quand il y a du contenu,
 * bascule en édition d'un tap. Enregistrement à la sortie du champ.
 */
export function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(!value)
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setV(value), [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`
  }, [v, editing])

  const save = () => v !== value && onSave(v)

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (editing) save()
            setEditing(!editing)
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-accent"
        >
          {editing ? <Eye className="size-5" /> : <Pencil className="size-5" />}
          {editing ? 'Aperçu' : 'Modifier'}
        </button>
      </div>
      {editing ? (
        <>
          <textarea
            ref={ref}
            value={v}
            autoFocus={Boolean(value)}
            onChange={(e) => setV(e.target.value)}
            onBlur={save}
            placeholder={'Notes libres en Markdown…\n- [ ] case à cocher\n**gras**, _italique_, [lien](https://…)'}
            className="w-full resize-none overflow-hidden rounded-lg border border-line bg-surface-2 p-3 font-mono"
            aria-label="Notes"
          />
        </>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onDoubleClick={() => setEditing(true)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
          className="rounded-lg border border-line p-3"
        >
          <Suspense fallback={<p className="text-muted">…</p>}>
            <MarkdownView source={value} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
