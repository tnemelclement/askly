import { Link } from '@tanstack/react-router'
import { ArrowRight, Bot } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** Pages du site (hors administration) : en-tête, appel à l'essai, pied de page. */

export const REPO = 'https://github.com/tnemelclement/askly'

const NAV = [
  { to: '/fonctionnalites', label: 'Fonctionnalités' },
  { to: '/tutoriels', label: 'Tutoriels' },
  { to: '/integration', label: 'Intégration' },
] as const

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="size-4" aria-hidden />
        </span>
        Askly
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        {NAV.map((item) => (
          <Button key={item.to} asChild variant="ghost" className="hidden md:inline-flex">
            <Link to={item.to} activeProps={{ className: 'bg-muted' }}>
              {item.label}
            </Link>
          </Button>
        ))}
        <Button asChild variant="ghost" className="hidden md:inline-flex">
          <a href="/#tarifs">Tarifs</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/admin/login">Se connecter</a>
        </Button>
        <Button asChild className="hidden sm:inline-flex">
          <a href="/signup">Essai gratuit</a>
        </Button>
      </nav>
    </header>
  )
}

export function CtaBand({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary p-8 text-primary-foreground sm:p-12 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 opacity-70">
            {children ?? '14 jours d’essai gratuit, toutes fonctions, sans carte bancaire.'}
          </p>
        </div>
        <Button asChild size="lg" variant="secondary" className="h-11 shrink-0 px-5">
          <a href="/signup">
            Essayer gratuitement <ArrowRight data-icon="inline-end" />
          </a>
        </Button>
      </div>
    </section>
  )
}

/** Haut d'une page du site : surtitre, titre, accroche. */
export function PageHero({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section
      className={
        aside
          ? 'mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-16'
          : 'mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 lg:pt-16'
      }
    >
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        <div className="mt-5 text-lg text-muted-foreground">{children}</div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 px-5">
            <a href="/signup">
              Essai gratuit <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 px-5">
            <a href="/#demo">Voir la démo</a>
          </Button>
        </div>
      </div>
      {aside}
    </section>
  )
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}

/** Carte de fonctionnalité : icône, titre, texte. */
export function FeatureCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-background p-6">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

/** Fenêtre de navigateur factice, pour montrer Askly dans un site ou un écran. */
export function BrowserFrame({
  url,
  children,
  className,
}: {
  url: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-background shadow-lg ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="mx-auto truncate rounded-md bg-background px-3 py-0.5 text-xs text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-[1fr_auto_auto] sm:px-6">
        <div>
          <span className="font-medium text-foreground">Askly</span>
          <p className="mt-1">Des questionnaires auxquels on a envie de répondre.</p>
          <p className="mt-1">Logiciel libre sous licence MIT.</p>
        </div>
        <nav className="grid content-start gap-2" aria-label="Produit">
          <span className="font-medium text-foreground">Produit</span>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <a href="/#tarifs" className="hover:text-foreground">
            Tarifs
          </a>
          <a href={REPO} className="hover:text-foreground">
            GitHub
          </a>
        </nav>
        <nav className="grid content-start gap-2" aria-label="Informations légales">
          <span className="font-medium text-foreground">Légal</span>
          <Link to="/mentions-legales" className="hover:text-foreground">
            Mentions légales
          </Link>
          <Link to="/cgv" className="hover:text-foreground">
            CGV
          </Link>
          <Link to="/confidentialite" className="hover:text-foreground">
            Confidentialité
          </Link>
        </nav>
      </div>
    </footer>
  )
}
