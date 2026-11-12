import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site'

/** Éditeur du service : clementmouly.com et l'annuaire des entreprises (SIREN 851 860 874). */
export const EDITOR = {
  name: 'Clément Mouly',
  status: 'Entrepreneur individuel',
  siret: '851 860 874 00045',
  address: '6 rue Chéreau, 75013 Paris, France',
  vat: 'FR70851860874',
  email: 'mouly.cl@gmail.com',
}

/** Mise en page des pages légales : retour à l'accueil, texte lisible. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Askly
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>
        <div className="mt-10 space-y-4 leading-relaxed text-pretty [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
