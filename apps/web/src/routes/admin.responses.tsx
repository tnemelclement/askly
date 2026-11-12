import type { RespondentStatus } from '@askly/api/domain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox, UserRound } from 'lucide-react'
import { useState } from 'react'
import {
  Cell,
  DataTable,
  EmptyState,
  FilterSelect,
  IconTile,
  PageHeader,
  PillTabs,
  ProgressBar,
  Row,
  SearchField,
  StatusTag,
  Toolbar,
} from '@/components/app/kit'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'

export const Route = createFileRoute('/admin/responses')({ component: ResponsesPage })

interface ResponseRow {
  id: string
  name: string
  email: string | null
  formId: string
  formTitle: string
  kind: 'questionnaire' | 'tutorial'
  total: number
  answered: number
  status: RespondentStatus
  createdAt: string
  startedAt: string | null
  submittedAt: string | null
}

type Tab = 'all' | 'questionnaire' | 'tutorial'
type Status = 'all' | RespondentStatus
type Period = 'all' | '1' | '7' | '30'

function ResponsesPage() {
  const query = useQuery({
    queryKey: ['responses'],
    queryFn: () => api<ResponseRow[]>('/api/admin/respondents'),
  })
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [period, setPeriod] = useState<Period>('all')
  const [formId, setFormId] = useState('all')

  const data = query.data ?? []
  const forms = [...new Map(data.map((r) => [r.formId, r.formTitle])).entries()]
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 86_400_000
  const last = (r: ResponseRow) => r.submittedAt ?? r.startedAt ?? r.createdAt
  const rows = data
    .filter((r) => tab === 'all' || r.kind === tab)
    .filter((r) => status === 'all' || r.status === status)
    .filter((r) => formId === 'all' || r.formId === formId)
    .filter((r) => new Date(last(r)).getTime() >= since)
    .filter((r) =>
      `${r.name} ${r.email ?? ''} ${r.formTitle}`.toLowerCase().includes(q.trim().toLowerCase()),
    )

  return (
    <>
      <PageHeader title="Réponses" />
      <PillTabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'Tout' },
          { value: 'questionnaire', label: 'Questionnaires' },
          { value: 'tutorial', label: 'Tutoriels' },
        ]}
      />
      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Rechercher une personne…" />
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <FilterSelect
            label="Période"
            value={period}
            onChange={setPeriod}
            className="sm:w-36"
            options={[
              { value: 'all', label: 'Toujours' },
              { value: '1', label: '24 heures' },
              { value: '7', label: '7 jours' },
              { value: '30', label: '30 jours' },
            ]}
          />
          <FilterSelect
            label="Statut"
            value={status}
            onChange={setStatus}
            className="sm:w-36"
            options={[
              { value: 'all', label: 'Tous statuts' },
              { value: 'not_started', label: 'Pas commencé' },
              { value: 'in_progress', label: 'En cours' },
              { value: 'done', label: 'Terminé' },
            ]}
          />
          <FilterSelect
            label="Questionnaire"
            value={formId}
            onChange={setFormId}
            className="sm:w-48"
            options={[
              { value: 'all', label: 'Tous' },
              ...forms.map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </Toolbar>

      {query.isError && <p className="text-sm text-destructive">{query.error.message}</p>}

      <DataTable
        columns={[
          { label: 'Personne' },
          { label: 'Statut' },
          { label: 'Questionnaire', className: 'hidden md:table-cell' },
          { label: 'Progression', className: 'hidden sm:table-cell' },
          { label: 'Activité', className: 'text-right' },
        ]}
        empty={
          query.isPending ? (
            <span className="text-sm text-muted-foreground">Chargement…</span>
          ) : rows.length === 0 ? (
            data.length === 0 ? (
              <EmptyState icon={Inbox} title="Personne n’a encore été invité">
                Ouvrez un questionnaire et créez un lien pour chaque personne : ses réponses
                arriveront ici.
              </EmptyState>
            ) : (
              <span className="text-sm text-muted-foreground">
                Aucun résultat pour ces filtres.
              </span>
            )
          ) : undefined
        }
      >
        {rows.map((r) => (
          <Row key={r.id}>
            <Cell>
              <Link
                to="/admin/respondents/$respondentId"
                params={{ respondentId: r.id }}
                data-row-link
                className="flex items-center gap-3 outline-none after:absolute after:inset-0"
              >
                <IconTile
                  icon={UserRound}
                  tone={
                    r.status === 'done' ? 'ok' : r.status === 'in_progress' ? 'live' : 'neutral'
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  {r.email && (
                    <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                  )}
                </span>
              </Link>
            </Cell>
            <Cell>
              <StatusTag status={r.status} />
            </Cell>
            <Cell className="hidden max-w-56 truncate md:table-cell">{r.formTitle}</Cell>
            <Cell className="hidden sm:table-cell">
              <ProgressBar value={r.answered} max={r.total} />
            </Cell>
            <Cell className="text-right whitespace-nowrap text-muted-foreground">
              {timeAgo(last(r))}
            </Cell>
          </Row>
        ))}
      </DataTable>
      {rows.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {rows.length} personne{rows.length > 1 ? 's' : ''}
          {rows.length < data.length && ` sur ${data.length}`}
        </p>
      )}
    </>
  )
}
