import type { Question } from '@askly/api/domain'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_UPLOAD_MB } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FileAttachButton } from './file-attach'

/**
 * Réponses en un clic sous la question en cours : les options d'un choix, Oui / Non, des
 * cases à cocher puis « Valider » pour un choix multiple, ou les réponses proposées d'une
 * question ouverte. Un clic envoie la réponse comme si le répondant l'avait écrite ; il peut
 * toujours écrire autre chose.
 */
export function QuickReplies({
  question,
  suggestions,
  onSend,
  onSkip,
  onAttach,
  uploading = false,
}: {
  question: Question
  suggestions: string[]
  onSend: (text: string) => void
  onSkip: () => void
  /** Question `file` : fichiers choisis par le répondant. */
  onAttach?: (files: File[]) => void
  uploading?: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  // Question facultative : on peut la passer sans y répondre (l'IA la laisse vide).
  const skip = !question.required && (
    <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
      Passer
    </Button>
  )

  if (question.type === 'file') {
    return (
      <div className="ml-11 flex flex-wrap items-center gap-2">
        <FileAttachButton variant="default" uploading={uploading} onFiles={(f) => onAttach?.(f)} />
        <span className="text-xs text-muted-foreground">
          Photos, PDF ou documents, {MAX_UPLOAD_MB} Mo maximum chacun
        </span>
        {skip}
      </div>
    )
  }

  if (question.type === 'multichoice') {
    const options = question.options ?? []
    return (
      <fieldset className="ml-11 flex flex-wrap gap-2" aria-label={question.label}>
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <Button
              key={o}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={on}
              className={cn(
                on &&
                  'border-primary bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground',
              )}
              onClick={() =>
                setSelected((prev) => (on ? prev.filter((s) => s !== o) : [...prev, o]))
              }
            >
              {on && <Check />}
              {o}
            </Button>
          )
        })}
        <Button
          type="button"
          size="sm"
          disabled={selected.length === 0}
          // Ordre du questionnaire, pas celui des clics.
          onClick={() => onSend(options.filter((o) => selected.includes(o)).join(', '))}
        >
          Valider
        </Button>
        {skip}
      </fieldset>
    )
  }

  const choices =
    question.type === 'yesno'
      ? ['Oui', 'Non']
      : question.type === 'step'
        ? ['C’est fait', 'Je bloque']
        : question.options
          ? question.options
          : suggestions
  if (choices.length === 0 && !skip) return null

  return (
    <fieldset className="ml-11 flex flex-wrap gap-2" aria-label="Réponses proposées">
      {choices.map((c) => (
        <Button
          key={c}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 py-1.5 text-left whitespace-normal"
          onClick={() => onSend(c)}
        >
          {c}
        </Button>
      ))}
      {skip}
    </fieldset>
  )
}
