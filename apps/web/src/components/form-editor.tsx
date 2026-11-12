import type { FormDefinition, Question, QuestionType } from '@askly/api/domain'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { parse, stringify } from 'yaml'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * Éditeur visuel d'un questionnaire. Le YAML reste la source : on le lit, on modifie l'objet
 * et on le réécrit, d'où un passage libre entre les deux vues (les commentaires YAML se
 * perdent à la première modification visuelle).
 */

type Q = Omit<Question, 'required'> & { required?: boolean }
type Section = { title: string; questions: Q[] }
type Def = Omit<FormDefinition, 'sections'> & { sections: Section[] }

const TYPES: Record<QuestionType, string> = {
  text: 'Texte court',
  longtext: 'Texte long',
  number: 'Nombre',
  date: 'Date',
  yesno: 'Oui / non',
  choice: 'Choix unique',
  multichoice: 'Choix multiples',
  file: 'Fichiers (photos, PDF…)',
  step: 'Étape à réaliser (tutoriel)',
}

const SELECT =
  'h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/** Lit le YAML ; `null` s'il est invalide ou n'a pas la forme d'un questionnaire. */
export function readDefinition(source: string): Def | null {
  try {
    const d = parse(source)
    const ok =
      d &&
      typeof d === 'object' &&
      Array.isArray(d.sections) &&
      d.sections.every((s: unknown) => Array.isArray((s as Section)?.questions))
    return ok ? (d as Def) : null
  } catch {
    return null
  }
}

const write = (d: Def) => stringify(d, { lineWidth: 100 })
const hasOptions = (t: QuestionType) => t === 'choice' || t === 'multichoice'
const lines = (s: string) => s.split('\n')
const toId = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)

export function FormEditor({
  source,
  onChange,
}: {
  source: string
  onChange: (source: string) => void
}) {
  const def = useMemo(() => readDefinition(source), [source])
  if (!def)
    return (
      <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        Le YAML est invalide : corrigez-le dans la vue YAML pour revenir à l’éditeur visuel.
      </p>
    )

  const update = (fn: (d: Def) => void) => {
    const next = structuredClone(def)
    fn(next)
    onChange(write(next))
  }
  const inSection = (si: number, fn: (s: Section) => void) =>
    update((d) => {
      const s = d.sections[si]
      if (s) fn(s)
    })
  const tutorial = def.kind === 'tutorial'
  const newType: QuestionType = tutorial ? 'step' : 'text'
  const allIds = def.sections.flatMap((s) => s.questions.map((q) => q.id))
  const freshId = () => {
    let n = allIds.length + 1
    while (allIds.includes(`question_${n}`)) n++
    return `question_${n}`
  }
  const move = <T,>(list: T[], i: number, by: number) => {
    const [item] = list.splice(i, 1)
    if (item !== undefined) list.splice(i + by, 0, item)
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Field label="Titre">
          <Input
            value={def.title ?? ''}
            onChange={(e) =>
              update((d) => {
                d.title = e.target.value
              })
            }
          />
        </Field>
        <Field label="Introduction (vue par le répondant)">
          <Textarea
            rows={2}
            value={def.intro ?? ''}
            onChange={(e) =>
              update((d) => {
                d.intro = e.target.value
              })
            }
          />
        </Field>
        <Field label="Contexte pour l’IA (qui répond, à quoi servent les réponses)">
          <Textarea
            rows={2}
            value={def.context ?? ''}
            onChange={(e) =>
              update((d) => {
                if (e.target.value) d.context = e.target.value
                else delete d.context
              })
            }
          />
        </Field>
        <Field label="Type">
          <select
            className={`${SELECT} sm:max-w-md`}
            value={def.kind ?? 'questionnaire'}
            onChange={(e) =>
              update((d) => {
                if (e.target.value === 'tutorial') d.kind = 'tutorial'
                else delete d.kind
              })
            }
          >
            <option value="questionnaire">Questionnaire : des questions à poser</option>
            <option value="tutorial">Tutoriel : guider la personne étape par étape</option>
          </select>
        </Field>
        <Field label="Présentation">
          <select
            className={`${SELECT} sm:max-w-md`}
            value={def.style ?? 'chat'}
            onChange={(e) =>
              update((d) => {
                if (e.target.value === 'classic') d.style = 'classic'
                else delete d.style
              })
            }
          >
            <option value="chat">Conversation avec l’IA</option>
            <option value="classic">Formulaire classique, une question par écran (sans IA)</option>
          </select>
        </Field>
      </div>

      {def.sections.map((section, si) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: les sections n'ont pas d'identifiant.
        <section key={si} className="grid gap-3 rounded-xl border bg-muted/40 p-4">
          <div className="flex items-end gap-2">
            <Field label={`Section ${si + 1}`} className="flex-1">
              <Input
                value={section.title ?? ''}
                onChange={(e) =>
                  inSection(si, (s) => {
                    s.title = e.target.value
                  })
                }
              />
            </Field>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Supprimer la section"
              disabled={def.sections.length < 2}
              onClick={() => update((d) => void d.sections.splice(si, 1))}
            >
              <Trash2 />
            </Button>
          </div>

          {section.questions.map((q, qi) => {
            const set = (fn: (q: Q) => void) =>
              inSection(si, (s) => {
                const q = s.questions[qi]
                if (q) fn(q)
              })
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: l'id se modifie en cours de saisie.
              <div key={qi} className="grid gap-3 rounded-lg border bg-background p-4">
                <div className="flex items-start gap-2">
                  <Field label={`${tutorial ? 'Étape' : 'Question'} ${qi + 1}`} className="flex-1">
                    <Input
                      value={q.label ?? ''}
                      onChange={(e) =>
                        set((q) => {
                          q.label = e.target.value
                        })
                      }
                      onBlur={() =>
                        /^question_\d+$/.test(q.id) &&
                        toId(q.label) &&
                        !allIds.includes(toId(q.label)) &&
                        set((q) => {
                          q.id = toId(q.label)
                        })
                      }
                    />
                  </Field>
                  <div className="flex pt-6">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Monter"
                      disabled={qi === 0}
                      onClick={() => inSection(si, (s) => move(s.questions, qi, -1))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Descendre"
                      disabled={qi === section.questions.length - 1}
                      onClick={() => inSection(si, (s) => move(s.questions, qi, 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer la question"
                      disabled={section.questions.length < 2}
                      onClick={() => inSection(si, (s) => void s.questions.splice(qi, 1))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <select
                      className={SELECT}
                      value={q.type}
                      onChange={(e) =>
                        set((q) => {
                          q.type = e.target.value as QuestionType
                          if (hasOptions(q.type)) {
                            q.options ??= ['', '']
                            delete q.suggestions
                          } else delete q.options
                          if (q.type === 'file' || q.type === 'step') delete q.suggestions
                        })
                      }
                    >
                      {Object.entries(TYPES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Identifiant">
                    <Input
                      className="font-mono"
                      value={q.id}
                      onChange={(e) =>
                        set((q) => {
                          q.id = toId(e.target.value)
                        })
                      }
                    />
                  </Field>
                  <div className="flex items-center gap-2 sm:pt-6">
                    <Checkbox
                      id={`req-${si}-${qi}`}
                      checked={q.required !== false}
                      onCheckedChange={(v) =>
                        set((q) => {
                          if (v === true) delete q.required
                          else q.required = false
                        })
                      }
                    />
                    <Label htmlFor={`req-${si}-${qi}`} className="font-normal">
                      Obligatoire
                    </Label>
                  </div>
                </div>

                {hasOptions(q.type) && (
                  <ListField
                    label="Choix proposés (un par ligne)"
                    value={q.options ?? []}
                    onChange={(v) =>
                      set((q) => {
                        q.options = v
                      })
                    }
                  />
                )}
                {!hasOptions(q.type) && q.type !== 'file' && q.type !== 'step' && (
                  <ListField
                    label="Réponses suggérées en un clic (facultatif, une par ligne)"
                    value={q.suggestions ?? []}
                    onChange={(v) =>
                      set((q) => {
                        if (v.some(Boolean)) q.suggestions = v
                        else delete q.suggestions
                      })
                    }
                  />
                )}
                <Field label="Aide : ce que l’IA explique si le répondant hésite (facultatif)">
                  <Textarea
                    rows={2}
                    value={q.help ?? ''}
                    onChange={(e) =>
                      set((q) => {
                        if (e.target.value) q.help = e.target.value
                        else delete q.help
                      })
                    }
                  />
                </Field>
              </div>
            )
          })}

          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              inSection(
                si,
                (s) => void s.questions.push({ id: freshId(), label: '', type: newType }),
              )
            }
          >
            <Plus /> {tutorial ? 'Ajouter une étape' : 'Ajouter une question'}
          </Button>
        </section>
      ))}

      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          update(
            (d) =>
              void d.sections.push({
                title: 'Nouvelle section',
                questions: [{ id: freshId(), label: '', type: newType }],
              }),
          )
        }
      >
        <Plus /> Ajouter une section
      </Button>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: le champ est l'enfant du label.
    <label className={`grid gap-2 ${className ?? ''}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

/** Une valeur par ligne ; les lignes vides (en cours de saisie) ne partent qu'à la sortie du champ. */
function ListField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <Field label={label}>
      <Textarea
        rows={Math.max(2, value.length)}
        value={value.join('\n')}
        onChange={(e) => onChange(lines(e.target.value))}
        onBlur={() => onChange(value.map((s) => s.trim()).filter(Boolean))}
      />
    </Field>
  )
}
