import { describe, expect, it } from 'vitest'
import { mergeSuggestions, PRESENT_QUESTION_TOOL, pendingQuestion, visibleMessages } from './ai.ts'
import { parseForm } from './forms.ts'

const form = parseForm(
  'test',
  `
title: T
intro: I
sections:
  - title: S
    questions:
      - { id: activite, label: Activité, type: text, suggestions: [Artisan, Commerce] }
      - { id: offre, label: Offre, type: choice, options: [A, B] }
      - { id: ok, label: OK, type: yesno }
`,
)
const q = (id: string) => {
  const found = form.sections[0]?.questions.find((x) => x.id === id)
  if (!found) throw new Error(id)
  return found
}

describe('réponses proposées', () => {
  it('met celles du questionnaire avant celles de l’IA, sans doublon', () => {
    expect(mergeSuggestions(q('activite'), ['Commerce', ' Restaurant ', '', 42])).toEqual([
      'Artisan',
      'Commerce',
      'Restaurant',
    ])
  })

  it('ignore les suggestions de l’IA pour une question à options ou oui/non', () => {
    expect(mergeSuggestions(q('offre'), ['C'])).toEqual([])
    expect(mergeSuggestions(q('ok'), ['Peut-être'])).toEqual([])
  })

  it('refuse `suggestions` sur une question à options', () => {
    expect(() =>
      parseForm(
        'test-x',
        'title: T\nintro: I\nsections:\n  - title: S\n    questions:\n      - { id: a, label: A, type: choice, options: [x, y], suggestions: [x] }\n',
      ),
    ).toThrow(/suggestions/)
  })

  it('refuse un identifiant de questionnaire mal formé', () => {
    expect(() => parseForm('Mon Questionnaire', {})).toThrow(/Identifiant/)
  })
})

describe('question en attente (reprise)', () => {
  const present = (questionId: string, suggestions?: string[]) => ({
    role: 'assistant' as const,
    display: 'question',
    content: [
      {
        type: 'tool_use',
        name: PRESENT_QUESTION_TOOL,
        input: { question_id: questionId, suggestions },
      },
    ],
  })
  const user = (display: string | null) => ({ role: 'user' as const, display, content: [] })

  it('renvoie la dernière question affichée', () => {
    expect(pendingQuestion(form, [present('offre'), user(null)], {})).toEqual({
      questionId: 'offre',
      suggestions: [],
    })
  })

  it('s’efface dès que le répondant a écrit', () => {
    expect(pendingQuestion(form, [present('activite', ['Bois']), user('Ébéniste')], {})).toBeNull()
  })

  it('se rabat sur la question suivante si l’IA a posé une question sans l’outil', () => {
    const asked = { role: 'assistant' as const, display: 'Quelle offre ?', content: [] }
    expect(pendingQuestion(form, [user('Artisan'), asked], { activite: 'Artisan' })).toEqual({
      questionId: 'offre',
      suggestions: [],
    })
    const told = { role: 'assistant' as const, display: 'Décrivez votre offre.', content: [] }
    expect(pendingQuestion(form, [user('Artisan'), told], { activite: 'Artisan' })).toEqual({
      questionId: 'offre',
      suggestions: [],
    })
    expect(pendingQuestion(form, [asked, user('B')], { activite: 'Artisan' })).toBeNull()
  })

  it('passe une facultative laissée vide derrière la dernière réponse', () => {
    const asked = { role: 'assistant' as const, display: 'Êtes-vous d’accord ?', content: [] }
    expect(pendingQuestion(form, [user('B'), asked], { offre: 'B' })).toEqual({
      questionId: 'ok',
      suggestions: [],
    })
  })

  it('ignore une question inconnue', () => {
    expect(pendingQuestion(form, [present('inexistante')], {})).toEqual({
      questionId: 'activite',
      suggestions: ['Artisan', 'Commerce'],
    })
  })
})

describe('images du répondant', () => {
  it('réaffiche les images envoyées en miniature', () => {
    const rows = [
      {
        id: 1,
        role: 'user',
        display: '',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
          { type: 'text', text: 'état…' },
        ],
      },
      { id: 2, role: 'user', display: null, content: [] },
    ] as unknown as Parameters<typeof visibleMessages>[0]
    expect(visibleMessages(rows)).toEqual([
      { id: 1, role: 'user', text: '', images: ['data:image/jpeg;base64,AAAA'] },
    ])
  })
})
