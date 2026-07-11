import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8');

const extraRateLimitsHtml = `
          <div className="field-col">
            <label className="field-label">Sandbox Requests Per Minute</label>
            <input
              type="number"
              className="settings-input"
              value={configData.security.rate_limits?.sandbox_requests_per_minute ?? 60}
              onChange={(e) => updateSecurityNested('rate_limits', 'sandbox_requests_per_minute', parseInt(e.target.value, 10))}
            />
          </div>

          <div className="field-col">
            <label className="field-label">Ingest Requests Per Minute</label>
            <input
              type="number"
              className="settings-input"
              value={configData.security.rate_limits?.ingest_requests_per_minute ?? 300}
              onChange={(e) => updateSecurityNested('rate_limits', 'ingest_requests_per_minute', parseInt(e.target.value, 10))}
            />
          </div>
`;

content = content.replace(/<label className="field-label">API Requests Per Minute \(Rate Limit\)<\/label>[\s\S]*?<\/div>/, `$&
${extraRateLimitsHtml}
`);

fs.writeFileSync('frontend/src/pages/SettingsPage.tsx', content);
console.log('patched more settings');
