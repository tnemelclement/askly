import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

export const Route = createFileRoute('/admin/')({ component: FormsPage })

interface FormSummary {
  id: string
  title: string
  intro: string
  reusable: boolean
  questionCount: number
  respondents: number
  done: number
  inProgress: number
}

function FormsPage() {
  const forms = useQuery({
    queryKey: ['forms'],
    queryFn: () => api<FormSummary[]>('/api/admin/forms'),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Questionnaires</h1>
        <Button asChild>
          <Link to="/admin/edit">
            <Plus />
            Nouveau questionnaire
          </Link>
        </Button>
      </div>
      {forms.isError && <p className="text-sm text-destructive">{forms.error.message}</p>}
      {forms.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun questionnaire pour l’instant : créez le premier, l’IA peut le rédiger pour vous.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {forms.data?.map((f) => (
          <Link key={f.id} to="/admin/forms/$formId" params={{ formId: f.id }} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2">
                  {f.title}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardTitle>
                <CardDescription className="line-clamp-2">{f.intro}</CardDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  {!f.reusable && <Badge variant="outline">Ponctuel</Badge>}
                  <Badge variant="secondary">{f.questionCount} questions</Badge>
                  <Badge variant="outline">
                    {f.respondents} répondant{f.respondents > 1 ? 's' : ''}
                  </Badge>
                  {f.inProgress > 0 && <Badge variant="outline">{f.inProgress} en cours</Badge>}
                  {f.done > 0 && (
                    <Badge>
                      {f.done} terminé{f.done > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
