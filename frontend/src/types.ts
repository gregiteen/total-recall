// ─── Types for the Total Recall frontend ────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  versions?: string[]
  currentVersionIndex?: number
}

export interface MemoryNode {
  slug: string
  title: string
  category: string
  status?: string
  priority?: string
  importance?: number
  confidence?: number
  modality?: string
  tags?: string[]
  body?: string
  content?: string
  excerpt?: string
  related?: string[]
  supersedes?: string[]
  contradicts?: string[]
}

export interface ScriptFile {
  name: string
  size: number
  modified: string
}

export interface HealthData {
  status: string
  version: string
  uptime_seconds: number
  timestamp: string
  disk?: { free: number, total: number }
  ollama?: string
  ollama_models?: string[]
  cli_agents?: string[]
  daemon?: string
  emergency_alerts?: string | null
}

export interface SandboxResult {
  success: boolean
  output: string
  isError?: boolean
}

export interface Task {
  slug: string
  target: string
  category: string
  status: string
  priority: number
  body?: string
  error?: string
}

export interface FileNode {
  name: string
  size: number
  modified: string
  isDirectory: boolean
}

export interface ResearchItem {
  id: string
  topic: string
  status: 'pending' | 'in_progress' | 'done' | 'failed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  notes: string | null
  node_slug?: string | null
  research_phase?: string
  created_at: string
  updated_at: string
  completed_at?: string | null
}

