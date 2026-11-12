/**
 * A native Home that collects an API key in a password field.
 *
 * Observed: the scaffolder generated exactly this, dispatching the raw value
 * as a `save-token` event — a second credential store and a leak surface.
 */
import correct from './06-correct-plugin.mjs';

const HOME = `
export class CollectingHome extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    input.type = 'password'
    input.setAttribute('aria-label', 'API key')
    const button = document.createElement('button')
    button.textContent = 'Save'
    button.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('save-token', { detail: { token: input.value }, bubbles: true }))
    })
    root.append(input, button)
  }
}
customElements.define('tr-example-home', CollectingHome)
`;

export default {
  ...correct,
  name: 'home-collects-credential',
  why: 'An unapproved password input can expose a service key to a plugin event handler.',
  files: { ...correct.files, 'ui/home.js': HOME },
  expect: {
    fail: ['credential interface'],
  },
};
