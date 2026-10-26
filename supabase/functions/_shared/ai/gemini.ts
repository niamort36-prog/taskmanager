// Implémentation Google Gemini (API REST generateContent, sortie JSON structurée).
// En cas de surcharge (503/500), on retente puis on bascule sur un modèle de secours.
import { AiError, type AiProvider, type AiRequest, type AiResult } from './provider.ts'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function gemini(): AiProvider {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) {
    throw new AiError('Clé GEMINI_API_KEY absente des secrets Supabase', 503)
  }
  const primary = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL
  const fallback = Deno.env.get('GEMINI_FALLBACK_MODEL') ??
    (primary === DEFAULT_MODEL ? 'gemini-flash-latest' : DEFAULT_MODEL)

  async function call<T>(model: string, req: AiRequest): Promise<AiResult<T>> {
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          // Clé en en-tête (et non dans l'URL) pour qu'elle n'apparaisse pas dans les journaux.
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key!,
          },
          // Délai maximal : une Edge Function ne doit jamais rester bloquée.
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
            generationConfig: {
              temperature: req.temperature ?? 0.6,
              responseMimeType: 'application/json',
              responseSchema: req.schema,
              maxOutputTokens: 4096,
            },
          }),
        },
      )
    } catch (e) {
      const timeout = (e as Error).name === 'TimeoutError' ||
        (e as Error).name === 'AbortError'
      throw new AiError(
        timeout ? 'Gemini met trop de temps à répondre, réessayez.' : `Gemini injoignable : ${(e as Error).message}`,
        503,
      )
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = body?.error?.message ?? res.statusText
      if (res.status === 429) {
        throw new AiError(
          'Quota Gemini dépassé, réessayez dans un moment.',
          429,
        )
      }
      if (res.status === 400 && /API key/i.test(msg)) {
        throw new AiError('Clé Gemini invalide.', 503)
      }
      if (res.status === 503 || res.status === 500) {
        throw new AiError(
          'Gemini est surchargé, réessayez dans un instant.',
          503,
        )
      }
      throw new AiError(`Gemini ${res.status} : ${msg}`.slice(0, 300), 502)
    }
    const candidate = body.candidates?.[0]
    const text: string | undefined = candidate?.content?.parts?.map((
      p: { text?: string },
    ) => p.text ?? '').join('')
    if (!text) {
      const reason = candidate?.finishReason ??
        body.promptFeedback?.blockReason ?? 'réponse vide'
      throw new AiError(`Gemini n’a pas répondu (${reason}).`, 502)
    }
    try {
      return {
        data: JSON.parse(text),
        model,
        tokensIn: body.usageMetadata?.promptTokenCount,
        tokensOut: body.usageMetadata?.candidatesTokenCount,
      }
    } catch {
      throw new AiError('Réponse de Gemini illisible, réessayez.', 502)
    }
  }

  return {
    name: 'gemini',
    async generateJson<T>(req: AiRequest) {
      // Modèle principal, puis modèle de secours (≈ 1 min au pire).
      const plan = [primary, fallback]
      let last: unknown
      for (let i = 0; i < plan.length; i++) {
        try {
          return await call<T>(plan[i], req)
        } catch (e) {
          last = e
          const retryable = e instanceof AiError && e.status === 503 &&
            !/Clé/.test(e.message)
          if (!retryable) throw e
          if (i < plan.length - 1) await sleep(1000)
        }
      }
      throw last
    },
  }
}
