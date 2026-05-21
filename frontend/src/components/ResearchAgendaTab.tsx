import React, { Fragment } from 'react'
import { renderMarkdown, extractSources } from './MarkdownUtils'

export interface ResearchItem {
  id: string
  topic: string
  status: 'pending' | 'in_progress' | 'done' | 'failed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  notes: string | null
  node_slug?: string | null
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
  loadedDiscoveries: Record<string, any>
  loadingNodeSlugs: Record<string, boolean>
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
  } = props

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
                onChange={e => setResearchPriority(e.target.value as any)}
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
                          item.status === 'done' ? 'badge-success' : 
                          item.status === 'in_progress' ? 'badge-accent' :
                          item.status === 'failed' ? 'badge-error' :
                          'badge-warning'
                        }`} style={{ textTransform: 'capitalize', fontSize: 11 }}>
                          {item.status.replace('_', ' ')}
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

                            {item.status === 'done' && (
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

                                    <div style={{ maxHeight: 350, overflowY: 'auto', paddingRight: 8 }}>
                                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {renderMarkdown(node.content || node.body || '')}
                                      </div>
                                    </div>

                                    {extractSources(node.content || node.body).length > 0 && (
                                      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 12 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 8 }}>Sources & Citations</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                          {extractSources(node.content || node.body).map((src, idx) => (
                                            <a 
                                              key={idx} 
                                              href={src.url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                background: 'rgba(108, 92, 231, 0.08)',
                                                border: '1px solid rgba(108, 92, 231, 0.25)',
                                                borderRadius: 20,
                                                padding: '4px 12px',
                                                fontSize: 12,
                                                color: 'var(--accent)',
                                                transition: 'all 0.2s',
                                                cursor: 'pointer'
                                              }}
                                              onMouseOver={e => {
                                                e.currentTarget.style.background = 'rgba(108, 92, 231, 0.15)'
                                                e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.4)'
                                              }}
                                              onMouseOut={e => {
                                                e.currentTarget.style.background = 'rgba(108, 92, 231, 0.08)'
                                                e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.25)'
                                              }}
                                            >
                                              <span>🔗</span>
                                              <span style={{ fontWeight: 500 }}>{src.text}</span>
                                            </a>
                                          ))}
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
    </div>
  )
}
