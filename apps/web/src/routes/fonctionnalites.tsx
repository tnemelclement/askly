import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Code,
  Download,
  FileUp,
  History,
  ImageIcon,
  ImagePlus,
  Link2,
  ListChecks,
  Lock,
  LockOpen,
  MessageCircleQuestion,
  MessagesSquare,
  Mic,
  PencilLine,
  RotateCcw,
  Smartphone,
  Sparkles,
  SquareStack,
  TableProperties,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { CtaBand, FeatureCard, PageHero, SitePage } from '@/components/site'

export const Route = createFileRoute('/fonctionnalites')({
  component: FeaturesPage,
})

function FeaturesPage() {
  return (
    <SitePage>
      <PageHero eyebrow="Fonctionnalités" title="Tout pour obtenir des réponses complètes.">
        Askly remplace le formulaire par une conversation. Vos clients répondent plus facilement,
        vous recevez des réponses propres, rangées et prêtes à utiliser.
      </PageHero>

      <Group
        title="Trois formats, un seul outil"
        intro="Choisissez à la création, changez quand vous voulez."
        muted
      >
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard icon={MessagesSquare} title="Conversation avec l’IA">
            L’assistant pose vos questions une à une, les explique quand on hésite, reformule et
            range chaque réponse. C’est le format par défaut.
          </FeatureCard>
          <FeatureCard icon={SquareStack} title="Formulaire classique">
            Une question par écran, une barre de progression, des raccourcis clavier. Sans IA : pour
            les questionnaires courts et très cadrés.
          </FeatureCard>
          <FeatureCard icon={BookOpen} title="Tutoriel guidé">
            Des étapes à réaliser plutôt que des questions. L’IA guide votre client pas à pas et
            l’aide quand il bloque.{' '}
            <Link
              to="/tutoriels"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              En savoir plus
            </Link>
          </FeatureCard>
        </div>
      </Group>

      <Group
        title="Pour vos répondants"
        intro="Moins d’effort pour eux, c’est plus de réponses pour vous."
      >
        <Grid>
          <FeatureCard icon={MessageCircleQuestion} title="Des explications à la demande">
            « C’est quoi un nom de domaine ? » L’assistant explique avec un exemple concret, puis
            revient à la question.
          </FeatureCard>
          <FeatureCard icon={ListChecks} title="Réponses en un clic">
            Choix, cases à cocher, oui / non, dates et suggestions adaptées à ce que la personne a
            déjà dit.
          </FeatureCard>
          <FeatureCard icon={Mic} title="Répondre à la voix">
            Un micro dans la barre de réponse : on parle, le texte s’écrit, on relit avant
            d’envoyer.
          </FeatureCard>
          <FeatureCard icon={ImagePlus} title="Photos et captures d’écran">
            On joint une image au message ; l’IA la regarde pour comprendre une situation ou
            débloquer une étape.
          </FeatureCard>
          <FeatureCard icon={FileUp} title="Documents joints">
            Une question peut demander des fichiers : photos, PDF, devis… jusqu’à 20 Mo chacun.
          </FeatureCard>
          <FeatureCard icon={PencilLine} title="Tout reste corrigeable">
            Un panneau montre les réponses retenues ; on les relit et on corrige avant d’envoyer.
          </FeatureCard>
          <FeatureCard icon={History} title="Reprendre plus tard">
            Le lien reste valable : on s’arrête, on revient le lendemain, la conversation reprend où
            elle en était.
          </FeatureCard>
          <FeatureCard icon={Smartphone} title="Pensé pour le téléphone">
            Lien reçu par WhatsApp ou SMS, réponses au pouce : rien à installer, aucun compte à
            créer.
          </FeatureCard>
          <FeatureCard icon={ArrowRight} title="Questions facultatives">
            Un bouton « Passer » sous chaque question facultative : on n’y revient pas.
          </FeatureCard>
        </Grid>
      </Group>

      <Group title="Pour vous" intro="Créer, envoyer, suivre, exporter : sans quitter Askly." muted>
        <Grid>
          <FeatureCard icon={Sparkles} title="Créé en le décrivant">
            « Je veux connaître le projet de cuisine d’un client » : l’IA rédige le questionnaire,
            vous l’ajustez.
          </FeatureCard>
          <FeatureCard icon={PencilLine} title="Éditeur visuel ou YAML">
            Sections, questions, options, aide : un éditeur simple, et le texte brut pour aller
            vite.
          </FeatureCard>
          <FeatureCard icon={ImageIcon} title="Images dans les questions">
            Une photo, un plan ou une capture sous la question, pour montrer plutôt qu’expliquer.
          </FeatureCard>
          <FeatureCard icon={Link2} title="Un lien par personne">
            À envoyer par mail, WhatsApp ou SMS ; le mail est prérédigé. Chaque réponse est
            nominative.
          </FeatureCard>
          <FeatureCard icon={Code} title="Sur votre site">
            Le questionnaire directement dans vos pages, avec une ligne de code (une iframe).{' '}
            <Link
              to="/integration"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              En savoir plus
            </Link>
          </FeatureCard>
          <FeatureCard icon={TableProperties} title="Suivi en direct">
            Qui a commencé, qui a fini, où en est chacun. La conversation complète, images
            comprises.
          </FeatureCard>
          <FeatureCard icon={Download} title="Export CSV et JSON">
            Une ligne par personne, une colonne par question : prêt pour un tableur ou un outil
            maison.
          </FeatureCard>
          <FeatureCard icon={RotateCcw} title="Rouvrir des réponses">
            Une erreur après l’envoi ? Vous rouvrez, la personne corrige avec le même lien.
          </FeatureCard>
          <FeatureCard icon={Bot} title="Piloté depuis Claude">
            Un serveur MCP et une API : « envoie ce questionnaire à Dupont » depuis une
            conversation.
          </FeatureCard>
        </Grid>
      </Group>

      <Group title="En confiance">
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard icon={Lock} title="Hébergé en France">
            Base de données et fichiers chez OVH. Seuls les messages passent par l’IA pour générer
            les réponses de l’assistant.
          </FeatureCard>
          <FeatureCard icon={LockOpen} title="Code ouvert">
            Askly est un logiciel libre : vous savez exactement ce qu’il fait de vos réponses.
          </FeatureCard>
          <FeatureCard icon={Download} title="Vos données vous appartiennent">
            Tout s’exporte à tout moment, sans engagement : l’abonnement se résilie en un clic.
          </FeatureCard>
        </div>
      </Group>

      <CtaBand title="Essayez avec votre prochain client." />
    </SitePage>
  )
}

function Group({
  title,
  intro,
  muted = false,
  children,
}: {
  title: string
  intro?: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <section className={muted ? 'border-y bg-muted/50' : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}
