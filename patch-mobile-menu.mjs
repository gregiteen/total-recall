import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

const replacement = `      <div className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="md-hidden" onClick={() => document.querySelector('.sidebar')?.classList.add('open')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1>Models & Agents</h1>
            <p>Configure Bring Your Own Model (BYOM) settings and manage active reasoning agents</p>
          </div>
        </div>`;

content = content.replace(
  /      <div className="page-header"[\s\S]*?<h1>Models & Agents<\/h1>\n\s*<p>Configure Bring Your Own Model \(BYOM\) settings and manage active reasoning agents<\/p>\n\s*<\/div>/,
  replacement
);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
