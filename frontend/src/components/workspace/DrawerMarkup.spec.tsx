import { expect, it } from 'vitest'
import { drawerMarkupDocument } from './DrawerMarkup'

it('keeps presentation while removing navigation, scripts and active embeds', () => {
  const source = drawerMarkupDocument(`
    <style>summary { color: teal }</style>
    <details open><summary onclick="alert(1)">Report</summary></details>
    <img src="https://example.org/tracker"><a href="#outside">Read</a>
    <script>alert(1)</script><iframe src="/settings"></iframe>
  `)
  const frame = new DOMParser().parseFromString(source, 'text/html')
  expect(frame.querySelector('details[open] summary')?.textContent).toBe('Report')
  expect(frame.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'))
    .toContain("default-src 'none'")
  expect(frame.querySelector('script, iframe, [onclick], a[href], img[src]')).toBeNull()
})
