import { describe, expect, it } from 'vitest'
import { allQuestions, formatAnswer, validateAnswer } from './domain.ts'
import { parseForm, readFormFiles } from './forms.ts'

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
      - { id: pieces, label: Pièces, type: file, image: { url: 'https://exemple.fr/a.png', alt: A } }
`
const form = parseForm('test', YAML)

describe('validation du YAML', () => {
  it('accepte un questionnaire valide et met required à true par défaut', () => {
    expect(form.sections[0]?.questions[0]?.required).toBe(true)
    expect(form.sections[0]?.questions[1]?.required).toBe(false)
  })

  it('valide les questionnaires livrés dans forms/', () => {
    expect(readFormFiles().length).toBeGreaterThan(0)
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

describe('fichiers et images', () => {
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  it('file : liste d’id de fichiers, dédoublonnée, 10 au plus', () => {
    const r = validateAnswer(form, 'pieces', [uuid, uuid])
    expect(r.ok && r.value).toEqual([uuid])
    expect(validateAnswer(form, 'pieces', []).ok).toBe(false)
    expect(validateAnswer(form, 'pieces', ['pas-un-id']).ok).toBe(false)
    expect(validateAnswer(form, 'pieces', 'plan.pdf').ok).toBe(false)
    const many = Array.from(
      { length: 11 },
      (_, i) => `3f2504e0-4f89-41d3-9a0c-0305e82c33${String(i).padStart(2, '0')}`,
    )
    expect(validateAnswer(form, 'pieces', many).ok).toBe(false)
  })

  it('formatAnswer affiche les noms des fichiers', () => {
    const q = form.sections[0]?.questions.find((x) => x.id === 'pieces')
    // biome-ignore lint/style/noNonNullAssertion: question du YAML ci-dessus
    expect(formatAnswer(q!, [uuid], { [uuid]: 'plan.pdf' })).toBe('plan.pdf')
  })

  it.each([
    [
      'image en http(s) seulement',
      "{ id: a, label: A, type: text, image: { url: 'ftp://x/a.png' } }",
    ],
    ['image sans url', '{ id: a, label: A, type: text, image: { alt: A } }'],
    ['suggestions sur un fichier', '{ id: a, label: A, type: file, suggestions: [x] }'],
    ['options sur un fichier', '{ id: a, label: A, type: file, options: [x, y] }'],
  ])('refuse : %s', (_, question) => {
    const source = `title: T\nintro: I\nsections:\n  - title: S\n    questions:\n      - ${question}\n`
    expect(() => parseForm('bad', source)).toThrow(/invalide/)
  })
})

describe('tutoriels', () => {
  const tuto = parseForm('tuto', {
    title: 'Installer l’app',
    intro: 'On y va pas à pas.',
    kind: 'tutorial',
    sections: [
      {
        title: 'Étapes',
        questions: [{ id: 'telecharger', label: 'Téléchargez l’app', type: 'step' }],
      },
    ],
  })

  it('une étape ne vaut que true, affichée « Fait »', () => {
    expect(validateAnswer(tuto, 'telecharger', true)).toMatchObject({ ok: true, value: true })
    expect(validateAnswer(tuto, 'telecharger', false).ok).toBe(false)
    expect(validateAnswer(tuto, 'telecharger', 'oui').ok).toBe(false)
    const [step] = allQuestions(tuto)
    expect(step && formatAnswer(step, true)).toBe('Fait')
  })

  it('le prompt guide au lieu d’interroger', async () => {
    const { buildSystemPrompt } = await import('./ai.ts')
    expect(buildSystemPrompt(tuto)).toContain('Vous guidez une personne')
  })
})
