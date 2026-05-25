import { useState, useEffect } from 'react';
import { fetchUsageStats, fetchConfigJson } from '../api';
import type { ConfigJson } from '../types';

interface UsageBreakdown {
  dailyUsd: number;
  weeklyUsd: number;
  dailyTokens?: number;
  weeklyTokens?: number;
}

interface UsageData {
  timestamp: string;
  dailyUsd: number;
  weeklyUsd: number;
  breakdown: {
    gemini: UsageBreakdown;
    claude: UsageBreakdown;
    codex: UsageBreakdown;
  };
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [config, setConfig] = useState<ConfigJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageAndConfig = async () => {
    try {
      const stats = await fetchUsageStats();
      setUsage(stats);
      
      const configData = await fetchConfigJson();
      setConfig(configData);
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to sync budget consumption stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate statistics sync on mount
    void fetchUsageAndConfig();
    const interval = setInterval(fetchUsageAndConfig, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <div style={{ color: 'var(--text-secondary)' }}>Aggregating token expenditures...</div>
      </div>
    );
  }

  const dailyCap = config?.budget?.budget?.daily_cap_usd ?? 5.0;
  const weeklyCap = config?.budget?.budget?.weekly_cap_usd ?? 25.0;
  const budgetEnabled = config?.budget?.budget?.enabled !== false;

  const dailyPercent = Math.min(100, ((usage?.dailyUsd || 0) / dailyCap) * 100);
  const weeklyPercent = Math.min(100, ((usage?.weeklyUsd || 0) / weeklyCap) * 100);

  const getProgressColor = (percent: number) => {
    if (percent > 85) return 'var(--error)';
    if (percent > 60) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Token & Budget Statistics</h1>
        <p>Monitor your token cost expenditure in real time against safety budget limits</p>
      </div>

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Overview dollar cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 24 }}>
        
        {/* Daily Cap progress card */}
        <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily Expenditure</h3>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                ${usage?.dailyUsd.toFixed(4) || '0.0000'}
              </div>
            </div>
            <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 11 }}>
              Cap: ${dailyCap.toFixed(2)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>Consumption Ratio</span>
              <span>{dailyPercent.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${dailyPercent}%`,
                background: getProgressColor(dailyPercent),
                boxShadow: `0 0 8px ${getProgressColor(dailyPercent)}`,
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
            Status: {budgetEnabled ? '🛡️ Budget supervision active' : '⚠️ Limits unmonitored (disabled)'}
          </div>
        </div>

        {/* Weekly Cap progress card */}
        <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Weekly Expenditure</h3>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                ${usage?.weeklyUsd.toFixed(4) || '0.0000'}
              </div>
            </div>
            <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 11 }}>
              Cap: ${weeklyCap.toFixed(2)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>Consumption Ratio</span>
              <span>{weeklyPercent.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${weeklyPercent}%`,
                background: getProgressColor(weeklyPercent),
                boxShadow: `0 0 8px ${getProgressColor(weeklyPercent)}`,
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
            Rolling window: Last 7 days in local system time
          </div>
        </div>

      </div>

      {/* Per Model breakdown list */}
      <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16 }}>
          Model Engine Spend breakdown
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          
          {/* Gemini */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>♊</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Gemini</span>
              </div>
              <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                Google API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.gemini.dailyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.gemini.weeklyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown.gemini.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Claude */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🍊</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Claude</span>
              </div>
              <span className="badge" style={{ background: 'rgba(239, 107, 107, 0.1)', color: '#f87171', border: '1px solid rgba(239, 107, 107, 0.2)' }}>
                Anthropic API
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.claude.dailyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.claude.weeklyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>(Ingested stats-cache)</span>
              </div>
            </div>
          </div>

          {/* Codex */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>💻</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Codex</span>
              </div>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                OpenAI API
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.codex.dailyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown.codex.weeklyUsd.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown.codex.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
