import { useRef, useState } from 'react'

export const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']

/** Lettre de regroupement d'un nom : "Émilie" -> "E", "3D Bâtiment" -> "#". */
export function letterOf(name: string): string {
  const c = name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .charAt(0)
    .toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

interface Props {
  /** Lettres qui ont au moins une entrée. */
  available: Set<string>
  onSelect: (letter: string) => void
}

/**
 * Barre alphabétique verticale (comme le répertoire du téléphone) : toucher
 * une lettre, ou glisser le doigt le long de la barre, fait défiler la liste.
 */
export function AlphabetIndex({ available, onSelect }: Props) {
  const bar = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string | null>(null)

  /** Lettre sous le doigt ; si elle est vide, la suivante qui existe. */
  const pick = (clientY: number) => {
    const rect = bar.current!.getBoundingClientRect()
    const i = Math.min(ALPHABET.length - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * ALPHABET.length)))
    const target = ALPHABET.slice(i).find((l) => available.has(l)) ?? [...ALPHABET.slice(0, i)].reverse().find((l) => available.has(l))
    if (target && target !== active) {
      setActive(target)
      onSelect(target)
      navigator.vibrate?.(5)
    }
  }

  return (
    <>
      <div
        ref={bar}
        role="navigation"
        aria-label="Index alphabétique"
        data-no-pull
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e.clientY)
        }}
        onPointerMove={(e) => e.buttons && pick(e.clientY)}
        onPointerUp={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
        className="fixed top-[calc(env(safe-area-inset-top)+9rem)] right-0 bottom-[calc(env(safe-area-inset-bottom)+9.75rem)] z-20 flex w-9 touch-none flex-col items-center justify-between py-1 select-none lg:top-40 lg:bottom-8"
      >
        {ALPHABET.map((l) => (
          <span
            key={l}
            aria-hidden
            className={`flex w-full flex-1 items-center justify-center text-[0.8125rem] leading-none font-semibold ${
              available.has(l) ? (active === l ? 'text-accent-fg' : 'text-accent') : 'text-muted/40'
            }`}
          >
            <span className={active === l ? 'rounded-full bg-accent px-1' : ''}>{l}</span>
          </span>
        ))}
      </div>
      {active && (
        <div
          aria-live="assertive"
          className="pointer-events-none fixed top-1/2 left-1/2 z-30 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-surface/95 text-4xl font-bold text-accent shadow-xl"
        >
          {active}
        </div>
      )}
      {/* Lien accessible au clavier / lecteur d'écran */}
      <nav className="sr-only" aria-label="Aller à la lettre">
        {ALPHABET.filter((l) => available.has(l)).map((l) => (
          <button key={l} onClick={() => onSelect(l)}>
            {l}
          </button>
        ))}
      </nav>
    </>
  )
}
