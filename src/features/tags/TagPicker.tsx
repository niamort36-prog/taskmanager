import { useState } from 'react'
import { Plus } from 'lucide-react'
import { TAG_COLORS } from '@/features/tasks/meta'
import { useCreateTag, useTags, useToggleTaskTag } from './api'

/** Étiquettes d'une tâche : on touche une étiquette pour l'ajouter/la retirer. */
export function TagPicker({ taskId, tagIds }: { taskId: string; tagIds: string[] }) {
  const { data: tags } = useTags()
  const toggle = useToggleTaskTag(taskId)
  const create = useCreateTag()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = async () => {
    const n = name.trim()
    setName('')
    setAdding(false)
    if (!n) return
    const existing = tags?.find((t) => t.name.toLowerCase() === n.toLowerCase())
    const tag =
      existing ?? (await create.mutateAsync({ name: n, color: TAG_COLORS[(tags?.length ?? 0) % TAG_COLORS.length] }))
    if (!tagIds.includes(tag.id)) toggle.mutate({ tagId: tag.id, on: true })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags?.map((t) => {
        const on = tagIds.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle.mutate({ tagId: t.id, on: !on })}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 ${
              on ? 'border-transparent text-white' : 'border-line bg-surface-2'
            }`}
            style={on ? { background: t.color } : undefined}
          >
            {!on && <span className="size-2.5 rounded-full" style={{ background: t.color }} />}
            {t.name}
          </button>
        )
      })}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void submit()}
            placeholder="Nouvelle étiquette"
            enterKeyHint="done"
            maxLength={50}
            className="min-h-11 w-44 rounded-full border border-accent bg-surface-2 px-4"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed border-line px-4 text-muted"
        >
          <Plus className="size-4" /> Étiquette
        </button>
      )}
    </div>
  )
}
