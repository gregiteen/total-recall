/**
 * A native Home that reports success when its command returns no health reading.
 *
 * Observed: a git card read `data.worktree.unstaged`, `data.synced` and
 * `data.upstream.status`, none of which the command returns, and defaulted to
 * "Up to date" — so a repository with three unpushed commits rendered clean.
 */
import correct from './06-correct-plugin.mjs';

const HOME = `
export class ReassuringHome extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    const output = document.createElement('output')
    const button = document.createElement('button')
    button.textContent = 'Read status'
    button.addEventListener('click', async () => {
      const data = await this.host.run('status', ['--json'])
      output.textContent = data.health || 'Healthy'
    })
    root.append(output, button)
  }
}
customElements.define('tr-example-home', ReassuringHome)
`;

export default {
  ...correct,
  name: 'reassuring-default',
  why: 'An unverified success can hide a failed read.',
  files: { ...correct.files, 'ui/home.js': HOME },
  expect: {
    fail: ['no reassuring default'],
  },
};
