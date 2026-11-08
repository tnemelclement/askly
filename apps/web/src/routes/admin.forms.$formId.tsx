import {
  allQuestions,
  type Form,
  type RespondentStatus,
  STATUS_LABELS,
} from '@questionnaire/api/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Copy, Download, Eye, Mail, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { STATUS_VARIANTS } from '@/lib/status'

export const Route = createFileRoute('/admin/forms/$formId')({ component: FormPage })

interface RespondentRow {
  id: string
  token: string
  name: string
  email: string
  status: RespondentStatus
  answered: number
  createdAt: string
}

function respondentLink(token: string) {
  return `${window.location.origin}/r/${token}`
}

/** Brouillon de mail dans le client de l'utilisateur : rien n'est envoyé sans lui. */
function mailtoHref(form: Form, r: RespondentRow) {
  const subject = form.title
  const body = `Bonjour ${r.name},

Pourriez-vous prendre quelques minutes pour répondre à ce questionnaire ? Il se remplit sous forme de conversation : vous pouvez demander des précisions à tout moment, et reprendre plus tard avec le même lien.

${respondentLink(r.token)}

Merci d'avance,`
  return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function FormPage() {
  const { formId } = Route.useParams()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['form', formId],
    queryFn: () => api<{ form: Form; respondents: RespondentRow[] }>(`/api/admin/forms/${formId}`),
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const create = useMutation({
    mutationFn: () =>
      api<RespondentRow>(`/api/admin/forms/${formId}/respondents`, { body: { name, email } }),
    onSuccess: async () => {
      setName('')
      setEmail('')
      toast.success('Répondant ajouté : copiez son lien ou préparez le mail.')
      await queryClient.invalidateQueries({ queryKey: ['form', formId] })
    },
    onError: (err) => toast.error(err.message),
  })

  if (query.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (query.isError) return <p className="text-sm text-destructive">{query.error.message}</p>
  const { form, respondents } = query.data
  const total = allQuestions(form).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Questionnaires
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
          <p className="text-sm text-muted-foreground">
            {total} questions · {form.sections.length} sections
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/admin/forms/${formId}/export?format=csv`} download>
              <Download />
              CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/admin/forms/${formId}/export?format=json`} download>
              <Download />
              JSON
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inviter un répondant</CardTitle>
          <CardDescription>Chaque répondant reçoit son propre lien.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              <UserPlus />
              Créer le lien
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        {respondents.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Aucun répondant pour l’instant.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Répondant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden sm:table-cell">Réponses</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respondents.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {r.answered}/{total}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copier le lien de ${r.name}`}
                        title="Copier le lien"
                        onClick={async () => {
                          await navigator.clipboard.writeText(respondentLink(r.token))
                          toast.success('Lien copié')
                        }}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        asChild
                        title="Préparer le mail (brouillon)"
                      >
                        <a
                          href={mailtoHref(form, r)}
                          aria-label={`Préparer le mail pour ${r.name}`}
                        >
                          <Mail />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon-sm" asChild title="Voir les réponses">
                        <Link
                          to="/admin/respondents/$respondentId"
                          params={{ respondentId: r.id }}
                          aria-label={`Voir les réponses de ${r.name}`}
                        >
                          <Eye />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
