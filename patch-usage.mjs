import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/UsagePage.tsx', 'utf8');

// 1. Add openrouter to interface
content = content.replace(
  /    codex: UsageBreakdown;\n  \};/,
  `    codex: UsageBreakdown;\n    openrouter: UsageBreakdown;\n  };`
);

// 2. Add openrouter card below Codex
const codexCardEndRegex = /<\/span>\n\s*<span>\{usage\?\.breakdown\.codex\.dailyTokens\?\.toLocaleString\(\) \|\| 0\} \(24h\)<\/span>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>/;

const openRouterCard = `
          {/* OpenRouter */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🌐</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>OpenRouter</span>
              </div>
              <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                OR API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>\${usage?.breakdown.openrouter?.dailyUsd.toFixed(4) || '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>\${usage?.breakdown.openrouter?.weeklyUsd.toFixed(4) || '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown.openrouter?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>
`;

content = content.replace(codexCardEndRegex, match => match + openRouterCard);

fs.writeFileSync('frontend/src/pages/UsagePage.tsx', content);
