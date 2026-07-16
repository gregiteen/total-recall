import { useState, useEffect, useCallback } from 'react';
import {
  getNetworkStats,
  getNetworkPolicy,
  updateNetworkPolicy,
  blockDomain,
  unblockDomain,
  getAuditLog,
} from '../api/network';
import type { NetworkStats, NetworkPolicy, AuditLogEntry } from '../api/network';
import './NetworkPage.css';

const REFRESH_OPTIONS = [
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: 'Off', value: 0 },
];

export default function NetworkPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [policy, setPolicy] = useState<NetworkPolicy | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  // Blocklist add form
  const [newDomain, setNewDomain] = useState('');

  // Limits editor (local edits before save)
  const [editLimits, setEditLimits] = useState({
    max_global_concurrency: 20,
    max_per_domain_concurrency: 5,
    default_timeout_ms: 30000,
  });
  const [limitsChanged, setLimitsChanged] = useState(false);

  // Audit filters
  const [filterDomain, setFilterDomain] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [statsRes, policyRes, auditRes] = await Promise.all([
        getNetworkStats(),
        getNetworkPolicy().catch(() => null),
        getAuditLog(
          filterDomain || filterStatus
            ? { ...(filterDomain && { domain: filterDomain }), ...(filterStatus && { status: filterStatus }) }
            : undefined
        ),
      ]);
      setStats(statsRes.stats || statsRes as any);
      if (policyRes) {
        setPolicy(policyRes);
        if (!limitsChanged) {
          setEditLimits({
            max_global_concurrency: policyRes.max_global_concurrency ?? 20,
            max_per_domain_concurrency: policyRes.max_per_domain_concurrency ?? 5,
            default_timeout_ms: policyRes.default_timeout_ms ?? 30000,
          });
        }
      }
      setAudit(auditRes.audit || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load network data');
    } finally {
      setLoading(false);
    }
  }, [filterDomain, filterStatus, limitsChanged]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!refreshInterval) return;
    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadData]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleBlockDomain = async () => {
    const domain = newDomain.trim();
    if (!domain) return;
    try {
      await blockDomain(domain);
      setNewDomain('');
      setSuccess(`Blocked ${domain}`);
      setTimeout(() => setSuccess(''), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnblockDomain = async (domain: string) => {
    try {
      await unblockDomain(domain);
      setSuccess(`Unblocked ${domain}`);
      setTimeout(() => setSuccess(''), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveLimits = async () => {
    try {
      await updateNetworkPolicy(editLimits);
      setLimitsChanged(false);
      setSuccess('Limits updated');
      setTimeout(() => setSuccess(''), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleWhitelist = async () => {
    if (!policy) return;
    try {
      await updateNetworkPolicy({ whitelist_mode: !policy.whitelist_mode });
      setSuccess(`Switched to ${!policy.whitelist_mode ? 'whitelist' : 'blocklist'} mode`);
      setTimeout(() => setSuccess(''), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-container network-page">
        <div className="page-header">
          <h1>Network Firewall</h1>
        </div>
        <div className="empty-state">Loading network data...</div>
      </div>
    );
  }

  const errorCount = (stats?.errors ?? 0) + (stats?.timeouts ?? 0);

  return (
    <div className="page-container network-page">
      {/* Header */}
      <div className="page-header">
        <h1>Network Firewall</h1>
        <div className="refresh-controls">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Refresh:</span>
          <select
            className="select"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 20 }}>{success}</div>}

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className={`stat-value ${(stats?.active ?? 0) > 10 ? 'accent' : ''}`}>
            {stats?.active ?? 0}
          </div>
          <div className="stat-label">Active Connections</div>
        </div>
        <div className="card stat-card">
          <div className={`stat-value ${(stats?.queueLength ?? 0) > 5 ? 'accent' : ''}`}>
            {stats?.queueLength ?? 0}
          </div>
          <div className="stat-label">Queue Depth</div>
        </div>
        <div className="card stat-card">
          <div className={`stat-value ${errorCount > 0 ? 'error' : 'success'}`}>
            {errorCount}
          </div>
          <div className="stat-label">Errors + Timeouts</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="network-sections">
        {/* Firewall Blocklist */}
        <div className="card">
          <div className="section-title">
            🛡️ Firewall Blocklist
            <span className="badge badge-warning">{policy?.blocked_domains?.length ?? 0}</span>
          </div>

          {/* Whitelist toggle */}
          <div className="toggle-row">
            <button
              className={`toggle-switch ${policy?.whitelist_mode ? 'active' : ''}`}
              onClick={handleToggleWhitelist}
              aria-label="Toggle whitelist mode"
            />
            <span className="toggle-label">
              {policy?.whitelist_mode ? 'Whitelist mode (allow only listed)' : 'Blocklist mode (block listed)'}
            </span>
          </div>

          {policy?.blocked_domains && policy.blocked_domains.length > 0 ? (
            <ul className="blocklist-items">
              {policy.blocked_domains.map((domain) => (
                <li key={domain} className="blocklist-item">
                  <span>{domain}</span>
                  <button className="blocklist-remove" onClick={() => handleUnblockDomain(domain)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">No domains blocked</div>
          )}

          <div className="blocklist-add">
            <input
              className="input"
              type="text"
              placeholder="domain.to.block"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBlockDomain()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleBlockDomain}>
              Block
            </button>
          </div>
        </div>

        {/* Global Limits Editor */}
        <div className="card">
          <div className="section-title">⚙️ Global Limits</div>
          <div className="limits-form">
            <div className="limits-row">
              <span className="limits-label">Max Global Concurrency</span>
              <input
                className="input limits-input"
                type="number"
                min={1}
                value={editLimits.max_global_concurrency}
                onChange={(e) => {
                  setEditLimits(prev => ({ ...prev, max_global_concurrency: parseInt(e.target.value) || 1 }));
                  setLimitsChanged(true);
                }}
              />
            </div>
            <div className="limits-row">
              <span className="limits-label">Max Per-Domain</span>
              <input
                className="input limits-input"
                type="number"
                min={1}
                value={editLimits.max_per_domain_concurrency}
                onChange={(e) => {
                  setEditLimits(prev => ({ ...prev, max_per_domain_concurrency: parseInt(e.target.value) || 1 }));
                  setLimitsChanged(true);
                }}
              />
            </div>
            <div className="limits-row">
              <span className="limits-label">Default Timeout (ms)</span>
              <input
                className="input limits-input"
                type="number"
                min={1000}
                step={1000}
                value={editLimits.default_timeout_ms}
                onChange={(e) => {
                  setEditLimits(prev => ({ ...prev, default_timeout_ms: parseInt(e.target.value) || 5000 }));
                  setLimitsChanged(true);
                }}
              />
            </div>
            {limitsChanged && (
              <div className="limits-actions">
                <button className="btn btn-primary btn-sm" onClick={handleSaveLimits}>
                  Save Limits
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card network-section-full">
        <div className="section-title">📋 Audit Log</div>

        <div className="audit-filters">
          <input
            className="input"
            type="text"
            placeholder="Filter by domain..."
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
          />
          <select
            className="select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="timeout">Timeout</option>
          </select>
        </div>

        {audit.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Domain</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Queue Wait</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 50).map((entry, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {entry.domain || new URL(entry.url || 'http://unknown').hostname}
                    </td>
                    <td>
                      <span className="badge badge-follower">{entry.method || 'GET'}</span>
                    </td>
                    <td>
                      <span className={`audit-status-badge ${
                        entry.status && entry.status < 400 ? 'success' :
                        entry.error?.includes('timeout') ? 'timeout' : 'error'
                      }`}>
                        {entry.status || (entry.error ? 'ERR' : '—')}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {entry.queueWait != null ? `${entry.queueWait}ms` : '—'}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {entry.duration != null ? `${entry.duration}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No audit log entries{filterDomain || filterStatus ? ' matching filters' : ''}</div>
        )}
      </div>
    </div>
  );
}
