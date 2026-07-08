import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import type { UsageData } from '../types';

interface UsageChartProps {
  usageData: UsageData | null;
  geminiModels: unknown[];
  claudeModels: unknown[];
  openaiModels: unknown[];
}

export const UsageChart: React.FC<UsageChartProps> = ({ usageData }) => {
  if (!usageData || !usageData.timeseries) return null;

  // Transform timeseries into chart data
  const data = Object.keys(usageData.timeseries).sort().map(dateStr => {
    const dayData = usageData.timeseries![dateStr];
    
    let totalUsd = 0;
    const providersCost: Record<string, number> = { gemini: 0, claude: 0, codex: 0, openrouter: 0 };
    
    Object.keys(dayData).forEach(model => {
      const { cost, provider } = dayData[model];
      
      // Safety fallback to ensure numbers
      const finalCost = typeof cost === 'number' && !isNaN(cost) ? cost : 0;

      totalUsd += finalCost;
      if (providersCost[provider] !== undefined) {
        providersCost[provider] += finalCost;
      } else if (provider) {
        providersCost[provider] = finalCost;
      }
    });

    return {
      date: dateStr.split('-').slice(1).join('/'), // MM/DD
      gemini: parseFloat(providersCost.gemini.toFixed(4)),
      claude: parseFloat(providersCost.claude.toFixed(4)),
      codex: parseFloat(providersCost.codex.toFixed(4)),
      openrouter: parseFloat((providersCost.openrouter || 0).toFixed(4)),
      total: parseFloat(totalUsd.toFixed(4))
    };
  });

  if (data.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <span style={{ fontSize: 20 }}>📊</span>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>API Costs Over Time</h3>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Historical cost breakdown by provider (USD)</p>
        </div>
      </div>
      <div style={{ width: '100%', height: 250, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-tertiary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip 
              contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ fontSize: 12 }}
              formatter={(value: any) => [`$${Number(value).toFixed(4)}`, undefined]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="gemini" name="Gemini" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
            <Bar isAnimationActive={false} dataKey="claude" name="Claude" stackId="a" fill="#d97757" radius={[0,0,0,0]} />
            <Bar isAnimationActive={false} dataKey="codex" name="OpenAI" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
            <Bar isAnimationActive={false} dataKey="openrouter" name="OpenRouter" stackId="a" fill="#8b5cf6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
