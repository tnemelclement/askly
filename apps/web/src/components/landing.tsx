import {
  ArrowRight,
  Bot,
  FileUp,
  ListChecks,
  Lock,
  MessagesSquare,
  PencilLine,
  Server,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ConversationThread,
  GuideMessage,
  UserAnswer,
} from '@/components/conversation/conversation'
import { Button } from '@/components/ui/button'

const REPO = 'https://github.com/tnemelclement/askly'

/** Page de présentation d'Askly (racine du site). */
export function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="size-4" aria-hidden />
          </span>
          Askly
        </span>
        <Button asChild variant="outline">
          <a href={REPO}>GitHub</a>
        </Button>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              Open source · auto-hébergeable
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Des questionnaires auxquels on a envie de répondre.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Askly remplace le formulaire par une conversation. Une IA pose vos questions une à
              une, les explique quand on hésite, propose des réponses en un clic et remplit les
              réponses au fil de l'échange. Vous recevez des réponses complètes, pas des champs
              vides.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <a href={REPO}>
                  Voir le code <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <a href="#heberger">L'héberger</a>
              </Button>
            </div>
          </div>
          <Preview />
        </section>

        <section className="border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Comment ça marche</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              <Step n={1} title="Vous écrivez les questions">
                En YAML, depuis l'administration, ou en demandant à Claude : « fais-moi un
                questionnaire pour Dupont sur son projet de cuisine ».
              </Step>
              <Step n={2} title="Vous envoyez un lien">
                Chaque personne a son lien. Elle répond quand elle veut, s'arrête et reprend où elle
                en était.
              </Step>
              <Step n={3} title="Vous lisez les réponses">
                Rangées question par question, fichiers joints compris, dans l'administration ou via
                l'API.
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
            <Feature icon={Lock} title="Vos données chez vous">
              Postgres et un stockage S3 que vous choisissez. Rien ne transite par un service tiers,
              hormis l'API du modèle.
            </Feature>
          </div>
        </section>

        <section id="heberger" className="border-t bg-muted/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <Server className="mb-4 size-8" aria-hidden />
              <h2 className="text-3xl font-semibold tracking-tight">Hébergez-le en cinq minutes</h2>
              <p className="mt-4 text-muted-foreground">
                Une seule image Docker, une base Postgres, une clé Anthropic. Licence MIT : vous
                pouvez l'utiliser, le modifier et le revendre.
              </p>
              <Button asChild size="lg" className="mt-8 h-11 px-5">
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

      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
        Askly · logiciel libre sous licence MIT
      </footer>
    </div>
  )
}

function Preview() {
  return (
    <div className="rounded-xl border bg-background p-5 shadow-lg sm:p-6" aria-hidden>
      <ConversationThread>
        <GuideMessage>Quel est l'objectif principal de votre site ?</GuideMessage>
        <UserAnswer>Je ne sais pas trop, c'est quoi la différence ?</UserAnswer>
        <GuideMessage>
          Un site vitrine présente votre activité ; un site de vente encaisse des commandes. Vous
          voulez surtout être trouvé, ou vendre en ligne ?
        </GuideMessage>
        <li className="ml-11 flex flex-wrap gap-2">
          {['Présenter mon activité', 'Obtenir des devis', 'Vendre en ligne'].map((o) => (
            <span key={o} className="rounded-full border px-3 py-1.5 text-sm">
              {o}
            </span>
          ))}
        </li>
      </ConversationThread>
    </div>
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
