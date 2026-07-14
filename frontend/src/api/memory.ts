// ─── Memory domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'
import type { MemoryNode, Conflict } from './_base'

export async function listMemory(brainId?: string, category?: string, status?: string): Promise<MemoryNode[]> {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  
  if (!brainId) {
    const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
    if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : (data.nodes || [])
  }
  
  const ids = brainId.split(',')
  const fetchPromises = ids.map(async (id) => {
    const url = id === 'global'
      ? `${API_BASE}/api/memory?${params}`
      : `${API_BASE}/api/brains/${id}/nodes?${params}`
    try {
      const res = await apiFetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.nodes || [])
    } catch {
      return []
    }
  })
  
  const results = await Promise.all(fetchPromises)
  const merged: MemoryNode[] = []
  const seenSlugs = new Set<string>()
  
  // Project brains override Global brain nodes on slug collisions
  const sortedResults = results.map((nodes, index) => ({ nodes, id: ids[index] }))
    .sort((a, b) => {
      if (a.id === 'global') return 1
      if (b.id === 'global') return -1
      return 0
    })
    
  for (const { nodes } of sortedResults) {
    for (const node of nodes) {
      if (!seenSlugs.has(node.slug)) {
        seenSlugs.add(node.slug)
        merged.push(node)
      }
    }
  }
  
  return merged
}

export async function searchMemory(query: string, category?: string): Promise<MemoryNode[]> {
  const params = new URLSearchParams({ q: query })
  if (category) params.set('category', category)
  const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
  if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.nodes || [])
}

export async function readMemory(slug: string, brainId?: string): Promise<MemoryNode | null> {
  const params = new URLSearchParams()
  if (brainId) params.set('brain', brainId)
  const qs = params.toString()
  const res = await apiFetch(`${API_BASE}/api/memory/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
  return res.json()
}

export async function saveMemory(slug: string, node: Partial<MemoryNode>, brainId?: string): Promise<MemoryNode> {
  const params = new URLSearchParams()
  if (brainId) params.set('brain', brainId)
  const qs = params.toString()
  const res = await apiFetch(`${API_BASE}/api/memory/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(node),
  })
  if (!res.ok) throw new Error(`Failed to save memory: ${res.status}`)
  return res.json()
}

export async function createMemory(node: Partial<MemoryNode> & { slug: string }, brainId?: string): Promise<MemoryNode> {
  const params = new URLSearchParams()
  if (brainId) params.set('brain', brainId)
  const qs = params.toString()
  const res = await apiFetch(`${API_BASE}/api/memory${qs ? `?${qs}` : ''}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(node),
  })
  if (!res.ok) throw new Error(`Failed to create memory: ${res.status}`)
  return res.json()
}

export async function deleteMemory(slug: string, brainId?: string): Promise<void> {
  const params = new URLSearchParams()
  if (brainId) params.set('brain', brainId)
  const qs = params.toString()
  const res = await apiFetch(`${API_BASE}/api/memory/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`)
}

export async function fetchMemoryStats(): Promise<{ total: number; byCategory: Record<string, number>; byPriority: Record<string, number>; byStatus: Record<string, number> }> {
  const res = await apiFetch(`${API_BASE}/api/memory/stats`)
  if (!res.ok) throw new Error(`Memory stats error: ${res.status}`)
  return res.json()
}

export async function fetchGraph(): Promise<{ nodes: MemoryNode[]; routes: unknown[] }> {
  const res = await apiFetch(`${API_BASE}/api/graph`)
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`)
  return res.json()
}

export async function fetchConflicts(): Promise<{ conflicts: Conflict[] }> {
  const res = await apiFetch(`${API_BASE}/api/conflicts`)
  if (!res.ok) throw new Error(`Conflicts API error: ${res.status}`)
  return res.json()
}

export async function resolveConflict(
  conflictId: string,
  action: "keep" | "supersede",
  winnerSlug: string
): Promise<{ success: boolean; conflict_id: string }> {
  const res = await apiFetch(`${API_BASE}/api/conflicts/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conflict_id: conflictId, action, winner_slug: winnerSlug }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Conflict resolution API error: ${res.status}`)
  }
  return res.json()
}

export async function fetchVaultStatus(): Promise<{ totalNodes: number; categories: Record<string, number>; embeddings: number; lastCompiled: string }> {
  const res = await apiFetch(`${API_BASE}/api/vault/status`)
  if (!res.ok) throw new Error(`Vault status error: ${res.status}`)
  return res.json()
}

// ─── OpenWiki ─────────────────────────────────────────────────────────────────

/**
 * OpenWiki nodes for the selected brain(s) only.
 * Scoped by x-total-recall-brain header (apiFetch) and explicit brain query.
 */
export async function fetchOpenWikiNodes(
  brainId?: string | null,
): Promise<MemoryNode[]> {
  const active =
    brainId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('total-recall-active-brain') : null) ||
    'global'

  // Reuse listMemory brain routing (global vs project:name), then keep openwiki-tagged only.
  // Server also filters tag=openwiki when we hit /api/memory?tag=openwiki.
  const params = new URLSearchParams({ tag: 'openwiki', limit: '500' })
  const ids = active.split(',').map((s) => s.trim()).filter(Boolean)

  if (ids.length === 0 || (ids.length === 1 && ids[0] === 'global')) {
    const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
    if (!res.ok) throw new Error(`OpenWiki nodes error: ${res.status}`)
    const data = await res.json()
    const nodes = Array.isArray(data) ? data : (data.nodes ?? [])
    return filterOpenWikiNodes(nodes)
  }

  // Multi / project brains — fetch each scope separately (same merge rules as Memory)
  const fetchPromises = ids.map(async (id) => {
    try {
      if (id === 'global') {
        const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data) ? data : (data.nodes ?? [])
      }
      // Project brain: list all nodes then filter openwiki (brains/:id/nodes may not support tag)
      const res = await apiFetch(`${API_BASE}/api/brains/${encodeURIComponent(id)}/nodes`)
      if (!res.ok) {
        // Fallback: memory list with brain header already set by apiFetch
        const res2 = await apiFetch(`${API_BASE}/api/memory?${params}&brain=${encodeURIComponent(id)}`)
        if (!res2.ok) return []
        const data2 = await res2.json()
        return Array.isArray(data2) ? data2 : (data2.nodes ?? [])
      }
      const data = await res.json()
      const nodes = Array.isArray(data) ? data : (data.nodes ?? [])
      return filterOpenWikiNodes(nodes)
    } catch {
      return []
    }
  })

  const results = await Promise.all(fetchPromises)
  const merged: MemoryNode[] = []
  const seen = new Set<string>()
  // Project overrides global on slug collision
  const ordered = results
    .map((nodes, i) => ({ nodes, id: ids[i] }))
    .sort((a, b) => {
      if (a.id === 'global') return 1
      if (b.id === 'global') return -1
      return 0
    })
  for (const { nodes } of ordered) {
    for (const n of filterOpenWikiNodes(nodes)) {
      if (!seen.has(n.slug)) {
        seen.add(n.slug)
        merged.push(n)
      }
    }
  }
  return merged
}

function filterOpenWikiNodes(nodes: MemoryNode[]): MemoryNode[] {
  return nodes.filter((n) => {
    const tags = (n.tags || []).map((t) => String(t).toLowerCase())
    const slug = String(n.slug || '').toLowerCase()
    return tags.includes('openwiki') || slug.startsWith('openwiki-')
  })
}
