import { useMemo } from 'react'

const TAGS = new Set('a abbr article aside b bdi blockquote br button caption code col colgroup dd del details div dl dt em fieldset figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img input kbd label legend li main mark meter nav ol optgroup option p pre progress q s samp section select small span strong style sub summary sup table tbody td textarea tfoot th thead time tr u ul var wbr'.split(' '))
const ATTRIBUTES = new Set('alt checked class cols colspan datetime dir disabled for height hidden id lang max maxlength min multiple name open placeholder role rows rowspan scope selected size step style tabindex title type value width'.split(' '))
const POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; object-src 'none'"

/** Parse in an inert template; only the reconstructed markup goes into an opaque frame. */
export function drawerMarkupDocument(source: string) {
  const template = document.createElement('template')
  template.innerHTML = source
  for (const element of template.content.querySelectorAll('*')) {
    const name = element.localName
    if (!TAGS.has(name) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const { name: key, value } = attribute
      if (ATTRIBUTES.has(key) || /^aria-[a-z-]+$/.test(key)) continue
      if (name === 'img' && key === 'src' && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) continue
      element.removeAttribute(key)
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${POLICY}">
    <style>:root{color-scheme:light dark}body{margin:0;padding:16px;font:14px/1.55 system-ui,sans-serif}img{max-width:100%;height:auto}*{box-sizing:border-box}</style>
    </head><body>${template.innerHTML}</body></html>`
}

export function DrawerMarkup({ title, html }: { title: string; html: string }) {
  const source = useMemo(() => drawerMarkupDocument(html), [html])
  return <iframe className="drawer-html" title={title} sandbox="" referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
    srcDoc={source} />
}
