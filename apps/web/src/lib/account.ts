import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Compte connecté (`GET /api/admin/me`). */
export interface Me {
  email: string
  plan: 'trial' | 'solo' | 'pro' | 'unlimited'
  planLabel: string
  active: boolean
  trialEndsAt: string | null
  subscriptionStatus: string | null
  hasApiToken: boolean
  usage: number
  limit: number | null
  features: { files: boolean; mcp: boolean }
  billing: boolean
  mcpUrl: string
}

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/admin/me') })

/** Réglages publics de l'instance (`GET /api/config`). */
export const useConfig = () =>
  useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ signup: boolean; billing: boolean }>('/api/config'),
  })
