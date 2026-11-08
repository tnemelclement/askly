import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { ClipboardList, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    try {
      await api('/api/admin/me')
    } catch {
      throw redirect({ to: '/admin/login' })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh bg-secondary">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
            Questionnaires
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await api('/api/admin/logout', { body: {} })
              await navigate({ to: '/admin/login' })
            }}
          >
            <LogOut />
            Se déconnecter
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
