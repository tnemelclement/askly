import type { Answers, AnswerValue, Form } from '@askly/api/domain'
import { allQuestions } from '@askly/api/domain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowUp, CircleCheck, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClassicForm } from '@/components/classic-form'
import { AnswersPanel, answersCounterLabel } from '@/components/conversation/answers-panel'
import { ChatLayout } from '@/components/conversation/chat-layout'
import {
  ConversationThread,
  GuideMessage,
  ThinkingMessage,
  UserAnswer,
} from '@/components/conversation/conversation'
import { QuickReplies } from '@/components/conversation/quick-replies'
import { VoiceInput } from '@/components/conversation/voice-input'
import { ZoomableImage } from '@/components/conversation/zoomable-image'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  api,
  type ChatEvent,
  type FileInfo,
  MAX_UPLOAD_MB,
  streamChat,
  uploadFile,
} from '@/lib/api'
import { hasFinePointer } from '@/lib/device'
import { type StagedImage, shrinkImage } from '@/lib/image'

/** Même plafond que le serveur. */
const MAX_IMAGES = 4

export const Route = createFileRoute('/r/$token')({ component: RespondentPage })

interface Bubble {
  id: string
  role: 'user' | 'assistant'
  text: string
  images?: string[]
}

/** Question en cours, avec ses réponses proposées. */
interface Pending {
  questionId: string
  suggestions: string[]
}

interface RespondentData {
  form: Form
  respondent: { name: string; submittedAt: string | null }
  voice: boolean
  answers: Answers
  files: Record<string, FileInfo>
  messages: { id: number; role: 'user' | 'assistant'; text: string; images?: string[] }[]
  pending: Pending | null
}

function RespondentPage() {
  const { token } = Route.useParams()
  const query = useQuery({
    queryKey: ['respondent', token],
    queryFn: () => api<RespondentData>(`/api/r/${token}`),
  })
  const [submitted, setSubmitted] = useState(false)

  if (query.isPending) {
    return <div className="flex h-dvh items-center justify-center text-muted-foreground">…</div>
  }
  if (query.isError) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center text-muted-foreground">
        Ce lien n’est pas valide. Vérifiez l’adresse reçue par e-mail.
      </div>
    )
  }
  const { form, respondent } = query.data
  if (respondent.submittedAt || submitted) return <Submitted form={form} />
  return form.style === 'classic' ? (
    <ClassicForm
      token={token}
      form={form}
      initial={query.data}
      onSubmitted={() => setSubmitted(true)}
    />
  ) : (
    <Conversation token={token} initial={query.data} />
  )
}

/** Écran final, dans la même fenêtre que le questionnaire (voir ChatLayout). */
function Submitted({ form }: { form: Form }) {
  const demo = form.id.startsWith('demo-')
  return (
    <div className="h-dvh bg-muted sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6 text-center sm:rounded-xl sm:border sm:shadow-lg">
        <CircleCheck className="size-16 text-primary" aria-hidden />
        <p className="text-lg font-medium">
          {form.kind === 'tutorial'
            ? 'Bravo, c’est terminé. Merci !'
            : 'Vos réponses ont été envoyées. Merci !'}
        </p>
        {/* Démo de la page d'accueil : on propose la suite. */}
        {demo && (
          <>
            <p className="max-w-md text-muted-foreground">
              C'est ce que vivront vos clients. Créez vos propres questionnaires en décrivant ce que
              vous voulez savoir.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <a href="/signup">Essai gratuit de 14 jours</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="/#demo">Retour à la démo</a>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Conversation({ token, initial }: { token: string; initial: RespondentData }) {
  const { form } = initial
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initial.messages.map((m) => ({ ...m, id: String(m.id) })),
  )
  const [answers, setAnswers] = useState<Answers>(initial.answers)
  const [files, setFiles] = useState(initial.files)
  const [uploading, setUploading] = useState(false)
  const [locked, setLocked] = useState(Boolean(initial.respondent.submittedAt))
  const [streaming, setStreaming] = useState(false)
  // Vrai entre le début d'un tour assistant et son premier mot : on montre « écrit… ».
  const [waiting, setWaiting] = useState(false)
  const [draft, setDraft] = useState('')
  // Images choisies, pas encore envoyées (aperçu au-dessus de la zone de saisie).
  const [staged, setStaged] = useState<StagedImage[]>([])
  const imageInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(initial.pending)
  const [submitting, setSubmitting] = useState(false)
  const scrollRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const kickedOff = useRef(false)

  async function send(message: string | null, images: StagedImage[] = []) {
    setPending(null)
    setStreaming(true)
    setWaiting(true)
    if (message || images.length) {
      setBubbles((b) => [
        ...b,
        {
          id: `u${Date.now()}`,
          role: 'user',
          text: message ?? '',
          images: images.map((i) => i.preview),
        },
      ])
    }
    // Chaque tour assistant (entre deux appels d'outils) devient sa propre bulle.
    let current: string | null = null
    const onEvent = (e: ChatEvent) => {
      if (e.type === 'message_start') {
        current = null
        setWaiting(true)
      } else if (e.type === 'text') {
        setWaiting(false)
        if (current === null) {
          const id = `a${Date.now()}${Math.random()}`
          current = id
          setBubbles((b) => [...b, { id, role: 'assistant', text: e.text.trimStart() }])
        } else {
          const id = current
          setBubbles((b) => b.map((x) => (x.id === id ? { ...x, text: x.text + e.text } : x)))
        }
      } else if (e.type === 'question') {
        setPending({ questionId: e.questionId, suggestions: e.suggestions })
      } else if (e.type === 'answer') {
        setAnswers((a) => ({ ...a, [e.questionId]: e.value }))
      } else if (e.type === 'error') {
        toast.error(e.message)
      }
    }
    try {
      await streamChat(
        token,
        message,
        onEvent,
        images.map(({ mediaType, data }) => ({ mediaType, data })),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setStreaming(false)
      setWaiting(false)
      if (hasFinePointer()) inputRef.current?.focus()
    }
  }

  // Première visite : l'assistant ouvre la conversation (une seule fois, même en StrictMode).
  // biome-ignore lint/correctness/useExhaustiveDependencies: au montage seulement.
  useEffect(() => {
    if (kickedOff.current || locked || bubbles.length > 0) return
    kickedOff.current = true
    void send(null)
  }, [])

  // Le fil reste collé en bas tant que le répondant n'est pas remonté le relire : le
  // contenu grandit aussi après coup (images chargées, réponses proposées qui apparaissent).
  const stickToBottom = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    const content = el?.firstElementChild
    if (!el || !content) return
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTo({ top: el.scrollHeight })
    })
    el.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit le contenu du fil.
  useEffect(() => {
    stickToBottom.current = true
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [bubbles, waiting, pending])

  function onSubmitMessage(e?: React.FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if ((!text && staged.length === 0) || streaming || locked) return
    setDraft('')
    const images = staged
    setStaged([])
    void send(text || null, images)
  }

  async function editAnswer(questionId: string, value: AnswerValue) {
    const res = await api<{ answers: Answers; files: Record<string, FileInfo> }>(
      `/api/r/${token}/answers/${questionId}`,
      { method: 'PUT', body: { value } },
    )
    setAnswers(res.answers)
    setFiles(res.files)
    toast.success('Réponse corrigée')
  }

  /**
   * Envoie les fichiers un par un. Depuis le fil (`announce`), un message les annonce ensuite
   * à l'assistant pour qu'il enchaîne ; depuis le panneau, ils apparaissent juste dans l'état.
   */
  async function attach(questionId: string, list: File[], announce: boolean) {
    setUploading(true)
    const sent: string[] = []
    for (const file of list) {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`${file.name} : ${MAX_UPLOAD_MB} Mo maximum`)
        continue
      }
      try {
        const res = await uploadFile(token, questionId, file)
        setAnswers(res.answers)
        setFiles(res.files)
        sent.push(file.name)
      } catch (err) {
        toast.error(`${file.name} : ${err instanceof Error ? err.message : 'envoi impossible'}`)
      }
    }
    setUploading(false)
    if (sent.length && announce) {
      void send(`${sent.length > 1 ? 'Fichiers joints' : 'Fichier joint'} : ${sent.join(', ')}`)
    } else if (sent.length) {
      toast.success(sent.length > 1 ? 'Fichiers ajoutés' : 'Fichier ajouté')
    }
  }

  async function submitAll() {
    setSubmitting(true)
    try {
      await api(`/api/r/${token}/submit`, { method: 'POST', body: {} })
      setLocked(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (locked) return <Submitted form={form} />

  const answeredCount = Object.keys(answers).length
  const total = allQuestions(form).length
  const pendingQuestion = pending && allQuestions(form).find((q) => q.id === pending.questionId)

  return (
    <ChatLayout
      title={form.title}
      scrollRef={scrollRef}
      panelSummary={answersCounterLabel(answeredCount, total, form.kind === 'tutorial')}
      panel={
        <AnswersPanel
          form={form}
          answers={answers}
          files={files}
          fileHref={(id) => `/api/r/${token}/files/${id}`}
          onAttach={(questionId, list) => attach(questionId, list, false)}
          uploading={uploading}
          locked={locked}
          onEdit={editAnswer}
          onSubmit={submitAll}
          submitting={submitting}
        />
      }
      composer={
        <form
          onSubmit={onSubmitMessage}
          className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-1.5 pl-2 shadow-soft transition-colors focus-within:border-foreground"
        >
          {staged.length > 0 && (
            <ul className="flex w-full flex-wrap gap-2 px-1 pt-1" aria-label="Images à envoyer">
              {staged.map((img, i) => (
                <li key={img.preview.slice(-32)} className="relative">
                  <img
                    src={img.preview}
                    alt={`Pièce jointe ${i + 1}, pas encore envoyée`}
                    className="size-16 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Retirer l'image ${i + 1}`}
                    onClick={() => setStaged((s) => s.filter((x) => x !== img))}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const list = [...(e.target.files ?? [])]
              e.target.value = ''
              const room = MAX_IMAGES - staged.length
              if (list.length > room) toast.error(`${MAX_IMAGES} images maximum par message`)
              try {
                const shrunk = await Promise.all(list.slice(0, room).map(shrinkImage))
                setStaged((s) => [...s, ...shrunk])
              } catch {
                toast.error('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.')
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-10"
            aria-label="Envoyer une image"
            title="Envoyer une photo ou une capture d’écran"
            disabled={streaming || locked || staged.length >= MAX_IMAGES}
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus />
          </Button>
          <label htmlFor="message" className="sr-only">
            Votre message
          </label>
          <Textarea
            id="message"
            ref={inputRef}
            rows={1}
            autoFocus={hasFinePointer()}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                hasFinePointer()
              ) {
                e.preventDefault()
                onSubmitMessage()
              }
            }}
            placeholder="Votre réponse, ou une question…"
            className="max-h-40 min-h-10 w-auto min-w-0 flex-1 basis-0 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
          />
          {initial.voice && (
            <VoiceInput
              token={token}
              disabled={streaming || locked}
              onText={(text) => {
                setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
                inputRef.current?.focus()
              }}
            />
          )}
          <Button
            type="submit"
            size="icon-lg"
            className="size-10"
            disabled={streaming || (!draft.trim() && staged.length === 0)}
            aria-label="Envoyer"
          >
            <ArrowUp />
          </Button>
        </form>
      }
    >
      {form.image && (
        <ZoomableImage
          src={form.image.url}
          alt={form.image.alt ?? ''}
          className="mb-5 max-h-64 w-full rounded-xl border object-cover"
        />
      )}
      <p className="mb-6 text-sm text-muted-foreground">{form.intro}</p>
      <ConversationThread>
        {bubbles.map((b) =>
          b.role === 'user' ? (
            <UserAnswer key={b.id} images={b.images}>
              {b.text}
            </UserAnswer>
          ) : (
            <GuideMessage key={b.id}>{b.text}</GuideMessage>
          ),
        )}
        {waiting && <ThinkingMessage />}
        {!streaming && pendingQuestion?.image && (
          <li className="ml-11">
            <ZoomableImage
              src={pendingQuestion.image.url}
              alt={pendingQuestion.image.alt ?? ''}
              className="max-h-80 max-w-full rounded-xl border object-contain"
            />
          </li>
        )}
        {!streaming && pendingQuestion && (
          <li>
            <QuickReplies
              onAttach={(list) => void attach(pendingQuestion.id, list, true)}
              uploading={uploading}
              // Remis à zéro (cases cochées) à chaque nouvelle question.
              key={`${pendingQuestion.id}-${bubbles.length}`}
              question={pendingQuestion}
              suggestions={pending?.suggestions ?? []}
              onSend={(text) => void send(text)}
            />
          </li>
        )}
      </ConversationThread>
    </ChatLayout>
  )
}
