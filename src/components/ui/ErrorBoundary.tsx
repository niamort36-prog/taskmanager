import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Change de valeur => l'erreur est oubliée (ex. changement de page ou de tâche). */
  resetKey?: unknown
}

/**
 * Filet de sécurité : une erreur dans une partie de l'écran (une donnée
 * inattendue…) n'efface plus toute l'application, seulement cette zone.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur d’affichage', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="m-4 space-y-3 rounded-xl border border-danger bg-danger/10 p-4">
        <p className="font-semibold text-danger">Cet écran n’a pas pu s’afficher.</p>
        <p className="text-sm text-muted">{this.state.error.message}</p>
        <div className="flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="min-h-11 rounded-lg border border-line px-4">
            Réessayer
          </button>
          <button onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-fg">
            Recharger l’app
          </button>
        </div>
      </div>
    )
  }
}
