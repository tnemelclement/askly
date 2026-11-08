import { Loader2, Paperclip } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_UPLOAD_MB, UPLOAD_ACCEPT } from '@/lib/api'

/** Bouton « Joindre un fichier » : ouvre le sélecteur (plusieurs fichiers possibles). */
export function FileAttachButton({
  onFiles,
  uploading,
  label = 'Joindre un fichier',
  variant = 'outline',
}: {
  onFiles: (files: File[]) => void
  uploading: boolean
  label?: string
  variant?: 'outline' | 'default'
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={uploading}
        onClick={() => input.current?.click()}
        title={`Photos, PDF ou documents, ${MAX_UPLOAD_MB} Mo maximum chacun`}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
        {uploading ? 'Envoi…' : label}
      </Button>
    </>
  )
}
