import { LoaderCircle, Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { transcribeAudio } from '@/lib/api'

/** Garde-fou : au-delà, l'enregistrement s'arrête seul. */
const MAX_SECONDS = 120

/**
 * Micro de la barre de réponse : un clic lance l'enregistrement, un second l'arrête ; le
 * texte transcrit rejoint la zone de saisie, que le répondant relit avant d'envoyer.
 */
export function VoiceInput({
  token,
  disabled,
  onText,
}: {
  token: string
  disabled?: boolean
  onText: (text: string) => void
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'busy'>('idle')
  const recorder = useRef<MediaRecorder | null>(null)

  // Quitter la page coupe le micro.
  useEffect(
    () => () => {
      for (const t of recorder.current?.stream.getTracks() ?? []) t.stop()
    },
    [],
  )

  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) return null

  async function start() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast.error('Micro inaccessible : autorisez-le dans le navigateur, ou écrivez.')
      return
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = async () => {
      for (const t of stream.getTracks()) t.stop()
      recorder.current = null
      setState('busy')
      try {
        const text = await transcribeAudio(token, new Blob(chunks, { type: rec.mimeType }))
        if (text) onText(text)
        else toast.error('Rien entendu, réessayez.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Transcription impossible')
      } finally {
        setState('idle')
      }
    }
    rec.start()
    recorder.current = rec
    setState('recording')
    setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_SECONDS * 1000)
  }

  const recording = state === 'recording'
  return (
    <Button
      type="button"
      size="icon-lg"
      variant={recording ? 'destructive' : 'ghost'}
      className="size-10"
      disabled={disabled || state === 'busy'}
      aria-label={recording ? 'Arrêter la dictée' : 'Dicter la réponse'}
      aria-pressed={recording}
      onClick={() => (recording ? recorder.current?.stop() : void start())}
    >
      {state === 'busy' ? (
        <LoaderCircle className="animate-spin" />
      ) : recording ? (
        <Square className="animate-pulse" />
      ) : (
        <Mic />
      )}
    </Button>
  )
}
