const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** « il y a 2 heures », « hier »… ; « à l'instant » sous la minute. */
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const seconds = (new Date(date).getTime() - Date.now()) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'à l’instant'
}

/** « 12 nov., 09:44 ». */
export const dateTime = (date: string | Date) =>
  new Date(date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
