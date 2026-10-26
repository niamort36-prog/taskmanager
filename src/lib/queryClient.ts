import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Doit couvrir la durée du cache hors ligne (voir lib/offline.ts).
      gcTime: 7 * 24 * 3600_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Hors ligne, la mutation est mise en pause puis rejouée au retour du réseau.
      networkMode: 'online',
      retry: 2,
    },
  },
})

export const qk = {
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  tags: ['tags'] as const,
  history: (taskId: string) => ['history', taskId] as const,
  settings: ['settings'] as const,
  contacts: ['contacts'] as const,
  taskContacts: (taskId: string) => ['task-contacts', taskId] as const,
  links: (taskId: string) => ['links', taskId] as const,
  attachments: (taskId: string) => ['attachments', taskId] as const,
  reminders: (taskId: string) => ['reminders', taskId] as const,
  notificationLogs: ['notification-logs'] as const,
}
