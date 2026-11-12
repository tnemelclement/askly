import { createFileRoute } from '@tanstack/react-router'
import {
  Check,
  Circle,
  Globe,
  ImagePlus,
  KeyRound,
  LifeBuoy,
  ListChecks,
  LogIn,
  Mic,
  MonitorDown,
  Printer,
  ShieldCheck,
} from 'lucide-react'
import { type Line, ScriptedChat } from '@/components/landing-demo'
import { BrowserFrame, CtaBand, FeatureCard, PageHero, SitePage } from '@/components/site'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/tutoriels')({ component: TutorialsPage })

const SCRIPT: Line[] = [
  {
    ai: 'Étape 1 : connectez-vous à votre compte Gandi, puis ouvrez **Noms de domaine**. Dites-moi quand c’est fait.',
  },
  { chips: ['C’est fait', 'Je bloque'] },
  { user: 'Je bloque, je ne trouve pas' },
  { ai: 'Pas de souci. Que voyez-vous à l’écran ? Vous pouvez m’envoyer une capture.' },
  { file: 'capture-gandi.png' },
  {
    ai: 'Merci ! Vous êtes sur l’accueil. Cliquez sur **Domaines** dans le menu de gauche, puis sur boulangerie-martin.fr.',
  },
  { user: 'Ah oui, ça y est' },
  { ai: 'Parfait, c’est coché. Étape 2 : ouvrez l’onglet **Enregistrements DNS**.' },
]

const STEPS = [
  { label: 'Ouvrir les noms de domaine', done: true },
  { label: 'Ouvrir les enregistrements DNS', current: true },
  { label: 'Ajouter la ligne TXT de Google' },
  { label: 'Vérifier que la ligne apparaît' },
]

function TutorialsPage() {
  return (
    <SitePage>
      <PageHero
        eyebrow="Tutoriels guidés"
        title="Vos clients le font eux-mêmes. Sans vous appeler."
        aside={
          <BrowserFrame url="ask.tnemelc.fr/r/…">
            <div className="grid sm:grid-cols-[1fr_190px]">
              <div className="p-5">
                <ScriptedChat script={SCRIPT} loop />
              </div>
              <aside className="hidden border-l bg-muted/50 p-4 sm:block" aria-hidden>
                <p className="text-sm font-semibold">Étapes</p>
                <p className="text-xs text-muted-foreground">1/4 étape</p>
                <ul className="mt-4 grid gap-2.5 text-sm">
                  {STEPS.map((s) => (
                    <li
                      key={s.label}
                      className={cn(
                        'flex items-start gap-2 rounded-md px-1.5 py-1',
                        s.current && 'bg-muted font-medium',
                        s.done && 'text-muted-foreground line-through',
                      )}
                    >
                      {s.done ? (
                        <Check className="mt-0.5 size-4 shrink-0 rounded-full bg-primary p-0.5 text-primary-foreground" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                      )}
                      {s.label}
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </BrowserFrame>
        }
      >
        Configurer un nom de domaine, activer la double authentification, installer un logiciel : au
        lieu d’un appel de 40 minutes, envoyez un lien. L’IA guide votre client une étape à la fois
        et l’aide quand il bloque.
      </PageHero>

      <section className="border-y bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pour tout ce que vous expliquez au téléphone
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={Globe} title="Nom de domaine et DNS">
              Ajouter une ligne de vérification Google, pointer le domaine vers le nouveau site.
            </FeatureCard>
            <FeatureCard icon={ShieldCheck} title="Double authentification">
              L’activer sur un compte Google, Microsoft ou bancaire, application comprise.
            </FeatureCard>
            <FeatureCard icon={MonitorDown} title="Installer un logiciel">
              Télécharger, installer, faire les premiers réglages, sans prise en main à distance.
            </FeatureCard>
            <FeatureCard icon={LogIn} title="Première connexion">
              Activer un espace client, choisir un mot de passe, trouver les bons menus.
            </FeatureCard>
            <FeatureCard icon={Printer} title="Brancher un appareil">
              Imprimante, box, terminal de paiement : les étapes dans l’ordre, avec des photos.
            </FeatureCard>
            <FeatureCard icon={KeyRound} title="Donner un accès">
              Inviter votre agence sur Google Analytics ou un compte de publicité, sans partager de
              mot de passe.
            </FeatureCard>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Comment ça marche</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-4">
          <Step n={1} title="Vous écrivez les étapes">
            Une phrase par étape, avec l’aide utile et une capture. Ou décrivez le tutoriel : l’IA
            le rédige.
          </Step>
          <Step n={2} title="Vous envoyez un lien">
            Par mail, WhatsApp ou SMS. Rien à installer pour votre client.
          </Step>
          <Step n={3} title="L’IA guide">
            Une étape à la fois. « C’est fait » : elle coche et passe à la suite. « Je bloque » :
            elle cherche où, et réexplique autrement.
          </Step>
          <Step n={4} title="Vous suivez">
            Qui a terminé, où chacun s’est arrêté, et toute la conversation si vous devez reprendre
            la main.
          </Step>
        </ol>
      </section>

      <section className="border-y bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ce qui fait la différence
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={ListChecks} title="Une liste à cocher">
              Votre client voit où il en est et ce qu’il reste : il ne se perd pas.
            </FeatureCard>
            <FeatureCard icon={ImagePlus} title="Il montre son écran">
              Une capture suffit : l’IA comprend où il est et lui dit où cliquer.
            </FeatureCard>
            <FeatureCard icon={Mic} title="Il peut parler">
              Pas besoin de taper « je ne trouve pas le bouton » : il le dit au micro.
            </FeatureCard>
            <FeatureCard icon={LifeBuoy} title="Il n’est jamais seul">
              Si une étape ne correspond pas à ce qu’il voit, l’IA le dit et propose de vous
              prévenir.
            </FeatureCard>
          </div>
        </div>
      </section>

      <CtaBand title="Votre prochain appel « vous pouvez m’aider à… », envoyez un lien." />
    </SitePage>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: string }) {
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
