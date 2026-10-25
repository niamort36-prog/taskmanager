import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Plein écran (détail d'une tâche) ou hauteur automatique (menus). */
  full?: boolean
}

/**
 * Feuille glissable depuis le bas (mobile). On la ferme en la tirant vers
 * le bas, en touchant le fond, ou avec le bouton retour du téléphone
 * (géré par l'appelant via l'URL quand c'est pertinent).
 */
export function BottomSheet({ open, onClose, title, children, full }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-2xl flex-col rounded-t-2xl border-t border-line bg-surface pb-safe outline-none ${
            full ? 'h-[94dvh]' : 'max-h-[85dvh]'
          }`}
        >
          <div className="mx-auto mt-2 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-line" aria-hidden />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">{title}</Drawer.Description>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
