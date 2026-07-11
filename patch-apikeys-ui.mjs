import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');

// I will extract the Cloud API Keys Panel from ModelsPage.tsx and inject it into ApiKeysPage.tsx under tab === 'cloud'.
const modelsPageContent = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// The cloud panel starts at "Cloud API Keys Panel"
const cloudPanelMatch = modelsPageContent.match(/\{\/\* Cloud API Keys Panel \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*<UsageChart/);
if (!cloudPanelMatch) {
  throw new Error("Could not find cloud panel in ModelsPage.tsx");
}

let cloudPanel = cloudPanelMatch[1].trim();

// add the config success banner to the top of the cloud panel
cloudPanel = `
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
      )}
`;

// Insert it right before "export default function ApiKeysPage" ends? No, before the last </div> of ApiKeysPage.
// Find the last </div>
const parts = content.split(/(\n\s*<\/div>\n\s*)$/);
content = parts[0] + "\n" + cloudPanel + parts[1] + parts[2];

fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', content);
console.log('patched UI');
