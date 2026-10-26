/**
 * État d'interface partagé entre les vues de tâches :
 * - tâche ouverte (dans l'URL : ?task=<id>, donc le bouton retour la ferme) ;
 * - sélection multiple (appui long) ;
 * - feuilles "Reporter" et "Nouvelle tâche".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { takeShareDraft, type ShareDraft } from '@/lib/shareTarget'

interface TaskUi {
  openTaskId: string | null
  openTask: (id: string) => void
  closeTask: () => void

  selected: Set<string>
  selecting: boolean
  toggleSelected: (id: string) => void
  clearSelection: () => void

  postponeIds: string[] | null
  openPostpone: (ids: string[]) => void
  closePostpone: () => void

  quickAddOpen: boolean
  setQuickAddOpen: (open: boolean) => void
  /** Contenu partagé depuis une autre app, à reprendre dans la saisie rapide. */
  shareDraft: ShareDraft | null
  clearShareDraft: () => void
}

const Ctx = createContext<TaskUi | null>(null)

export function useTaskUi(): TaskUi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTaskUi hors de TaskUiProvider')
  return v
}

export function TaskUiProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [postponeIds, setPostponeIds] = useState<string[] | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null)

  const openTaskId = params.get('task')

  // Raccourci "Nouvelle tâche" de l'icône de l'app : #/today?new=1
  useEffect(() => {
    if (params.get('new') !== '1') return
    const draft = takeShareDraft()
    if (draft) setShareDraft(draft)
    setQuickAddOpen(true)
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.delete('new')
      return n
    }, { replace: true })
  }, [params, setParams])

  // Changement d'onglet : on referme les feuilles et la sélection en cours.
  // (pas au premier affichage : la saisie ouverte par ?new=1 doit rester ouverte).
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    setSelected(new Set())
    setPostponeIds(null)
    setQuickAddOpen(false)
  }, [pathname])

  const openTask = useCallback(
    (id: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.set('task', id)
        return n
      }, { replace: Boolean(openTaskId) }),
    [setParams, openTaskId],
  )

  const closeTask = useCallback(() => {
    // Si la tâche a été ouverte depuis l'app, "retour" ramène à la liste.
    if (window.history.state?.idx > 0) window.history.back()
    else
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.delete('task')
        return n
      }, { replace: true })
  }, [setParams])

  const toggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const value = useMemo<TaskUi>(
    () => ({
      openTaskId,
      openTask,
      closeTask,
      selected,
      selecting: selected.size > 0,
      toggleSelected,
      clearSelection: () => setSelected(new Set()),
      postponeIds,
      openPostpone: setPostponeIds,
      closePostpone: () => setPostponeIds(null),
      quickAddOpen,
      setQuickAddOpen,
      shareDraft,
      clearShareDraft: () => setShareDraft(null),
    }),
    [openTaskId, openTask, closeTask, selected, toggleSelected, postponeIds, quickAddOpen, shareDraft],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
