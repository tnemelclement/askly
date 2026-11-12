import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  ChevronsUpDown,
  ClipboardList,
  ExternalLink,
  Gauge,
  Inbox,
  LogOut,
  type LucideIcon,
  Menu,
  Monitor,
  Moon,
  Plug,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useMe } from '@/lib/account'
import { api } from '@/lib/api'
import { type Theme, useAppTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Châssis du back-office, d'après resend.com : barre latérale fixe (compte en haut,
 * navigation en groupes séparés par un filet, thème en bas), contenu centré sur 860 px.
 * Sous 1024 px, la barre se replie derrière un bouton menu.
 */

type NavItem = {
  label: string
  icon: LucideIcon
  to: string
  search?: Record<string, string>
  /** Actif quand l'adresse commence par l'un de ces chemins. */
  match: (path: string, search: Record<string, unknown>) => boolean
}

const GROUPS: NavItem[][] = [
  [
    {
      label: 'Questionnaires',
      icon: ClipboardList,
      to: '/admin',
      search: {},
      match: (p, s) =>
        (p === '/admin' || p.startsWith('/admin/forms') || p.startsWith('/admin/edit')) &&
        s.kind !== 'tutorial',
    },
    {
      label: 'Tutoriels',
      icon: BookOpen,
      to: '/admin',
      search: { kind: 'tutorial' },
      match: (p, s) => p === '/admin' && s.kind === 'tutorial',
    },
    {
      label: 'Réponses',
      icon: Inbox,
      to: '/admin/responses',
      match: (p) => p.startsWith('/admin/responses') || p.startsWith('/admin/respondents'),
    },
  ],
  [
    {
      label: 'Utilisation',
      icon: Gauge,
      to: '/admin/account',
      search: { tab: 'usage' },
      match: (p, s) => p === '/admin/account' && (s.tab === 'usage' || !s.tab),
    },
    {
      label: 'MCP et API',
      icon: Plug,
      to: '/admin/account',
      search: { tab: 'integrations' },
      match: (p, s) => p === '/admin/account' && s.tab === 'integrations',
    },
    {
      label: 'Paramètres',
      icon: Settings,
      to: '/admin/account',
      search: { tab: 'account' },
      match: (p, s) => p === '/admin/account' && (s.tab === 'account' || s.tab === 'billing'),
    },
  ],
]

export function AppShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useAppTheme()
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const me = useMe()

  // Le menu mobile se referme à chaque navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit l'adresse.
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Barre du haut, mobile seulement. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-accent"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-sidebar transition-transform lg:w-[194px] lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-3">
          <AccountMenu email={me.data?.email} plan={me.data?.planLabel} />
        </div>
        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3">
          {GROUPS.map((group, i) => (
            <div key={group[0]?.label}>
              {i > 0 && <hr className="mx-2 my-3" />}
              <ul className="grid gap-0.5">
                {group.map((item) => (
                  <li key={item.label}>
                    <NavLink item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 p-3">
          <ThemeSwitch theme={theme} onChange={setTheme} />
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Le site <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </aside>

      <div className="lg:pl-[194px]">
        {me.data && !me.data.active && (
          <div className="border-b bg-live-soft/60">
            <p className="mx-auto max-w-[860px] px-4 py-2.5 text-sm sm:px-6">
              {me.data.plan === 'trial'
                ? 'Votre essai est terminé : vos questionnaires restent consultables, mais personne ne peut plus commencer à répondre.'
                : 'Votre abonnement n’est plus actif : personne ne peut plus commencer à répondre.'}{' '}
              <Link
                to="/admin/account"
                search={{ tab: 'billing' }}
                className="font-medium underline underline-offset-4"
              >
                Choisir une offre
              </Link>
            </p>
          </div>
        )}
        <main className="mx-auto max-w-[860px] px-4 pt-6 pb-20 sm:px-6 lg:pt-8">{children}</main>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/admin" className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ClipboardList className="size-3.5" aria-hidden />
      </span>
      Askly
    </Link>
  )
}

function NavLink({ item }: { item: NavItem }) {
  const location = useRouterState({ select: (s) => s.location })
  const active = item.match(location.pathname, location.search as Record<string, unknown>)
  return (
    <Link
      to={item.to}
      search={item.search}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
        active && 'bg-sidebar-accent font-medium text-foreground',
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  )
}

/** Sélecteur de compte façon Resend : avatar en dégradé, e-mail, menu. */
function AccountMenu({ email, plan }: { email?: string; plan?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initial = (email?.[0] ?? 'A').toUpperCase()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{email ?? '…'}</span>
          {plan && <span className="block text-xs text-muted-foreground">Offre {plan}</span>}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-52 rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DropdownMenu.Label className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            {email}
          </DropdownMenu.Label>
          <MenuItem onSelect={() => navigate({ to: '/admin/account', search: { tab: 'account' } })}>
            <Settings className="size-4" /> Paramètres du compte
          </MenuItem>
          <MenuItem onSelect={() => navigate({ to: '/admin/account', search: { tab: 'billing' } })}>
            <Gauge className="size-4" /> Offre et facturation
          </MenuItem>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <MenuItem
            onSelect={async () => {
              await api('/api/admin/logout', { body: {} })
              queryClient.clear()
              await navigate({ to: '/admin/login' })
            }}
          >
            <LogOut className="size-4" /> Se déconnecter
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
    >
      {children}
    </DropdownMenu.Item>
  )
}

const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
]

function ThemeSwitch({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <fieldset aria-label="Thème" className="flex rounded-lg border p-0.5">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={theme === t.value}
          aria-label={t.label}
          title={t.label}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground',
            theme === t.value && 'bg-accent text-foreground',
          )}
        >
          <t.icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </fieldset>
  )
}
