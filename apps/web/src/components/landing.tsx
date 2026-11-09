import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  Check,
  FileUp,
  ListChecks,
  Lock,
  MessagesSquare,
  PencilLine,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Comparison, Demo, HERO_SCRIPT, ScriptedChat } from './landing-demo'

const REPO = 'https://github.com/tnemelclement/askly'

const PLANS = [
  {
    name: 'Solo',
    price: '9 €',
    period: '/ mois',
    pitch: 'Pour quelques clients par mois.',
    features: [
      '50 réponses par mois',
      'Questionnaires illimités',
      'Choix, cases, dates, images',
      'Export CSV et JSON',
    ],
    cta: { label: 'Essayer gratuitement', href: '/signup' },
  },
  {
    name: 'Pro',
    price: '29 €',
    period: '/ mois',
    pitch: 'Pour un usage quotidien.',
    features: [
      '500 réponses par mois',
      'Tout Solo, plus :',
      'Photos et documents joints',
      'Serveur MCP : pilotez Askly depuis Claude',
    ],
    cta: { label: 'Essayer gratuitement', href: '/signup' },
    featured: true,
  },
  {
    name: 'Auto-hébergé',
    price: '0 €',
    period: '',
    pitch: 'Sur votre serveur, avec votre clé Anthropic.',
    features: [
      'Toutes les fonctions',
      'Réponses illimitées',
      'Licence MIT',
      'Vous gérez mises à jour et sauvegardes',
    ],
    cta: { label: 'Voir le dépôt', href: REPO },
  },
]

const FAQ = [
  {
    q: 'Qu’est-ce qu’une « réponse » ?',
    a: 'Une personne qui commence un de vos questionnaires dans le mois. Qu’elle échange trois ou trente messages, cela compte pour une. Un lien envoyé mais jamais ouvert ne compte pas.',
  },
  {
    q: 'Que se passe-t-il après l’essai ?',
    a: 'L’essai dure 14 jours, avec toutes les fonctions et 20 réponses, sans carte bancaire. Ensuite, vous choisissez une offre pour continuer à recevoir des réponses ; vos questionnaires et réponses restent consultables.',
  },
  {
    q: 'Où sont mes données ?',
    a: 'Chez OVH, en France : base de données et fichiers. Seuls les messages de la conversation passent par l’API d’Anthropic pour générer les réponses de l’assistant. Vous pouvez tout exporter à tout moment.',
  },
  {
    q: 'Puis-je résilier ?',
    a: 'Oui, à tout moment depuis votre compte, sans engagement. L’abonnement s’arrête à la fin du mois déjà payé.',
  },
  {
    q: 'Quelle différence avec l’auto-hébergement ?',
    a: 'Le logiciel est le même. Hébergé, vous n’avez rien à installer, ni serveur, ni clé d’API, ni mises à jour. Auto-hébergé, c’est gratuit, mais l’installation, les sauvegardes et le coût de l’IA sont pour vous.',
  },
  {
    q: 'Quelle IA est utilisée ?',
    a: 'Claude, d’Anthropic. Il pose vos questions, les explique et range les réponses, mais ne valide que ce qui correspond au type attendu : le répondant relit tout avant d’envoyer.',
  },
]

/** Page de présentation d'Askly (racine du site). */
export function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="size-4" aria-hidden />
          </span>
          Askly
        </span>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href="#tarifs">Tarifs</a>
          </Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href={REPO}>GitHub</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/admin/login">Se connecter</a>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              Logiciel libre, ou hébergé pour vous
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Des questionnaires auxquels on a envie de répondre.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Askly remplace le formulaire par une conversation. Une IA pose vos questions une à
              une, les explique quand on hésite, propose des réponses en un clic et range les
              réponses au fil de l'échange. Vous recevez des réponses complètes, pas des champs
              vides.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <a href="#demo">
                  Voir la démo <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <a href="/signup">Essai gratuit</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              14 jours d'essai, sans carte bancaire. Ou téléchargez-le : c'est un logiciel libre.
            </p>
          </div>
          <div className="rounded-xl border bg-background p-5 shadow-lg sm:p-6">
            <ScriptedChat script={HERO_SCRIPT} loop />
          </div>
        </section>

        <Comparison />
        <Demo />

        <section className="border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Comment ça marche</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              <Step n={1} title="Vous écrivez les questions">
                Depuis l'administration, ou en demandant à Claude : « fais-moi un questionnaire pour
                Dupont sur son projet de cuisine ».
              </Step>
              <Step n={2} title="Vous envoyez un lien">
                Chaque personne a son lien. Elle répond quand elle veut, s'arrête et reprend où elle
                en était.
              </Step>
              <Step n={3} title="Vous lisez les réponses">
                Rangées question par question, fichiers joints compris, dans l'administration ou en
                export CSV.
              </Step>
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Ce qui change pour le répondant</h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={MessagesSquare} title="Une question à la fois">
              Pas de page de vingt champs. L'assistant enchaîne et reformule si la question n'est
              pas claire.
            </Feature>
            <Feature icon={ListChecks} title="Réponses en un clic">
              Choix, cases à cocher, oui / non, dates et suggestions adaptées : on clique au lieu de
              taper.
            </Feature>
            <Feature icon={PencilLine} title="Tout reste corrigeable">
              Un panneau montre les réponses retenues. On les relit et on les modifie avant
              d'envoyer.
            </Feature>
            <Feature icon={FileUp} title="Photos et documents">
              Une question peut demander des fichiers : photos, PDF, devis… jusqu'à 20 Mo chacun.
            </Feature>
            <Feature icon={Bot} title="Piloté par Claude">
              Un serveur MCP expose toute l'administration : créer, envoyer et lire un questionnaire
              depuis une conversation.
            </Feature>
            <Feature icon={Lock} title="Hébergé en France">
              Base de données et fichiers chez OVH. Le code est ouvert : vous savez exactement ce
              qu'il fait de vos réponses.
            </Feature>
          </div>
        </section>

        <section id="tarifs" className="scroll-mt-6 border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Tarifs</h2>
            <p className="mt-3 text-muted-foreground">
              Sans engagement. 14 jours d'essai gratuit, toutes fonctions, 20 réponses.
            </p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    'flex flex-col rounded-xl border bg-background p-6',
                    plan.featured && 'border-foreground shadow-lg',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {plan.featured && (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Le plus complet
                      </span>
                    )}
                  </div>
                  <p className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="text-muted-foreground"> {plan.period}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.pitch}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    size="lg"
                    variant={plan.featured ? 'default' : 'outline'}
                    className="mt-8 h-11"
                  >
                    <a href={plan.cta.href}>{plan.cta.label}</a>
                  </Button>
                </div>
              ))}
            </div>
            {/* TODO : régime de TVA à confirmer (franchise art. 293 B du CGI ou prix TTC). */}
            <p className="mt-6 text-sm text-muted-foreground">
              Paiement mensuel par carte via Stripe. TODO : mention de TVA à confirmer.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Questions fréquentes</h2>
          <div className="mt-8 divide-y border-y">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span
                    className="text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Préférez l'héberger ?</h2>
              <p className="mt-4 text-muted-foreground">
                Askly est un logiciel libre sous licence MIT. Une image Docker, une base Postgres,
                une clé Anthropic : vous pouvez l'installer chez vous, le modifier et le
                redistribuer.
              </p>
              <Button asChild size="lg" variant="outline" className="mt-8 h-11 px-5">
                <a href={REPO}>Le dépôt sur GitHub</a>
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-primary p-5 text-sm leading-relaxed text-primary-foreground">
              <code>{`git clone ${REPO}
cd askly && pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate && pnpm dev`}</code>
            </pre>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Askly · logiciel libre sous licence MIT</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/mentions-legales" className="hover:text-foreground">
            Mentions légales
          </Link>
          <Link to="/cgv" className="hover:text-foreground">
            CGV
          </Link>
          <Link to="/confidentialite" className="hover:text-foreground">
            Confidentialité
          </Link>
          <a href={REPO} className="hover:text-foreground">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        {n}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </li>
  )
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <Icon className="size-6" aria-hidden />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </div>
  )
}
