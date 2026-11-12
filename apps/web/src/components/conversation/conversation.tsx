import { Bot } from 'lucide-react'
import type { ReactNode } from 'react'
import { RichText } from '@/lib/rich-text'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './motion'
import { ZoomableImage } from './zoomable-image'

/**
 * Briques du fil de conversation :
 * - `ConversationThread` : liste ordonnée, région `aria-live="polite"` ;
 * - `GuideMessage` : message de l'assistant, à gauche, en texte simple (sans bulle) ;
 * - `UserAnswer` : message du répondant, à droite ;
 * - `ThinkingMessage` : l'assistant prépare sa réponse.
 * Entrée en fondu, désactivée sous `prefers-reduced-motion`.
 */

function useEntryClass(): string | false {
  return !usePrefersReducedMotion() && 'animate-in fade-in slide-in-from-bottom-1 duration-300'
}

export function ConversationThread({ children }: { children: ReactNode }) {
  return (
    <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-4">
      {children}
    </ol>
  )
}

export function GuideMessage({ children, className }: { children: ReactNode; className?: string }) {
  const entry = useEntryClass()
  return (
    <li className={cn('flex items-start gap-3', entry, className)} data-message="guide">
      <div
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Bot className="size-4" />
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 pt-1 text-[15px] leading-relaxed',
          typeof children !== 'string' && 'whitespace-pre-wrap',
        )}
      >
        <span className="sr-only">Assistant : </span>
        {typeof children === 'string' ? <RichText text={children} /> : children}
      </div>
    </li>
  )
}

export function UserAnswer({ children, images }: { children: ReactNode; images?: string[] }) {
  const entry = useEntryClass()
  return (
    <li className={cn('flex flex-col items-end gap-1.5', entry)} data-message="answer">
      {images && images.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {images.map((src, i) => (
            <div key={src.slice(-32) + String(i)} className="w-40 sm:w-52">
              <ZoomableImage
                src={src}
                alt={`Image envoyée ${i + 1}`}
                className="max-h-56 w-full rounded-2xl border object-cover"
              />
            </div>
          ))}
        </div>
      )}
      {children !== '' && (
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-primary-foreground">
          <span className="sr-only">Vous : </span>
          {children}
        </div>
      )}
    </li>
  )
}

export function ThinkingMessage({ children = 'L’assistant écrit…' }: { children?: ReactNode }) {
  return (
    <GuideMessage>
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" />
          <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms] motion-reduce:animate-none" />
          <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms] motion-reduce:animate-none" />
        </span>
        {children}
      </span>
    </GuideMessage>
  )
}
