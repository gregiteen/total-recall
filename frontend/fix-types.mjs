import fs from 'fs';

let content = fs.readFileSync('src/pages/ApiKeysPage.tsx', 'utf8');

// 1. Import useMemo
content = content.replace(
  "import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'",
  "import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'"
);

// 2. Fix the filter replacement properly
const oldFilterBlock = `
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter key, provider, repo, tier…"
              style={{
                flex: '1 1 200px',
                minWidth: 160,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
`;

let newFilterBlock = `
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
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
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter key, provider, repo, tier…"
              style={{
                flex: '1 1 200px',
                minWidth: 160,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
`;

// It might have been slightly differently formatted, let's use replace instead
let lines = content.split('\n');
let replaced = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('placeholder="Filter key, provider, repo, tier…"')) {
    // found the input
    let target = i;
    while (!lines[target].includes('<div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>')) {
      target--;
    }
    // We found the start of the filter block
    // Inject the buttons right after this target line
    lines.splice(target + 1, 0, `
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
`);
    replaced = true;
    break;
  }
}
if (!replaced) console.log("Failed to find filter block to insert groupBy toggle");

// 3. Fix the map signature since useMemo doesn't know the exact type 
// (or we can just define the return type of useMemo explicitly)
// Actually, TS errors: Parameter 'sec' implicitly has an 'any' type.
// That's because groupKeysByRepo returns an array, but wait... 
// groupKeysByRepo returns {id:string, label:string, kind:string, keys:SecretCatalogKey[]}[]
// I will just cast useMemo:
const useMemoRegex = /const repoSections = useMemo\(\(\) => \{/;
content = lines.join('\n').replace(useMemoRegex, 
  "const repoSections = useMemo<{id: string; label: string; kind: 'error' | 'developer' | 'repo'; keys: SecretCatalogKey[]}[]>(() => {"
);

fs.writeFileSync('src/pages/ApiKeysPage.tsx', content);
console.log('Fixed types');
