import { type RespondentStatus, STATUS_LABELS } from '@askly/api/domain'
import { Check, ChevronDown, Copy, type LucideIcon, Search } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Briques du back-office, d'après resend.com : en-têtes de page, onglets en pastilles,
 * filtres, tableaux à en-tête arrondi, fiches détaillées, sections de réglages.
 */

export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[28px] leading-tight font-medium">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Onglets en pastilles (« Sending / Receiving » sur Resend). */
export function PillTabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'h-8 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground',
            value === it.value && 'bg-accent text-foreground',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Rechercher…',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn('relative block min-w-0 flex-1', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-xl border border-input bg-field pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
    </label>
  )
}

/** Liste déroulante de filtre (native, donc accessible et tactile). */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 w-full appearance-none rounded-xl border border-input bg-field pr-8 pl-3 text-sm text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </label>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-col gap-2 sm:flex-row">{children}</div>
}

/** Tableau à en-tête en barre arrondie ; lignes séparées par un filet. */
export function DataTable({
  columns,
  children,
  empty,
}: {
  columns: { label: string; className?: string }[]
  children: ReactNode
  /** Affiché à la place des lignes quand il n'y en a pas. */
  empty?: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={cn(
                  'h-8 border-y border-input bg-field px-3 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground first:rounded-l-xl first:border-l last:rounded-r-xl last:border-r',
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-14 text-center">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Ligne cliquable : le lien couvre la ligne, les boutons d'action restent au-dessus. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn(
        'group relative transition-colors hover:bg-muted/60 has-[a[data-row-link]:focus-visible]:bg-muted/60',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b px-3 py-3 align-middle', className)}>{children}</td>
}

/** Pastille d'icône carrée (cellule « To » et en-tête de fiche sur Resend). */
export function IconTile({
  icon: Icon,
  size = 'sm',
  tone = 'neutral',
}: {
  icon: LucideIcon
  size?: 'sm' | 'lg'
  tone?: 'neutral' | 'ok' | 'live'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border bg-gradient-to-b from-background to-muted',
        size === 'sm'
          ? 'size-7 rounded-lg'
          : 'size-15 rounded-2xl shadow-[inset_0_0_0_4px_var(--background)]',
        tone === 'ok' && 'border-ok/30 text-ok',
        tone === 'live' && 'border-live/30 text-live',
        tone === 'neutral' && 'border-input text-muted-foreground',
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-6'} />
    </span>
  )
}

const BADGE_TONES = {
  neutral: 'bg-muted text-muted-foreground',
  ok: 'bg-ok-soft text-ok',
  live: 'bg-live-soft text-live',
  danger: 'bg-destructive/10 text-destructive',
} as const

export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof BADGE_TONES
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

const STATUS_TONES: Record<RespondentStatus, keyof typeof BADGE_TONES> = {
  not_started: 'neutral',
  in_progress: 'live',
  done: 'ok',
}

export function StatusTag({ status }: { status: RespondentStatus }) {
  return <Tag tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Tag>
}

/** En-tête d'une fiche : grande pastille, sur-titre, titre, actions à droite. */
export function DetailHeader({
  icon,
  tone,
  eyebrow,
  title,
  actions,
}: {
  icon: LucideIcon
  tone?: 'neutral' | 'ok' | 'live'
  eyebrow: ReactNode
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <IconTile icon={icon} size="lg" tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="truncate text-2xl font-medium">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Grille d'informations à étiquettes en petites capitales (FROM, SUBJECT… sur Resend). */
export function MetaGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {it.label}
          </dt>
          <dd className="truncate text-sm">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  )
}

/** Valeur en police mono avec bouton copier (ID d'un e-mail sur Resend). */
export function CopyChip({ value, display }: { value: string; display?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        toast.success('Copié')
        setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-input bg-field px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      title="Copier"
    >
      <span className="truncate">{display ?? value}</span>
      {done ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
    </button>
  )
}

/** Frise d'événements sur fond pointillé (« Email events » sur Resend). */
export function Timeline({
  events,
}: {
  events: { label: string; date: string | null; icon: LucideIcon; tone?: 'ok' | 'live' }[]
}) {
  return (
    <div className="mb-8 overflow-x-auto rounded-xl bg-[radial-gradient(var(--input)_1px,transparent_1px)] [background-size:8px_8px] px-6 py-6">
      <ol className="flex min-w-max items-start">
        {events.map((e, i) => (
          <li key={e.label} className="flex items-start">
            {i > 0 && (
              <span
                aria-hidden
                className={cn('mt-4 h-px w-16 sm:w-24', e.date ? 'bg-foreground/40' : 'bg-input')}
              />
            )}
            <div
              className={cn(
                'flex w-28 flex-col items-center gap-2 text-center',
                !e.date && 'opacity-50',
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-input bg-background">
                <e.icon
                  className={cn(
                    'size-4',
                    e.date && e.tone === 'ok' && 'text-ok',
                    e.date && e.tone === 'live' && 'text-live',
                  )}
                  aria-hidden
                />
              </span>
              <Tag tone={e.date ? (e.tone ?? 'neutral') : 'neutral'}>{e.label}</Tag>
              <span className="text-xs text-muted-foreground">
                {e.date
                  ? new Date(e.date).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'pas encore'}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Section de réglages en deux colonnes : titre et explication à gauche, contenu à droite. */
export function SettingsSection({
  title,
  description,
  aside,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** Sous l'explication (bouton « Upgrade » sur Resend). */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-6 border-b py-10 first:pt-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-12">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        {description && (
          <p className="mt-1 max-w-xs text-sm text-pretty text-muted-foreground">{description}</p>
        )}
        {aside && <div className="mt-4">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** Jauge circulaire et compteur (lignes d'utilisation sur Resend). */
export function UsageRow({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number | null
}) {
  const ratio = max ? Math.min(1, value / max) : 0
  const c = 2 * Math.PI * 6
  return (
    <div className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0">
      <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--input)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke={ratio >= 1 ? 'var(--destructive)' : 'var(--ok)'}
          strokeWidth="2"
          strokeDasharray={`${ratio * c} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground tabular-nums">
        {value.toLocaleString('fr-FR')} / {max === null ? 'illimité' : max.toLocaleString('fr-FR')}
      </span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <IconTile icon={icon} size="lg" />
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

/** Barre fine et compteur « 3/7 ». */
export function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-foreground/70"
          style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {value}/{max}
      </span>
    </span>
  )
}
