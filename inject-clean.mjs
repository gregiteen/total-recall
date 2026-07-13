import fs from 'fs';
let panel = fs.readFileSync('test-panel.tsx', 'utf8');
const startIdx = panel.indexOf('{/* Cloud API Keys Panel */}');
const endIdx = panel.lastIndexOf('</div>');
let cloudPanel = panel.substring(startIdx, endIdx + 6).trim();

const extraKeysHtml = `
              {/* Search & Tool APIs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Search & External Tools</h4>
                {['tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'].map(key => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 500 }}>{key.replace(/_/g, ' ').replace('api', 'API').replace('key', 'Key').replace('token', 'Token').replace(/\\b\\w/g, c => c.toUpperCase())}</label>
                    <input type="password" placeholder="Enter token..." value={(configData?.secrets as any)?.[key] || ''} onChange={(e) => updateSecretsProp(key, e.target.value)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: 13 }} />
                  </div>
                ))}
              </div>`;

cloudPanel = cloudPanel.replace(/<span style=\{\{ fontSize: 10, color: 'var\(--text-tertiary\)' \}\}>/, `${extraKeysHtml}\n        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>`);
cloudPanel = cloudPanel.replace(/<span style=\{\{ fontSize: 10, color: "var\(--text-tertiary\)" \}\}>/, `${extraKeysHtml}\n        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>`);
cloudPanel = cloudPanel.replace(/Cloud Models \(API Keys\)/g, 'Cloud & Search APIs');

const fullInjection = `
      {tab === 'cloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
             <button onClick={handleSaveConfig} disabled={saving} className="btn btn-primary" style={{ minWidth: 120 }}>
               {saving ? 'Saving...' : 'Save Configuration'}
             </button>
          </div>
          {configSuccess && (
            <div className="badge badge-success" style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
              ✓ {configSuccess}
            </div>
          )}
          ${cloudPanel}
        </div>
      )}`;

let page = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');

const target = `      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text-tertiary)' }}>
        CLI: <code>secret catalog</code> · <code>secret meta KEY --repo app --tier pro --monthly-cost 25 --rotate-days 90</code> ·{' '}
        <code>secret rotation-due</code> · <code>secret usage</code> · <code>secret providers</code>
      </p>
    </div>
  )
}`;

if (!page.includes(target)) {
  console.log('TARGET NOT FOUND');
} else {
  page = page.replace(target, `${fullInjection}\n\n${target}`);
  fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', page);
  console.log('Injected successfully');
}
