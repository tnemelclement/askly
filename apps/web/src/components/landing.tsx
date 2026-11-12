import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  type Bot,
  Check,
  Code,
  FileUp,
  ImagePlus,
  ListChecks,
  MessagesSquare,
  Mic,
  PencilLine,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Comparison, Demo, HeroChat } from './landing-demo'
import { ProductReplay } from './product-replay'
import { SiteFooter, SiteHeader } from './site'

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
    q: 'Puis-je l’intégrer à mon site ?',
    a: 'Oui : activez le lien public d’un questionnaire et collez une ligne de code (une iframe) : le questionnaire s’affiche directement dans votre page. Chaque visiteur qui commence compte pour une réponse.',
  },
  {
    q: 'Puis-je résilier ?',
    a: 'Oui, à tout moment depuis votre compte, sans engagement. L’abonnement s’arrête à la fin du mois déjà payé.',
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
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Ce que vous demandez à vos clients, en conversation.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Un questionnaire à remplir, un réglage à faire, un avis à donner : une IA mène
              l’échange, explique quand on hésite, guide quand on bloque et range tout au fil de la
              conversation. Vous recevez des réponses complètes, pas des champs vides.
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
              14 jours d'essai, sans carte bancaire.
            </p>
          </div>
          <HeroChat />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Trois façons de l’utiliser</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Un questionnaire envoyé à vos clients, un tutoriel qui les guide pas à pas, ou un
            formulaire intégré à votre site. Le tout depuis le même compte.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <UseCard
              icon={MessagesSquare}
              title="Questionnaires"
              to="/fonctionnalites"
              cta="Toutes les fonctionnalités"
            >
              Un lien par personne. L’IA pose vos questions, les explique et range les réponses. Ou,
              si vous préférez, un formulaire classique une question par écran, sans IA.
            </UseCard>
            <UseCard icon={BookOpen} title="Tutoriels guidés" to="/tutoriels" cta="Découvrir">
              Configurer un domaine, activer la double authentification, installer un logiciel :
              l’IA guide votre client étape par étape, et l’aide quand il bloque.
            </UseCard>
            <UseCard icon={Code} title="Sur votre site" to="/integration" cta="Voir comment">
              Le questionnaire directement dans votre page, en une ligne de code : chaque visiteur
              répond en conversation, vous recevez des réponses complètes.
            </UseCard>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Ce que voit votre client</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Il répond dans un chat, l’assistant l’aide quand il hésite, et chaque réponse se range à
            droite, prête à être relue et corrigée avant l’envoi.
          </p>
          <div className="mt-8">
            <ProductReplay />
          </div>
        </section>

        <Comparison />
        <Demo />

        <section className="border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Comment ça marche</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              <Step n={1} title="Vous préparez">
                Les questions d’un questionnaire ou les étapes d’un tutoriel. Ou décrivez ce que
                vous voulez : l’IA le rédige, vous ajustez.
              </Step>
              <Step n={2} title="Vous partagez">
                Un lien par personne, par mail ou WhatsApp, ou un lien public intégré dans votre
                site. On répond quand on veut, on reprend où on en était.
              </Step>
              <Step n={3} title="Vous recevez">
                Réponses rangées, étapes cochées, fichiers et captures, toute la conversation : dans
                l’administration ou en export CSV.
              </Step>
            </ol>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ce qui change pour vos clients
            </h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              <Feature icon={MessagesSquare} title="Une question à la fois">
                Pas de page de vingt champs. L'assistant enchaîne et reformule si la question n'est
                pas claire.
              </Feature>
              <Feature icon={ListChecks} title="Réponses en un clic">
                Choix, cases à cocher, oui / non, dates et suggestions adaptées : on clique au lieu
                de taper.
              </Feature>
              <Feature icon={Mic} title="Répondre à la voix">
                Un micro dans la barre de réponse : on parle, le texte s’écrit, on relit avant
                d’envoyer.
              </Feature>
              <Feature icon={ImagePlus} title="Photos et captures d’écran">
                On joint une photo ou une capture, l’IA la regarde et s’en sert pour répondre ou
                débloquer la situation.
              </Feature>
              <Feature icon={PencilLine} title="Tout reste corrigeable">
                Un panneau montre les réponses retenues. On les relit et on les modifie avant
                d'envoyer.
              </Feature>
              <Feature icon={FileUp} title="Documents joints">
                Une question peut demander des fichiers : photos, PDF, devis… jusqu'à 20 Mo chacun.
              </Feature>
            </div>
            <Button asChild variant="outline" className="mt-12">
              <Link to="/fonctionnalites">
                Toutes les fonctionnalités <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>

        <section id="tarifs" className="scroll-mt-6 border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Tarifs</h2>
            <p className="mt-3 text-muted-foreground">
              Sans engagement. 14 jours d'essai gratuit, toutes fonctions, 20 réponses.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
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
            <p className="mt-6 text-sm text-muted-foreground">
              Prix TTC, TVA de 20 % incluse. Paiement mensuel par carte via Stripe.
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
      </main>

      <SiteFooter />
    </div>
  )
}

function UseCard({
  icon: Icon,
  title,
  to,
  cta,
  children,
}: {
  icon: typeof Bot
  title: string
  to: '/fonctionnalites' | '/tutoriels' | '/integration'
  cta: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border bg-background p-6 transition-colors hover:border-foreground"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 flex-1 text-muted-foreground">{children}</p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
        {cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
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
