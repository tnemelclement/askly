import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, BookOpen, ClipboardList } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export const Route = createFileRoute('/f/$publicToken')({ component: PublicFormPage })

interface PublicForm {
  title: string
  intro: string
  kind: 'questionnaire' | 'tutorial'
  image?: { url: string; alt?: string }
}

const storageKey = (publicToken: string) => `askly:${publicToken}`

function remembered(publicToken: string) {
  try {
    return localStorage.getItem(storageKey(publicToken))
  } catch {
    return null
  }
}

/**
 * Lien public d'un questionnaire, ouvert tel quel ou intégré dans un site (embed.js) :
 * une présentation, puis un répondant neuf au clic sur « Commencer ». Rien n'est créé (ni
 * compté dans le quota) tant que le visiteur ne clique pas. Un visiteur qui revient reprend
 * sa conversation.
 */
function PublicFormPage() {
  const { publicToken } = Route.useParams()
  const navigate = useNavigate()
  const previous = remembered(publicToken)

  useEffect(() => {
    if (previous) void navigate({ to: '/r/$token', params: { token: previous }, replace: true })
  }, [previous, navigate])

  const query = useQuery({
    queryKey: ['public-form', publicToken],
    queryFn: () => api<PublicForm>(`/api/f/${publicToken}`),
    enabled: !previous,
  })
  const start = useMutation({
    mutationFn: () =>
      api<{ token: string }>(`/api/f/${publicToken}/start`, {
        // Dans un site, le referrer est la page qui intègre le questionnaire.
        body: { page: document.referrer || undefined },
      }),
    onSuccess: ({ token }) => {
      try {
        localStorage.setItem(storageKey(publicToken), token)
      } catch {}
      void navigate({ to: '/r/$token', params: { token }, replace: true })
    },
  })

  if (previous || query.isPending) {
    return <div className="flex h-dvh items-center justify-center text-muted-foreground">…</div>
  }
  if (query.isError) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center text-muted-foreground">
        {query.error.message}
      </div>
    )
  }
  const form = query.data
  const Icon = form.kind === 'tutorial' ? BookOpen : ClipboardList
  return (
    <div className="page-frame h-dvh bg-muted sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center overflow-y-auto bg-background p-6 sm:rounded-xl sm:border sm:shadow-lg">
        <div className="w-full max-w-md">
          {form.image ? (
            <img
              src={form.image.url}
              alt={form.image.alt ?? ''}
              className="mb-6 max-h-48 w-full rounded-xl border object-cover"
            />
          ) : (
            <span className="mb-6 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{form.title}</h1>
          <p className="mt-3 whitespace-pre-line text-muted-foreground">{form.intro}</p>
          <Button
            size="lg"
            className="mt-8 h-11 w-full sm:w-auto"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? 'Ouverture…' : 'Commencer'}
            <ArrowRight data-icon="inline-end" />
          </Button>
          {start.isError && <p className="mt-3 text-sm text-destructive">{start.error.message}</p>}
        </div>
      </div>
    </div>
  )
}
