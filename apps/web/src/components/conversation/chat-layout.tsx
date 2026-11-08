import { ClipboardList, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Châssis plein écran du répondant : fil de conversation au centre (défile seul), panneau
 * « Vos réponses » à droite dès 1280 px (`xl`) ; en dessous, il se replie derrière un
 * bouton de l'en-tête et s'ouvre par-dessus le fil. `h-dvh` et non `h-screen` : sur
 * téléphone, `100vh` déborde sous la barre d'outils du navigateur.
 */
export function ChatLayout({
  title,
  children,
  composer,
  panel,
  panelSummary,
  scrollRef,
}: {
  title: string
  children: ReactNode
  /** Zone de saisie, hors défilement. */
  composer?: ReactNode
  panel: ReactNode
  panelSummary: string
  scrollRef?: React.Ref<HTMLElement>
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ClipboardList className="size-4" aria-hidden="true" />
          </div>
          <h1 className="truncate font-semibold">{title}</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="xl:hidden"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
          <span className="hidden sm:inline">Vos réponses</span>
          <span className="text-muted-foreground sm:before:content-['·_']">{panelSummary}</span>
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* `relative` : bloc conteneur des `sr-only`, sinon ils font déborder la racine. */}
          <main
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
          >
            <div className="mx-auto max-w-2xl">{children}</div>
          </main>
          {composer && (
            <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
              <div className="mx-auto max-w-2xl">{composer}</div>
            </div>
          )}
        </div>

        <aside
          id={panelId}
          aria-label="Vos réponses"
          className={cn(
            'w-[360px] shrink-0 border-l bg-muted/30',
            panelOpen
              ? 'absolute inset-y-0 right-0 z-20 block w-[min(360px,92vw)] bg-background shadow-xl'
              : 'hidden',
            'xl:static xl:block xl:bg-muted/30 xl:shadow-none',
          )}
        >
          {panel}
        </aside>
      </div>
    </div>
  )
}
