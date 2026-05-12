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
  importance?: number
  modality?: string
  tags?: string[]
  body?: string
  excerpt?: string
}

export interface HealthData {
  status: string
  version: string
  uptime_seconds: number
  timestamp: string
  disk?: { free: number, total: number }
  ollama?: string
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
