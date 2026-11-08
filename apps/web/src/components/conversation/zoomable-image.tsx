import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

/** Image cliquable qui s'ouvre en grand dans un dialogue. */
export function ZoomableImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block w-full cursor-zoom-in rounded-xl text-left"
          aria-label={alt ? `Agrandir l'image : ${alt}` : "Agrandir l'image"}
        >
          <img src={src} alt={alt} className={className} />
        </button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="w-auto max-w-[calc(100vw-2rem)] bg-transparent p-0 ring-0 sm:max-w-[calc(100vw-4rem)]"
      >
        <DialogTitle className="sr-only">{alt || 'Image'}</DialogTitle>
        <img
          src={src}
          alt={alt}
          className="max-h-[calc(100dvh-4rem)] max-w-full rounded-xl object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
