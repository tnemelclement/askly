import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarCheck,
  Inbox,
  MessageCircle,
  QrCode,
  Star,
  ThumbsUp,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import { type Line, ScriptedChat } from '@/components/landing-demo'
import { BrowserFrame, CtaBand, FeatureCard, PageHero, SitePage } from '@/components/site'

export const Route = createFileRoute('/integration')({ component: IntegrationPage })

const SCRIPT: Line[] = [
  { ai: 'Bonjour ! Quelle note donneriez-vous à votre commande ?' },
  { chips: ['5 - Excellent', '4 - Très bien', '3 - Correct'] },
  { user: '5 - Excellent' },
  { ai: 'Merci ! Qu’avez-vous le plus apprécié ?' },
  { chips: ['Le goût', 'La fraîcheur', 'L’accueil'] },
  { user: 'Le pain au levain, encore tiède à 7 h' },
  { ai: 'Ça fait plaisir. Pouvons-nous publier votre avis sur notre site ?' },
  { user: 'Oui, avec mon prénom' },
]

const BUBBLE = `<script src="https://ask.tnemelc.fr/embed.js"
  data-askly="VOTRE-JETON" data-label="Donner mon avis" async></script>`

const INLINE = `<script src="https://ask.tnemelc.fr/embed.js"
  data-askly="VOTRE-JETON" data-mode="inline" async></script>`

function IntegrationPage() {
  return (
    <SitePage>
      <PageHero
        eyebrow="Intégration sur votre site"
        title="Les avis et demandes de vos visiteurs, en conversation."
        aside={<SiteMock />}
      >
        Une bulle « Donner mon avis » en bas de votre site, ou un formulaire directement dans la
        page. Chaque visiteur répond en quelques clics ; vous recevez des réponses complètes, pas un
        « bien » dans un champ de texte.
      </PageHero>

      <section className="border-y bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pour quoi faire ?</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={Star} title="Demande d’avis">
              Après une commande ou une prestation : la note, ce qui a plu, ce qui manque, et
              l’accord pour publier.
            </FeatureCard>
            <FeatureCard icon={Inbox} title="Contact et devis">
              Au lieu de « Votre message », l’IA demande ce qu’il faut pour chiffrer : surface,
              délai, budget, photos.
            </FeatureCard>
            <FeatureCard icon={CalendarCheck} title="Rendez-vous qualifié">
              Le motif, l’urgence, les disponibilités : vous arrivez au rendez-vous en connaissant
              le dossier.
            </FeatureCard>
            <FeatureCard icon={UserPlus} title="Inscription et candidature">
              Une candidature qui se remplit sur téléphone sans abandon à la troisième question.
            </FeatureCard>
            <FeatureCard icon={Wrench} title="Service après-vente">
              Le modèle, la panne, une photo : le diagnostic commence avant le premier appel.
            </FeatureCard>
            <FeatureCard icon={ThumbsUp} title="Satisfaction">
              Après une intervention, une formation ou un événement : des retours précis, pas des
              étoiles seules.
            </FeatureCard>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Deux lignes à coller, deux façons de l’afficher
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Dans Askly, ouvrez le questionnaire et cliquez sur « Intégrer » : le code est prêt. Il
          fonctionne sur tout site qui accepte un bout de HTML (WordPress, Webflow, Shopify…).
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <CodeCard title="La bulle" code={BUBBLE}>
            Un bouton en bas à droite de toutes vos pages. Le questionnaire s’ouvre dans un panneau,
            et ne se charge qu’au clic : votre site reste aussi rapide.
          </CodeCard>
          <CodeCard title="Dans la page" code={INLINE}>
            Le questionnaire s’affiche à l’endroit du code : page « Contact », page de remerciement
            après une commande, article de blog…
          </CodeCard>
        </div>
      </section>

      <section className="border-y bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bon à savoir</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={MessageCircle} title="Un visiteur, une réponse">
              Chaque personne qui clique sur « Commencer » apparaît dans votre liste, avec le site
              d’où elle vient. Si elle revient, elle reprend où elle en était.
            </FeatureCard>
            <FeatureCard icon={Star} title="Compté seulement s’il répond">
              Afficher la bulle ou la page ne coûte rien : une réponse n’est comptée que si le
              visiteur commence.
            </FeatureCard>
            <FeatureCard icon={QrCode} title="Aussi en lien direct">
              Le même lien public se met dans une signature de mail, un QR code en boutique ou une
              story.
            </FeatureCard>
          </div>
        </div>
      </section>

      <CtaBand title="Ajoutez une bulle « Donner mon avis » à votre site aujourd’hui." />
    </SitePage>
  )
}

function CodeCard({ title, code, children }: { title: string; code: string; children: string }) {
  return (
    <div className="flex flex-col rounded-xl border p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{children}</p>
      <pre className="mt-5 overflow-x-auto rounded-lg bg-primary p-4 font-mono text-xs leading-relaxed text-primary-foreground">
        {code}
      </pre>
    </div>
  )
}

/** Un site de boulangerie factice, avec la bulle ouverte sur une demande d'avis. */
function SiteMock() {
  return (
    <BrowserFrame url="boulangerie-martin.fr/merci" className="relative">
      <div className="relative h-[34rem] overflow-hidden bg-[#fbf6ee]" aria-hidden>
        <div className="bg-[#c98b4a] px-6 py-5 text-white">
          <p className="font-serif text-xl font-semibold">Boulangerie Martin</p>
          <p className="text-sm opacity-80">Merci pour votre commande !</p>
        </div>
        <div className="space-y-2 px-6 py-5">
          <div className="h-3 w-2/3 rounded bg-[#3b2a1a]/15" />
          <div className="h-3 w-1/2 rounded bg-[#3b2a1a]/10" />
          <div className="h-3 w-3/5 rounded bg-[#3b2a1a]/10" />
        </div>
        <div className="absolute right-4 bottom-16 left-4 overflow-hidden rounded-2xl bg-background shadow-2xl sm:left-auto sm:w-[22rem]">
          <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
            <span className="size-2 rounded-full bg-emerald-500" />
            Votre avis sur la boulangerie
          </div>
          <div className="px-4 pb-4 [&_ol]:gap-3 [&>div]:h-80">
            <ScriptedChat script={SCRIPT} loop />
          </div>
        </div>
        <span className="absolute right-4 bottom-4 flex size-10 items-center justify-center rounded-full bg-[#8a4b16] text-white shadow-lg">
          <X className="size-4" />
        </span>
      </div>
    </BrowserFrame>
  )
}
