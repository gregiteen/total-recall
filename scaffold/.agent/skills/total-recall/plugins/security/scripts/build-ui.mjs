import fs from 'node:fs';
const card = fs.readFileSync(new URL('../ui/card.js', import.meta.url), 'utf8');
// The host runs each interface from a standalone Blob module; bundle the shared class.
fs.writeFileSync(new URL('../ui/panel.js', import.meta.url), `${card}\nclass SecurityPanel extends SecuritySecurityCard {}\nif (!customElements.get('security-panel')) customElements.define('security-panel', SecurityPanel);\n`);
