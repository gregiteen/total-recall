import { useState } from 'react';
import { runSandbox } from '../api';

type OkfTab = 'import' | 'export' | 'lint';
type ConflictMode = 'skip' | 'warn' | 'overwrite';
type CategoryOverride = 'auto' | 'invariants' | 'preferences' | 'facts' | 'concepts' | 'patterns' | 'decisions' | 'lore';
type ExportFormat = 'directory' | 'tar.gz';
type ExportScope = 'all' | 'global' | 'project';

interface LintRow {
  slug: string;
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: 0,
  borderBottom: '1px solid var(--border)',
  marginBottom: 24,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
  cursor: 'pointer',
  transition: 'color 0.2s, border-color 0.2s',
});

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 14px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%239e9e9e' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
};

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  backdropFilter: 'blur(12px)',
  borderRadius: 10,
  padding: 24,
};

const outputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 320,
  overflowY: 'auto',
  marginTop: 16,
};

const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const severityColor: Record<string, string> = {
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OkfPage() {
  const [activeTab, setActiveTab] = useState<OkfTab>('import');

  // ── Import state ──
  const [importPath, setImportPath] = useState('');
  const [conflictMode, setConflictMode] = useState<ConflictMode>('warn');
  const [categoryOverride, setCategoryOverride] = useState<CategoryOverride>('auto');
  const [importanceOverride, setImportanceOverride] = useState('');
  const [importOutput, setImportOutput] = useState('');
  const [importRunning, setImportRunning] = useState(false);
  const [importError, setImportError] = useState(false);

  // ── Export state ──
  const [exportPath, setExportPath] = useState('');
  const [stripMeta, setStripMeta] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('directory');
  const [exportScope, setExportScope] = useState<ExportScope>('all');
  const [exportOutput, setExportOutput] = useState('');
  const [exportRunning, setExportRunning] = useState(false);
  const [exportError, setExportError] = useState(false);

  // ── Lint state ──
  const [lintRows, setLintRows] = useState<LintRow[]>([]);
  const [lintRan, setLintRan] = useState(false);
  const [lintRunning, setLintRunning] = useState(false);
  const [lintRawOutput, setLintRawOutput] = useState('');

  // ── Handlers ──

  const handleImport = async () => {
    if (!importPath.trim()) return;
    setImportRunning(true);
    setImportOutput('');
    setImportError(false);
    try {
      let cmd = `npx total-recall ingest okf ${JSON.stringify(importPath.trim())} --on-conflict ${conflictMode}`;
      if (categoryOverride !== 'auto') cmd += ` --category ${categoryOverride}`;
      const imp = parseInt(importanceOverride, 10);
      if (imp >= 1 && imp <= 5) cmd += ` --importance ${imp}`;

      const code = `
const { execSync } = require('child_process');
try {
  const out = execSync(${JSON.stringify(cmd)}, { encoding: 'utf8', timeout: 30000 });
  console.log(out);
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(1);
}`;
      const result = await runSandbox(code, 30000);
      setImportOutput(result.output);
      setImportError(!result.success);
    } catch (e) {
      setImportOutput((e as Error).message);
      setImportError(true);
    } finally {
      setImportRunning(false);
    }
  };

  const handleExport = async () => {
    if (!exportPath.trim()) return;
    setExportRunning(true);
    setExportOutput('');
    setExportError(false);
    try {
      let cmd = `npx total-recall export okf ${JSON.stringify(exportPath.trim())} --format ${exportFormat} --scope ${exportScope}`;
      if (stripMeta) cmd += ' --strip-ssss';

      const code = `
const { execSync } = require('child_process');
try {
  const out = execSync(${JSON.stringify(cmd)}, { encoding: 'utf8', timeout: 30000 });
  console.log(out);
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(1);
}`;
      const result = await runSandbox(code, 30000);
      setExportOutput(result.output);
      setExportError(!result.success);
    } catch (e) {
      setExportOutput((e as Error).message);
      setExportError(true);
    } finally {
      setExportRunning(false);
    }
  };

  const handleLint = async () => {
    setLintRunning(true);
    setLintRows([]);
    setLintRawOutput('');
    setLintRan(false);
    try {
      const code = `
const { execSync } = require('child_process');
try {
  const out = execSync('npx total-recall lint okf --json', { encoding: 'utf8', timeout: 30000 });
  console.log(out);
} catch (e) {
  // lint exits non-zero if there are errors — output is still valid
  if (e.stdout) console.log(e.stdout);
  else console.error(e.stderr || e.message);
}`;
      const result = await runSandbox(code, 30000);
      setLintRawOutput(result.output);

      // Try to parse JSON lint output
      try {
        const parsed = JSON.parse(result.output);
        const rows: LintRow[] = (Array.isArray(parsed) ? parsed : parsed.issues || []).map(
          (item: { slug?: string; field?: string; severity?: string; message?: string }) => ({
            slug: item.slug || '—',
            field: item.field || '—',
            severity: (['error', 'warning', 'info'].includes(item.severity || '') ? item.severity : 'info') as LintRow['severity'],
            message: item.message || '',
          }),
        );
        setLintRows(rows);
      } catch {
        // Non-JSON output — show raw
      }
      setLintRan(true);
    } catch (e) {
      setLintRawOutput((e as Error).message);
      setLintRan(true);
    } finally {
      setLintRunning(false);
    }
  };

  const lintErrors = lintRows.filter(r => r.severity === 'error').length;
  const lintWarnings = lintRows.filter(r => r.severity === 'warning').length;

  // ── Render ──

  return (
    <div className="page">
      <div className="page-header">
        <h1>📦 Open Knowledge Format</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Import, export, and lint OKF bundles for interoperable memory exchange.
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={tabBarStyle}>
        {(['import', 'export', 'lint'] as OkfTab[]).map(tab => (
          <button
            key={tab}
            id={`okf-tab-${tab}`}
            style={tabStyle(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'import' && '⬇ Import'}
            {tab === 'export' && '⬆ Export'}
            {tab === 'lint' && '🔍 Lint'}
          </button>
        ))}
      </div>

      {/* ── Import Tab ── */}
      {activeTab === 'import' && (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Import Open Knowledge Format bundles into your memory vault.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={fieldGroup}>
              <label htmlFor="okf-import-path" style={labelStyle}>OKF Bundle Path</label>
              <input
                id="okf-import-path"
                type="text"
                placeholder="/path/to/okf-bundle"
                value={importPath}
                onChange={e => setImportPath(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={formGrid}>
              <div style={fieldGroup}>
                <label htmlFor="okf-conflict-mode" style={labelStyle}>Conflict Resolution</label>
                <select
                  id="okf-conflict-mode"
                  value={conflictMode}
                  onChange={e => setConflictMode(e.target.value as ConflictMode)}
                  style={selectStyle}
                >
                  <option value="skip">Skip</option>
                  <option value="warn">Warn (default)</option>
                  <option value="overwrite">Overwrite</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label htmlFor="okf-category-override" style={labelStyle}>Category Override</label>
                <select
                  id="okf-category-override"
                  value={categoryOverride}
                  onChange={e => setCategoryOverride(e.target.value as CategoryOverride)}
                  style={selectStyle}
                >
                  <option value="auto">Auto (default)</option>
                  <option value="invariants">Invariants</option>
                  <option value="preferences">Preferences</option>
                  <option value="facts">Facts</option>
                  <option value="concepts">Concepts</option>
                  <option value="patterns">Patterns</option>
                  <option value="decisions">Decisions</option>
                  <option value="lore">Lore</option>
                </select>
              </div>
            </div>

            <div style={{ ...fieldGroup, maxWidth: 200 }}>
              <label htmlFor="okf-importance-override" style={labelStyle}>Importance Override (1–5)</label>
              <input
                id="okf-importance-override"
                type="number"
                min={1}
                max={5}
                placeholder="Optional"
                value={importanceOverride}
                onChange={e => setImportanceOverride(e.target.value)}
                style={inputStyle}
              />
            </div>

            <button
              id="okf-import-run"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importRunning || !importPath.trim()}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              {importRunning ? '⏳ Importing…' : '⬇ Import Bundle'}
            </button>
          </div>

          {importOutput && (
            <div id="okf-import-output" style={{ ...outputStyle, borderColor: importError ? 'var(--error)' : 'var(--border)' }}>
              {importOutput}
            </div>
          )}
        </div>
      )}

      {/* ── Export Tab ── */}
      {activeTab === 'export' && (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Export your memory vault as an Open Knowledge Format bundle.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={fieldGroup}>
              <label htmlFor="okf-export-path" style={labelStyle}>Output Path</label>
              <input
                id="okf-export-path"
                type="text"
                placeholder="/path/to/export"
                value={exportPath}
                onChange={e => setExportPath(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={formGrid}>
              <div style={fieldGroup}>
                <label htmlFor="okf-export-format" style={labelStyle}>Format</label>
                <select
                  id="okf-export-format"
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value as ExportFormat)}
                  style={selectStyle}
                >
                  <option value="directory">Directory</option>
                  <option value="tar.gz">tar.gz</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label htmlFor="okf-export-scope" style={labelStyle}>Scope</label>
                <select
                  id="okf-export-scope"
                  value={exportScope}
                  onChange={e => setExportScope(e.target.value as ExportScope)}
                  style={selectStyle}
                >
                  <option value="all">All</option>
                  <option value="global">Global</option>
                  <option value="project">Project</option>
                </select>
              </div>
            </div>

            <label
              htmlFor="okf-strip-meta"
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)' }}
            >
              <input
                id="okf-strip-meta"
                type="checkbox"
                checked={stripMeta}
                onChange={e => setStripMeta(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Strip SSSS metadata
            </label>

            <button
              id="okf-export-run"
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exportRunning || !exportPath.trim()}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              {exportRunning ? '⏳ Exporting…' : '⬆ Export Vault'}
            </button>
          </div>

          {exportOutput && (
            <div id="okf-export-output" style={{ ...outputStyle, borderColor: exportError ? 'var(--error)' : 'var(--border)' }}>
              {exportOutput}
            </div>
          )}
        </div>
      )}

      {/* ── Lint Tab ── */}
      {activeTab === 'lint' && (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Run OKF compliance checks across all memory nodes.
          </p>

          <button
            id="okf-lint-run"
            className="btn btn-primary"
            onClick={handleLint}
            disabled={lintRunning}
            style={{ marginBottom: 20 }}
          >
            {lintRunning ? '⏳ Checking…' : '🔍 Run Compliance Check'}
          </button>

          {lintRan && lintRows.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Slug</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Field</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Severity</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lintRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>{row.slug}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{row.field}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            className="badge"
                            style={{
                              background: `${severityColor[row.severity]}22`,
                              color: severityColor[row.severity],
                              padding: '3px 10px',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                            }}
                          >
                            {row.severity}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={4} style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: 13 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Total: {lintRows.length}</strong>
                        {' · '}
                        <span style={{ color: 'var(--error)' }}>Errors: {lintErrors}</span>
                        {' · '}
                        <span style={{ color: 'var(--warning)' }}>Warnings: {lintWarnings}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {lintRan && lintRows.length === 0 && !lintRawOutput && (
            <div
              id="okf-lint-pass"
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--success)',
                fontSize: 15,
                fontWeight: 500,
              }}
            >
              ✅ All nodes pass OKF compliance
            </div>
          )}

          {lintRan && lintRows.length === 0 && lintRawOutput && (
            <div id="okf-lint-output" style={outputStyle}>
              {lintRawOutput}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
