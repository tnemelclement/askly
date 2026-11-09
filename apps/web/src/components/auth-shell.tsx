import { Link } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Carte centrée des pages de connexion et d'inscription. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Link
            to="/"
            className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            aria-label="Askly, accueil"
          >
            <ClipboardList className="size-4" aria-hidden="true" />
          </Link>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
