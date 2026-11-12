/**
 * Askly sur un site : <script src="https://ask.tnemelc.fr/embed.js" data-askly="JETON" async></script>
 *
 * - par défaut, une bulle en bas à droite ouvre le questionnaire dans un panneau ;
 * - data-mode="inline" l'affiche dans la page, à l'endroit du script (data-height pour la hauteur) ;
 * - data-label : texte de la bulle ; data-color : sa couleur.
 *
 * Le questionnaire tourne dans une iframe : aucun cookie, rien à configurer côté site.
 */
;(() => {
  const script = document.currentScript
  const token = script?.dataset.askly
  if (!script || !token) return
  const url = `${new URL(script.src).origin}/f/${encodeURIComponent(token)}`
  const color = script.dataset.color || '#111111'

  const frame = () => {
    const iframe = document.createElement('iframe')
    iframe.src = url
    iframe.title = script.dataset.title || 'Questionnaire'
    iframe.allow = 'microphone; clipboard-write'
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#fff'
    return iframe
  }

  if (script.dataset.mode === 'inline') {
    const box = document.createElement('div')
    box.style.cssText = `width:100%;height:${script.dataset.height || '640px'};border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,.1)`
    box.appendChild(frame())
    script.parentNode.insertBefore(box, script)
    return
  }

  const label = script.dataset.label || 'Donner mon avis'
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-expanded', 'false')
  button.style.cssText = `position:fixed;right:20px;bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;background:${color};color:#fff;font:600 15px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer`
  const icon =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>'
  const close =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  const text = document.createElement('span')
  text.textContent = label
  const setButton = (open) => {
    button.innerHTML = open ? close : icon
    if (!open) button.appendChild(text)
    button.setAttribute('aria-label', open ? 'Fermer' : label)
    button.setAttribute('aria-expanded', String(open))
  }
  setButton(false)

  const panel = document.createElement('div')
  const narrow = window.matchMedia('(max-width: 480px)')
  const place = () => {
    panel.style.cssText = narrow.matches
      ? 'position:fixed;inset:0 0 84px 0;z-index:2147483647;background:#fff;display:none'
      : 'position:fixed;right:20px;bottom:84px;z-index:2147483647;width:400px;height:min(640px,calc(100vh - 110px));border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 16px 48px rgba(0,0,0,.25);display:none'
  }
  place()
  narrow.addEventListener('change', () => {
    const shown = panel.style.display
    place()
    panel.style.display = shown
  })

  let open = false
  button.addEventListener('click', () => {
    open = !open
    // L'iframe ne se charge qu'à la première ouverture : rien ne pèse sur le site avant.
    if (open && !panel.firstChild) panel.appendChild(frame())
    panel.style.display = open ? 'block' : 'none'
    setButton(open)
  })

  const mount = () => document.body.append(panel, button)
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
