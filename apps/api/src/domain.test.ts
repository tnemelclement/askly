import { describe, expect, it } from 'vitest'
import { formatAnswer, validateAnswer } from './domain.ts'
import { listForms, parseForm } from './forms.ts'

const YAML = `
title: Test
intro: Intro
sections:
  - title: S
    questions:
      - { id: nom, label: Nom, type: text }
      - { id: notes, label: Notes, type: longtext, required: false }
      - { id: offre, label: Offre, type: choice, options: [A, B] }
      - { id: pages, label: Pages, type: multichoice, options: [Accueil, Contact, Blog] }
      - { id: budget, label: Budget, type: number }
      - { id: jour, label: Jour, type: date }
      - { id: ok, label: OK, type: yesno }
`
const form = parseForm('test', YAML)

describe('validation du YAML', () => {
  it('accepte un questionnaire valide et met required à true par défaut', () => {
    expect(form.sections[0]?.questions[0]?.required).toBe(true)
    expect(form.sections[0]?.questions[1]?.required).toBe(false)
  })

  it('valide les questionnaires livrés dans forms/', () => {
    expect(listForms().length).toBeGreaterThan(0)
  })

  it.each([
    ['type inconnu', '{ id: a, label: A, type: email }'],
    ['choice sans options', '{ id: a, label: A, type: choice }'],
    ['options sur un texte', '{ id: a, label: A, type: text, options: [x, y] }'],
    ['id mal formé', '{ id: Mon-Id, label: A, type: text }'],
    ['champ inconnu', '{ id: a, label: A, type: text, requis: true }'],
    ['id en double', '{ id: a, label: A, type: text }\n      - { id: a, label: B, type: text }'],
  ])('refuse : %s', (_, question) => {
    const source = `title: T\nintro: I\nsections:\n  - title: S\n    questions:\n      - ${question}\n`
    expect(() => parseForm('bad', source)).toThrow(/Questionnaire « bad » invalide/)
  })

  it('refuse un questionnaire sans section', () => {
    expect(() => parseForm('bad', 'title: T\nintro: I\nsections: []\n')).toThrow()
  })
})

describe('validation de record_answer par type', () => {
  const ok = (id: string, raw: unknown) => {
    const r = validateAnswer(form, id, raw)
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
  const ko = (id: string, raw: unknown) => {
    const r = validateAnswer(form, id, raw)
    expect(r.ok).toBe(false)
    return r.ok ? '' : r.error
  }

  it('refuse un id de question inconnu', () => {
    expect(ko('inexistante', 'x')).toMatch(/question inconnue/)
  })

  it('text / longtext : chaîne non vide, nettoyée, longueur bornée', () => {
    expect(ok('nom', '  Martin  ')).toBe('Martin')
    ko('nom', '   ')
    ko('nom', 42)
    ko('nom', 'x'.repeat(501))
    expect(ok('notes', 'x'.repeat(5000))).toHaveLength(5000)
  })

  it('choice : une option exacte', () => {
    expect(ok('offre', 'A')).toBe('A')
    ko('offre', 'C')
    ko('offre', ['A'])
  })

  it('multichoice : options connues, dédoublonnées, dans l’ordre du questionnaire', () => {
    expect(ok('pages', ['Contact', 'Accueil', 'Contact'])).toEqual(['Accueil', 'Contact'])
    expect(ko('pages', ['Accueil', 'Boutique'])).toMatch(/Boutique/)
    ko('pages', [])
    ko('pages', 'Accueil')
  })

  it('number : nombre ou chaîne numérique (virgule française)', () => {
    expect(ok('budget', 1500)).toBe(1500)
    expect(ok('budget', '1 500,5')).toBe(1500.5)
    ko('budget', 'beaucoup')
    ko('budget', '')
    ko('budget', true)
  })

  it('date : AAAA-MM-JJ et date réelle', () => {
    expect(ok('jour', '2026-03-15')).toBe('2026-03-15')
    ko('jour', '15/03/2026')
    ko('jour', '2026-02-30')
  })

  it('yesno : booléen uniquement', () => {
    expect(ok('ok', false)).toBe(false)
    ko('ok', 'oui')
  })

  it('formatAnswer rend des valeurs lisibles en français', () => {
    const q = (id: string) => form.sections[0]?.questions.find((x) => x.id === id)
    // biome-ignore lint/style/noNonNullAssertion: questions du YAML ci-dessus
    expect(formatAnswer(q('ok')!, true)).toBe('Oui')
    // biome-ignore lint/style/noNonNullAssertion: idem
    expect(formatAnswer(q('jour')!, '2026-03-15')).toBe('15/03/2026')
  })
})
