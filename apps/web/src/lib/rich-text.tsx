import { Fragment, type ReactNode } from 'react'

/**
 * Mise en forme de base des messages de l'IA : paragraphes, listes (- ou 1.), **gras**,
 * *italique*, `code` et liens. Le texte est échappé par React : aucun HTML n'est interprété.
 * shortcut: sous-ensemble de Markdown (pas de titres, tableaux ni listes imbriquées), à
 * remplacer par une vraie bibliothèque si l'IA en a besoin.
 */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length}>
          {para.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: texte figé, l'ordre ne change pas
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>,
      )
      para = []
    }
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag
          key={blocks.length}
          className={
            list.ordered ? 'list-decimal pl-5' : 'list-disc pl-5 marker:text-muted-foreground'
          }
        >
          {list.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: texte figé, l'ordre ne change pas
            <li key={i} className="pl-1">
              {inline(item)}
            </li>
          ))}
        </Tag>,
      )
      list = null
    }
  }
  for (const line of text.split('\n')) {
    const item = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (item) {
      const ordered = Boolean(item[2])
      if (para.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push(item[3] ?? '')
    } else if (line.trim() === '') {
      flush()
    } else {
      if (list) flush()
      para.push(line)
    }
  }
  flush()
  return <div className="grid gap-3">{blocks}</div>
}

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s)]+[^\s).,;:!?»])/g

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [token] = m
    const key = m.index
    if (m[1]) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (m[2]) {
      out.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (m[3]) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else {
      const link = m[4] ? /^\[(.+)\]\((.+)\)$/.exec(token) : null
      const label = link?.[1] ?? token
      const href = link?.[2] ?? token
      out.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4 hover:text-muted-foreground"
        >
          {label}
        </a>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
