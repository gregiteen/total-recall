/**
 * A card that reads fields its command does not return, and defaults to a
 * reassurance.
 *
 * Observed: a git card read `data.worktree.unstaged`, `data.synced` and
 * `data.upstream.status`, none of which the command returns, and defaulted to
 * "Up to date" — so a repository with three unpushed commits rendered clean.
 */
const CARD = `
export class ReassuringCard extends HTMLElement {
  async read() {
    const data = await this.host.run('audit', ['--json'])
    const isClean = data.worktree?.clean ?? (data.clean ?? false)
    const upstream = data.upstream?.status || (data.synced ? 'Synced' : 'Up to date')
    this.shadowRoot.querySelector('.state').textContent = isClean ? 'Clean' : upstream
  }
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.read() }
}
customElements.define('tr-reassuring-card', ReassuringCard)
`;

export default {
  name: 'reassuring-default',
  why: 'an unverified reassurance is worse than no value, because it is believed',
  files: {
    'plugin.json': JSON.stringify({
      id: 'reassuring', name: 'Reassuring', version: '1.0.0', description: 'A plugin that reassures without checking.',
      cli: { command: 'reassuring', handler: './cli.mjs', subcommands: [{ name: 'audit', effect: 'read' }] },
      status: { command: 'audit', refresh_seconds: 30 },
      branding: { color: '#b45309' },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-reassuring-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': 'export default async function run() {}\n',
    'ui/card.js': CARD,
  },
  expect: {
    fail: ['no reassuring default'],
  },
};
