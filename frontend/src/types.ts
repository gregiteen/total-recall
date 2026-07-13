// ─── Types for the Total Recall frontend ────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  versions?: string[]
  currentVersionIndex?: number
}

export interface GeminiModelInfo {
  id: string
  displayName: string
  pricing?: {
    prompt: string
    completion: string
  }
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
  subject?: string
  predicate?: string
  object?: string
  sentiment_polarity?: string
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
  caddy?: string
  cloudflare?: string
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
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'paused'
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
    openrouter?: UsageBreakdown
    tavily?: UsageBreakdown
    brave?: UsageBreakdown
    exa?: UsageBreakdown
    serper?: UsageBreakdown
  }
  timeseries?: {
    [dateStr: string]: {
      [modelId: string]: {
        input: number
        output: number
        tokens: number
        provider: string
        cost: number
      }
    }
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
      trusted_proxies?: string[]
    }
    rate_limits?: {
      api_requests_per_minute?: number
      sandbox_requests_per_minute?: number
      ingest_requests_per_minute?: number
    }
    sandbox?: {
      enabled?: boolean
    }
    api?: {
      allow_static_pats?: boolean
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
  brain?: {
    url?: string
    has_token?: boolean
    token?: string
    name?: string
    role?: string
    layer?: string
    tags?: string[]
    full_brain?: boolean
    preferred_agent?: string
    local_endpoint?: string
    openrouter_model?: string
    gemini_model?: string
    claude_model?: string
    openai_model?: string
  }
  secrets?: {
    google_api_key?: string
    anthropic_api_key?: string
    openai_api_key?: string
    tavily_api_key?: string
    brave_api_key?: string
    exa_api_key?: string
    serper_api_key?: string
    github_token?: string
    openrouter_api_key?: string
  }
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

// ─── Instruction Surface Types ──────────────────────────────────────────────────

export interface InstructionSurface {
  name: string
  filename: string
  size: number
  lastCompiled: string
  active: boolean
  content?: string
}

export interface InstructionsData {
  surfaces: InstructionSurface[]
  lastCompileTimestamp: string
  totalNodes: number
}

// ─── Skill Detail Types ─────────────────────────────────────────────────────────

export interface SkillSubFile {
  name: string
  path: string
  size: number
  modified: string
  isDirectory: boolean
}

export interface SkillDetail {
  name: string
  description: string
  content: string
  subFiles: {
    scripts: SkillSubFile[]
    references: SkillSubFile[]
    evals: SkillSubFile[]
    subagents: SkillSubFile[]
  }
  evalsStatus?: {
    total: number
    passed: number
    failed: number
  }
}

// ─── OKF Types ──────────────────────────────────────────────────────────────────

export interface OkfLintResult {
  slug: string
  field: string
  severity: 'warning' | 'error'
  message: string
}

export interface OkfExportOptions {
  stripSsss: boolean
  format: 'directory' | 'tar.gz'
  scope: 'global' | 'project' | 'all'
}

// ─── OpenWiki Types ─────────────────────────────────────────────────────────────

export interface OpenWikiNode {
  slug: string
  title: string
  category: string
  tags: string[]
  body: string
  source: string
}

// ─── UCW Bundle Types (SSSS §16 — UltraChat Workspace) ─────────────────────────

export interface UcwBundleManifest {
  name: string
  description: string
  version: string
  exported_at: string
  ssss_core_version: string
  required_extensions: string[]
  export_profile: 'backup' | 'template' | 'sale'
  primitive_inventory: Record<string, number>
  provisioning: UcwProvisioningStep[]
  parameters?: UcwParameter[]
  source_workspace_id?: string
  file_count: number
  provenance: {
    content_hash: string
    exporter: string
    signature?: string
  }
}

export interface UcwProvisioningStep {
  type: string
  target: string
  action: string
  installMode?: 'optional' | 'recommended' | 'required'
}

export interface UcwParameter {
  name: string
  description: string
  required: boolean
  default?: string
}

export interface UcwBundle {
  manifest: UcwBundleManifest
  branding?: Record<string, string>
  files: Array<{ path: string; content: string; frontmatter?: Record<string, unknown> }>
}

// ─── Design Docs Types ──────────────────────────────────────────────────────────

export interface DesignDoc {
  name: string
  path: string
  size: number
  modified: string
  category: 'in-progress' | 'completed' | 'planned' | 'archived' | 'backlog' | 'root'
  content?: string
}

// ─── Memory Stats Types ─────────────────────────────────────────────────────────

export interface MemoryVaultStats {
  total: number
  byCategory: Record<string, number>
  byPriority: Record<string, number>
  byStatus: Record<string, number>
  avgImportance: number
  avgConfidence: number
}

