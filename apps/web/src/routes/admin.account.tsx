import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import {
  CopyChip,
  PageHeader,
  PillTabs,
  SettingsSection,
  Tag,
  UsageRow,
} from '@/components/app/kit'
import { EDITOR } from '@/components/legal-page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Me, useMe } from '@/lib/account'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Tab = 'usage' | 'billing' | 'integrations' | 'account'
const TABS: Tab[] = ['usage', 'billing', 'integrations', 'account']

export const Route = createFileRoute('/admin/account')({
  validateSearch: (s: Record<string, unknown>): { billing?: 'success'; tab?: Tab } => ({
    ...(s.billing === 'success' ? { billing: 'success' } : {}),
    ...(TABS.includes(s.tab as Tab) ? { tab: s.tab as Tab } : {}),
  }),
  component: SettingsPage,
})

const OFFERS = [
  {
    plan: 'solo',
    label: 'Solo',
    price: '9 €',
    features: [
      '50 réponses par mois',
      'Questionnaires et tutoriels illimités',
      'Rédaction par l’IA',
    ],
  },
  {
    plan: 'pro',
    label: 'Pro',
    price: '29 €',
    features: ['500 réponses par mois', 'Fichiers joints (photos, PDF)', 'Serveur MCP pour Claude'],
  },
] as const

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' })

function SettingsPage() {
  const me = useMe()
  const navigate = useNavigate({ from: '/admin/account' })
  const { billing, tab = billing ? 'billing' : 'usage' } = Route.useSearch()
  useEffect(() => {
    if (billing === 'success') toast.success('Merci ! Votre abonnement est en cours d’activation.')
  }, [billing])

  if (me.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (me.isError) return <p className="text-sm text-destructive">{me.error.message}</p>
  const a = me.data

  return (
    <>
      <PageHeader title="Paramètres" />
      <PillTabs
        className="mb-4"
        value={tab}
        onChange={(t) => navigate({ search: { tab: t } })}
        items={[
          { value: 'usage', label: 'Utilisation' },
          { value: 'billing', label: 'Offre' },
          { value: 'integrations', label: 'MCP et API' },
          { value: 'account', label: 'Compte' },
        ]}
      />
      {tab === 'usage' && <Usage me={a} />}
      {tab === 'billing' && <Billing me={a} />}
      {tab === 'integrations' && <Integrations me={a} />}
      {tab === 'account' && <Account me={a} />}
    </>
  )
}

function Usage({ me }: { me: Me }) {
  return (
    <>
      <SettingsSection
        title="Réponses"
        description="Une réponse compte quand une personne commence un questionnaire ou un tutoriel, une fois par mois et par personne."
      >
        <p className="mb-2 text-sm font-medium">Offre {me.planLabel}</p>
        <UsageRow label="Réponses commencées ce mois-ci" value={me.usage} max={me.limit} />
        <div className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0">
          <span className="flex-1">Statut</span>
          <Tag tone={me.active ? 'ok' : 'danger'}>{me.active ? 'Actif' : 'Inactif'}</Tag>
        </div>
        {me.plan === 'trial' && me.trialEndsAt && (
          <div className="flex items-center gap-3 py-3 text-sm">
            <span className="flex-1">Fin de l’essai</span>
            <span className="text-muted-foreground">{dateFr(me.trialEndsAt)}</span>
          </div>
        )}
      </SettingsSection>
      <SettingsSection title="Fonctions" description="Ce que comprend votre offre.">
        <Feature on label="Questionnaires, tutoriels et formulaires classiques" />
        <Feature on label="Rédaction par l’IA" />
        <Feature on={me.features.files} label="Fichiers joints (photos, PDF, documents)" />
        <Feature on={me.features.mcp} label="Serveur MCP pour Claude" />
      </SettingsSection>
    </>
  )
}

function Feature({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0">
      <Check className={cn('size-4', on ? 'text-ok' : 'text-muted-foreground/40')} aria-hidden />
      <span className={cn('flex-1', !on && 'text-muted-foreground')}>{label}</span>
      {!on && <Tag>Offre Pro</Tag>}
    </div>
  )
}

function Billing({ me }: { me: Me }) {
  const go = useMutation({
    mutationFn: (body: { plan: 'solo' | 'pro' } | null) =>
      api<{ url: string }>(body ? '/api/admin/billing/checkout' : '/api/admin/billing/portal', {
        body: body ?? {},
      }),
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (err) => toast.error(err.message),
  })
  const subscribed = Boolean(me.subscriptionStatus && me.subscriptionStatus !== 'canceled')

  return (
    <SettingsSection
      title={`Offre ${me.planLabel}`}
      description={
        me.plan === 'trial' && me.trialEndsAt
          ? `Essai gratuit jusqu’au ${dateFr(me.trialEndsAt)}, toutes fonctions comprises.`
          : me.plan === 'unlimited'
            ? 'Instance du propriétaire : aucune limite.'
            : me.subscriptionStatus === 'past_due'
              ? 'Paiement en échec : mettez à jour votre carte.'
              : 'Abonnement mensuel, sans engagement.'
      }
      aside={
        subscribed && me.billing ? (
          <Button
            variant="outline"
            size="sm"
            disabled={go.isPending}
            onClick={() => go.mutate(null)}
          >
            Gérer l’abonnement
          </Button>
        ) : undefined
      }
    >
      {me.plan === 'unlimited' ? (
        <p className="text-sm text-muted-foreground">Rien à régler ici.</p>
      ) : !me.billing ? (
        <p className="text-sm text-muted-foreground">
          Le paiement en ligne arrive bientôt. Pour continuer après l’essai, écrivez-nous à{' '}
          <a href={`mailto:${EDITOR.email}`} className="underline underline-offset-4">
            {EDITOR.email}
          </a>
          .
        </p>
      ) : subscribed ? (
        <p className="text-sm text-muted-foreground">
          Changez d’offre, mettez à jour votre carte, retrouvez vos factures ou résiliez depuis
          l’espace de facturation sécurisé (Stripe).
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {OFFERS.map((o) => (
            <div
              key={o.plan}
              className={cn(
                'flex flex-col rounded-2xl border p-4',
                o.plan === 'pro' && 'border-foreground/30',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                {o.label}
                {o.plan === 'pro' && <Tag tone="live">Recommandé</Tag>}
              </p>
              <p className="mt-1 text-2xl font-medium">
                {o.price}
                <span className="text-sm font-normal text-muted-foreground"> / mois</span>
              </p>
              <ul className="mt-3 mb-4 grid gap-1.5 text-sm">
                {o.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-3.5 text-ok" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-auto w-full"
                variant={o.plan === 'pro' ? 'default' : 'outline'}
                disabled={go.isPending}
                onClick={() => go.mutate({ plan: o.plan })}
              >
                Choisir {o.label}
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

function Integrations({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const rotate = useMutation({
    mutationFn: () => api<{ token: string }>('/api/admin/api-token', { body: {} }),
    onSuccess: async (r) => {
      setToken(r.token)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast.error(err.message),
  })

  if (!me.features.mcp) {
    return (
      <SettingsSection
        title="Serveur MCP"
        description="Créez et suivez vos questionnaires depuis Claude, en conversation."
        aside={<Tag>Offre Pro</Tag>}
      >
        <p className="text-sm text-muted-foreground">
          Le serveur MCP et le jeton d’API font partie de l’offre Pro.
        </p>
      </SettingsSection>
    )
  }
  return (
    <>
      <SettingsSection
        title="Serveur MCP"
        description="Ajoutez cette adresse comme connecteur dans Claude : il vous demandera de vous connecter avec ce compte."
      >
        <Label className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Adresse du serveur
        </Label>
        <CopyChip value={me.mcpUrl} />
      </SettingsSection>
      <SettingsSection
        title="Jeton d’API"
        description="Pour Claude Code ou vos scripts, en en-tête « Authorization: Bearer ». Le remplacer désactive l’ancien."
        aside={
          !token && (
            <Button
              variant="outline"
              size="sm"
              disabled={rotate.isPending}
              onClick={() => rotate.mutate()}
            >
              <KeyRound /> {me.hasApiToken ? 'Remplacer le jeton' : 'Créer un jeton'}
            </Button>
          )
        }
      >
        {token ? (
          <div className="grid gap-2">
            <p className="text-sm">Copiez-le maintenant : il ne sera plus affiché.</p>
            <CopyChip value={token} />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <span className="flex-1">Jeton</span>
            <Tag tone={me.hasApiToken ? 'ok' : 'neutral'}>{me.hasApiToken ? 'Créé' : 'Aucun'}</Tag>
          </div>
        )}
      </SettingsSection>
    </>
  )
}

function Account({ me }: { me: Me }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [confirming, setConfirming] = useState(false)
  const change = useMutation({
    mutationFn: () => api('/api/admin/password', { body: { current, password } }),
    onSuccess: () => {
      setCurrent('')
      setPassword('')
      toast.success('Mot de passe changé')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <>
      <SettingsSection
        title="Identifiant"
        description="L’adresse avec laquelle vous vous connectez."
      >
        <Input readOnly value={me.email} aria-label="E-mail" className="max-w-sm" />
      </SettingsSection>
      <SettingsSection title="Mot de passe" description="8 caractères au moins.">
        <form
          className="grid max-w-sm gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="current">Mot de passe actuel</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={change.isPending}
          >
            Changer le mot de passe
          </Button>
        </form>
      </SettingsSection>
      {me.plan !== 'unlimited' && (
        <SettingsSection
          title="Supprimer le compte"
          description="Efface définitivement vos questionnaires, les réponses et les fichiers joints. Résiliez d’abord votre abonnement s’il est actif."
        >
          <form
            className="grid max-w-sm gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setConfirming(true)
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="delete-password">Mot de passe, pour confirmer</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="justify-self-start"
              disabled={!deletePassword}
            >
              Supprimer le compte
            </Button>
          </form>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Supprimer définitivement le compte ?"
            description="Tous vos questionnaires, tutoriels, réponses et fichiers seront effacés. Impossible de revenir en arrière."
            confirmLabel="Supprimer définitivement"
            onConfirm={async () => {
              try {
                await api('/api/admin/account', {
                  method: 'DELETE',
                  body: { password: deletePassword },
                })
                queryClient.clear()
                toast.success('Compte supprimé')
                await navigate({ to: '/' })
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Erreur')
              }
            }}
          />
        </SettingsSection>
      )}
    </>
  )
}
