import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { ClipboardList, LogOut, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMe } from '@/lib/account'
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
  const queryClient = useQueryClient()
  const me = useMe()
  return (
    <div className="min-h-dvh bg-secondary">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
            Askly
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/account">
                <UserRound />
                <span className="hidden sm:inline">Mon compte</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Se déconnecter"
              onClick={async () => {
                await api('/api/admin/logout', { body: {} })
                queryClient.clear()
                await navigate({ to: '/admin/login' })
              }}
            >
              <LogOut />
              <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
          </div>
        </div>
      </header>
      {me.data && !me.data.active && (
        <div className="border-b bg-background">
          <p className="mx-auto max-w-5xl px-4 py-3 text-sm sm:px-6">
            {me.data.plan === 'trial'
              ? 'Votre essai est terminé : vos questionnaires restent consultables, mais personne ne peut plus commencer à répondre.'
              : 'Votre abonnement n’est plus actif : personne ne peut plus commencer à répondre.'}{' '}
            <Link to="/admin/account" className="font-medium underline underline-offset-4">
              Choisir une offre
            </Link>
          </p>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
