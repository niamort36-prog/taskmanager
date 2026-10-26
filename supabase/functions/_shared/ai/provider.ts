// Abstraction du fournisseur d'IA : l'Edge Function ne connaît que cette
// interface. Pour changer de modèle ou de fournisseur, ajouter une
// implémentation et la sélectionner via le secret AI_PROVIDER.

/** Schéma de réponse JSON (sous-ensemble OpenAPI, compris par Gemini). */
export type JsonSchema =
  | { type: 'STRING'; description?: string }
  | { type: 'INTEGER'; description?: string; nullable?: boolean }
  | { type: 'ARRAY'; items: JsonSchema; description?: string }
  | { type: 'OBJECT'; properties: Record<string, JsonSchema>; required?: string[]; description?: string }

export interface AiRequest {
  system: string
  prompt: string
  schema: JsonSchema
  temperature?: number
}

export interface AiResult<T> {
  data: T
  model: string
  tokensIn?: number
  tokensOut?: number
}

export interface AiProvider {
  name: string
  generateJson<T>(req: AiRequest): Promise<AiResult<T>>
}

/** Erreur à afficher telle quelle à l'utilisateur, avec un statut HTTP. */
export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
  }
}

export async function getAiProvider(): Promise<AiProvider> {
  const choice = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase()
  switch (choice) {
    case 'gemini': {
      const { gemini } = await import('./gemini.ts')
      return gemini()
    }
    default:
      throw new AiError(`Fournisseur IA inconnu : ${choice}`, 500)
  }
}
