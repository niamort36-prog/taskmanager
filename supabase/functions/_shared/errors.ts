/** Erreur de canal : "skipped" = rien à envoyer / canal indisponible, "failed" = à retenter. */
export class ChannelError extends Error {
  constructor(message: string, readonly outcome: 'failed' | 'skipped') {
    super(message)
  }
}
