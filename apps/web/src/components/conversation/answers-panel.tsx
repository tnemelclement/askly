import {
  type Answers,
  type AnswerValue,
  allQuestions,
  type Form,
  formatAnswer,
  missingRequired,
  type Question,
} from '@askly/api/domain'
import { FileText, Lock, Pencil, Send, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { FileInfo } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AnimatedCheck } from './animated-check'
import { FileAttachButton } from './file-attach'
import { usePrefersReducedMotion, useStaggeredReveal } from './motion'

/**
 * Panneau « Vos réponses » : les questions groupées par section, qui se cochent (l'une
 * après l'autre) à mesure que l'assistant enregistre les réponses. Chaque ligne s'ouvre
 * pour être corrigée à la main ; « Envoyer mes réponses » verrouille le tout.
 */

export function answersCounterLabel(ready: number, total: number): string {
  return `${ready}/${total} réponse${ready > 1 ? 's' : ''}`
}

export function AnswersPanel({
  form,
  answers,
  files,
  fileHref,
  onAttach,
  uploading,
  locked,
  onEdit,
  onSubmit,
  submitting,
}: {
  form: Form
  answers: Answers
  /** Fichiers joints, par id, et lien pour les retélécharger. */
  files: Record<string, FileInfo>
  fileHref: (id: string) => string
  onAttach: (questionId: string, files: File[]) => Promise<void>
  uploading: boolean
  locked: boolean
  onEdit: (questionId: string, value: AnswerValue) => Promise<void>
  onSubmit: () => void
  submitting: boolean
}) {
  const reducedMotion = usePrefersReducedMotion()
  const answeredIds = useMemo(() => Object.keys(answers), [answers])
  const revealed = useStaggeredReveal(answeredIds, reducedMotion)
  // Déjà remplies au montage (reprise) : ni animées, ni annoncées.
  const initial = useRef<ReadonlySet<string>>(new Set(answeredIds))
  const [editing, setEditing] = useState<Question | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(new Set(answeredIds))
  const names = useMemo(
    () => Object.fromEntries(Object.values(files).map((f) => [f.id, f.filename])),
    [files],
  )

  useEffect(() => {
    const fresh = allQuestions(form).filter(
      (q) => answers[q.id] !== undefined && revealed.has(q.id) && !announced.current.has(q.id),
    )
    if (fresh.length === 0) return
    for (const q of fresh) announced.current.add(q.id)
    setAnnouncement(
      fresh.map((q) => `${q.label} : ${formatAnswer(q, answers[q.id], names)}`).join(' ; '),
    )
  }, [form, answers, revealed, names])

  const total = allQuestions(form).length
  const ready = answeredIds.filter((id) => revealed.has(id)).length
  const missing = missingRequired(form, answers)

  return (
    <section aria-label="Vos réponses" className="flex h-full flex-col">
      <header className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Vos réponses</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {answersCounterLabel(ready, total)}
          {!locked && ' · cliquez sur une ligne pour la corriger'}
        </p>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {form.sections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.questions.map((q) => {
                const value = answers[q.id]
                const state =
                  value === undefined ? 'empty' : revealed.has(q.id) ? 'checked' : 'pending'
                const animate = !reducedMotion && state === 'checked' && !initial.current.has(q.id)
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setEditing(q)}
                      data-status={state}
                      className={cn(
                        'group flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                        'enabled:hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        state === 'empty' && 'opacity-70',
                        animate && 'answer-glow',
                      )}
                    >
                      <AnimatedCheck state={state} animate={animate} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">
                          {q.label}
                          {!q.required && ' (facultatif)'}
                        </span>
                        <span className="block text-sm break-words">
                          {state === 'empty' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            formatAnswer(q, value, names)
                          )}
                        </span>
                      </span>
                      {!locked && (
                        <Pencil
                          aria-hidden="true"
                          className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <footer className="border-t px-5 py-4">
        {locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" />
            Réponses envoyées. Merci !
          </p>
        ) : (
          <>
            <Button
              className="w-full"
              size="lg"
              disabled={missing.length > 0 || submitting}
              onClick={onSubmit}
            >
              <Send />
              Envoyer mes réponses
            </Button>
            {missing.length > 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Encore {missing.length} question{missing.length > 1 ? 's' : ''} obligatoire
                {missing.length > 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </footer>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {editing?.type === 'file' && (
        <FilesEditor
          question={editing}
          ids={Array.isArray(answers[editing.id]) ? (answers[editing.id] as string[]) : []}
          files={files}
          fileHref={fileHref}
          uploading={uploading}
          onAttach={(list) => onAttach(editing.id, list)}
          onRemove={(remaining) => onEdit(editing.id, remaining)}
          onClose={() => setEditing(null)}
        />
      )}

      {editing && editing.type !== 'file' && (
        <AnswerEditor
          question={editing}
          value={answers[editing.id]}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            await onEdit(editing.id, v)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

/** Fichiers joints à une question : les voir, en retirer, en ajouter. */
function FilesEditor({
  question: q,
  ids,
  files,
  fileHref,
  uploading,
  onAttach,
  onRemove,
  onClose,
}: {
  question: Question
  ids: string[]
  files: Record<string, FileInfo>
  fileHref: (id: string) => string
  uploading: boolean
  onAttach: (files: File[]) => Promise<void>
  onRemove: (remaining: string[]) => Promise<void>
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vos fichiers</DialogTitle>
          <DialogDescription>{q.label}</DialogDescription>
        </DialogHeader>
        {ids.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun fichier pour l’instant.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {ids.map((id) => (
              <li key={id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={fileHref(id)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
                >
                  {files[id]?.filename ?? 'fichier'}
                </a>
                {files[id] && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatSize(files[id].size)}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retirer ${files[id]?.filename ?? 'ce fichier'}`}
                  onClick={async () => {
                    setError(null)
                    try {
                      await onRemove(ids.filter((x) => x !== id))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Erreur')
                    }
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <FileAttachButton
            uploading={uploading}
            onFiles={(f) => void onAttach(f)}
            label="Ajouter"
          />
          <Button type="button" onClick={onClose}>
            Terminé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

/** Brouillon local : chaîne pour les champs de saisie, valeur typée pour les choix. */
function initialDraft(q: Question, value: AnswerValue | undefined): AnswerValue | undefined {
  if (value === undefined) return q.type === 'multichoice' ? [] : undefined
  return q.type === 'number' ? String(value) : value
}

function AnswerEditor({
  question: q,
  value,
  onClose,
  onSave,
}: {
  question: Question
  value: AnswerValue | undefined
  onClose: () => void
  onSave: (value: AnswerValue) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => initialDraft(q, value))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputId = `edit-${q.id}`

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (draft === undefined || draft === '') return setError('Indiquez une réponse.')
    setSaving(true)
    setError(null)
    try {
      // Le serveur fait foi : il convertit « 1 500 » en nombre ou refuse.
      await onSave(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^[a-z_0-9]+ : /, '') : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  let field: React.ReactNode
  switch (q.type) {
    case 'text':
    case 'number':
    case 'date':
      field = (
        <Input
          id={inputId}
          autoFocus
          type={q.type === 'date' ? 'date' : 'text'}
          inputMode={q.type === 'number' ? 'decimal' : undefined}
          value={typeof draft === 'string' ? draft : ''}
          onChange={(e) => setDraft(e.target.value)}
        />
      )
      break
    case 'longtext':
      field = (
        <Textarea
          id={inputId}
          autoFocus
          rows={5}
          value={typeof draft === 'string' ? draft : ''}
          onChange={(e) => setDraft(e.target.value)}
        />
      )
      break
    case 'yesno':
    case 'choice': {
      const options = q.type === 'yesno' ? ['Oui', 'Non'] : (q.options ?? [])
      const current =
        q.type === 'yesno' ? (draft === undefined ? '' : draft ? 'Oui' : 'Non') : draft
      field = (
        <RadioGroup
          value={typeof current === 'string' ? current : ''}
          onValueChange={(v) => setDraft(q.type === 'yesno' ? v === 'Oui' : v)}
        >
          {options.map((o) => (
            <Label key={o} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={o} />
              {o}
            </Label>
          ))}
        </RadioGroup>
      )
      break
    }
    case 'multichoice': {
      const selected = Array.isArray(draft) ? draft : []
      field = (
        <div className="grid gap-2">
          {(q.options ?? []).map((o) => (
            <Label key={o} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={selected.includes(o)}
                onCheckedChange={(on) =>
                  setDraft(on ? [...selected, o] : selected.filter((s) => s !== o))
                }
              />
              {o}
            </Label>
          ))}
        </div>
      )
      break
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Corriger la réponse</DialogTitle>
            <DialogDescription>
              <label htmlFor={inputId}>{q.label}</label>
            </DialogDescription>
          </DialogHeader>
          {field}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
