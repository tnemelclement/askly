import {
  type Answers,
  type Form,
  formatAnswer,
  type RespondentStatus,
  STATUS_LABELS,
} from '@askly/api/domain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Paperclip } from 'lucide-react'
import {
  ConversationThread,
  GuideMessage,
  UserAnswer,
} from '@/components/conversation/conversation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type FileInfo } from '@/lib/api'
import { STATUS_VARIANTS } from '@/lib/status'

export const Route = createFileRoute('/admin/respondents/$respondentId')({
  component: RespondentPage,
})

interface Detail {
  respondent: {
    name: string
    email: string
    formId: string
    status: RespondentStatus
    submittedAt: string | null
  }
  form: Form
  answers: Answers
  files: Record<string, FileInfo>
  messages: { id: number; role: 'user' | 'assistant'; text: string }[]
}

function RespondentPage() {
  const { respondentId } = Route.useParams()
  const query = useQuery({
    queryKey: ['respondent-admin', respondentId],
    queryFn: () => api<Detail>(`/api/admin/respondents/${respondentId}`),
  })
  if (query.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (query.isError) return <p className="text-sm text-destructive">{query.error.message}</p>
  const { respondent, form, answers, files, messages } = query.data

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/forms/$formId"
          params={{ formId: form.id }}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {form.title}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{respondent.name}</h1>
          <Badge variant={STATUS_VARIANTS[respondent.status]}>
            {STATUS_LABELS[respondent.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {respondent.email}
          {respondent.submittedAt &&
            ` · envoyé le ${new Date(respondent.submittedAt).toLocaleString('fr-FR')}`}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Réponses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {form.sections.map((s) => (
              <div key={s.title}>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {s.title}
                </h3>
                <dl className="space-y-2">
                  {s.questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs text-muted-foreground">{q.label}</dt>
                      <dd className="text-sm whitespace-pre-wrap">
                        {answers[q.id] === undefined ? (
                          <span className="text-muted-foreground">—</span>
                        ) : q.type === 'file' && Array.isArray(answers[q.id]) ? (
                          <ul className="space-y-1">
                            {(answers[q.id] as string[]).map((id) => (
                              <li key={id}>
                                <a
                                  href={`/api/admin/files/${id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                                >
                                  <Paperclip className="size-3.5" aria-hidden="true" />
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
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pas encore commencée.</p>
            ) : (
              <ConversationThread>
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <UserAnswer key={m.id}>{m.text}</UserAnswer>
                  ) : (
                    <GuideMessage key={m.id}>{m.text}</GuideMessage>
                  ),
                )}
              </ConversationThread>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
