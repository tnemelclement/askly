import type { Answers, AnswerValue, Form, Question } from '@askly/api/domain'
import { ArrowRight, Check, ChevronLeft, ClipboardList, CornerDownLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FileAttachButton } from '@/components/conversation/file-attach'
import { ZoomableImage } from '@/components/conversation/zoomable-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { api, type FileInfo, MAX_UPLOAD_MB, uploadFile } from '@/lib/api'
import { hasFinePointer } from '@/lib/device'
import { cn } from '@/lib/utils'

/**
 * Formulaire classique (style Typeform) : une question par écran, sans IA. Chaque réponse
 * est enregistrée en passant à la suivante, par les mêmes routes que le panneau du chat.
 */

type Item = { q: Question; section: string }
type Saved = { answers: Answers; files: Record<string, FileInfo> }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const DONE = 'C’est fait'
const choicesOf = (q: Question) =>
  q.type === 'yesno' ? ['Oui', 'Non'] : q.type === 'step' ? [DONE] : (q.options ?? [])

/** Brouillon : texte pour les champs, liste pour les choix multiples, valeur brute sinon. */
function draftFor(q: Question, v: AnswerValue | undefined): AnswerValue | undefined {
  if (q.type === 'multichoice') return Array.isArray(v) ? v : []
  if (q.type === 'yesno') return v === undefined ? undefined : v ? 'Oui' : 'Non'
  if (q.type === 'step') return v === undefined ? undefined : DONE
  return v === undefined ? '' : typeof v === 'number' ? String(v) : v
}

export function ClassicForm({
  token,
  form,
  initial,
  onSubmitted,
}: {
  token: string
  form: Form
  initial: Saved
  onSubmitted: () => void
}) {
  const items: Item[] = form.sections.flatMap((s) =>
    s.questions.map((q) => ({ q, section: s.title })),
  )
  const [answers, setAnswers] = useState(initial.answers)
  const [files, setFiles] = useState(initial.files)
  // -1 : accueil ; items.length : envoi. On reprend à la première question sans réponse.
  const [step, setStep] = useState(() => {
    if (Object.keys(initial.answers).length === 0) return -1
    const i = items.findIndex(({ q }) => initial.answers[q.id] === undefined)
    return i === -1 ? items.length : i
  })
  const item = items[step]
  const [draft, setDraft] = useState<AnswerValue | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: on recharge le brouillon à chaque écran.
  useEffect(() => {
    if (item) setDraft(draftFor(item.q, answers[item.q.id]))
    setError(null)
  }, [step])

  const go = (to: number) => setStep(Math.max(-1, Math.min(items.length, to)))

  async function save(value: AnswerValue | undefined = draft) {
    if (!item) return
    const { q } = item
    const empty =
      value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (q.type === 'file' || empty) {
      if (q.required && answers[q.id] === undefined)
        return setError('Cette question est obligatoire.')
      return go(step + 1)
    }
    setBusy(true)
    setError(null)
    try {
      const body = {
        value: q.type === 'yesno' ? value === 'Oui' : q.type === 'step' ? true : value,
      }
      const res = await api<Saved>(`/api/r/${token}/answers/${q.id}`, { method: 'PUT', body })
      setAnswers(res.answers)
      setFiles(res.files)
      go(step + 1)
    } catch (err) {
      // Le serveur fait foi (« 1 500 » devient un nombre, ou il refuse) ; on garde son message.
      setError(err instanceof Error ? err.message.replace(/^[a-z_0-9]+ : /, '') : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function attach(list: File[]) {
    if (!item) return
    setBusy(true)
    setError(null)
    for (const file of list) {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setError(`${file.name} : ${MAX_UPLOAD_MB} Mo maximum`)
        continue
      }
      try {
        const res = await uploadFile(token, item.q.id, file)
        setAnswers(res.answers)
        setFiles(res.files)
      } catch (err) {
        setError(`${file.name} : ${err instanceof Error ? err.message : 'envoi impossible'}`)
      }
    }
    setBusy(false)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/r/${token}/submit`, { method: 'POST', body: {} })
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
      setBusy(false)
    }
  }

  // Clavier : A, B, C… choisissent une option, comme sur Typeform.
  useEffect(() => {
    if (!item || !['choice', 'yesno', 'multichoice', 'step'].includes(item.q.type)) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || busy) return
      // Entrée hors d'un champ ou d'un bouton : valide les choix (sinon le formulaire s'en charge).
      if (e.key === 'Enter' && e.target === document.body) return void save()
      const option = choicesOf(item.q)[LETTERS.indexOf(e.key.toUpperCase())]
      if (option) pick(option)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function pick(option: string) {
    if (!item) return
    if (item.q.type === 'multichoice') {
      const list = Array.isArray(draft) ? draft : []
      setDraft(list.includes(option) ? list.filter((o) => o !== option) : [...list, option])
    } else {
      setDraft(option)
      void save(option)
    }
  }

  const answered = items.filter(({ q }) => answers[q.id] !== undefined).length
  const missing = items.filter(({ q }) => q.required && answers[q.id] === undefined)

  return (
    <div className="page-frame h-dvh bg-muted sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-background sm:rounded-xl sm:border sm:shadow-lg">
        <header className="shrink-0 border-b">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="size-4" aria-hidden="true" />
            </div>
            <h1 className="truncate font-semibold">{form.title}</h1>
            <span className="ml-auto shrink-0 text-sm text-muted-foreground tabular-nums">
              {answered} / {items.length}
            </span>
          </div>
          <Progress
            value={(answered / items.length) * 100}
            aria-label="Progression"
            className="h-1 rounded-none"
          />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-10 sm:px-6">
          <div
            key={step}
            className="mx-auto flex min-h-full max-w-2xl flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none"
          >
            {step === -1 ? (
              <div className="grid gap-6">
                {form.image && (
                  <ZoomableImage
                    src={form.image.url}
                    alt={form.image.alt ?? ''}
                    className="max-h-64 w-full rounded-xl border object-cover"
                  />
                )}
                <h2 className="text-3xl font-semibold tracking-tight text-balance">{form.title}</h2>
                <p className="text-lg text-muted-foreground text-pretty">{form.intro}</p>
                <Button size="lg" className="h-12 justify-self-start px-6" onClick={() => go(0)}>
                  Commencer <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            ) : item ? (
              <form
                className="grid gap-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save()
                }}
              >
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-muted-foreground">{item.section}</p>
                  <h2 className="flex gap-3 text-2xl font-medium text-balance">
                    <span className="flex shrink-0 items-center gap-1 pt-1 text-base text-primary tabular-nums">
                      {step + 1} <ArrowRight className="size-4" aria-hidden />
                    </span>
                    <span>
                      {item.q.label}
                      {item.q.required && <span className="text-muted-foreground"> *</span>}
                    </span>
                  </h2>
                  {item.q.help && <p className="text-muted-foreground">{item.q.help}</p>}
                </div>
                {item.q.image && (
                  <ZoomableImage
                    src={item.q.image.url}
                    alt={item.q.image.alt ?? ''}
                    className="max-h-72 w-auto justify-self-start rounded-xl border"
                  />
                )}

                <Field
                  q={item.q}
                  draft={draft}
                  setDraft={setDraft}
                  pick={pick}
                  submit={() => void save()}
                  fileNames={((answers[item.q.id] as string[] | undefined) ?? []).map(
                    (id) => files[id]?.filename ?? 'fichier',
                  )}
                  attach={(list) => void attach(list)}
                  busy={busy}
                />

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" className="h-11 px-5" disabled={busy}>
                    OK <Check data-icon="inline-end" />
                  </Button>
                  {hasFinePointer() && item.q.type !== 'longtext' && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      ou appuyez sur Entrée <CornerDownLeft className="size-3.5" aria-hidden />
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <div className="grid gap-6">
                <h2 className="text-3xl font-semibold tracking-tight">
                  {missing.length
                    ? `Il manque quelques ${form.kind === 'tutorial' ? 'étapes' : 'réponses'}`
                    : 'C’est terminé !'}
                </h2>
                {missing.length ? (
                  <ul className="grid gap-2">
                    {missing.map(({ q }) => (
                      <li key={q.id}>
                        <button
                          type="button"
                          className="text-left underline underline-offset-4 hover:text-primary"
                          onClick={() => go(items.findIndex((i) => i.q.id === q.id))}
                        >
                          {q.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-lg text-muted-foreground">
                    Vous pouvez revenir en arrière pour relire, puis envoyer vos réponses.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  size="lg"
                  className="h-12 justify-self-start px-6"
                  disabled={busy || missing.length > 0}
                  onClick={() => void submit()}
                >
                  {form.kind === 'tutorial' ? 'Terminer' : 'Envoyer mes réponses'}
                </Button>
              </div>
            )}
          </div>
        </main>

        {step >= 0 && (
          <footer className="flex shrink-0 justify-between border-t px-4 py-3 sm:px-6">
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={busy}>
              <ChevronLeft /> Précédent
            </Button>
            {item && !item.q.required && (
              <Button variant="ghost" onClick={() => go(step + 1)} disabled={busy}>
                Passer
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function Field({
  q,
  draft,
  setDraft,
  pick,
  submit,
  fileNames,
  attach,
  busy,
}: {
  q: Question
  draft: AnswerValue | undefined
  setDraft: (v: AnswerValue) => void
  pick: (option: string) => void
  submit: () => void
  fileNames: string[]
  attach: (files: File[]) => void
  busy: boolean
}) {
  const text = typeof draft === 'string' ? draft : ''
  const autoFocus = hasFinePointer()

  if (q.type === 'choice' || q.type === 'yesno' || q.type === 'multichoice' || q.type === 'step') {
    const selected = (o: string) => (Array.isArray(draft) ? draft.includes(o) : draft === o)
    return (
      <div className="grid gap-2 sm:max-w-md">
        {q.type === 'multichoice' && (
          <p className="text-sm text-muted-foreground">Plusieurs choix possibles.</p>
        )}
        {choicesOf(q).map((o, i) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            aria-pressed={selected(o)}
            onClick={() => pick(o)}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-foreground',
              selected(o) && 'border-primary bg-primary/5',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded border text-xs font-medium',
                selected(o) && 'border-primary bg-primary text-primary-foreground',
              )}
              aria-hidden
            >
              {LETTERS[i]}
            </span>
            <span className="flex-1">{o}</span>
            {selected(o) && <Check className="size-4 text-primary" aria-hidden />}
          </button>
        ))}
      </div>
    )
  }

  if (q.type === 'file') {
    return (
      <div className="grid justify-items-start gap-3">
        {fileNames.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {fileNames.map((name, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: deux fichiers peuvent porter le même nom.
              <li key={i} className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden /> {name}
              </li>
            ))}
          </ul>
        )}
        <FileAttachButton uploading={busy} onFiles={attach} />
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {q.type === 'longtext' ? (
        <Textarea
          aria-label={q.label}
          autoFocus={autoFocus}
          rows={4}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder="Votre réponse… (Cmd + Entrée pour valider)"
          className="text-lg"
        />
      ) : (
        <Input
          aria-label={q.label}
          autoFocus={autoFocus}
          type={q.type === 'date' ? 'date' : 'text'}
          inputMode={q.type === 'number' ? 'decimal' : undefined}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={q.type === 'date' ? undefined : 'Votre réponse…'}
          className="h-12 text-lg sm:max-w-md"
        />
      )}
      {q.suggestions && (
        <div className="flex flex-wrap gap-2">
          {q.suggestions.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" onClick={() => setDraft(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
