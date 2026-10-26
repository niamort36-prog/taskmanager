import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

// API de reconnaissance vocale du navigateur (préfixée sur Chrome/Safari).
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
type RecognitionCtor = new () => Recognition

const Ctor = (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
const SpeechRecognitionImpl = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition

export const dictationSupported = Boolean(SpeechRecognitionImpl)

/**
 * Bouton micro : dicte du texte en français et le transmet à `onText`.
 * Masqué si le navigateur ne gère pas la reconnaissance vocale (le micro du
 * clavier du téléphone reste toujours disponible).
 */
export function DictationButton({ onText, className = '' }: { onText: (text: string) => void; className?: string }) {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)

  useEffect(() => () => rec.current?.stop(), [])
  if (!SpeechRecognitionImpl) return null

  const toggle = () => {
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new SpeechRecognitionImpl()
    r.lang = 'fr-FR'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .filter((res) => res.isFinal)
        .map((res) => res[0].transcript)
        .join(' ')
        .trim()
      if (text) onText(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Évite de faire perdre le focus (et d'enregistrer) au champ voisin.
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={listening}
      aria-label={listening ? 'Arrêter la dictée' : 'Dicter'}
      className={`tap shrink-0 rounded-lg ${listening ? 'animate-pulse bg-danger/15 text-danger' : 'text-muted'} ${className}`}
    >
      {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
    </button>
  )
}

/** Ajoute un texte dicté à la suite d'un texte existant. */
export const appendText = (current: string, added: string) => (current.trim() ? `${current.trimEnd()} ${added}` : added)
