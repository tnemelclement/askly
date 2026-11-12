import { Link } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppTheme } from '@/lib/theme'

/** Pages de connexion et d'inscription, dans la DA du back-office (resend.com). */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  useAppTheme()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="mb-8 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          aria-label="Askly, accueil"
        >
          <ClipboardList className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-[28px] leading-tight font-medium">{title}</h1>
        <p className="mt-1 mb-8 text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  )
}
