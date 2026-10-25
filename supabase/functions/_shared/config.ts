/** URL publique de l'application (pour les liens dans les notifications). */
export const APP_URL = (Deno.env.get('APP_URL') ?? 'https://niamort36-prog.github.io/taskmanager/').replace(/\/?$/, '/')
