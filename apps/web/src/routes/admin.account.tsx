import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Copy, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EDITOR } from '@/components/legal-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { type Me, useMe } from '@/lib/account'
import { api } from '@/lib/api'

export const Route = createFileRoute('/admin/account')({
  validateSearch: (s: Record<string, unknown>): { billing?: 'success' } =>
    s.billing === 'success' ? { billing: 'success' } : {},
  component: AccountPage,
})

const OFFERS = [
  { plan: 'solo', label: 'Solo', price: '9 €', detail: '50 réponses par mois' },
  {
    plan: 'pro',
    label: 'Pro',
    price: '29 €',
    detail: '500 réponses par mois, fichiers joints, serveur MCP',
  },
] as const

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' })

function AccountPage() {
  const me = useMe()
  const { billing } = Route.useSearch()
  useEffect(() => {
    if (billing === 'success') toast.success('Merci ! Votre abonnement est en cours d’activation.')
  }, [billing])

  if (me.isPending) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (me.isError) return <p className="text-sm text-destructive">{me.error.message}</p>
  const a = me.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
        <p className="text-sm text-muted-foreground">{a.email}</p>
      </div>
      <PlanCard me={a} />
      <ApiCard me={a} />
      <PasswordCard />
      {a.plan !== 'unlimited' && <DeleteCard />}
    </div>
  )
}

function PlanCard({ me }: { me: Me }) {
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Offre {me.planLabel}
          <Badge variant={me.active ? 'secondary' : 'destructive'}>
            {me.active ? 'active' : 'inactive'}
          </Badge>
        </CardTitle>
        <CardDescription>
          {me.plan === 'trial' && me.trialEndsAt
            ? `Essai gratuit jusqu’au ${dateFr(me.trialEndsAt)}.`
            : me.plan === 'unlimited'
              ? 'Instance auto-hébergée : aucune limite.'
              : me.subscriptionStatus === 'past_due'
                ? 'Paiement en échec : mettez à jour votre carte.'
                : 'Abonnement mensuel, sans engagement.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {me.limit !== null && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Réponses commencées ce mois-ci</span>
              <span className="tabular-nums">
                {me.usage} / {me.limit}
              </span>
            </div>
            <Progress value={Math.min(100, (me.usage / me.limit) * 100)} />
          </div>
        )}
        {me.plan !== 'unlimited' &&
          (!me.billing ? (
            <p className="text-sm text-muted-foreground">
              Le paiement en ligne arrive bientôt. Pour continuer après l’essai, écrivez-nous à{' '}
              <a href={`mailto:${EDITOR.email}`} className="underline underline-offset-4">
                {EDITOR.email}
              </a>
              .
            </p>
          ) : subscribed ? (
            <Button variant="outline" disabled={go.isPending} onClick={() => go.mutate(null)}>
              Gérer l’abonnement (offre, carte, factures, résiliation)
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {OFFERS.map((o) => (
                <div key={o.plan} className="rounded-xl border p-4">
                  <p className="font-medium">
                    {o.label} · {o.price}
                    <span className="text-sm font-normal text-muted-foreground"> / mois</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{o.detail}</p>
                  <Button
                    className="mt-3 w-full"
                    variant={o.plan === 'pro' ? 'default' : 'outline'}
                    disabled={go.isPending}
                    onClick={() => go.mutate({ plan: o.plan })}
                  >
                    Choisir {o.label}
                  </Button>
                </div>
              ))}
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

function ApiCard({ me }: { me: Me }) {
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
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success('Copié'))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Piloter Askly depuis Claude</CardTitle>
        <CardDescription>
          {me.features.mcp
            ? 'Ajoutez le serveur MCP comme connecteur dans Claude : il vous demandera de vous connecter avec ce compte. Pour Claude Code, utilisez un jeton d’API.'
            : 'Le serveur MCP fait partie de l’offre Pro.'}
        </CardDescription>
      </CardHeader>
      {me.features.mcp && (
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="mcp-url">Adresse du serveur MCP</Label>
            <div className="flex gap-2">
              <Input id="mcp-url" readOnly value={me.mcpUrl} className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copier"
                onClick={() => copy(me.mcpUrl)}
              >
                <Copy />
              </Button>
            </div>
          </div>
          {token ? (
            <div className="grid gap-2">
              <Label htmlFor="token">Jeton d’API (affiché une seule fois)</Label>
              <div className="flex gap-2">
                <Input id="token" readOnly value={token} className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copier"
                  onClick={() => copy(token)}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
              <KeyRound />
              {me.hasApiToken ? 'Remplacer le jeton d’API' : 'Créer un jeton d’API'}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
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
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="current">Actuel</Label>
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
            <Label htmlFor="new-password">Nouveau</Label>
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
          <Button type="submit" variant="outline" disabled={change.isPending}>
            Changer
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteCard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const remove = useMutation({
    mutationFn: () => api('/api/admin/account', { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      queryClient.clear()
      toast.success('Compte supprimé')
      await navigate({ to: '/' })
    },
    onError: (err) => toast.error(err.message),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supprimer le compte</CardTitle>
        <CardDescription>
          Efface définitivement vos questionnaires, les réponses et les fichiers joints. Résiliez
          d’abord votre abonnement s’il est actif.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            remove.mutate()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="delete-password">Mot de passe, pour confirmer</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="destructive" disabled={remove.isPending || !password}>
            Supprimer définitivement
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
