import type { ReactNode } from 'react'

/** En-tête collant en haut de page, sous l'encoche (safe-area). */
export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 pt-safe backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 px-4">
        <h1 className="flex-1 truncate text-xl font-bold first-letter:uppercase">{title}</h1>
        {actions}
      </div>
      {children && <div className="px-4 pb-3">{children}</div>}
    </header>
  )
}
