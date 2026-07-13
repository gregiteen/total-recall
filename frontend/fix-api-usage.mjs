import fs from 'fs';

let content = fs.readFileSync('src/pages/ApiKeysPage.tsx', 'utf8');

content = content.replace(
  "type Tab = 'catalog' | 'pats' | 'import' | 'cloud'",
  "type Tab = 'catalog' | 'pats' | 'import' | 'cloud' | 'usage'"
);

content = content.replace(
  "import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'",
  "import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'\nimport UsagePage from './UsagePage'"
);

const tabsHtml = `
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {[
          { id: 'catalog', label: 'Vault Catalog' },
          { id: 'usage', label: 'Usage & Spend' },
          { id: 'cloud', label: 'Cloud APIs' },
          { id: 'pats', label: 'Server Auth (PATs)' },
          { id: 'import', label: 'Migrate .env' },
        ].map((t) => (
`;

content = content.replace(
  /      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var\(--border\)', paddingBottom: 12 }}>\s+?\{\[\s+?\{ id: 'catalog', label: 'Vault Catalog' \},\s+?\{ id: 'cloud', label: 'Cloud APIs' \},\s+?\{ id: 'pats', label: 'Server Auth \(PATs\)' \},\s+?\{ id: 'import', label: 'Migrate .env' \},\s+?\]\.map\(\(t\) => \(/m,
  tabsHtml.trim()
);

let catalogRegex = /      \{tab === 'catalog' && \(\s+<div/;

let insertAfterCatalog = `
      {tab === 'usage' && (
        <div style={{ height: 'calc(100vh - 280px)', minHeight: 420, position: 'relative', overflowY: 'auto' }}>
          <UsagePage />
        </div>
      )}

      {tab === 'catalog' && (
        <div`;

content = content.replace(catalogRegex, insertAfterCatalog.trim());

// State and GroupBy Logic
content = content.replace(
  "const [filter, setFilter] = useState('')",
  "const [filter, setFilter] = useState('')\n  const [groupBy, setGroupBy] = useState<'repo' | 'api'>('repo')"
);

content = content.replace(
  "const repoSections = groupKeysByRepo(keys)",
  `const repoSections = useMemo(() => {
    if (!catalog?.keys) return []
    const f = filter.toLowerCase()
    const filtered = catalog.keys.filter(
      (k) =>
        k.key.toLowerCase().includes(f) ||
        (k.provider || '').toLowerCase().includes(f) ||
        (k.repos || []).some((r) => r.toLowerCase().includes(f)) ||
        (k.label || '').toLowerCase().includes(f)
    )
    return groupBy === 'api' ? groupKeysByProvider(filtered) : groupKeysByRepo(filtered)
  }, [catalog, filter, groupBy])`
);

let filterHtml = `
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
              <button
                onClick={() => setGroupBy('repo')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: 'pointer', border: 'none',
                  background: groupBy === 'repo' ? 'var(--bg-active)' : 'transparent',
                  color: groupBy === 'repo' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                By Repo
              </button>
              <button
                onClick={() => setGroupBy('api')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: 'pointer', border: 'none',
                  background: groupBy === 'api' ? 'var(--bg-active)' : 'transparent',
                  color: groupBy === 'api' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                By API
              </button>
            </div>
            <input
              type="text"
              placeholder="Search keys..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="search-input"
              style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
            />
          </div>
`;

content = content.replace(
  /<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>\s+?<input\s+type="text"\s+placeholder="Search keys..."\s+value=\{filter\}\s+onChange=\{\(e\) => setFilter\(e\.target\.value\)\}\s+className="search-input"\s+style=\{\{ flex: 1, padding: '6px 12px', fontSize: 13 \}\}\s+\/>\s+<\/div>/m,
  filterHtml.trim()
);

let renderTitleRegex = /\{open \? '▾ ' : '▸ '\}\s+\{sec\.label\}/m;
content = content.replace(renderTitleRegex, `{open ? '▾ ' : '▸ '}\n                    {groupBy === 'api' && <ProviderLogo provider={sec.id} />}\n                    {sec.label}`);

let renderTitleRegex2 = /\{open \? '▾' : '▸'\} \{sec\.label\}/m;
content = content.replace(renderTitleRegex2, `{open ? '▾' : '▸'} {groupBy === 'api' && <ProviderLogo provider={sec.id} />} {sec.label}`);

let providerLogoFunc = `
function groupKeysByProvider(keys: SecretCatalogKey[]) {
  const groups = new Map<string, { id: string; label: string; kind: 'repo'; keys: SecretCatalogKey[] }>()

  keys.forEach((k) => {
    const provider = (k.provider || 'unknown').toLowerCase()
    if (!groups.has(provider)) {
      groups.set(provider, { id: provider, label: provider.toUpperCase(), kind: 'repo', keys: [] })
    }
    groups.get(provider)!.keys.push(k)
  })

  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function ProviderLogo({ provider }: { provider?: string }) {
  if (!provider) return null;
  const p = provider.toLowerCase();
  if (p === 'openai') return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0462 6.0462 0 0 0 5.3-3.71 6.0415 6.0415 0 0 0 4.4646-6.4463A5.9847 5.9847 0 0 0 22.282 9.8211Z"/></svg>;
  if (p === 'anthropic') return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.433 2.115L15.939 12h3.048l1.494-9.885h-3.048zM14.616 2.115l-1.392 9.885h3.048l1.392-9.885h-3.048zM10.371 14.542l-5.637 7.343H7.78l3.966-5.166 2.766 5.166h3.018l-7.159-12.836-5.836 12.836h3.043l1.838-4.043h4.636l-3.681-3.3z"/></svg>;
  if (p === 'google') return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>;
  if (p === 'github') return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/></svg>;
  return null;
}
`;

content = content.replace(
  "export default function ApiKeysPage() {",
  providerLogoFunc + "\nexport default function ApiKeysPage() {"
);

fs.writeFileSync('src/pages/ApiKeysPage.tsx', content);
console.log('Fixed usage page script');
