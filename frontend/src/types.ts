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
  progress?: number
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

export interface Conflict {
  conflict_id: string
  status: 'pending' | 'resolved'
  new_slug: string
  existing_slug: string
  similarity: number
  polarity_flip: boolean
  detected_at: string
  reason: string
  resolution: string | null
  resolved_at: string | null
  _existing_node?: MemoryNode
  _new_node?: MemoryNode
}

export interface UsageBreakdown {
  dailyUsd: number
  weeklyUsd: number
  dailyTokens?: number
  weeklyTokens?: number
}

export interface UsageData {
  timestamp: string
  dailyUsd: number
  weeklyUsd: number
  breakdown: {
    gemini: UsageBreakdown
    claude: UsageBreakdown
    codex: UsageBreakdown
  }
}

export interface ConfigJson {
  security: {
    yolo_mode?: boolean
    privacy?: {
      enforce_local_only?: boolean
      allow_frontier_export?: 'always' | 'ask_per_skill' | 'never' | string
    }
    dashboard?: {
      force_password_reset?: boolean
      session_ttl_hours?: number
    }
    bind?: {
      host?: string
      port?: number
      allow_public_bind?: boolean
    }
    network?: {
      require_https?: boolean
      public_health?: boolean
      allowed_origins?: string[]
    }
    rate_limits?: {
      api_requests_per_minute?: number
      sandbox_requests_per_minute?: number
      ingest_requests_per_minute?: number
    }
    [key: string]: unknown
  }
  budget: {
    budget?: {
      enabled?: boolean
      daily_cap_usd?: number
      weekly_cap_usd?: number
    }
    [key: string]: unknown
  }
}

