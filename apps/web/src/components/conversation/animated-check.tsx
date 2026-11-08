import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Pastille d'état d'une ligne du panneau : `empty` (rond pointillé), `pending` (en cours),
 * `checked` (coche qui se trace, classe `check-draw` de styles.css). Décorative : l'état
 * est porté en texte par le parent.
 */

export type CheckState = 'empty' | 'pending' | 'checked'

export function AnimatedCheck({
  state,
  animate = true,
  className,
}: {
  state: CheckState
  animate?: boolean
  className?: string
}) {
  if (state === 'pending') {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary',
          className,
        )}
      >
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
      </span>
    )
  }
  if (state === 'empty') {
    return (
      <span
        aria-hidden="true"
        className={cn('size-5 shrink-0 rounded-full border border-dashed border-border', className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-3" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={animate ? 'check-draw' : undefined}
        />
      </svg>
    </span>
  )
}
