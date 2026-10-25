import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const qk = {
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  tags: ['tags'] as const,
  history: (taskId: string) => ['history', taskId] as const,
  settings: ['settings'] as const,
}
