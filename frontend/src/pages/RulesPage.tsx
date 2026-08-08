import { useState, useEffect } from 'react';
import { getApiBase, apiFetch } from '../api';

interface RuleNode {
  slug: string;
  category: string;
  title: string;
  status: string;
  importance: number;
  body: string;
  scope: 'global' | 'project';
}

export default function RulesPage({ activeBrainId }: { activeBrainId: string }) {
  const [rules, setRules] = useState<RuleNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, [activeBrainId]);

  async function fetchRules() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(getApiBase() + '/api/rules');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch rules');
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (rule: RuleNode) => {
    if (!window.confirm(`Are you sure you want to archive this rule?\n\n"${rule.title}"`)) {
      return;
    }
    try {
      await apiFetch(getApiBase() + `/api/memory/${rule.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
        headers: { 'Content-Type': 'application/json' },
      });
      fetchRules();
    } catch {
      alert('Failed to archive rule');
    }
  };

  const handleRestore = async (rule: RuleNode) => {
    try {
      await apiFetch(getApiBase() + `/api/memory/${rule.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
        headers: { 'Content-Type': 'application/json' },
      });
      fetchRules();
    } catch {
      alert('Failed to restore rule');
    }
  };

  const invariants = rules.filter((r) => r.category === 'invariants');
  const preferences = rules.filter((r) => r.category === 'preferences');
  const corrections = rules.filter((r) => r.category === 'anti-patterns');

  const renderRuleCard = (rule: RuleNode, colorCode: string) => {
    const isArchived = rule.status === 'archived';
    const stars = Math.min(5, Math.max(0, Number(rule.importance) || 0));
    return (
      <div
        key={`${rule.scope}:${rule.slug}`}
        data-testid="rule-card"
        style={{
          border: `1px solid ${isArchived ? 'var(--border)' : colorCode}`,
          opacity: isArchived ? 0.6 : 1,
          borderRadius: 8,
          padding: 16,
          marginBottom: 12,
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{rule.title}</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>
              {rule.scope} brain
            </span>
            <span style={{ fontSize: 12, color: 'gold' }} aria-label={`Importance ${stars} of 5`}>
              {'★'.repeat(stars) + '☆'.repeat(5 - stars)}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
          {rule.body || '(no body)'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          {isArchived ? (
            <button
              onClick={() => handleRestore(rule)}
              style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--bg-primary)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-primary)' }}
            >
              Restore
            </button>
          ) : (
            <button
              onClick={() => handleArchive(rule)}
              style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--bg-primary)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-primary)' }}
            >
              Archive
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: 20 }} data-testid="rules-loading">Loading rules...</div>;
  }

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: '0 auto', height: '100%', overflowY: 'auto' }} data-testid="rules-page">
      <header style={{ marginBottom: 40 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: 28, color: 'var(--text-primary)' }}>Agent Rules</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 16 }}>
          Manage invariants, preferences, and corrections across your active brains.
        </p>
      </header>

      {error && (
        <div
          data-testid="rules-error"
          role="alert"
          style={{
            marginBottom: 24,
            padding: 12,
            borderRadius: 8,
            border: '1px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
          }}
        >
          Failed to load rules: {error}
          <button
            type="button"
            onClick={() => fetchRules()}
            style={{ marginLeft: 12, padding: '2px 8px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#ef4444' }}>Invariants</h2>
          <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 'bold' }}>
            {invariants.length}
          </span>
        </div>
        {invariants.map((r) => renderRuleCard(r, 'rgba(239, 68, 68, 0.3)'))}
        {invariants.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>No invariants found.</p>}
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#3b82f6' }}>Preferences</h2>
          <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 'bold' }}>
            {preferences.length}
          </span>
        </div>
        {preferences.map((r) => renderRuleCard(r, 'rgba(59, 130, 246, 0.3)'))}
        {preferences.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>No preferences found.</p>}
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#f59e0b' }}>Corrections</h2>
          <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 'bold' }}>
            {corrections.length}
          </span>
        </div>
        {corrections.map((r) => renderRuleCard(r, 'rgba(245, 158, 11, 0.3)'))}
        {corrections.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>No corrections found.</p>}
      </section>
    </div>
  );
}
