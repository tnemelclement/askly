import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, ClipboardList, MessagesSquare, Plus, Rows3 } from 'lucide-react'
import { useState } from 'react'
import {
  Cell,
  DataTable,
  EmptyState,
  FilterSelect,
  IconTile,
  PageHeader,
  Row,
  SearchField,
  Tag,
  Toolbar,
} from '@/components/app/kit'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'

type Kind = 'questionnaire' | 'tutorial'

export const Route = createFileRoute('/admin/')({
  validateSearch: (s: Record<string, unknown>): { kind?: 'tutorial' } =>
    s.kind === 'tutorial' ? { kind: 'tutorial' } : {},
  component: FormsPage,
})

export interface FormSummary {
  id: string
  title: string
  intro: string
  kind: Kind
  style: 'chat' | 'classic'
  reusable: boolean
  lastActivity: string | null
  questionCount: number
  respondents: number
  done: number
  inProgress: number
}

type Usage = 'all' | 'reusable' | 'single'
type Activity = 'all' | 'waiting' | 'done' | 'empty'

function FormsPage() {
  const { kind = 'questionnaire' } = Route.useSearch()
  const tutorial = kind === 'tutorial'
  const forms = useQuery({
    queryKey: ['forms'],
    queryFn: () => api<FormSummary[]>('/api/admin/forms'),
  })
  const [q, setQ] = useState('')
  const [usage, setUsage] = useState<Usage>('all')
  const [activity, setActivity] = useState<Activity>('all')

  const all = (forms.data ?? []).filter((f) => f.kind === kind)
  const rows = all
    .filter((f) => `${f.title} ${f.id}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((f) => usage === 'all' || (usage === 'reusable') === f.reusable)
    .filter(
      (f) =>
        activity === 'all' ||
        (activity === 'waiting' && f.inProgress > 0) ||
        (activity === 'done' && f.done > 0) ||
        (activity === 'empty' && f.respondents === 0),
    )
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))

  const noun = tutorial ? 'tutoriel' : 'questionnaire'

  return (
    <>
      <PageHeader
        title={tutorial ? 'Tutoriels' : 'Questionnaires'}
        actions={
          <Button asChild>
            <Link to="/admin/edit" search={tutorial ? { kind: 'tutorial' } : {}}>
              <Plus />
              {tutorial ? 'Nouveau tutoriel' : 'Nouveau questionnaire'}
            </Link>
          </Button>
        }
      />

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Rechercher par nom ou identifiant…" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <FilterSelect
            label="Usage"
            value={usage}
            onChange={setUsage}
            className="sm:w-44"
            options={[
              { value: 'all', label: 'Tous les usages' },
              { value: 'reusable', label: 'Réutilisables' },
              { value: 'single', label: 'Ponctuels' },
            ]}
          />
          <FilterSelect
            label="Activité"
            value={activity}
            onChange={setActivity}
            className="sm:w-44"
            options={[
              { value: 'all', label: 'Toute activité' },
              { value: 'waiting', label: 'Réponses en cours' },
              { value: 'done', label: 'Réponses reçues' },
              { value: 'empty', label: 'Personne invitée' },
            ]}
          />
        </div>
      </Toolbar>

      {forms.isError && <p className="text-sm text-destructive">{forms.error.message}</p>}

      <DataTable
        columns={[
          { label: 'Nom' },
          { label: 'Format', className: 'hidden md:table-cell' },
          { label: tutorial ? 'Terminés' : 'Réponses' },
          { label: 'Activité', className: 'hidden sm:table-cell text-right' },
          { label: '', className: 'w-8' },
        ]}
        empty={
          forms.isPending ? (
            <span className="text-sm text-muted-foreground">Chargement…</span>
          ) : rows.length === 0 ? (
            all.length === 0 ? (
              <EmptyState
                icon={tutorial ? BookOpen : ClipboardList}
                title={tutorial ? 'Aucun tutoriel' : 'Aucun questionnaire'}
              >
                {tutorial
                  ? 'Un tutoriel guide un client pas à pas pour qu’il fasse quelque chose seul : l’IA donne chaque étape et l’aide quand il bloque.'
                  : 'Décrivez ce que vous voulez demander : l’IA rédige les questions, vous relisez.'}
                <div className="mt-4">
                  <Button asChild size="sm">
                    <Link to="/admin/edit" search={tutorial ? { kind: 'tutorial' } : {}}>
                      <Plus /> Créer un {noun}
                    </Link>
                  </Button>
                </div>
              </EmptyState>
            ) : (
              <span className="text-sm text-muted-foreground">
                Aucun résultat pour ces filtres.
              </span>
            )
          ) : undefined
        }
      >
        {rows.map((f) => (
          <Row key={f.id}>
            <Cell>
              <Link
                to="/admin/forms/$formId"
                params={{ formId: f.id }}
                data-row-link
                className="flex items-center gap-3 outline-none after:absolute after:inset-0"
              >
                <IconTile
                  icon={tutorial ? BookOpen : ClipboardList}
                  tone={f.done > 0 ? 'ok' : 'neutral'}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.title}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {f.id}
                  </span>
                </span>
              </Link>
            </Cell>
            <Cell className="hidden md:table-cell">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {f.style === 'classic' ? (
                  <Rows3 className="size-3.5" aria-hidden />
                ) : (
                  <MessagesSquare className="size-3.5" aria-hidden />
                )}
                {f.style === 'classic' ? 'Formulaire' : 'Conversation'}
                {!f.reusable && <Tag>Ponctuel</Tag>}
              </span>
            </Cell>
            <Cell>
              <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
                {f.respondents === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <Tag tone={f.done > 0 ? 'ok' : 'neutral'}>
                      {f.done} / {f.respondents}
                    </Tag>
                    {f.inProgress > 0 && <Tag tone="live">{f.inProgress} en cours</Tag>}
                  </>
                )}
              </span>
            </Cell>
            <Cell className="hidden text-right whitespace-nowrap text-muted-foreground sm:table-cell">
              {timeAgo(f.lastActivity)}
            </Cell>
            <Cell className="text-muted-foreground">
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Cell>
          </Row>
        ))}
      </DataTable>
      {rows.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {rows.length} {noun}
          {rows.length > 1 ? 's' : ''}
          {rows.length < all.length && ` sur ${all.length}`}
        </p>
      )}
    </>
  )
}
