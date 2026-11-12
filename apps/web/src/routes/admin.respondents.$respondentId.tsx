import { type Answers, type Form, formatAnswer, type RespondentStatus } from '@askly/api/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  CircleCheck,
  Copy,
  ExternalLink,
  MailPlus,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import {
  CopyChip,
  DetailHeader,
  MetaGrid,
  PillTabs,
  ProgressBar,
  SectionLabel,
  StatusTag,
  Timeline,
} from '@/components/app/kit'
import {
  ConversationThread,
  GuideMessage,
  UserAnswer,
} from '@/components/conversation/conversation'
import { Button } from '@/components/ui/button'
import { api, type FileInfo } from '@/lib/api'

export const Route = createFileRoute('/admin/respondents/$respondentId')({
  component: RespondentPage,
})

interface Detail {
  respondent: {
    id: string
    name: string
    email: string | null
    formId: string
    status: RespondentStatus
    link: string
    createdAt: string
    startedAt: string | null
    submittedAt: string | null
  }
  form: Form
  answers: Answers
  files: Record<string, FileInfo>
  messages: { id: number; role: 'user' | 'assistant'; text: string; images?: string[] }[]
}

function RespondentPage() {
  const { respondentId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['respondent-admin', respondentId],
    queryFn: () => api<Detail>(`/api/admin/respondents/${respondentId}`),
  })
  const [tab, setTab] = useState<'answers' | 'conversation'>('answers')
  const [deleting, setDeleting] = useState(false)

  if (query.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (query.isError) return <p className="text-sm text-destructive">{query.error.message}</p>
  const { respondent: r, form, answers, files, messages } = query.data
  const tutorial = form.kind === 'tutorial'
  const total = form.sections.reduce((n, s) => n + s.questions.length, 0)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['respondent-admin', respondentId] })
    await queryClient.invalidateQueries({ queryKey: ['form', form.id] })
    await queryClient.invalidateQueries({ queryKey: ['responses'] })
    await queryClient.invalidateQueries({ queryKey: ['forms'] })
  }

  return (
    <>
      <DetailHeader
        icon={UserRound}
        tone={r.status === 'done' ? 'ok' : r.status === 'in_progress' ? 'live' : 'neutral'}
        eyebrow={
          <Link to="/admin/responses" className="hover:text-foreground">
            Personne
          </Link>
        }
        title={r.name}
        actions={
          <>
            {r.status === 'done' && (
              <Button
                variant="outline"
                title="La personne peut de nouveau modifier ses réponses"
                onClick={async () => {
                  await api(`/api/admin/respondents/${r.id}/reopen`, { body: {} })
                  toast.success('Réponses rouvertes')
                  await refresh()
                }}
              >
                <RotateCcw /> Rouvrir
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={r.link} target="_blank" rel="noreferrer">
                <ExternalLink /> Ouvrir
              </a>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Supprimer"
              title="Supprimer"
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <MetaGrid
        items={[
          {
            label: tutorial ? 'Tutoriel' : 'Questionnaire',
            value: (
              <Link
                to="/admin/forms/$formId"
                params={{ formId: form.id }}
                className="underline-offset-4 hover:underline"
              >
                {form.title}
              </Link>
            ),
          },
          { label: 'Statut', value: <StatusTag status={r.status} /> },
          {
            label: tutorial ? 'Étapes' : 'Réponses',
            value: <ProgressBar value={Object.keys(answers).length} max={total} />,
          },
          { label: 'E-mail', value: r.email ?? '—' },
          {
            label: 'Lien',
            value: <CopyChip value={r.link} display={r.link.replace(/^https?:\/\//, '')} />,
          },
        ]}
      />

      <SectionLabel>Événements</SectionLabel>
      <Timeline
        events={[
          { label: 'Invité', date: r.createdAt, icon: MailPlus },
          { label: 'Commencé', date: r.startedAt, icon: MessageCircle, tone: 'live' },
          {
            label: tutorial ? 'Terminé' : 'Envoyé',
            date: r.submittedAt,
            icon: CircleCheck,
            tone: 'ok',
          },
        ]}
      />

      <div className="rounded-2xl border">
        <div className="flex items-center justify-between gap-2 border-b p-2">
          <PillTabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'answers', label: tutorial ? 'Étapes' : 'Réponses' },
              {
                value: 'conversation',
                label: (
                  <>
                    Conversation{' '}
                    <span className="ml-1 text-muted-foreground">{messages.length}</span>
                  </>
                ),
              },
            ]}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            title="Copier les réponses"
            aria-label="Copier les réponses"
            onClick={async () => {
              const text = form.sections
                .flatMap((s) => s.questions)
                .map((q) => `${q.label}\n${formatAnswer(q, answers[q.id]) || '—'}`)
                .join('\n\n')
              await navigator.clipboard.writeText(text)
              toast.success('Réponses copiées')
            }}
          >
            <Copy />
          </Button>
        </div>
        <div className="p-5 sm:p-6">
          {tab === 'answers' ? (
            <div className="grid gap-7">
              {form.sections.map((s) => (
                <section key={s.title}>
                  <SectionLabel>{s.title}</SectionLabel>
                  <dl className="divide-y">
                    {s.questions.map((q) => (
                      <div key={q.id} className="grid gap-1 py-3 sm:grid-cols-[2fr_3fr] sm:gap-6">
                        <dt className="text-sm text-muted-foreground">{q.label}</dt>
                        <dd className="text-sm whitespace-pre-wrap">
                          {answers[q.id] === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : q.type === 'file' && Array.isArray(answers[q.id]) ? (
                            <ul className="grid gap-1">
                              {(answers[q.id] as string[]).map((id) => (
                                <li key={id}>
                                  <a
                                    href={`/api/admin/files/${id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                                  >
                                    <Paperclip className="size-3.5" aria-hidden />
                                    {files[id]?.filename ?? 'fichier'}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            formatAnswer(q, answers[q.id])
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {form.style === 'classic'
                ? 'Formulaire classique : pas de conversation.'
                : 'Pas encore commencée.'}
            </p>
          ) : (
            <ConversationThread>
              {messages.map((m) =>
                m.role === 'user' ? (
                  <UserAnswer key={m.id} images={m.images}>
                    {m.text}
                  </UserAnswer>
                ) : (
                  <GuideMessage key={m.id}>{m.text}</GuideMessage>
                ),
              )}
            </ConversationThread>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Supprimer ${r.name} ?`}
        description="Ses réponses, sa conversation et ses fichiers seront effacés, et son lien ne fonctionnera plus. C’est définitif."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await api(`/api/admin/respondents/${r.id}`, { method: 'DELETE' })
          toast.success(`${r.name} supprimé`)
          await refresh()
          await navigate({ to: '/admin/forms/$formId', params: { formId: form.id } })
        }}
      />
    </>
  )
}
