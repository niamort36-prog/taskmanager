import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastData {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

type ShowToast = (message: string, action?: { label: string; onClick: () => void }) => void

const ToastContext = createContext<ShowToast>(() => {})

export const useToast = () => useContext(ToastContext)

/** Petit message temporaire au-dessus de la barre du bas (avec action "Annuler"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback<ShowToast>((message, action) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, actionLabel: action?.label, onAction: action?.onClick })
    timer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-fg px-4 py-2 text-bg shadow-lg lg:bottom-6"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.actionLabel && (
            <button
              className="tap font-semibold text-sky-300 dark:text-sky-700"
              onClick={() => {
                toast.onAction?.()
                setToast(null)
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
