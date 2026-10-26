import { useState } from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'
import { useTemplateMutations, useTemplates, type TaskTemplate } from './api'

/** Gestion des modèles : une sous-tâche par ligne. */
export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates()
  const { addExamples } = useTemplateMutations()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        title="Modèles de tâches"
        actions={
          <Link to="/settings" className="tap rounded-lg" aria-label="Retour aux réglages">
            <ChevronLeft className="size-6" />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <p className="text-muted">
          Un modèle est une liste de sous-tâches que vous appliquez en un tap depuis une tâche (section Sous-tâches → Modèles).
        </p>
        {isLoading && <p className="text-muted">Chargement…</p>}
        {templates.map((t) => (
          <TemplateEditor key={t.id} template={t} />
        ))}
        {creating ? (
          <TemplateEditor onDone={() => setCreating(false)} />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-muted"
          >
            <Plus className="size-5" /> Nouveau modèle
          </button>
        )}
        {!isLoading && !templates.length && (
          <button
            onClick={() => addExamples.mutate()}
            disabled={addExamples.isPending}
            className="min-h-12 w-full rounded-xl bg-surface-2 font-medium"
          >
            Créer les modèles d’exemple
          </button>
        )}
      </div>
    </>
  )
}

function TemplateEditor({ template, onDone }: { template?: TaskTemplate; onDone?: () => void }) {
  const { save, remove } = useTemplateMutations()
  const toast = useToast()
  const [name, setName] = useState(template?.name ?? '')
  const [lines, setLines] = useState((template?.subtasks ?? []).join('\n'))
  const dirty = !template || name !== template.name || lines !== template.subtasks.join('\n')

  const submit = async () => {
    if (!name.trim()) return toast('Donnez un nom au modèle')
    await save.mutateAsync({ id: template?.id, name, subtasks: lines.split('\n') })
    toast('Modèle enregistré')
    onDone?.()
  }

  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du modèle"
        maxLength={100}
        className="min-h-11 w-full rounded-lg border border-line bg-surface-2 px-3 font-semibold"
        aria-label="Nom du modèle"
      />
      <textarea
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        rows={Math.max(3, lines.split('\n').length + 1)}
        placeholder={'Une sous-tâche par ligne\nVisite et métré\nÉtablir le devis'}
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2"
        aria-label="Sous-tâches, une par ligne"
      />
      <div className="flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={!dirty || save.isPending}
          className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-accent-fg disabled:opacity-40"
        >
          Enregistrer
        </button>
        {template ? (
          <button
            onClick={() => window.confirm(`Supprimer le modèle « ${template.name} » ?`) && remove.mutate(template.id)}
            className="tap rounded-lg border border-danger px-3 text-danger"
            aria-label={`Supprimer le modèle ${template.name}`}
          >
            <Trash2 className="size-5" />
          </button>
        ) : (
          <button onClick={onDone} className="min-h-11 rounded-lg border border-line px-4">
            Annuler
          </button>
        )}
      </div>
    </section>
  )
}
