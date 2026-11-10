import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FormEditor, readDefinition } from '@/components/form-editor'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

/** Création (sans `id`) ou modification d'un questionnaire, en YAML, avec rédaction par l'IA. */
export const Route = createFileRoute('/admin/edit')({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === 'string' ? { id: s.id } : {},
  component: EditPage,
})

const TEMPLATE = `title: Votre projet
intro: Quelques questions pour bien comprendre votre besoin. Comptez cinq minutes.
context: Le répondant est un client ; ses réponses serviront à préparer un devis.
sections:
  - title: Le projet
    questions:
      - id: description
        label: Décrivez votre projet en quelques phrases
        type: longtext
      - id: budget
        label: Quel budget envisagez-vous ?
        type: choice
        options: [Moins de 1 000 €, 1 000 à 5 000 €, Plus de 5 000 €]
      - id: delai
        label: Pour quand ?
        type: date
        required: false
        help: Une date approximative suffit.
`

/** Identifiant tiré du titre : minuscules, chiffres et tirets. */
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)

function EditPage() {
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const existing = useQuery({
    queryKey: ['form', id],
    queryFn: () => api<{ form: { reusable: boolean }; source: string }>(`/api/admin/forms/${id}`),
    enabled: Boolean(id),
  })
  const [brief, setBrief] = useState('')
  const [source, setSource] = useState(id ? '' : TEMPLATE)
  const [formId, setFormId] = useState(id ?? '')
  const [reusable, setReusable] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [visual, setVisual] = useState(true)

  useEffect(() => {
    if (existing.data) {
      setSource(existing.data.source)
      setReusable(existing.data.form.reusable)
    }
  }, [existing.data])

  const draft = useMutation({
    mutationFn: () => api<{ source: string }>('/api/admin/forms/draft', { body: { brief } }),
    onSuccess: (r) => {
      setSource(r.source)
      const title = r.source.match(/^title: (.+)$/m)?.[1]
      if (!id && title) setFormId(slugify(title.replace(/^["']|["']$/g, '')))
      toast.success('Brouillon prêt : relisez-le, puis enregistrez.')
    },
    onError: (err) => toast.error(err.message),
  })

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/api/admin/forms/${formId}`, {
        method: 'PUT',
        body: { definition: source, reusable, mode: id ? 'upsert' : 'create' },
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
      await queryClient.invalidateQueries({ queryKey: ['form', r.id] })
      toast.success('Questionnaire enregistré')
      await navigate({ to: '/admin/forms/$formId', params: { formId: r.id } })
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api(`/api/admin/forms/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
      toast.success('Questionnaire supprimé')
      await navigate({ to: '/admin' })
    },
    onError: (err) => toast.error(err.message),
  })

  if (id && existing.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (existing.isError) return <p className="text-sm text-destructive">{existing.error.message}</p>

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={id ? '/admin/forms/$formId' : '/admin'}
          params={{ formId: id ?? '' }}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {id ? 'Retour au questionnaire' : 'Questionnaires'}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {id ? 'Modifier le questionnaire' : 'Nouveau questionnaire'}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {id ? 'Réécrire avec l’IA' : 'Décrivez ce que vous voulez demander'}
          </CardTitle>
          <CardDescription>
            À qui s’adresse le questionnaire, à quoi serviront les réponses, ce que vous voulez
            savoir. L’IA rédige les questions ; vous relisez avant d’enregistrer.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Textarea
            aria-label="Description du questionnaire"
            rows={4}
            maxLength={4000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ex. : un questionnaire pour mes clients qui veulent rénover leur cuisine : surface, style, budget, délais, photos de la pièce actuelle."
          />
          <Button
            className="justify-self-start"
            disabled={draft.isPending || brief.trim().length < 10}
            onClick={() => draft.mutate()}
          >
            <Sparkles />
            {draft.isPending ? 'Rédaction…' : 'Rédiger avec l’IA'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            {visual
              ? 'Chaque question peut avoir une aide que l’IA utilise pour l’expliquer.'
              : 'Format YAML. Types : text, longtext, number, date, yesno, choice, multichoice, file. Chaque question peut avoir une aide (help) que l’IA utilise pour expliquer.'}
          </CardDescription>
          <CardAction>
            <div className="flex rounded-lg border p-0.5">
              {(['Visuel', 'YAML'] as const).map((label) => {
                const on = (label === 'Visuel') === visual
                return (
                  <Button
                    key={label}
                    size="sm"
                    variant={on ? 'secondary' : 'ghost'}
                    aria-pressed={on}
                    onClick={() => {
                      if (label === 'Visuel' && !readDefinition(source))
                        return toast.error('Le YAML est invalide : corrigez-le d’abord.')
                      setVisual(label === 'Visuel')
                    }}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {visual ? (
            <FormEditor source={source} onChange={setSource} />
          ) : (
            <Textarea
              aria-label="Définition YAML"
              spellCheck={false}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="min-h-96 font-mono text-sm"
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="form-id">Identifiant</Label>
              <Input
                id="form-id"
                value={formId}
                disabled={Boolean(id)}
                onChange={(e) => setFormId(slugify(e.target.value))}
                placeholder="projet-cuisine"
                className="font-mono"
              />
            </div>
            <div className="flex items-center gap-2 sm:pt-6">
              <Checkbox
                id="reusable"
                checked={reusable}
                onCheckedChange={(v) => setReusable(v === true)}
              />
              <Label htmlFor="reusable" className="font-normal">
                Plusieurs personnes y répondront (un lien chacune)
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={save.isPending || formId.length < 2 || !source.trim()}
              onClick={() => save.mutate()}
            >
              Enregistrer
            </Button>
            {id && (
              <Button
                variant={confirmDelete ? 'destructive' : 'outline'}
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
              >
                <Trash2 />
                {confirmDelete
                  ? 'Confirmer : supprimer aussi les réponses'
                  : 'Supprimer le questionnaire'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
