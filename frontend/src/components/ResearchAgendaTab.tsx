import React, { Fragment, useState, useRef } from 'react'
import { renderMarkdown, extractSources } from './MarkdownUtils'
import type { MemoryNode } from '../types'
import { patchResearch, deleteResearch, shareToApi } from '../api'

export interface ResearchItem {
  id: string
  topic: string
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'paused'
  priority: 'low' | 'medium' | 'high' | 'critical'
  notes: string | null
  node_slug?: string | null
  research_phase?: string
  created_at: string
  updated_at: string
}

interface ResearchAgendaTabProps {
  researchItems: ResearchItem[]
  loading: boolean
  showResearchForm: boolean
  setShowResearchForm: (v: boolean) => void
  researchTopic: string
  setResearchTopic: (v: string) => void
  researchPriority: 'low' | 'medium' | 'high' | 'critical'
  setResearchPriority: (v: 'low' | 'medium' | 'high' | 'critical') => void
  researchNotes: string
  setResearchNotes: (v: string) => void
  researchSubmitting: boolean
  handleCreateResearch: (e: React.FormEvent) => void
  expandedResearchId: string | null
  handleToggleExpand: (item: ResearchItem) => void
  loadedDiscoveries: Record<string, MemoryNode | null>
  loadingNodeSlugs: Record<string, boolean>
  refreshResearch?: () => void
}

export default function ResearchAgendaTab(props: ResearchAgendaTabProps) {
  const {
    researchItems,
    loading,
    showResearchForm,
    setShowResearchForm,
    researchTopic,
    setResearchTopic,
    researchPriority,
    setResearchPriority,
    researchNotes,
    setResearchNotes,
    researchSubmitting,
    handleCreateResearch,
    expandedResearchId,
    handleToggleExpand,
    loadedDiscoveries,
    loadingNodeSlugs,
    refreshResearch,
  } = props

  const [steerTarget, setSteerTarget] = useState<string | null>(null)
  const steerRef = useRef<HTMLTextAreaElement>(null)
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})

  const handlePatch = async (id: string, updates: Record<string, unknown>) => {
    try {
      await patchResearch(id, updates)
      refreshResearch?.()
    } catch (err) {
      console.error('Failed to update research:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Cancel this research project?')) return
    try {
      await deleteResearch(id)
      refreshResearch?.()
    } catch (err) {
      console.error('Failed to delete research:', err)
    }
  }

  const handleSteerSubmit = async () => {
    if (!steerTarget || !steerRef.current) return
    const direction = steerRef.current.value.trim()
    if (!direction) return
    try {
      await patchResearch(steerTarget, { notes: direction })
      setSteerTarget(null)
      refreshResearch?.()
    } catch (err) {
      console.error('Failed to steer research:', err)
    }
  }


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Vector Research agenda</h3>
        <button 
          className="btn btn-sm btn-ghost" 
          onClick={() => setShowResearchForm(!showResearchForm)}
          style={{ borderColor: 'var(--border)' }}
        >
          {showResearchForm ? 'Cancel' : '+ Queue Research Topic'}
        </button>
      </div>

      {/* Collapsible Research Form */}
      {showResearchForm && (
        <form onSubmit={handleCreateResearch} style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              Research Query / Topic
              <input 
                type="text"
                required
                placeholder="e.g. Bun vs Node.js HTTP clustering performance benchmarks"
                value={researchTopic}
                onChange={e => setResearchTopic(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  outline: 'none'
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              Agenda Priority
              <select 
                value={researchPriority} 
                onChange={e => setResearchPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  outline: 'none'
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            Target Gaps / Reference Notes
            <textarea 
              placeholder="Identify specific APIs, libraries or cutoff dates..."
              value={researchNotes}
              onChange={e => setResearchNotes(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: 8,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                outline: 'none',
                minHeight: 80,
                resize: 'vertical'
              }}
            />
          </label>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={researchSubmitting || !researchTopic.trim()}
            style={{ alignSelf: 'flex-end', minWidth: 120 }}
          >
            {researchSubmitting ? 'Queueing...' : 'Add to Agenda'}
          </button>
        </form>
      )}

      {/* Research Agenda Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left', background: 'rgba(255, 255, 255, 0.02)' }}>
              <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}></th>
              <th style={{ padding: '12px 16px' }}>Research Topic</th>
              <th style={{ padding: '12px 16px', width: 100 }}>Priority</th>
              <th style={{ padding: '12px 16px', width: 120 }}>Status</th>
              <th style={{ padding: '12px 16px', width: 160 }}>Updated At</th>
            </tr>
          </thead>
          <tbody>
            {loading && researchItems.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading agenda...</td>
              </tr>
            ) : researchItems.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                  No active research topics queued.
                </td>
              </tr>
            ) : (
              researchItems.map(item => {
                const isExpanded = expandedResearchId === item.id;
                const node = item.node_slug ? loadedDiscoveries[item.node_slug] : null;
                const isNodeLoading = item.node_slug ? loadingNodeSlugs[item.node_slug] : false;

                return (
                  <Fragment key={item.id}>
                    <tr 
                      onClick={() => handleToggleExpand(item)}
                      style={{ 
                        borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <span style={{ 
                          display: 'inline-block',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: 10
                        }}>
                          ▶
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.topic}</div>
                        {item.notes && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {item.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${
                          item.priority === 'critical' ? 'badge-error' : 
                          item.priority === 'high' ? 'badge-accent' :
                          item.priority === 'medium' ? 'badge-warning' :
                          'badge-ghost'
                        }`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                          {item.priority}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${
                          (item.node_slug && (item.status === 'pending' || item.status === 'in_progress')) || item.status === 'done' ? 'badge-success' : 
                          item.status === 'in_progress' ? 'badge-accent' :
                          item.status === 'failed' ? 'badge-error' :
                          'badge-warning'
                        }`} style={{ textTransform: 'capitalize', fontSize: 11 }}>
                          {item.node_slug && (item.status === 'pending' || item.status === 'in_progress') ? 'Researched' : item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        {new Date(item.updated_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.015)' }}>
                        <td colSpan={5} style={{ padding: '0 24px 20px 24px' }}>
                          <div style={{
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: 12,
                            background: 'rgba(10, 10, 15, 0.4)',
                            padding: 20,
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 20px rgba(0, 0, 0, 0.3)',
                          }}>
                            <style dangerouslySetInnerHTML={{__html: `
                              @keyframes pulse {
                                0% { transform: scale(0.95); opacity: 0.5; }
                                50% { transform: scale(1.05); opacity: 1; }
                                100% { transform: scale(0.95); opacity: 0.5; }
                              }
                            `}} />

                            {/* Cognitive Stepper */}
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 12 }}>
                                Cognitive Research Engine Progress
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                                {[
                                  {
                                    title: 'Data Acquisition',
                                    phase: 'acquisition',
                                    icon: '🔍',
                                    desc: 'Deep multi-source crawling & LLM synthesis'
                                  },
                                  {
                                    title: 'Cognitive Deliberation',
                                    phase: 'deliberation',
                                    icon: '🧠',
                                    desc: 'System 2 context evaluation & insights'
                                  },
                                  {
                                    title: 'Clarity Auditing',
                                    phase: 'improvement',
                                    icon: '✨',
                                    desc: 'Markdown polish & premium layout restructuring'
                                  },
                                  {
                                    title: 'Source Monitoring',
                                    phase: 'monitoring',
                                    icon: '📡',
                                    desc: 'Ongoing newsletter, RSS & release tracking'
                                  },
                                  {
                                    title: 'Tangent Spawning',
                                    phase: 'expansion',
                                    icon: '🚀',
                                    desc: 'Autonomously brainstorming & enqueuing tangents'
                                  }
                                ].map((step, idx) => {
                                  const phases = ['acquisition', 'deliberation', 'improvement', 'monitoring', 'expansion']
                                  const activePhase = item.research_phase || 'acquisition'
                                  const activeIndex = phases.indexOf(activePhase)

                                  let state: 'completed' | 'active' | 'waiting' | 'failed' | 'upcoming' = 'upcoming'
                                  if (idx < activeIndex) {
                                    state = 'completed'
                                  } else if (idx === activeIndex) {
                                    if (item.status === 'in_progress') state = 'active'
                                    else if (item.status === 'pending') state = 'waiting'
                                    else if (item.status === 'failed') state = 'failed'
                                    else state = 'waiting'
                                  }

                                  let borderColor = 'rgba(255, 255, 255, 0.04)'
                                  let bgColor = 'rgba(255, 255, 255, 0.01)'
                                  let titleColor = 'var(--text-secondary)'
                                  let badgeBg = 'rgba(255, 255, 255, 0.02)'
                                  let statusText = 'Locked'
                                  let statusColor = 'var(--text-tertiary)'
                                  let isPulse = false

                                  if (state === 'completed') {
                                    borderColor = 'rgba(46, 204, 113, 0.25)'
                                    bgColor = 'rgba(46, 204, 113, 0.02)'
                                    titleColor = '#fff'
                                    badgeBg = 'rgba(46, 204, 113, 0.12)'
                                    statusText = '✓ Completed'
                                    statusColor = '#2ecc71'
                                  } else if (state === 'active') {
                                    borderColor = 'rgba(108, 92, 231, 0.45)'
                                    bgColor = 'rgba(108, 92, 231, 0.05)'
                                    titleColor = '#fff'
                                    badgeBg = 'rgba(108, 92, 231, 0.18)'
                                    statusText = '⚡ Running'
                                    statusColor = 'var(--accent)'
                                    isPulse = true
                                  } else if (state === 'waiting') {
                                    borderColor = 'rgba(241, 196, 15, 0.25)'
                                    bgColor = 'rgba(241, 196, 15, 0.02)'
                                    titleColor = 'var(--text-primary)'
                                    badgeBg = 'rgba(241, 196, 15, 0.1)'
                                    statusText = '⏳ Queued'
                                    statusColor = '#f1c40f'
                                  } else if (state === 'failed') {
                                    borderColor = 'rgba(231, 76, 60, 0.25)'
                                    bgColor = 'rgba(231, 76, 60, 0.02)'
                                    titleColor = 'var(--text-primary)'
                                    badgeBg = 'rgba(231, 76, 60, 0.1)'
                                    statusText = '⚠️ Failed'
                                    statusColor = '#e74c3c'
                                  }

                                  return (
                                    <div key={idx} style={{
                                      border: `1px solid ${borderColor}`,
                                      background: bgColor,
                                      borderRadius: 10,
                                      padding: 12,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 6,
                                      transition: 'all 0.3s ease',
                                      position: 'relative'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: 24,
                                          height: 24,
                                          borderRadius: '50%',
                                          background: badgeBg,
                                          fontSize: 12
                                        }}>
                                          {step.icon}
                                        </span>
                                        <span style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          color: statusColor,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}>
                                          {isPulse && (
                                            <span style={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: '50%',
                                              background: 'var(--accent)',
                                              animation: 'pulse 1.5s infinite ease-in-out'
                                            }} />
                                          )}
                                          {statusText}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: titleColor }}>
                                        {idx + 1}. {step.title}
                                      </div>
                                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
                                        {step.desc}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.06)', margin: '20px 0' }} />

                            {/* Lifecycle Control Buttons */}
                            <div style={{ display: 'flex', gap: '8px', padding: '0 0 16px', flexWrap: 'wrap' }}>
                              {item.status === 'in_progress' && (
                                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handlePatch(item.id, { status: 'paused' }) }}>⏸ Pause</button>
                              )}
                              {(item.status === 'paused' || item.status === 'failed') && (
                                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handlePatch(item.id, { status: 'pending' }) }}>▶️ Resume</button>
                              )}
                              {item.status === 'done' && (
                                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handlePatch(item.id, { status: 'pending', research_phase: 'acquisition' }) }}>🔄 Re-run</button>
                              )}
                              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setSteerTarget(item.id) }}>🎯 Steer</button>
                              {item.status !== 'done' && (
                                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handlePatch(item.id, { status: 'done' }) }}>✅ Conclude</button>
                              )}
                              <button className="btn btn-sm" style={{ borderColor: 'var(--error)', color: 'var(--error)' }} onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}>❌ Cancel</button>
                            </div>

                            {item.node_slug ? (
                              <>
                                {isNodeLoading ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                                    </svg>
                                    <span>Reading memory node and cataloging discoveries...</span>
                                  </div>
                                ) : node ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {item.status === 'in_progress' && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: 'rgba(108, 92, 231, 0.1)',
                                        border: '1px solid rgba(108, 92, 231, 0.2)',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        color: 'var(--accent)',
                                        marginBottom: 4
                                      }}>
                                        <span className="pulse" style={{ background: 'var(--accent)', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                                        <span>Fact-seeker agents are currently updating this topic in the background. Previous discoveries are displayed below.</span>
                                      </div>
                                    )}
                                    {item.status === 'pending' && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: 'rgba(241, 196, 15, 0.1)',
                                        border: '1px solid rgba(241, 196, 15, 0.2)',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        color: 'var(--warning)',
                                        marginBottom: 4
                                      }}>
                                        <span>⏳</span>
                                        <span>Scheduled for automatic refresh. Previous discoveries are displayed below.</span>
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: 12 }}>
                                      <div>
                                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>{node.title}</h4>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                                          <span className="badge badge-accent" style={{ fontSize: 10, padding: '2px 8px' }}>{node.category}</span>
                                          {node.modality && <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>{node.modality}</span>}
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                        {node.importance !== undefined && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.03)', padding: '4px 8px', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span>⭐ Importance:</span>
                                            <span style={{ fontWeight: 600, color: '#fff' }}>{node.importance}/5</span>
                                          </div>
                                        )}
                                        {node.confidence !== undefined && (
                                          <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: node.confidence >= 0.9 ? 'rgba(0, 206, 201, 0.08)' : 'rgba(108, 92, 231, 0.08)',
                                            border: `1px solid ${node.confidence >= 0.9 ? 'rgba(0, 206, 201, 0.3)' : 'rgba(108, 92, 231, 0.3)'}`,
                                            borderRadius: 6,
                                            padding: '4px 8px',
                                            fontSize: 11,
                                            color: node.confidence >= 0.9 ? 'var(--success)' : 'var(--accent)'
                                          }}>
                                            <span>✓ Confidence:</span>
                                            <span style={{ fontWeight: 600 }}>{(node.confidence * 100).toFixed(0)}%</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                      <div style={{
                                        maxHeight: expandedReports[item.id] ? 'none' : 500,
                                        overflow: 'hidden',
                                        paddingRight: 8,
                                        transition: 'max-height 0.3s ease',
                                      }}>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                          {renderMarkdown(node.content || node.body || '')}
                                        </div>
                                      </div>
                                      {!expandedReports[item.id] && (node.content || node.body || '').length > 800 && (
                                        <div style={{
                                          position: 'absolute',
                                          bottom: 0,
                                          left: 0,
                                          right: 0,
                                          height: 80,
                                          background: 'linear-gradient(transparent, rgba(10, 10, 15, 0.95))',
                                          pointerEvents: 'none',
                                        }} />
                                      )}
                                    </div>
                                    {(node.content || node.body || '').length > 800 && (
                                      <button
                                        className="btn btn-sm btn-ghost"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setExpandedReports(prev => ({ ...prev, [item.id]: !prev[item.id] }))
                                        }}
                                        style={{ alignSelf: 'flex-start', marginTop: 8, fontSize: 12, color: 'var(--accent)' }}
                                      >
                                        {expandedReports[item.id] ? '▲ Show less' : '▼ Show more'}
                                      </button>
                                    )}

                                    {extractSources(node.content || node.body).length > 0 && (
                                      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 12 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 8 }}>Sources & Citations</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                          {extractSources(node.content || node.body).map((src, idx) => {
                                            const domain = (() => { try { return new URL(src.url).hostname.replace(/^www\./, '') } catch { return src.url } })()
                                            return (
                                              <div
                                                key={idx}
                                                style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 10,
                                                  background: 'rgba(108, 92, 231, 0.06)',
                                                  border: '1px solid rgba(108, 92, 231, 0.2)',
                                                  borderRadius: 10,
                                                  padding: '8px 14px',
                                                  fontSize: 12,
                                                  transition: 'all 0.2s',
                                                }}
                                              >
                                                <img
                                                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                                                  width={16}
                                                  height={16}
                                                  alt=""
                                                  style={{ borderRadius: 2, flexShrink: 0 }}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.text}</span>
                                                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{domain}</span>
                                                </div>
                                                <a
                                                  href={src.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="btn btn-sm"
                                                  style={{ fontSize: 11, padding: '3px 10px', textDecoration: 'none', flexShrink: 0 }}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  Open
                                                </a>
                                                <button
                                                  className="btn btn-sm"
                                                  style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    shareToApi({ url: src.url, action: 'research', title: src.text }).catch(console.error)
                                                  }}
                                                >
                                                  🔬 Research deeper
                                                </button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                                    No memory synthesis node found for slug: <code>{item.node_slug}</code>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {item.status === 'pending' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)', fontWeight: 600, fontSize: 14 }}>
                                      <span>⏳</span> Queued for Ingestion
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                                      This research topic is enqueued in the Cognitive Scheduler. The background fact-seeker daemon will systematically synthesize findings and catalog discoveries when processing background gaps.
                                    </p>
                                  </div>
                                )}
                                
                                {item.status === 'in_progress' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>
                                      <span className="pulse" style={{ background: 'var(--accent)' }} />
                                      Synthesizing Deep Discoveries...
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                                      Fact-seeker agents are actively searching vector indexes, crawling target APIs, and structuring new domain schemas. Results will be verified by the System 2 consensus writer.
                                    </p>
                                  </div>
                                )}

                                {item.status === 'failed' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)', fontWeight: 600, fontSize: 14 }}>
                                      <span>⚠️</span> Ingestion Boundary Encountered
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                                      The research pipeline failed to produce high-confidence consensus conclusions or hit an instruction boundary. Check live cognitive console logs for execution specifics.
                                    </p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Steer Modal Overlay */}
      {steerTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary, #1e1e2e)', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 12px' }}>🎯 Steer Research</h3>
            <textarea
              ref={steerRef}
              placeholder="Add direction... e.g. 'Focus more on pricing comparisons'"
              style={{ width: '100%', minHeight: '100px', borderRadius: '8px', padding: '12px', background: 'var(--bg-primary, #11111b)', color: 'inherit', border: '1px solid var(--border, #333)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setSteerTarget(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSteerSubmit}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
