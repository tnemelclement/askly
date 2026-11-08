import { useEffect, useRef, useState } from 'react'

/**
 * Mouvement du panneau « Vos réponses ».
 *
 * - `usePrefersReducedMotion()` : `prefers-reduced-motion: reduce`, suivi en direct.
 * - `useStaggeredReveal(ids)` : révèle les identifiants un à un (~150 ms d'écart), même
 *   quand ils arrivent d'un coup, pour que le répondant VOIE les lignes se cocher. Ceux
 *   présents au premier rendu (reprise) sont révélés d'emblée, sans animation.
 */

export const REVEAL_STAGGER_MS = 150
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function useStaggeredReveal(
  ids: readonly string[],
  reducedMotion: boolean,
): ReadonlySet<string> {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set(ids))
  const queue = useRef<string[]>([])
  const key = ids.join('|')

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume `ids`.
  useEffect(() => {
    if (reducedMotion) {
      queue.current = []
      setRevealed(new Set(ids))
      return
    }
    queue.current.push(...ids.filter((id) => !revealed.has(id) && !queue.current.includes(id)))
  }, [key, reducedMotion])

  useEffect(() => {
    if (reducedMotion) return
    const timer = setInterval(() => {
      const next = queue.current.shift()
      if (next !== undefined) setRevealed((prev) => new Set(prev).add(next))
    }, REVEAL_STAGGER_MS)
    return () => clearInterval(timer)
  }, [reducedMotion])

  return revealed
}
