import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarCheck,
  ClipboardList,
  Inbox,
  MessageCircle,
  QrCode,
  Star,
  ThumbsUp,
  UserPlus,
  Wrench,
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

const IFRAME = `<iframe src="https://ask.tnemelc.fr/f/VOTRE-LIEN"
  title="Votre avis" width="100%" height="640"
  style="border:0;border-radius:12px" allow="microphone"></iframe>`

function IntegrationPage() {
  return (
    <SitePage>
      <PageHero
        eyebrow="Intégration sur votre site"
        title="Les avis et demandes de vos visiteurs, en conversation."
        aside={<SiteMock />}
      >
        Le questionnaire s’affiche directement dans votre page, comme une vidéo YouTube : une ligne
        à coller. Chaque visiteur répond en quelques clics ; vous recevez des réponses complètes,
        pas un « bien » dans un champ de texte.
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
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Une ligne à coller
            </h2>
            <p className="mt-3 text-muted-foreground">
              Dans Askly, ouvrez le questionnaire et cliquez sur « Intégrer » : le code est prêt.
              C’est une iframe classique, elle fonctionne sur tout site qui accepte un bout de HTML
              (WordPress, Wix, Webflow, Shopify…).
            </p>
            <ul className="mt-6 grid gap-3 text-sm">
              <li>
                <span className="font-medium">Où vous voulez :</span>{' '}
                <span className="text-muted-foreground">
                  page « Contact », page de remerciement après une commande, article de blog…
                </span>
              </li>
              <li>
                <span className="font-medium">À la taille voulue :</span>{' '}
                <span className="text-muted-foreground">
                  la largeur suit la page, la hauteur se règle avec height.
                </span>
              </li>
              <li>
                <span className="font-medium">Sans cadre en trop :</span>{' '}
                <span className="text-muted-foreground">
                  dans une iframe, Askly retire son propre cadre et se fond dans votre page.
                </span>
              </li>
            </ul>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-primary p-5 font-mono text-xs leading-relaxed text-primary-foreground">
            {IFRAME}
          </pre>
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
              Afficher la page ne coûte rien : une réponse n’est comptée que si le visiteur
              commence.
            </FeatureCard>
            <FeatureCard icon={QrCode} title="Aussi en lien direct">
              Le même lien public se met dans une signature de mail, un QR code en boutique ou une
              story.
            </FeatureCard>
          </div>
        </div>
      </section>

      <CtaBand title="Ajoutez une demande d’avis à votre site aujourd’hui." />
    </SitePage>
  )
}

/** Un site de boulangerie factice, avec le questionnaire d'avis intégré dans la page. */
function SiteMock() {
  return (
    <BrowserFrame url="boulangerie-martin.fr/merci">
      <div className="h-[34rem] overflow-hidden bg-[#fbf6ee]" aria-hidden>
        <div className="bg-[#c98b4a] px-6 py-4 text-white">
          <p className="font-serif text-xl font-semibold">Boulangerie Martin</p>
        </div>
        <div className="px-6 pt-5 text-[#3b2a1a]">
          <p className="font-serif text-lg font-semibold">Merci pour votre commande !</p>
          <p className="mt-1 text-sm opacity-70">
            Retrait demain dès 7 h. Laissez-nous votre avis :
          </p>
          {/* L'iframe : la page Askly, sans son cadre, posée dans le site. */}
          <div className="mt-4 overflow-hidden rounded-xl border border-[#3b2a1a]/10 bg-background">
            <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium text-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ClipboardList className="size-3.5" />
              </span>
              Votre avis sur la boulangerie
            </div>
            <div className="px-4 pb-4 text-foreground [&>div]:h-72">
              <ScriptedChat script={SCRIPT} loop />
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}
