import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Connexion sans mot de passe :
 * 1. on saisit son email, Supabase envoie un email contenant un lien ET un code ;
 * 2. on clique le lien (navigateur) ou on tape le code (indispensable dans la
 *    PWA installée sur iPhone, qui ne partage pas la session avec Safari).
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendEmail = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Inscriptions fermées : seul un compte déjà créé peut se connecter.
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    setBusy(false)
    if (error) setError(translate(error.message))
    else setStep('code')
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(translate(error.message))
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto mb-3 size-16" />
          <h1 className="text-2xl font-bold">Mes tâches</h1>
        </div>

        {step === 'email' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void sendEmail()
            }}
          >
            <label className="block space-y-1">
              <span>Adresse email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-4"
              />
            </label>
            <button disabled={busy} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50">
              {busy ? 'Envoi…' : 'Recevoir un email de connexion'}
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void verify()
            }}
          >
            <p className="text-muted">
              Un email a été envoyé à <strong className="text-fg">{email}</strong>. Ouvrez le lien{' '}
              <strong className="text-fg">sur cet appareil, dans ce navigateur</strong>, ou saisissez le code s’il y en
              a un :
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-center text-2xl tracking-[0.4em]"
              aria-label="Code reçu par email"
            />
            <button disabled={busy} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50">
              {busy ? 'Vérification…' : 'Se connecter'}
            </button>
            <button type="button" className="min-h-11 w-full text-muted underline" onClick={() => setStep('email')}>
              Changer d’adresse / renvoyer
            </button>
          </form>
        )}

        {error && <p className="rounded-xl bg-danger/10 p-3 text-danger">{error}</p>}
      </div>
    </main>
  )
}

function translate(msg: string): string {
  if (/signups not allowed|user not found/i.test(msg)) return 'Aucun compte pour cette adresse.'
  if (/expired|invalid/i.test(msg)) return 'Code invalide ou expiré.'
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives, réessayez dans quelques minutes.'
  return msg
}
