import { Bot } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './motion'

/**
 * Briques du fil de conversation :
 * - `ConversationThread` : liste ordonnée, région `aria-live="polite"` ;
 * - `GuideMessage` : bulle de l'assistant, à gauche ;
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
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
        <span className="sr-only">Assistant : </span>
        {children}
      </div>
    </li>
  )
}

export function UserAnswer({ children }: { children: ReactNode }) {
  const entry = useEntryClass()
  return (
    <li className={cn('flex justify-end', entry)} data-message="answer">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-primary-foreground">
        <span className="sr-only">Vous : </span>
        {children}
      </div>
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
