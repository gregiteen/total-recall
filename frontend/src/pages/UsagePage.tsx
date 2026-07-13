import { useState, useEffect, useMemo } from 'react';
import { fetchUsageStats, fetchConfigJson } from '../api';
import type { ConfigJson, UsageData } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

   
  const timeseriesData = useMemo(() => {
    if ((usage as unknown as Record<string, unknown>)?.timeseries && Object.keys((usage as unknown as Record<string, unknown>).timeseries as Record<string, unknown>).length > 0) {
      const ts = (usage as unknown as Record<string, unknown>).timeseries as Record<string, Record<string, { provider: string; cost: number }>>;
      return Object.entries(ts).map(([date, models]) => {
        const entry: Record<string, unknown> = { date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
        let geminiCost = 0, claudeCost = 0, openrouterCost = 0, codexCost = 0;
        for (const [, info] of Object.entries(models)) {
          const m = info as { provider: string; cost: number };
          if (m.provider === 'gemini') geminiCost += m.cost;
          else if (m.provider === 'claude') claudeCost += m.cost;
          else if (m.provider === 'openrouter') openrouterCost += m.cost;
          else codexCost += m.cost;
        }
        entry.gemini = +geminiCost.toFixed(3);
        entry.claude = +claudeCost.toFixed(3);
        entry.openrouter = +openrouterCost.toFixed(3);
        entry.codex = +codexCost.toFixed(3);
        return entry;
      });
    }
    return [];
  }, [usage]);

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

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Token & Budget Statistics</h1>
        <p>Monitor your token cost expenditure in real time against safety budget limits</p>
      </div>

      {/* Subscription Tier Banner */}
      <div style={{
        padding: '16px 20px',
        marginBottom: 24,
        background: 'rgba(18, 18, 26, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <span style={{ fontSize: 24 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>
            Local-first · Self-hosted
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Memory and processing stay on your machine. No vendor lock-in.
          </div>
        </div>
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
                ${usage?.dailyUsd?.toFixed(4) ?? '0.0000'}
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
                ${usage?.weeklyUsd?.toFixed(4) ?? '0.0000'}
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
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Gemini CLI</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>~/.gemini/tmp</span>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                Google API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.gemini?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.gemini?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.gemini?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Claude */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🍊</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Claude Code CLI</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>~/.claude</span>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(239, 107, 107, 0.1)', color: '#f87171', border: '1px solid rgba(239, 107, 107, 0.2)' }}>
                Anthropic API
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.claude?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.claude?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.claude?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Codex */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>💻</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Codex CLI</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>~/.codex/sessions</span>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                OpenAI API
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.codex?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.codex?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.codex?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>
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
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.openrouter?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.openrouter?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.openrouter?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Tavily */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔎</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Tavily Search</span>
              </div>
              <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                Web API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.tavily?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.tavily?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.tavily?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Brave */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🦁</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Brave Search</span>
              </div>
              <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                Web API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.brave?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.brave?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.brave?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Exa */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Exa Search</span>
              </div>
              <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                Web API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.exa?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.exa?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.exa?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

          {/* Serper */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔍</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Serper Search</span>
              </div>
              <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                Web API
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.serper?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Weekly Spend:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>${usage?.breakdown?.serper?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Rolling Tokens:</span>
                <span>{usage?.breakdown?.serper?.dailyTokens?.toLocaleString() || 0} (24h)</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Timeseries Cost Chart ── */}
      <div className="card" style={{ padding: 24, marginTop: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 20 }}>
          30-Day Cost Trend
        </h3>
        {timeseriesData.length === 0 ? (
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            No usage data available for the last 30 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeseriesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradGemini" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradClaude" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e17055" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#e17055" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOpenRouter" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#74b9ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#74b9ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCodex" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00cec9" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00cec9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#e8e8e8' }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value: number | string, name: string) => [`$${Number(value).toFixed(3)}`, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Area type="monotone" dataKey="gemini" stackId="1" stroke="#3b82f6" fill="url(#gradGemini)" strokeWidth={2} />
                <Area type="monotone" dataKey="claude" stackId="1" stroke="#e17055" fill="url(#gradClaude)" strokeWidth={2} />
                <Area type="monotone" dataKey="openrouter" stackId="1" stroke="#74b9ff" fill="url(#gradOpenRouter)" strokeWidth={2} />
                <Area type="monotone" dataKey="codex" stackId="1" stroke="#00cec9" fill="url(#gradCodex)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
        )}
      </div>

      {/* ── Provider Surface Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 24 }}>
        {([
          { name: 'Gemini', color: '#3b82f6', emoji: '♊', key: 'gemini' as const },
          { name: 'Claude', color: '#e17055', emoji: '🍊', key: 'claude' as const },
          { name: 'OpenRouter', color: '#74b9ff', emoji: '🌐', key: 'openrouter' as const },
          { name: 'Codex', color: '#00cec9', emoji: '💻', key: 'codex' as const },
          { name: 'Tavily', color: '#eab308', emoji: '🔎', key: 'tavily' as const },
          { name: 'Brave', color: '#eab308', emoji: '🦁', key: 'brave' as const },
          { name: 'Exa', color: '#eab308', emoji: '✨', key: 'exa' as const },
          { name: 'Serper', color: '#eab308', emoji: '🔍', key: 'serper' as const },
        ] as const).map((provider) => {
          const data = usage?.breakdown?.[provider.key as keyof typeof usage.breakdown];
          return (
            <div key={provider.key} style={{
              background: 'rgba(18, 18, 26, 0.6)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border)',
              borderTop: `4px solid ${provider.color}`,
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${provider.color}22`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{provider.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{provider.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Daily</span>
                  <span style={{ fontWeight: 600, color: provider.color }}>${data?.dailyUsd?.toFixed(4) ?? '0.0000'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Weekly</span>
                  <span style={{ fontWeight: 600, color: provider.color }}>${data?.weeklyUsd?.toFixed(4) ?? '0.0000'}</span>
                </div>
                {data?.dailyTokens != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span>Tokens (24h)</span>
                    <span>{data.dailyTokens.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Per-Model Token Breakdown Table ── */}
      <div className="card" style={{ padding: 24, marginTop: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16 }}>
          Per-Model Breakdown
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Provider', 'Daily ($)', 'Weekly ($)', 'Daily Tokens', 'Weekly Tokens'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { name: 'Gemini', key: 'gemini' as const, color: '#3b82f6' },
                { name: 'Claude', key: 'claude' as const, color: '#e17055' },
                { name: 'Codex', key: 'codex' as const, color: '#00cec9' },
                { name: 'OpenRouter', key: 'openrouter' as const, color: '#74b9ff' },
              ] as const).map((row, idx) => {
                const d = row.key === 'openrouter' ? usage?.breakdown?.openrouter : usage?.breakdown?.[row.key];
                return (
                  <tr key={row.key} style={{ background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: row.color }}>{row.name}</td>
                    <td style={{ padding: '10px 12px', color: '#fff' }}>${d?.dailyUsd?.toFixed(4) ?? '0.0000'}</td>
                    <td style={{ padding: '10px 12px', color: '#fff' }}>${d?.weeklyUsd?.toFixed(4) ?? '0.0000'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d?.dailyTokens?.toLocaleString() || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d?.weeklyTokens?.toLocaleString() || '—'}</td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(108, 92, 231, 0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>Total</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>
                  ${(
                    (usage?.breakdown?.gemini?.dailyUsd || 0) +
                    (usage?.breakdown?.claude?.dailyUsd || 0) +
                    (usage?.breakdown?.codex?.dailyUsd || 0) +
                    (usage?.breakdown?.openrouter?.dailyUsd || 0)
                  ).toFixed(4)}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>
                  ${(
                    (usage?.breakdown?.gemini?.weeklyUsd || 0) +
                    (usage?.breakdown?.claude?.weeklyUsd || 0) +
                    (usage?.breakdown?.codex?.weeklyUsd || 0) +
                    (usage?.breakdown?.openrouter?.weeklyUsd || 0)
                  ).toFixed(4)}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {(
                    (usage?.breakdown?.gemini?.dailyTokens || 0) +
                    (usage?.breakdown?.claude?.dailyTokens || 0) +
                    (usage?.breakdown?.codex?.dailyTokens || 0) +
                    (usage?.breakdown?.openrouter?.dailyTokens || 0)
                  ).toLocaleString()}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {(
                    (usage?.breakdown?.gemini?.weeklyTokens || 0) +
                    (usage?.breakdown?.claude?.weeklyTokens || 0) +
                    (usage?.breakdown?.codex?.weeklyTokens || 0) +
                    (usage?.breakdown?.openrouter?.weeklyTokens || 0)
                  ).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
