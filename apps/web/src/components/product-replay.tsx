import type { Answers, AnswerValue, Form } from '@askly/api/domain'
import { ArrowUp, Paperclip } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnswersPanel, answersCounterLabel } from '@/components/conversation/answers-panel'
import { ChatLayout } from '@/components/conversation/chat-layout'
import { GuideMessage, ThinkingMessage, UserAnswer } from '@/components/conversation/conversation'
import { usePrefersReducedMotion } from '@/components/conversation/motion'
import { cn } from '@/lib/utils'

/**
 * Le vrai écran du répondant (fil, boutons, panneau « Vos réponses »), rejoué en boucle sur
 * la page d'accueil : mêmes composants que `/r/$token`, conversation écrite d'avance.
 */

const FORM: Form = {
  id: 'demo-renovation',
  title: 'Votre projet de rénovation',
  intro: 'Quelques questions pour préparer la visite et le devis. Comptez cinq minutes.',
  sections: [
    {
      title: 'Le chantier',
      questions: [
        {
          id: 'piece',
          label: 'Quelle pièce voulez-vous rénover ?',
          type: 'choice',
          options: ['Cuisine', 'Salle de bain', 'Chambre ou séjour'],
          required: true,
        },
        {
          id: 'travaux',
          label: 'Quels travaux envisagez-vous ?',
          type: 'multichoice',
          options: ['Peinture', 'Sol', 'Plomberie', 'Électricité'],
          required: true,
        },
        { id: 'surface', label: 'Surface approximative, en m²', type: 'number', required: true },
        { id: 'photos', label: 'Photos de la pièce actuelle', type: 'file', required: false },
      ],
    },
    {
      title: 'Budget et délais',
      questions: [
        {
          id: 'budget',
          label: 'Quel budget envisagez-vous ?',
          type: 'choice',
          options: ['Moins de 5 000 €', '5 000 à 15 000 €', 'Plus de 15 000 €'],
          required: true,
        },
        { id: 'debut', label: 'Début des travaux souhaité', type: 'date', required: false },
        {
          id: 'occupe',
          label: 'Habiterez-vous le logement pendant les travaux ?',
          type: 'yesno',
          required: true,
        },
      ],
    },
  ],
}

const FILES = {
  f1: { id: 'f1', filename: 'salle-de-bain.jpg', contentType: 'image/jpeg', size: 1 },
}

type Step =
  | { ai: string }
  | { chips: string[] }
  /** `typed` : la réponse s'écrit d'abord dans la zone de saisie, sinon c'est un clic. */
  | { user: string; typed?: boolean; answer?: [string, AnswerValue] }
  | { file: string; answer: [string, AnswerValue] }

const SCRIPT: Step[] = [
  {
    ai: 'Bonjour ! Quelques questions pour préparer votre devis. Quelle pièce voulez-vous rénover ?',
  },
  { chips: ['Cuisine', 'Salle de bain', 'Chambre ou séjour'] },
  { user: 'Salle de bain', answer: ['piece', 'Salle de bain'] },
  { ai: 'Quels travaux envisagez-vous ? Plusieurs choix possibles.' },
  { chips: ['Peinture', 'Sol', 'Plomberie', 'Électricité'] },
  { user: 'La plomberie et le sol', typed: true, answer: ['travaux', ['Sol', 'Plomberie']] },
  { ai: 'Quelle est la surface approximative de la pièce, en m² ?' },
  { user: 'Aucune idée… elle est petite', typed: true },
  {
    ai: 'Pas de souci : une petite salle de bain fait souvent 4 à 6 m². Laquelle se rapproche le plus de la vôtre ?',
  },
  { chips: ['4 m²', '5 m²', '6 m²'] },
  { user: '5 m²', answer: ['surface', 5] },
  { ai: 'Pouvez-vous joindre une photo de la pièce telle qu’elle est aujourd’hui ?' },
  { file: 'salle-de-bain.jpg', answer: ['photos', ['f1']] },
  { ai: 'Merci, c’est très parlant. Quel budget envisagez-vous ?' },
  { chips: ['Moins de 5 000 €', '5 000 à 15 000 €', 'Plus de 15 000 €'] },
  { user: '5 000 à 15 000 €', answer: ['budget', '5 000 à 15 000 €'] },
  { ai: 'Pour quand aimeriez-vous commencer ?' },
  { user: 'Vers début mars', typed: true, answer: ['debut', '2027-03-01'] },
  { ai: 'Je note début mars 2027. Habiterez-vous le logement pendant les travaux ?' },
  { chips: ['Oui', 'Non'] },
  { user: 'Oui', answer: ['occupe', true] },
  { ai: 'C’est complet ! Relisez vos réponses à droite, corrigez si besoin, puis envoyez-les.' },
]

const STEP_MS = 1500
const TYPE_MS = 45

export function ProductReplay() {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduced ? SCRIPT.length : 0)
  // Texte en cours de frappe dans la zone de saisie (étape `typed` suivante).
  const [draft, setDraft] = useState('')
  const [round, setRound] = useState(0)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), {
      threshold: 0.25,
    })
    if (rootRef.current) observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !visible) return
    if (shown >= SCRIPT.length) {
      const t = setTimeout(() => {
        setShown(0)
        setRound((r) => r + 1)
      }, 6000)
      return () => clearTimeout(t)
    }
    const next = SCRIPT[shown]
    if (next && 'user' in next && next.typed && draft !== next.user) {
      const t = setTimeout(() => setDraft(next.user.slice(0, draft.length + 1)), TYPE_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(
      () => {
        setDraft('')
        setShown((n) => n + 1)
      },
      draft ? 400 : STEP_MS,
    )
    return () => clearTimeout(t)
  }, [shown, draft, visible, reduced])

  // Le fil suit la conversation, sans faire défiler la page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit le nombre de lignes.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [shown, reduced])

  const steps = SCRIPT.slice(0, shown)
  const answers: Answers = Object.fromEntries(
    steps.flatMap((s) => ('answer' in s && s.answer ? [s.answer] : [])),
  )
  const next = SCRIPT[shown]
  const last = steps[steps.length - 1]

  return (
    // Démonstration : ni annoncée ligne à ligne aux lecteurs d'écran, ni cliquable.
    <div ref={rootRef} className="h-[620px]" aria-hidden inert>
      <ChatLayout
        embedded
        title={FORM.title}
        scrollRef={scrollRef}
        panelSummary={answersCounterLabel(Object.keys(answers).length, 7)}
        panel={
          <AnswersPanel
            key={round}
            form={FORM}
            answers={answers}
            files={FILES}
            fileHref={() => '#'}
            onAttach={async () => {}}
            uploading={false}
            locked={false}
            onEdit={async () => {}}
            onSubmit={() => {}}
            submitting={false}
          />
        }
        composer={
          <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 pl-2 shadow-soft">
            <p
              className={cn(
                'min-h-10 flex-1 px-3 py-2 text-[15px]',
                !draft && 'text-muted-foreground',
              )}
            >
              {draft || 'Votre réponse, ou une question…'}
              {draft && <span className="ml-px animate-pulse">|</span>}
            </p>
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground',
                !draft && 'opacity-50',
              )}
            >
              <ArrowUp className="size-4" />
            </span>
          </div>
        }
      >
        <p className="mb-6 text-sm text-muted-foreground">{FORM.intro}</p>
        <ol className="flex flex-col gap-4">
          {steps.map((s, i) =>
            'ai' in s ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: script fixe, rejoué du début.
              <GuideMessage key={`${round}-${i}`}>{s.ai}</GuideMessage>
            ) : 'user' in s ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: idem.
              <UserAnswer key={`${round}-${i}`}>{s.user}</UserAnswer>
            ) : 'file' in s ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: idem.
              <UserAnswer key={`${round}-${i}`}>
                <span className="inline-flex items-center gap-2">
                  <Paperclip className="size-4" />
                  {s.file}
                </span>
              </UserAnswer>
            ) : // Les boutons ne restent que sous la question en cours.
            last === s ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: idem.
              <li key={`${round}-${i}`} className="ml-11 flex flex-wrap gap-2">
                {s.chips.map((c) => (
                  <span
                    key={c}
                    className={cn(
                      'rounded-full border bg-background px-3.5 py-2 text-sm transition-colors',
                      next && 'user' in next && !next.typed && next.user === c
                        ? 'border-foreground bg-primary text-primary-foreground delay-700'
                        : '',
                    )}
                  >
                    {c}
                  </span>
                ))}
              </li>
            ) : null,
          )}
          {next && 'ai' in next && <ThinkingMessage />}
        </ol>
      </ChatLayout>
    </div>
  )
}
