import { ClipboardList, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
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

  // Panneau ouvert par-dessus le fil (sous 1280 px) : Échap le referme.
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanelOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  return (
    // Fenêtre posée sur un fond (dès la tablette) : un questionnaire, pas une application.
    <div className="h-dvh bg-muted sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-background sm:rounded-xl sm:border sm:shadow-lg">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-2xl backdrop-saturate-150 sm:px-6">
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
              className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8"
            >
              <div className="mx-auto max-w-2xl">{children}</div>
            </main>
            {composer && (
              <div className="shrink-0 bg-background px-3 pt-2 pb-3 sm:px-6 sm:pb-4">
                <div className="mx-auto max-w-2xl">{composer}</div>
              </div>
            )}
          </div>

          {panelOpen && (
            // Voile sur le fil : un tap à côté referme le panneau.
            <button
              type="button"
              aria-label="Fermer le panneau"
              className="absolute inset-0 z-10 bg-foreground/20 xl:hidden"
              onClick={() => setPanelOpen(false)}
            />
          )}

          <aside
            id={panelId}
            aria-label="Vos réponses"
            className={cn(
              'w-[360px] shrink-0 border-l bg-secondary',
              panelOpen
                ? 'absolute inset-y-0 right-0 z-20 block w-[min(360px,92vw)] bg-background shadow-xl'
                : 'hidden',
              'xl:static xl:block xl:bg-secondary xl:shadow-none',
            )}
          >
            {panel}
          </aside>
        </div>
      </div>
    </div>
  )
}
