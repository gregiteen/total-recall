import { useEffect, useState } from 'react';
import { networkApi } from '../api/network';
import type { NetworkStats, NetworkPolicy, AuditLogEntry } from '../api/network';
import './NetworkPage.css';

export default function NetworkPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [policy, setPolicy] = useState<NetworkPolicy | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [blockInput, setBlockInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const statsRes = await networkApi.getStats();
      setStats(statsRes.stats);
      
      const policyRes = await networkApi.getPolicy();
      setPolicy(policyRes);
      
      const auditRes = await networkApi.getAuditLog();
      setAudit(auditRes.audit);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleBlockDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockInput.trim()) return;
    try {
      await networkApi.blockDomain(blockInput.trim());
      setBlockInput('');
      setSuccess('Domain blocked successfully');
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnblockDomain = async (domain: string) => {
    try {
      await networkApi.unblockDomain(domain);
      setSuccess('Domain unblocked successfully');
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!stats || !policy) return <div className="p-xl text-muted">Loading network settings...</div>;

  return (
    <div className="network-page p-xl fade-in max-w-4xl mx-auto">
      <header className="mb-xl flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-xs">Network Firewall & Dashboard</h1>
          <p className="text-muted">Manage network boundaries, rate limits, and view real-time traffic.</p>
        </div>
      </header>
      
      {error && <div className="alert alert-error mb-lg">{error}</div>}
      {success && <div className="bg-[var(--success)] text-white p-3 rounded mb-lg">{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
        <div className="card stat-card">
          <div className="stat-label">In-Flight Connections</div>
          <div className="stat-value">{stats.active} / {policy.max_global_concurrency || 20}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Queue Depth</div>
          <div className="stat-value">{stats.queueLength || 0}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Errors & Timeouts</div>
          <div className="stat-value text-[var(--danger)]">{stats.errors + stats.timeouts}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mb-xl">
        {/* Blocked Domains */}
        <div className="card p-lg">
          <h2 className="text-lg font-semibold mb-md border-b pb-sm border-[var(--border)]">Firewall Blocklist</h2>
          <form onSubmit={handleBlockDomain} className="flex gap-sm mb-md">
            <input 
              type="text" 
              value={blockInput} 
              onChange={e => setBlockInput(e.target.value)} 
              placeholder="e.g. tracking.com" 
              className="input flex-1"
            />
            <button type="submit" className="btn btn-primary">Block</button>
          </form>
          
          <ul className="list-none m-0 p-0">
            {policy?.blocked_domains?.map((domain: string) => (
              <li key={domain} className="flex justify-between items-center py-xs px-sm hover:bg-[var(--surface-hover)] rounded border border-transparent hover:border-[var(--border)] group transition-colors">
                <span className="font-mono text-sm text-[var(--danger)]">{domain}</span>
                <button 
                  className="btn btn-ghost btn-sm text-muted opacity-0 group-hover:opacity-100 transition-opacity" 
                  onClick={() => handleUnblockDomain(domain)}
                  title="Remove block"
                >
                  &times;
                </button>
              </li>
            ))}
            {(!policy?.blocked_domains || policy.blocked_domains.length === 0) && (
              <li className="text-muted text-sm italic p-sm text-center border border-dashed border-[var(--border)] rounded">No domains blocked.</li>
            )}
          </ul>
        </div>

        {/* Global Settings (from Phase 5E placeholder) */}
        <div className="card p-lg">
          <h2 className="text-lg font-semibold mb-md border-b pb-sm border-[var(--border)]">Global Limits</h2>
          <div className="flex flex-col gap-md">
            <div>
              <label className="text-sm font-semibold mb-1 block">Max Global Concurrency</label>
              <div className="text-xl">{policy.max_global_concurrency || 20}</div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">Max Per-Domain Concurrency</label>
              <div className="text-xl">{policy.max_per_domain_concurrency || 5}</div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">Default Timeout (ms)</label>
              <div className="text-xl">{policy.default_timeout_ms || 30000}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-lg mb-xl">
        <h2 className="text-lg font-semibold mb-md border-b pb-sm border-[var(--border)]">Recent Audit Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-muted">
                <th className="py-2 px-3 font-medium">Timestamp</th>
                <th className="py-2 px-3 font-medium">Domain</th>
                <th className="py-2 px-3 font-medium">Method</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Wait / Duration</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 15).map((log, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="py-2 px-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                  <td className="py-2 px-3 font-mono">{log.domain || (log.url ? new URL(log.url).hostname : '')}</td>
                  <td className="py-2 px-3">{log.method || 'GET'}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${log.status >= 400 || log.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {log.error || log.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">{log.queueWait || 0}ms / {log.duration}ms</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted italic">No recent network activity.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
