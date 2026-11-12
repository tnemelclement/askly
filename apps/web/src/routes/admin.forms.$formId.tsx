import { allQuestions, type Form, type RespondentStatus } from '@askly/api/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BookOpen,
  ClipboardList,
  Code,
  Copy,
  Download,
  ExternalLink,
  Mail,
  Pencil,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import {
  Cell,
  CopyChip,
  DataTable,
  DetailHeader,
  EmptyState,
  FilterSelect,
  IconTile,
  MetaGrid,
  PillTabs,
  ProgressBar,
  Row,
  SearchField,
  StatusTag,
  Tag,
  Toolbar,
} from '@/components/app/kit'
import { TYPES } from '@/components/form-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'

export const Route = createFileRoute('/admin/forms/$formId')({ component: FormPage })

interface RespondentRow {
  id: string
  token: string
  name: string
  email: string | null
  link: string
  status: RespondentStatus
  answered: number
  createdAt: string
  startedAt: string | null
  submittedAt: string | null
}

type StoredForm = Form & { reusable: boolean }

/** Brouillon de mail dans le client de l'utilisateur : rien n'est envoyé sans lui. */
function mailtoHref(form: Form, r: { name: string; email: string | null; link: string }) {
  const body =
    form.kind === 'tutorial'
      ? `Bonjour ${r.name},

Voici un guide pas à pas pour « ${form.title} ». Un assistant vous accompagne étape par étape et répond à vos questions si vous bloquez ; vous pouvez reprendre plus tard avec le même lien.

${r.link}

Merci d'avance,`
      : `Bonjour ${r.name},

Pourriez-vous prendre quelques minutes pour répondre à ce questionnaire ? Vous pouvez demander des précisions à tout moment, et reprendre plus tard avec le même lien.

${r.link}

Merci d'avance,`
  return `mailto:${encodeURIComponent(r.email ?? '')}?subject=${encodeURIComponent(form.title)}&body=${encodeURIComponent(body)}`
}

const copyLink = async (link: string) => {
  await navigator.clipboard.writeText(link)
  toast.success('Lien copié')
}

function FormPage() {
  const { formId } = Route.useParams()
  const query = useQuery({
    queryKey: ['form', formId],
    queryFn: () =>
      api<{ form: StoredForm; respondents: RespondentRow[]; publicToken: string | null }>(
        `/api/admin/forms/${formId}`,
      ),
  })
  const [tab, setTab] = useState<'people' | 'content'>('people')
  const [inviting, setInviting] = useState(false)
  const [embedding, setEmbedding] = useState(false)

  if (query.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (query.isError) return <p className="text-sm text-destructive">{query.error.message}</p>
  const { form, respondents, publicToken } = query.data
  const tutorial = form.kind === 'tutorial'
  const total = allQuestions(form).length

  return (
    <>
      <DetailHeader
        icon={tutorial ? BookOpen : ClipboardList}
        tone={respondents.some((r) => r.status === 'done') ? 'ok' : 'neutral'}
        eyebrow={
          <Link
            to="/admin"
            search={tutorial ? { kind: 'tutorial' } : {}}
            className="hover:text-foreground"
          >
            {tutorial ? 'Tutoriel' : 'Questionnaire'}
          </Link>
        }
        title={form.title}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/edit" search={{ id: formId }}>
                <Pencil /> Modifier
              </Link>
            </Button>
            <ExportMenu formId={formId} />
            <Button variant="outline" onClick={() => setEmbedding(true)}>
              <Code /> Intégrer
            </Button>
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Inviter
            </Button>
          </>
        }
      />

      <MetaGrid
        items={[
          {
            label: 'Format',
            value: form.style === 'classic' ? 'Formulaire classique' : 'Conversation avec l’IA',
          },
          {
            label: tutorial ? 'Étapes' : 'Questions',
            value: `${total} · ${form.sections.length} section${form.sections.length > 1 ? 's' : ''}`,
          },
          {
            label: 'Usage',
            value: form.reusable ? 'Réutilisable' : 'Ponctuel',
          },
          { label: 'Identifiant', value: <CopyChip value={form.id} /> },
        ]}
      />

      <PillTabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          {
            value: 'people',
            label: (
              <>
                Personnes <span className="ml-1 text-muted-foreground">{respondents.length}</span>
              </>
            ),
          },
          { value: 'content', label: tutorial ? 'Étapes' : 'Questions' },
        ]}
      />

      {tab === 'people' ? (
        <People
          form={form}
          respondents={respondents}
          total={total}
          onInvite={() => setInviting(true)}
        />
      ) : (
        <Content form={form} />
      )}

      <EmbedDialog
        form={form}
        publicToken={publicToken}
        open={embedding}
        onOpenChange={setEmbedding}
      />
      <InviteDialog form={form} open={inviting} onOpenChange={setInviting} />
    </>
  )
}

function ExportMenu({ formId }: { formId: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" aria-label="Exporter les réponses">
          <Download /> <span className="hidden sm:inline">Exporter</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-xl border bg-popover p-1 text-sm shadow-lg"
        >
          {(['csv', 'json'] as const).map((f) => (
            <DropdownMenu.Item key={f} asChild>
              <a
                href={`/api/admin/forms/${formId}/export?format=${f}`}
                download
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-accent"
              >
                <Download className="size-4" /> {f.toUpperCase()}
                <span className="text-muted-foreground">
                  {f === 'csv' ? '(tableur)' : '(développeurs)'}
                </span>
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function People({
  form,
  respondents,
  total,
  onInvite,
}: {
  form: StoredForm
  respondents: RespondentRow[]
  total: number
  onInvite: () => void
}) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | RespondentStatus>('all')
  const [deleting, setDeleting] = useState<RespondentRow | null>(null)
  const rows = respondents
    .filter((r) => status === 'all' || r.status === status)
    .filter((r) => `${r.name} ${r.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <>
      {respondents.length > 0 && (
        <Toolbar>
          <SearchField value={q} onChange={setQ} placeholder="Rechercher une personne…" />
          <FilterSelect
            label="Statut"
            value={status}
            onChange={setStatus}
            className="sm:w-44"
            options={[
              { value: 'all', label: 'Tous statuts' },
              { value: 'not_started', label: 'Pas commencé' },
              { value: 'in_progress', label: 'En cours' },
              { value: 'done', label: 'Terminé' },
            ]}
          />
        </Toolbar>
      )}
      <DataTable
        columns={[
          { label: 'Personne' },
          { label: 'Statut' },
          { label: 'Progression', className: 'hidden sm:table-cell' },
          { label: 'Invité', className: 'hidden md:table-cell' },
          { label: '', className: 'w-px' },
        ]}
        empty={
          rows.length === 0 ? (
            respondents.length === 0 ? (
              <EmptyState icon={Users} title="Personne n’est encore invité">
                Chaque personne reçoit son propre lien, à envoyer par mail, SMS ou WhatsApp.
                <div className="mt-4">
                  <Button size="sm" onClick={onInvite}>
                    <UserPlus /> Inviter quelqu’un
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
            <Cell className="hidden sm:table-cell">
              <ProgressBar value={r.answered} max={total} />
            </Cell>
            <Cell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
              {timeAgo(r.createdAt)}
            </Cell>
            <Cell>
              {/* Au-dessus du lien qui couvre la ligne. */}
              <div className="relative z-10 flex justify-end gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Copier le lien"
                  aria-label={`Copier le lien de ${r.name}`}
                  onClick={() => copyLink(r.link)}
                >
                  <Copy />
                </Button>
                {r.email && (
                  <Button variant="ghost" size="icon-sm" asChild title="Préparer le mail">
                    <a href={mailtoHref(form, r)} aria-label={`Préparer le mail pour ${r.name}`}>
                      <Mail />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Supprimer"
                  aria-label={`Supprimer ${r.name}`}
                  onClick={() => setDeleting(r)}
                >
                  <Trash2 />
                </Button>
              </div>
            </Cell>
          </Row>
        ))}
      </DataTable>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer ${deleting?.name ?? ''} ?`}
        description="Ses réponses, sa conversation et ses fichiers seront effacés, et son lien ne fonctionnera plus. C’est définitif."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/api/admin/respondents/${deleting.id}`, { method: 'DELETE' })
            toast.success(`${deleting.name} supprimé`)
            await queryClient.invalidateQueries({ queryKey: ['form', form.id] })
            await queryClient.invalidateQueries({ queryKey: ['responses'] })
            await queryClient.invalidateQueries({ queryKey: ['forms'] })
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Erreur')
          }
        }}
      />
    </>
  )
}

/** Aperçu des questions ou des étapes, comme l'onglet « Preview » d'un e-mail sur Resend. */
function Content({ form }: { form: StoredForm }) {
  let n = 0
  return (
    <div className="rounded-2xl border p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">{form.intro}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/edit" search={{ id: form.id }}>
            <Pencil /> Modifier
          </Link>
        </Button>
      </div>
      <div className="grid gap-8">
        {form.sections.map((s) => (
          <section key={s.title}>
            <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {s.title}
            </h3>
            <ol className="grid gap-3">
              {s.questions.map((q) => {
                n += 1
                return (
                  <li key={q.id} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums">
                      {n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {q.label}
                        {!q.required && (
                          <span className="font-normal text-muted-foreground"> · facultatif</span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag>{TYPES[q.type]}</Tag>
                        {q.options?.map((o) => (
                          <Tag key={o} tone="live">
                            {o}
                          </Tag>
                        ))}
                      </div>
                      {q.help && <p className="mt-1.5 text-sm text-muted-foreground">{q.help}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function InviteDialog({
  form,
  open,
  onOpenChange,
}: {
  form: StoredForm
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState<RespondentRow | null>(null)
  const create = useMutation({
    mutationFn: () =>
      api<RespondentRow>(`/api/admin/forms/${form.id}/respondents`, { body: { name, email } }),
    onSuccess: async (r) => {
      setCreated(r)
      await queryClient.invalidateQueries({ queryKey: ['form', form.id] })
      await queryClient.invalidateQueries({ queryKey: ['responses'] })
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
    },
    onError: (err) => toast.error(err.message),
  })
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setCreated(null)
      setName('')
      setEmail('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Lien prêt pour {created.name}</DialogTitle>
              <DialogDescription>
                Envoyez-le par le canal de votre choix. La personne peut reprendre plus tard avec le
                même lien.
              </DialogDescription>
            </DialogHeader>
            <Input readOnly value={created.link} className="font-mono text-xs" />
            <DialogFooter>
              {created.email && (
                <Button variant="outline" asChild>
                  <a href={mailtoHref(form, created)}>
                    <Mail /> Préparer le mail
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={created.link} target="_blank" rel="noreferrer">
                  <ExternalLink /> Ouvrir
                </a>
              </Button>
              <Button onClick={() => copyLink(created.link)}>
                <Copy /> Copier le lien
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>Inviter quelqu’un</DialogTitle>
              <DialogDescription>Chaque personne reçoit son propre lien.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="invite-name">Nom</Label>
              <Input
                id="invite-name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marie Dupont"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">
                E-mail <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marie@exemple.fr"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                Créer le lien
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Lien public et iframe à coller dans un site. */
function EmbedDialog({
  form,
  publicToken,
  open,
  onOpenChange,
}: {
  form: StoredForm
  publicToken: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api(`/api/admin/forms/${form.id}/public`, { body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form', form.id] }),
    onError: (err) => toast.error(err.message),
  })
  const origin = window.location.origin
  const link = publicToken && `${origin}/f/${publicToken}`
  // Micro autorisé : la dictée fonctionne aussi dans l'iframe.
  const snippet =
    link &&
    `<iframe src="${link}" title="${form.title.replaceAll('"', '&quot;')}" width="100%" height="640" style="border:0;border-radius:12px" allow="microphone"></iframe>`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Intégrer sur votre site</DialogTitle>
          <DialogDescription>
            Un lien unique pour tout le monde : chaque visiteur qui clique sur « Commencer » devient
            une personne dans la liste, avec ses propres réponses. Idéal pour une demande d’avis, un
            formulaire de contact ou une prise de rendez-vous.
          </DialogDescription>
        </DialogHeader>
        {!link || !snippet ? (
          <DialogFooter>
            <Button disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
              Activer le lien public
            </Button>
          </DialogFooter>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="public-link">Lien public</Label>
              <div className="flex gap-2">
                <Input id="public-link" readOnly value={link} className="font-mono text-xs" />
                <Button variant="outline" onClick={() => copyLink(link)}>
                  <Copy /> Copier
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Code à coller dans votre site</Label>
              <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {snippet}
              </pre>
              <p className="text-xs text-muted-foreground">
                À l’endroit où le questionnaire doit apparaître ; height règle sa hauteur. Une
                réponse n’est comptée que si le visiteur commence.
              </p>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(false)}
                title="Le lien et le code intégré cessent de fonctionner"
              >
                Désactiver
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink /> Ouvrir
                  </a>
                </Button>
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(snippet)
                    toast.success('Code copié')
                  }}
                >
                  <Copy /> Copier le code
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
