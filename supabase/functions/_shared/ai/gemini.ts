// Implémentation Google Gemini (API REST generateContent, sortie JSON structurée).
import { AiError, type AiProvider } from './provider.ts'

export function gemini(): AiProvider {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new AiError('Clé GEMINI_API_KEY absente des secrets Supabase', 503)
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'

  return {
    name: 'gemini',
    async generateJson(req) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        // Clé en en-tête (et non dans l'URL) pour qu'elle n'apparaisse pas dans les journaux.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = body?.error?.message ?? res.statusText
        if (res.status === 429) throw new AiError('Quota Gemini dépassé, réessayez dans un moment.', 429)
        if (res.status === 400 && /API key/i.test(msg)) throw new AiError('Clé Gemini invalide.', 503)
        throw new AiError(`Gemini ${res.status} : ${msg}`.slice(0, 300), 502)
      }
      const candidate = body.candidates?.[0]
      const text: string | undefined = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
      if (!text) {
        const reason = candidate?.finishReason ?? body.promptFeedback?.blockReason ?? 'réponse vide'
        throw new AiError(`Gemini n’a pas répondu (${reason}).`, 502)
      }
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new AiError('Réponse de Gemini illisible, réessayez.', 502)
      }
      return {
        data,
        model,
        tokensIn: body.usageMetadata?.promptTokenCount,
        tokensOut: body.usageMetadata?.candidatesTokenCount,
      }
    },
  }
}
