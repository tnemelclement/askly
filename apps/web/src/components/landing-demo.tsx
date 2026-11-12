import { ArrowRight, Check, CircleAlert, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GuideMessage, ThinkingMessage, UserAnswer } from '@/components/conversation/conversation'
import { usePrefersReducedMotion } from '@/components/conversation/motion'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Mises en situation de la page d'accueil : conversation jouée, et vraie démo à essayer. */

type Line = { ai: string } | { user: string } | { chips: string[] } | { file: string }

interface Scenario {
  /** Questionnaire `forms/<formId>.yaml` ouvert par « Répondre moi-même ». */
  formId: string
  tab: string
  persona: string
  replaces: string
  script: Line[]
  received: [string, string][]
}

export const SCENARIOS: Scenario[] = [
  {
    formId: 'demo-renovation',
    tab: 'Artisan',
    persona:
      'Vous rénovez des salles de bain et des cuisines. Avant de vous déplacer, vous voulez savoir quoi, combien de m², quel budget et pour quand.',
    replaces:
      'Un formulaire « Décrivez votre projet » qui renvoie trois lignes, puis quatre coups de fil pour tout préciser.',
    script: [
      { ai: 'Bonjour ! Quelle pièce voulez-vous rénover ?' },
      { chips: ['Cuisine', 'Salle de bain', 'Chambre ou séjour'] },
      { user: 'La salle de bain' },
      { ai: 'Quelle est sa surface approximative, en m² ?' },
      { user: 'Aucune idée… elle est petite' },
      {
        ai: 'Pas de souci : longueur × largeur suffit. Une petite salle de bain fait souvent 4 à 6 m². Ça ressemble à la vôtre ?',
      },
      { user: 'Oui, plutôt 5 m² alors' },
      { ai: 'Je note 5 m². Pouvez-vous joindre une photo de la pièce actuelle ?' },
      { file: 'salle-de-bain.jpg' },
    ],
    received: [
      ['Pièce', 'Salle de bain'],
      ['Surface', '5 m²'],
      ['Travaux', 'Plomberie, sol'],
      ['Budget', '5 000 à 15 000 €'],
      ['Photos', '1 fichier'],
    ],
  },
  {
    formId: 'demo-site-web',
    tab: 'Agence web',
    persona:
      'Vous faites des sites pour des commerçants. Ils ne savent pas ce qu’est un nom de domaine, et c’est normal.',
    replaces:
      'Un brief de 25 questions en PDF, rempli à moitié, avec des « ? » dans toutes les cases techniques.',
    script: [
      { ai: 'Avez-vous déjà un nom de domaine ?' },
      { user: 'C’est quoi exactement ?' },
      {
        ai: 'C’est l’adresse de votre site, comme « boulangerie-martin.fr ». Si vous en avez une, vous recevez une facture chaque année, souvent chez OVH ou Gandi.',
      },
      { user: 'Ah oui, on paie un truc chez OVH tous les ans' },
      { ai: 'Alors c’est sûrement ça, je note oui. Qu’attendez-vous d’abord de votre site ?' },
      { chips: ['Être trouvé sur Google', 'Recevoir des devis', 'Vendre en ligne'] },
      { user: 'Recevoir des devis' },
    ],
    received: [
      ['Activité', 'Boulangerie de quartier'],
      ['Objectif', 'Recevoir des demandes de devis'],
      ['Nom de domaine', 'Oui, chez OVH'],
      ['Pages', 'Accueil, Produits, Contact'],
    ],
  },
  {
    formId: 'demo-recrutement',
    tab: 'Recrutement',
    persona:
      'Vous recrutez pour un restaurant. Vous voulez trier avant l’entretien, sans faire fuir les candidats sur leur téléphone.',
    replaces: 'Un formulaire de candidature froid, abandonné sur mobile à la troisième question.',
    script: [
      { ai: 'Avez-vous déjà travaillé au contact de clients ?' },
      { user: 'Pas en restaurant, mais deux étés à l’accueil d’un camping' },
      { ai: 'C’est une vraie expérience du public, je la note. Quand êtes-vous disponible ?' },
      { chips: ['Midis en semaine', 'Soirs en semaine', 'Week-ends'] },
      { user: 'Soirs et week-ends' },
      { ai: 'Noté. À partir de quand pourriez-vous commencer ?' },
      { user: 'Début du mois prochain' },
    ],
    received: [
      ['Expérience', '2 saisons à l’accueil d’un camping'],
      ['Disponibilités', 'Soirs en semaine, week-ends'],
      ['Contrat', 'Extra ou saison'],
      ['Début', '1er décembre'],
    ],
  },
]

const STEP_MS = 1300
/** Le scénario agence web, joué en boucle à côté du titre. */
export const HERO_SCRIPT = (SCENARIOS[1] as Scenario).script
/** Le passage « surface » du scénario artisan, en regard du formulaire classique. */
const COMPARISON_SCRIPT = (SCENARIOS[0] as Scenario).script.slice(3, 7)

/** Conversation jouée ligne à ligne (tout d'un coup si l'animation est réduite). */
export function ScriptedChat({ script, loop = false }: { script: Line[]; loop?: boolean }) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduced ? script.length : 0)
  // Ne joue que visible à l'écran : sinon la conversation est finie avant qu'on y arrive.
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), {
      threshold: 0.3,
    })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => setShown(reduced ? script.length : 0), [script, reduced])

  useEffect(() => {
    if (reduced || !visible) return
    const done = shown >= script.length
    if (done && !loop) return
    const timer = setTimeout(() => setShown(done ? 0 : shown + 1), done ? 4000 : STEP_MS)
    return () => clearTimeout(timer)
  }, [shown, script, loop, reduced, visible])

  const next = script[shown]
  return (
    // Décor : la conversation jouée n'est pas annoncée aux lecteurs d'écran ligne à ligne.
    // Hauteur fixe, calée en bas : les nouveaux messages poussent les anciens vers le haut
    // au lieu d'agrandir la carte (et de faire bouger la page).
    <div
      ref={ref}
      className="flex h-96 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_3rem)]"
    >
      <ol className="flex flex-col gap-4" aria-hidden>
        {script.slice(0, shown).map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: script fixe, rejoué du début.
          <ScriptLine key={i} line={line} />
        ))}
        {next && 'ai' in next && <ThinkingMessage />}
      </ol>
    </div>
  )
}

function ScriptLine({ line }: { line: Line }) {
  if ('ai' in line) return <GuideMessage>{line.ai}</GuideMessage>
  if ('user' in line) return <UserAnswer>{line.user}</UserAnswer>
  if ('file' in line) {
    return (
      <UserAnswer>
        <span className="inline-flex items-center gap-2">
          <Paperclip className="size-4" />
          {line.file}
        </span>
      </UserAnswer>
    )
  }
  return (
    <li className="ml-11 flex flex-wrap gap-2 animate-in fade-in duration-300">
      {line.chips.map((c) => (
        <span key={c} className="rounded-full border px-3 py-1.5 text-sm">
          {c}
        </span>
      ))}
    </li>
  )
}

/** Ouvre un vrai questionnaire de démo (nouveau lien de répondant). */
function useStartDemo() {
  const [pending, setPending] = useState<string | null>(null)
  async function start(formId: string) {
    setPending(formId)
    try {
      const { link } = await api<{ link: string }>(`/api/demo/${formId}`, { body: {} })
      // Même domaine que la page, quel que soit PUBLIC_URL.
      window.location.href = new URL(link).pathname
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Démo indisponible')
      setPending(null)
    }
  }
  return { start, pending }
}

export function Demo() {
  const [active, setActive] = useState(0)
  const { start, pending } = useStartDemo()
  const s = SCENARIOS[active] as Scenario

  return (
    <section id="demo" className="scroll-mt-6 mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-semibold tracking-tight">
        Mettez-vous à la place de vos clients
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Trois métiers, trois questionnaires. Regardez la conversation, puis répondez-y vous-même :
        la démo est réelle.
      </p>

      <div role="tablist" aria-label="Cas d’usage" className="mt-8 flex flex-wrap gap-2">
        {SCENARIOS.map((sc, i) => (
          <button
            key={sc.formId}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              i === active
                ? 'border-foreground bg-primary text-primary-foreground'
                : 'hover:bg-muted',
            )}
          >
            {sc.tab}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold">La situation</h3>
            <p className="mt-2 text-muted-foreground">{s.persona}</p>
          </div>
          <div>
            <h3 className="font-semibold">Ce que ça remplace</h3>
            <p className="mt-2 text-muted-foreground">{s.replaces}</p>
          </div>
          <div className="rounded-xl border bg-muted/50 p-5">
            <h3 className="font-semibold">Ce que vous recevez</h3>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {s.received.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Rangé question par question, exportable en CSV, avec la conversation complète.
            </p>
          </div>
          <Button
            size="lg"
            className="h-11 px-5"
            disabled={pending !== null}
            onClick={() => start(s.formId)}
          >
            {pending === s.formId ? 'Ouverture…' : 'Répondre à cette démo moi-même'}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
        <div className="rounded-xl border bg-background p-5 shadow-lg sm:p-6">
          <ScriptedChat script={s.script} />
        </div>
      </div>
    </section>
  )
}

const COMPARISON: [string, string, string][] = [
  [
    'Une question pas comprise',
    'Laissée vide, ou une réponse au hasard',
    'L’assistant explique, avec un exemple du métier',
  ],
  [
    'Une réponse floue (« je sais pas, c’est petit »)',
    'Acceptée telle quelle',
    'Il aide à préciser, puis vérifie le format',
  ],
  [
    'Vingt questions',
    'Un mur de champs, on abandonne',
    'Une à la fois ; on s’arrête et on reprend plus tard',
  ],
  [
    'Sur téléphone',
    'Petits champs, menus déroulants',
    'Des boutons à toucher, comme une messagerie',
  ],
  [
    'Ce que vous recevez',
    'Des trous, et des rappels à faire',
    'Des réponses complètes, relues par la personne',
  ],
  [
    'Créer le questionnaire',
    'Champ par champ, dans un éditeur',
    'Décrivez-le en une phrase, l’IA le rédige',
  ],
]

export function Comparison() {
  return (
    <section className="border-y bg-muted/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          Le formulaire classique pose des questions. Askly obtient des réponses.
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ClassicFormMock />
          <div className="rounded-xl border bg-background p-5 shadow-lg sm:p-6">
            <p className="mb-4 text-sm font-medium">Askly</p>
            <ScriptedChat script={COMPARISON_SCRIPT} loop />
          </div>
        </div>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-3 pr-4 font-medium" />
                <th scope="col" className="py-3 pr-4 font-medium text-muted-foreground">
                  Formulaire classique
                </th>
                <th scope="col" className="py-3 font-medium">
                  Askly
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(([situation, classic, askly]) => (
                <tr key={situation} className="border-b last:border-0">
                  <th scope="row" className="py-4 pr-4 align-top font-medium">
                    {situation}
                  </th>
                  <td className="py-4 pr-4 align-top text-muted-foreground">
                    <span className="flex gap-2">
                      <X className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {classic}
                    </span>
                  </td>
                  <td className="py-4 align-top">
                    <span className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                      {askly}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** Formulaire classique figé, tel qu'on en reçoit : un champ vide, une erreur, une étape 2 sur 5. */
function ClassicFormMock() {
  const field = 'h-9 rounded-md border bg-background px-3 text-sm leading-9 text-muted-foreground'
  return (
    <div className="rounded-xl border bg-background p-5 sm:p-6" aria-hidden>
      <div className="mb-4 flex items-center justify-between text-sm">
        <p className="font-medium text-muted-foreground">Formulaire classique</p>
        <p className="text-muted-foreground">Étape 2 sur 5</p>
      </div>
      <div className="space-y-4 opacity-90">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Type de pièce *</p>
          <div className={field}>Sélectionnez…</div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Surface (m²) *</p>
          <div className={cn(field, 'border-destructive')} />
          <p className="flex items-center gap-1 text-xs text-destructive">
            <CircleAlert className="size-3.5" />
            Ce champ est obligatoire
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Nature des travaux (lot) *</p>
          <div className={field}>Sélectionnez…</div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Budget prévisionnel HT *</p>
          <div className={field} />
        </div>
        <div className="flex justify-between pt-2">
          <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
            Précédent
          </span>
          <span className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            Suivant
          </span>
        </div>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        « C’est quoi un lot ? Je mets quoi pour la surface ? »… et l’onglet se ferme.
      </p>
    </div>
  )
}
