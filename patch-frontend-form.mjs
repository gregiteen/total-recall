import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

const oldCode = `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginTop: 24 }}>`;
const newCode = `<form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginTop: 24 }}>`;

const oldClose = `              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
            </div>

          </div>`;
const newClose = `              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
            </div>

          </form>`;

content = content.replace(oldCode, newCode);
content = content.replace(oldClose, newClose);
fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
