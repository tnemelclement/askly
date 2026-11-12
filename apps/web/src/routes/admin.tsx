import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app/app-shell'
import { api } from '@/lib/api'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    try {
      await api('/api/admin/me')
    } catch {
      throw redirect({ to: '/admin/login' })
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
