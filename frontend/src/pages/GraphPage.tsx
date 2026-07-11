import { useState, useEffect } from 'react'
import { listMemory, listResearch, fetchChatThreads } from '../api'
import type { MemoryNode, ResearchItem } from '../types'
import type { ChatThread } from '../api'
import Graph3D from '../components/Graph3D'

export default function GraphPage({ activeBrainId }: { activeBrainId?: string }) {
  const [memoryNodes, setMemoryNodes] = useState<MemoryNode[]>([])
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([])
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroundingNodes, setSelectedGroundingNodes] = useState<string[]>([])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [nodes, researchRes, threadsRes] = await Promise.all([
          listMemory(activeBrainId),
          listResearch().catch(() => ({ items: [] })),
          fetchChatThreads().catch(() => [])
        ])
        setMemoryNodes(nodes)
        setResearchItems(researchRes.items || [])
        setThreads(threadsRes)
      } catch (err) {
        console.error('Failed to load graph data', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [activeBrainId])

  return (
    <div className="page" style={{ padding: 0, height: 'calc(100vh - 1px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', background: 'rgba(18, 18, 26, 0.45)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>Memory Graph</h1>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          3D vault map — facts (blue), rules (cyan/rose), research (amber), sessions (teal).
        </p>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: '100%' }} />
        ) : (
          <Graph3D
            threads={threads}
            memoryNodes={memoryNodes}
            researchItems={researchItems}
            onOpenThread={() => {}}
            onGroundMemoryNode={(slug) => {
              setSelectedGroundingNodes(prev =>
                prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
              )
            }}
            selectedGroundingNodes={selectedGroundingNodes}
          />
        )}
      </div>
    </div>
  )
}
