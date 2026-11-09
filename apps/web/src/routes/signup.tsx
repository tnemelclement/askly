import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfig } from '@/lib/account'
import { api } from '@/lib/api'

export const Route = createFileRoute('/signup')({ component: SignupPage })

function SignupPage() {
  const navigate = useNavigate()
  const config = useConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api('/api/admin/signup', { body: { email, password, acceptTerms: accept } })
      await navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setPending(false)
    }
  }

  if (config.data && !config.data.signup) {
    return (
      <AuthShell
        title="Inscription fermée"
        description="Cette instance n’accepte pas de nouveaux comptes."
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/admin/login">Se connecter</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Essai gratuit" description="14 jours, sans carte bancaire.">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="accept"
            checked={accept}
            onCheckedChange={(v) => setAccept(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="accept" className="text-sm leading-snug font-normal">
            <span>
              J’accepte les{' '}
              <Link to="/cgv" target="_blank" className="underline underline-offset-4">
                conditions générales
              </Link>{' '}
              et la{' '}
              <Link to="/confidentialite" target="_blank" className="underline underline-offset-4">
                politique de confidentialité
              </Link>
              .
            </span>
          </Label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending || !email || password.length < 8 || !accept}>
          Créer mon compte
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Déjà inscrit ?{' '}
          <Link
            to="/admin/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Se connecter
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
