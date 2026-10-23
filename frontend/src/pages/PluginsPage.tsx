import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import {
  fetchPlugins,
  fetchPlugin,
  fetchBundledPlugins,
  fetchPeerPlugins,
  installPlugin,
  removePlugin,
  setPluginShared,
  updatePluginBranding,
  setPluginLocked,
  deployPluginToStore,
  runPluginCommand,
  fetchPluginReadme,
  setPluginActivation,
  type PluginInfo,
  type BundledPlugin,
  type PeersResponse,
  type PeerNode
} from "../api"
import { renderMarkdown } from "../components/MarkdownUtils"
import { PluginPanel, pluginElements } from "../components/plugins/PluginPanel"
import { PluginSettings } from "../components/plugins/PluginSettings"
import { CardEngine } from "../components/plugins/card/CardEngine"

interface PluginsPageProps {
  activeBrainId?: string | null
}

type Tab = "installed" | "bundled" | "mesh"
type DetailTab = "preview" | "run" | "readme" | "details"
type Alert = { type: "success" | "error"; message: string } | null

const PEER_STATUS_LABEL: Record<PeerNode["status"], string> = {
  ok: "online",
  offline: "offline",
  unreachable: "unreachable",
  not_configured: "mesh sync not configured",
  unsupported: "no plugin sharing (older version)",
  error: "error"
}

const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "12px" }
const muted: CSSProperties = { color: "var(--text-secondary)", fontSize: "13px", lineHeight: 1.5 }

const DEFAULT_CORE_PLUGINS = new Set([
  "auth",
  "mesh",
  "openwiki",
  "composable-cli",
  "cli-agents",
  "code-quality",
  "security",
  "embeddings",
  "git-sentinel"
])

const AGENT_RECIPE_PROMPT = `You are my coding agent. Author a bespoke Total Recall plugin for [DOMAIN] following the Total Recall Plugin Recipe:

1. Scaffold:
   total-recall scaffold-plugin <id> --title "<Name>" --description "<Description>"

2. Manifest (plugin.json):
   - id: lowercase kebab-case
   - name: Clear Title
   - branding: { name, color, badge }
   - cli: command name and subcommands with effect (read/write)
   - ui: elements declaring the Web Component tag <tr-plugin-<id>-card>
   - secrets: declare required keys, never store plain text

3. Web Component (ui/card.js):
   - Register <tr-plugin-<id>-card>
   - Standardized layout with clean borders and >=44px touch targets
   - Authentic purpose-built domain tools (NO fake audio equalizers or fake skins)
   - Real interactive controls executing plugin subcommands via host.run(subcommand, args)

4. Distribution:
   - Private: keep in .agent/skills/total-recall/plugins/<id>
   - Store: publish via total-recall deploy-store <id>`

function resolvePluginBranding(p: { id: string; branding?: { icon?: string | null; color?: string | null; badge?: string | null } }) {
  const custom = p.branding || {}
  return {
    icon: custom.icon || "",
    color: custom.color || "#3b82f6",
    badge: custom.badge || "Plugin",
  }
}

function shortHash(sha: string | null | undefined) {
  return sha ? `${sha.slice(0, 12)}…` : "—"
}

function formatBytes(n: number | null | undefined) {
  if (n === null || n === undefined) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function sourceLabel(p: PluginInfo) {
  switch (p.source.kind) {
    case "peer": return `from ${p.source.peer_hostname || "a peer"}`
    case "bundled": return "bundled"
    case "git": return "git"
    case "public": return "direct link"
    case "link": return "linked folder"
    default: return "local folder"
  }
}

function UseCaseChips({ useCases }: { useCases: string[] }) {
  if (!useCases.length) return null
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {useCases.map((u) => (
        <span key={u} className="badge" style={{ fontSize: "11px" }}>{u}</span>
      ))}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "12px", fontSize: "13px", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: "132px", flexShrink: 0, color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  )
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontWeight: 600, marginBottom: "6px" }}>{title}</div>
      {children && <div style={muted}>{children}</div>}
    </div>
  )
}

export function PluginCardCapabilities({
  p,
  onRunSubcommand,
  onOpenSettings,
  onOpenPreview
}: {
  p: PluginInfo;
  onRunSubcommand: (subcommand: string) => void;
  onOpenSettings: () => void;
  onOpenPreview: () => void;
}) {
  const [expanded, setExpanded] = useState(false)
  const subcommands = p.cli?.subcommands || []
  const tasks = p.tasks || []
  const secrets = p.secrets || []
  const uiElements = p.ui?.elements || []
  const categories = p.categories || []
  const deploy = (p.manifest?.deploy as Record<string, unknown> | undefined) || {}
  const accessGrants = (deploy.access_grants as string[] | undefined) || []

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
      {/* Quick Capability Badges */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "11px" }}>
        {p.cli && (
          <span className="badge" style={{ background: "rgba(20, 184, 166, 0.15)", color: "#14b8a6", borderColor: "rgba(20, 184, 166, 0.3)" }}>
            [CLI] {p.cli.command || p.id} ({subcommands.length} verbs)
          </span>
        )}
        {tasks.length > 0 && (
          <span className="badge" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818cf8", borderColor: "rgba(99, 102, 241, 0.3)" }}>
            [CRON] {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        )}
        {secrets.length > 0 && (
          <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" }}>
            [KEY] {secrets.length} {secrets.length === 1 ? "secret" : "secrets"}
          </span>
        )}
        {uiElements.length > 0 && (
          <span className="badge" style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6", borderColor: "rgba(236, 72, 153, 0.3)" }}>
            [UI] {uiElements.length} {uiElements.length === 1 ? "component" : "components"}
          </span>
        )}
        {categories.length > 0 && (
          <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", borderColor: "rgba(139, 92, 246, 0.3)" }}>
            [CAT] {categories.length} {categories.length === 1 ? "category" : "categories"}
          </span>
        )}
      </div>

      {/* Clickable Subcommand Chips */}
      {subcommands.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600 }}>ACTIONS &amp; CLIS:</div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {subcommands.slice(0, expanded ? undefined : 4).map((sub) => (
              <button
                key={sub.name}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRunSubcommand(sub.name)}
                title={sub.description || `Run ${p.cli?.command} ${sub.name}`}
                style={{
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px"
                }}
              >
                ${p.cli?.command ? ` ${p.cli.command}` : ""} {sub.name}
              </button>
            ))}
            {subcommands.length > 4 && !expanded && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExpanded(true)}
                style={{ padding: "2px 6px", fontSize: "10px", color: "var(--text-secondary)" }}
              >
                +{subcommands.length - 4} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expandable Deep Capabilities Drawer */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px", padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", border: "1px solid var(--border)" }}>
          {/* Workflows / Tasks */}
          {tasks.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "4px" }}>SCHEDULED WORKFLOWS:</div>
              {tasks.map((t, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", padding: "3px 0" }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "#818cf8" }}>{t.schedule}</span>
                  <span style={{ color: "var(--text-secondary)", flex: 1, marginLeft: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.intent}>
                    {t.intent}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRunSubcommand(t.command)}
                    style={{ padding: "1px 6px", fontSize: "10px" }}
                  >
                    ▶ Run
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Secrets & Config */}
          {secrets.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)" }}>CONFIGS &amp; CREDENTIALS:</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onOpenSettings}
                  style={{ padding: "1px 6px", fontSize: "10px" }}
                >
                  Configure
                </button>
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {secrets.map((s) => (
                  <span
                    key={s.key}
                    className="badge"
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      background: s.required ? "rgba(239, 68, 68, 0.1)" : "rgba(255, 255, 255, 0.05)",
                      color: s.required ? "#f87171" : "var(--text-secondary)",
                      borderColor: s.required ? "rgba(239, 68, 68, 0.2)" : "var(--border)"
                    }}
                    title={s.description || s.key}
                  >
                    {s.key} {s.required ? "(required)" : "(optional)"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Access Grants & Workspaces */}
          {accessGrants.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "4px" }}>SSSS ACCESS GRANTS:</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {accessGrants.map((grant: string) => (
                  <span key={grant} className="badge" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                    {grant}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* UI Custom Elements */}
          {uiElements.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "4px" }}>UI CUSTOM ELEMENTS:</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {uiElements.map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onOpenPreview}
                    style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "2px 6px" }}
                    title={`Open <${el.tag}> (${el.kind})`}
                  >
                    &lt;{el.tag}&gt;
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toggle Expand / Collapse */}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setExpanded(!expanded)}
        style={{
          alignSelf: "flex-start",
          padding: "2px 6px",
          fontSize: "11px",
          color: "var(--text-secondary)",
          marginTop: "2px"
        }}
      >
        {expanded ? "▴ Collapse details" : "▾ Expand capabilities & configs"}
      </button>
    </div>
  )
}

export default function PluginsPage({ activeBrainId }: PluginsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>("installed")
  const [installed, setInstalled] = useState<PluginInfo[]>([])
  const [bundled, setBundled] = useState<BundledPlugin[]>([])
  const [peers, setPeers] = useState<PeersResponse | null>(null)
  const [peersLoading, setPeersLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [useCase, setUseCase] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [alert, setAlert] = useState<Alert>(null)

  const [installOpen, setInstallOpen] = useState(false)
  const [installSource, setInstallSource] = useState("")
  const [installLink, setInstallLink] = useState(false)
  const [installGlobal, setInstallGlobal] = useState(false)

  const [detail, setDetail] = useState<PluginInfo | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>("preview")
  const [subcommand, setSubcommand] = useState("")
  const [args, setArgs] = useState("")
  const [output, setOutput] = useState<{ text: string; ok: boolean } | null>(null)
  const [readme, setReadme] = useState("")

  // Agent Plugin Recipe & Workspace State
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"workspace" | "all">("workspace")
  const [workspaceActiveIds, setWorkspaceActiveIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("tr_workspace_plugins")
      if (stored) return new Set(JSON.parse(stored))
    } catch {}
    return new Set<string>()
  })

  // Branding Customization Modal state
  const [brandingOpen, setBrandingOpen] = useState(false)
  const [brandingPlugin, setBrandingPlugin] = useState<PluginInfo | null>(null)
  const [brandingIcon, setBrandingIcon] = useState("")
  const [brandingColor, setBrandingColor] = useState("#3b82f6")
  const [brandingBadge, setBrandingBadge] = useState("")

  // Touch & Context Menu state (right-click & long-press)
  const [contextMenu, setContextMenu] = useState<{ plugin: PluginInfo; x: number; y: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = (p: PluginInfo, e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const clientX = touch.clientX
    const clientY = touch.clientY
    longPressTimerRef.current = setTimeout(() => {
      if ("vibrate" in navigator) {
        try { navigator.vibrate(50) } catch {}
      }
      setContextMenu({ plugin: p, x: clientX, y: clientY })
    }, 500)
  }

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleContextMenu = (p: PluginInfo, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ plugin: p, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const onPointerDown = () => setContextMenu(null)
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const loadLocal = useCallback(async () => {
    setLoading(true)
    try {
      const [i, b] = await Promise.all([fetchPlugins(), fetchBundledPlugins()])
      setInstalled(i)
      setBundled(b)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPeers = useCallback(async () => {
    setPeersLoading(true)
    try {
      setPeers(await fetchPeerPlugins())
    } finally {
      setPeersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLocal()
  }, [loadLocal, activeBrainId])

  useEffect(() => {
    if (tab === "mesh" && peers === null && !peersLoading) loadPeers()
  }, [tab, peers, peersLoading, loadPeers])

  const allUseCases = useMemo(() => {
    const set = new Set<string>()
    for (const p of installed) p.use_cases.forEach((u) => set.add(u))
    for (const p of bundled) p.use_cases.forEach((u) => set.add(u))
    for (const n of peers?.peers || []) n.plugins.forEach((p) => p.use_cases.forEach((u) => set.add(u)))
    return Array.from(set).sort()
  }, [installed, bundled, peers])

  const matches = useCallback((p: { id: string; name: string; description: string; use_cases: string[] }) => {
    if (useCase && !p.use_cases.includes(useCase)) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [p.id, p.name, p.description, ...p.use_cases].some((v) => v.toLowerCase().includes(q))
  }, [query, useCase])

  const isWorkspaceCard = useCallback((p: { id: string; scope?: string }) => {
    if (p.scope === "project") return true
    if (DEFAULT_CORE_PLUGINS.has(p.id)) return true
    if (workspaceActiveIds.has(p.id)) return true
    return false
  }, [workspaceActiveIds])

  const addToWorkspace = async (p: { id: string; name: string }) => {
    setBusy(p.id)
    try {
      const next = new Set(workspaceActiveIds)
      next.add(p.id)
      setWorkspaceActiveIds(next)
      try { localStorage.setItem("tr_workspace_plugins", JSON.stringify([...next])) } catch {}
      await setPluginActivation(p.id, true)
      setAlert({ type: "success", message: `Added ${p.name} to workspace dashboard` })
      await loadLocal()
    } catch (err: any) {
      setAlert({ type: "error", message: err?.message || `Could not activate ${p.name}` })
    } finally {
      setBusy(null)
    }
  }

  const removeFromWorkspace = async (p: { id: string; name: string }) => {
    setBusy(p.id)
    try {
      const next = new Set(workspaceActiveIds)
      next.delete(p.id)
      setWorkspaceActiveIds(next)
      try { localStorage.setItem("tr_workspace_plugins", JSON.stringify([...next])) } catch {}
      await setPluginActivation(p.id, false)
      setAlert({ type: "success", message: `Moved ${p.name} from workspace to Plugin Store` })
      await loadLocal()
    } catch (err: any) {
      setAlert({ type: "error", message: err?.message || `Could not deactivate ${p.name}` })
    } finally {
      setBusy(null)
    }
  }

  const copyAgentPrompt = () => {
    void navigator.clipboard?.writeText(AGENT_RECIPE_PROMPT)
    setAlert({ type: "success", message: "Copied Agent Plugin Recipe prompt to clipboard" })
  }

  const doInstall = async (source: string, opts: { link?: boolean; global?: boolean } = {}) => {
    setBusy(source)
    setAlert(null)
    const res = await installPlugin({ source, ...opts })
    setBusy(null)
    if (res.success) {
      setAlert({ type: "success", message: res.message || `Installed ${source}` })
      await loadLocal()
      if (peers) loadPeers()
      return true
    }
    setAlert({ type: "error", message: res.error || `Could not install ${source}` })
    return false
  }

  const doRemove = async (p: PluginInfo) => {
    if (!window.confirm(`Remove "${p.name}" (${p.scope})?`)) return
    setBusy(p.id)
    const res = await removePlugin(p.id, p.scope === "global")
    setBusy(null)
    setAlert(res.success ? { type: "success", message: `Removed ${p.name}` } : { type: "error", message: res.error || "Remove failed" })
    if (res.success) {
      if (detail?.id === p.id) closeDetail()
      loadLocal()
    }
  }

  const doShare = async (p: PluginInfo, shared: boolean) => {
    setBusy(p.id)
    const res = await setPluginShared(p.id, shared)
    setBusy(null)
    if (!res.success) {
      setAlert({ type: "error", message: res.error || "Could not change sharing" })
      return
    }
    if (res.plugin && detail?.id === p.id) setDetail(res.plugin)
    setAlert({ type: "success", message: shared ? `${p.name} is shared. Its public link is in the details.` : `${p.name} is no longer shared` })
    loadLocal()
  }

  const doToggleLock = async (p: PluginInfo) => {
    setBusy(p.id)
    const nextLocked = !p.locked
    const res = await setPluginLocked(p.id, nextLocked)
    setBusy(null)
    if (!res.success) {
      setAlert({ type: "error", message: res.error || "Could not update lock status" })
      return
    }
    if (res.plugin && detail?.id === p.id) setDetail(res.plugin)
    setAlert({
      type: "success",
      message: nextLocked ? `${p.name} is locked against further editing.` : `${p.name} is unlocked for editing.`
    })
    loadLocal()
  }

  const doDeployStore = async (p: PluginInfo) => {
    setBusy(p.id)
    const res = await deployPluginToStore(p.id, true)
    setBusy(null)
    if (!res.success) {
      setAlert({ type: "error", message: res.error || "Could not deploy plugin to store" })
      return
    }
    if (res.plugin && detail?.id === p.id) setDetail(res.plugin)
    setAlert({
      type: "success",
      message: `${p.name} deployed to the plugin store and locked as complete.`
    })
    loadLocal()
  }

  const openBrandingModal = (p: PluginInfo) => {
    const branding = resolvePluginBranding(p)
    setBrandingPlugin(p)
    setBrandingIcon(branding.icon)
    setBrandingColor(branding.color)
    setBrandingBadge(branding.badge)
    setBrandingOpen(true)
  }

  const saveBranding = async () => {
    if (!brandingPlugin) return
    if (brandingPlugin.locked) {
      setAlert({ type: "error", message: "Plugin is locked. Unlock it before editing branding." })
      setBrandingOpen(false)
      return
    }
    setBusy(brandingPlugin.id)
    const res = await updatePluginBranding(brandingPlugin.id, {
      icon: brandingIcon.trim() || undefined,
      color: brandingColor.trim() || undefined,
      badge: brandingBadge.trim() || undefined
    })
    setBusy(null)
    setBrandingOpen(false)
    if (!res.success) {
      setAlert({ type: "error", message: res.error || "Could not save branding" })
      return
    }
    setAlert({ type: "success", message: `Updated branding for ${brandingPlugin.name}` })
    await loadLocal()
    if (detail?.id === brandingPlugin.id && res.plugin) {
      setDetail(res.plugin)
    }
  }

  const openDetail = async (p: PluginInfo, targetTab: DetailTab = "preview") => {
    setDetail(await fetchPlugin(p.id) || p)
    setDetailTab(targetTab)
    setSubcommand(p.cli?.subcommands?.[0]?.name || "")
    setArgs("")
    setOutput(null)
    setReadme("")
    setReadme(await fetchPluginReadme(p.id))
  }

  const closeDetail = () => {
    setDetail(null)
    if (searchParams.has("id")) {
      const next = new URLSearchParams(searchParams)
      next.delete("id")
      setSearchParams(next)
    }
  }

  useEffect(() => {
    const id = searchParams.get("id")
    if (!id || detail?.id === id) return
    const match = installed.find((p) => p.id === id)
    if (match) openDetail(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, installed])

  useEffect(() => {
    if (!detail) return
    const fresh = installed.find((p) => p.id === detail.id)
    if (fresh && fresh !== detail) setDetail(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed])

  const runCommand = async () => {
    if (!detail) return
    setBusy(`run:${detail.id}`)
    const res = await runPluginCommand(detail.id, subcommand, args.trim() ? args.trim().split(/\s+/) : [])
    setBusy(null)
    if (res.error) setOutput({ text: res.error, ok: false })
    else setOutput({ text: (res.output || "").trim() || "(no output)", ok: res.success })
  }

  const filteredInstalled = installed.filter(matches)
  const myCards = filteredInstalled.filter(isWorkspaceCard)
  const shownInstalled = viewMode === "workspace" ? myCards : filteredInstalled

  const storeCatalog = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      version: string;
      description: string;
      use_cases: string[];
      installed: boolean;
      inWorkspace: boolean;
      sourcePlugin?: PluginInfo;
      branding?: { icon?: string | null; color?: string | null; badge?: string | null };
      cli?: { command: string | null; subcommands?: Array<{ name: string; description?: string }> } | null;
      tasks?: any[];
      secrets?: any[];
    }>()

    // Add bundled plugins
    for (const b of bundled) {
      const inst = installed.find((i) => i.id === b.id)
      map.set(b.id, {
        id: b.id,
        name: b.name,
        version: b.version,
        description: b.description,
        use_cases: b.use_cases || [],
        installed: b.installed || !!inst,
        inWorkspace: inst ? isWorkspaceCard(inst) : false,
        sourcePlugin: inst,
        branding: b.branding || (inst ? inst.branding : undefined),
        cli: b.cli || (inst ? inst.cli : null),
        tasks: b.tasks || (inst ? inst.tasks : []),
        secrets: inst?.secrets || []
      })
    }

    // Add any installed plugins that aren't in bundled
    for (const inst of installed) {
      if (!map.has(inst.id)) {
        map.set(inst.id, {
          id: inst.id,
          name: inst.name,
          version: inst.version,
          description: inst.description,
          use_cases: inst.use_cases || [],
          installed: true,
          inWorkspace: isWorkspaceCard(inst),
          sourcePlugin: inst,
          branding: inst.branding,
          cli: inst.cli,
          tasks: inst.tasks,
          secrets: inst.secrets || []
        })
      }
    }

    return Array.from(map.values())
  }, [bundled, installed, isWorkspaceCard])

  const filteredStoreCatalog = storeCatalog.filter(matches)

  const tabButton = (id: Tab, label: string, count?: number) => (
    <button
      key={id}
      role="tab"
      aria-selected={tab === id}
      className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-ghost"}`}
      onClick={() => setTab(id)}
    >
      {label}
      {count !== undefined && <span style={{ opacity: 0.75, fontWeight: 500, marginLeft: "4px" }}>{count}</span>}
    </button>
  )

  return (
    <div className="page" style={{ maxWidth: "100%", padding: "0 20px", margin: "0 auto", width: "100%" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1>Plugins</h1>
          <p>
            Modular capability system for Total Recall and SSSS apps — memory categories, agent context, commands, and design-token UI.
            Customizable branding, locked release status, and direct store deployment are managed on each card.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-ghost" onClick={() => setRecipeOpen(true)}>
            Agent Recipe
          </button>
          <button className="btn btn-primary" onClick={() => { setInstallOpen(true); setAlert(null) }}>
            Install from source…
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert ${alert.type === "success" ? "alert-success" : "alert-error"}`} role="status"
          style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "20px" }}>
          <span>{alert.message}</span>
          <button onClick={() => setAlert(null)} aria-label="Dismiss" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div role="tablist" style={{ display: "flex", gap: "8px" }}>
          {tabButton("installed", "My Cards", myCards.length)}
          {tabButton("bundled", "Plugin Store (Bundled)", filteredStoreCatalog.length)}
          {tabButton("mesh", "On the mesh")}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input className="input" placeholder="Search plugins" value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label="Search plugins" style={{ width: "220px" }} />
          <select className="select" value={useCase} onChange={(e) => setUseCase(e.target.value)} aria-label="Filter by use case" style={{ paddingRight: "32px" }}>
            <option value="">All use cases</option>
            {allUseCases.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {tab === "installed" && (
        loading ? <div style={muted}>Loading…</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>
                  {viewMode === "workspace" ? "Active Workspace Cards" : "All Installed Plugins"}
                </div>
                <div style={muted}>
                  {viewMode === "workspace"
                    ? "Core runtime foundation and activated repository cards. Optional tools live in the Plugin Store."
                    : "All plugin packages installed on this host."}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`btn btn-xs ${viewMode === "workspace" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("workspace")}
                >
                  Workspace ({myCards.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${viewMode === "all" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("all")}
                >
                  All Installed ({installed.length})
                </button>
              </div>
            </div>

            {shownInstalled.length === 0 ? (
              <Empty title={viewMode === "workspace" ? "No workspace cards active" : "No plugins installed"}>
                {viewMode === "workspace" ? (
                  <>
                    Explore the <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab("bundled")}>Plugin Store</button> to add capabilities or ask your agent to author one.
                  </>
                ) : (
                  <>Start with a <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab("bundled")}>bundled plugin</button> or see what your peers share.</>
                )}
              </Empty>
            ) : (
              {/* Plugin faces are wide surfaces with screens to flip through, never narrow columns. */}
              <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 720px), 1fr))", gap: "22px" }}>
                {shownInstalled.map((p) => {
                  return (
                    <div
                      key={`${p.scope}:${p.id}`}
                      onContextMenu={(e) => handleContextMenu(p, e)}
                      onTouchStart={(e) => handleTouchStart(p, e)}
                      onTouchEnd={cancelLongPress}
                      style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}
                    >
                      <CardEngine plugin={p} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", fontSize: "11px", color: "var(--text-tertiary)", flexWrap: "wrap", gap: "6px" }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <span className="badge">{p.scope}</span>
                          <span className="badge">{sourceLabel(p)}</span>
                          {p.shared && <span className="badge badge-accent">shared</span>}
                          {!p.valid && <span className="badge badge-error">invalid manifest</span>}
                          {p.modified_since_install && <span className="badge badge-warning">changed since install</span>}
                        </div>
                        {!DEFAULT_CORE_PLUGINS.has(p.id) && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => removeFromWorkspace(p)}
                            style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                            title="Move back to Plugin Store"
                          >
                            Remove from Workspace
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      )}

      {tab === "bundled" && (
        loading ? <div style={muted}>Loading…</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Agent Plugin Recipe Hero Banner */}
            <div className="card" style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span className="badge" style={{ background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", borderColor: "rgba(99, 102, 241, 0.4)", fontSize: "11px" }}>
                      AGENT RECIPE ARCHITECTURE
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      Declarative Recipes · Private or Store
                    </span>
                  </div>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                    Build Bespoke Plugins with Your Coding Agent
                  </h2>
                  <p style={{ ...muted, margin: "6px 0 0 0", maxWidth: "640px" }}>
                    Total Recall plugins are not generated by closed system templates; your contextual coding agent (Antigravity, Claude, Codex, DSH) builds them from a declarative Recipe. Run them privately in your workspace or publish them to the Plugin Store.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setRecipeOpen(true)}
                  >
                    View Agent Recipe
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={copyAgentPrompt}
                  >
                    Copy Agent Prompt
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setInstallOpen(true); setAlert(null) }}
                  >
                    Install from source…
                  </button>
                </div>
              </div>
            </div>

            {filteredStoreCatalog.length === 0 ? (
              <Empty title="No plugins match in store" />
            ) : (
              <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "16px" }}>
                {filteredStoreCatalog.map((item) => {
                  const branding = resolvePluginBranding(item)
                  return (
                    <div
                      key={item.id}
                      className="card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        borderTop: `3px solid ${branding.color}`,
                        background: "var(--bg-secondary)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <div
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "8px",
                              background: `${branding.color}20`,
                              border: `1px solid ${branding.color}40`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "12px",
                              color: branding.color
                            }}
                          >
                            {branding.icon || item.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px", lineHeight: 1.2 }}>{item.name}</div>
                            <div style={{ ...mono, color: "var(--text-tertiary)", fontSize: "11px" }}>
                              {item.id} · v{item.version}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                          <span className="badge" style={{ background: `${branding.color}15`, color: branding.color, borderColor: `${branding.color}35`, fontSize: "10px" }}>
                            {branding.badge}
                          </span>
                          {item.inWorkspace && (
                            <span className="badge badge-success" style={{ fontSize: "10px" }}>
                              ✓ In Workspace
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ ...muted, fontSize: "12px", minHeight: "36px" }}>
                        {item.description}
                      </div>

                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", fontSize: "10px" }}>
                        {item.cli && (
                          <span className="badge" style={{ fontFamily: "var(--font-mono)" }}>
                            CLI ({item.cli.subcommands?.length || 1})
                          </span>
                        )}
                        {item.tasks && item.tasks.length > 0 && (
                          <span className="badge" style={{ fontFamily: "var(--font-mono)" }}>
                            {item.tasks.length} {item.tasks.length === 1 ? "task" : "tasks"}
                          </span>
                        )}
                        {item.secrets && item.secrets.length > 0 && (
                          <span className="badge" style={{ fontFamily: "var(--font-mono)" }}>
                            {item.secrets.length} {item.secrets.length === 1 ? "secret" : "secrets"}
                          </span>
                        )}
                        {DEFAULT_CORE_PLUGINS.has(item.id) && (
                          <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>
                            Core Bundle
                          </span>
                        )}
                      </div>

                      <UseCaseChips useCases={item.use_cases} />

                      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (item.sourcePlugin) {
                              openDetail(item.sourcePlugin, "preview")
                            } else {
                              openDetail({
                                id: item.id,
                                name: item.name,
                                version: item.version,
                                description: item.description,
                                author: null,
                                license: null,
                                homepage: null,
                                use_cases: item.use_cases,
                                valid: true,
                                errors: [],
                                scope: "global",
                                linked: false,
                                dir: "",
                                shared: false,
                                mesh_shared: false,
                                share_url: null,
                                source: { kind: "bundled", ref: item.id },
                                installed_at: null,
                                sha256: null,
                                installed_sha256: null,
                                modified_since_install: false,
                                file_count: null,
                                size_bytes: null,
                                categories: [],
                                tasks: item.tasks || [],
                                openwiki_hubs: [],
                                cli: item.cli as any,
                                has_generator: false,
                                branding: item.branding
                              }, "preview")
                            }
                          }}
                        >
                          Preview
                        </button>

                        <div style={{ display: "flex", gap: "6px" }}>
                          {!item.installed ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy === item.id}
                              onClick={() => doInstall(item.id)}
                            >
                              {busy === item.id ? "Installing…" : "Install"}
                            </button>
                          ) : item.inWorkspace ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy === item.id}
                              onClick={() => removeFromWorkspace(item.sourcePlugin || item)}
                              style={{ fontSize: "11px" }}
                            >
                              Remove from Workspace
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy === item.id}
                              onClick={() => addToWorkspace(item.sourcePlugin || item)}
                            >
                              {busy === item.id ? "Adding…" : "+ Add to Workspace"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      )}

      {tab === "mesh" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <p style={{ ...muted, margin: 0 }}>Asked live from each node. Only plugins their owner chose to share appear here; content is hash-checked on install.</p>
            <button className="btn btn-ghost btn-sm" onClick={loadPeers} disabled={peersLoading}>{peersLoading ? "Asking peers…" : "Refresh"}</button>
          </div>

          {peersLoading && !peers ? <div style={muted}>Asking peers…</div> :
            peers === null ? <Empty title="Could not ask the mesh">The brain server did not answer the peer query.</Empty> :
            !peers.mesh.available ? (
              <Empty title="This node is not on a mesh">Enroll it with <code style={mono}>npx total-recall mesh enroll</code> to share plugins between your nodes.</Empty>
            ) : peers.peers.length === 0 ? <Empty title="No other nodes on the mesh" /> : (
              <>
                {!peers.mesh.configured && (
                  <div className="alert alert-warning">This node has no <code style={mono}>TR_MESH_SYNC_TOKEN</code>, so it cannot query peers. Set the same token on each node.</div>
                )}
                {peers.peers.map((node) => {
                  const shown = node.plugins.filter(matches)
                  return (
                    <div key={node.hostname} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: node.plugins.length ? "12px" : 0, flexWrap: "wrap" }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{node.hostname}</span>{" "}
                          <span style={{ ...mono, color: "var(--text-tertiary)" }}>{node.ip}</span>
                        </div>
                        <span className={`badge ${node.status === "ok" ? "badge-online" : node.status === "offline" ? "badge-offline" : "badge-warning"}`}>
                          {PEER_STATUS_LABEL[node.status]}{node.status === "ok" ? ` · ${node.plugins.length} shared` : ""}
                        </span>
                      </div>
                      {node.error && node.status !== "ok" && <div style={{ ...muted, fontSize: "12px" }}>{node.error}</div>}
                      {node.status === "ok" && node.plugins.length === 0 && <div style={muted}>Shares no plugins.</div>}
                      {node.status === "ok" && node.plugins.length > 0 && shown.length === 0 && <div style={muted}>No shared plugins match the filter.</div>}
                      {shown.map((p) => {
                        const source = `peer:${node.hostname}/${p.id}`
                        return (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "12px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                            <div style={{ minWidth: 0, flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div><span style={{ fontWeight: 600 }}>{p.name}</span> <span style={{ ...mono, color: "var(--text-tertiary)" }}>v{p.version}</span></div>
                              <div style={muted}>{p.description}</div>
                              <UseCaseChips useCases={p.use_cases} />
                              <div style={{ ...mono, color: "var(--text-tertiary)" }} title={p.sha256}>
                                sha256 {shortHash(p.sha256)} · {p.file_count} files · {formatBytes(p.size_bytes)}
                              </div>
                            </div>
                            <div style={{ alignSelf: "center" }}>
                              {p.installed
                                ? <span className={`badge ${p.same_as_installed ? "badge-success" : "badge-warning"}`}>
                                    {p.same_as_installed ? "installed (same content)" : "installed (different content)"}
                                  </span>
                                : <button className="btn btn-primary btn-sm" disabled={busy === source} onClick={() => doInstall(source)}>
                                    {busy === source ? "Installing…" : "Install"}
                                  </button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}
        </div>
      )}

      {installOpen && (
        <div role="dialog" aria-modal="true" aria-label="Install plugin from source" onClick={() => setInstallOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <form className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "14px" }}
            onSubmit={async (e) => {
              e.preventDefault()
              if (!installSource.trim()) return
              if (await doInstall(installSource.trim(), { link: installLink, global: installGlobal })) {
                setInstallOpen(false)
                setInstallSource("")
              }
            }}>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>Install from source</div>
            <div style={muted}>
              A bundled plugin id, <code style={mono}>peer:&lt;host&gt;/&lt;id&gt;</code>, a git URL, or a folder on this machine containing <code style={mono}>plugin.json</code>.
            </div>
            <input className="input" autoFocus value={installSource} onChange={(e) => setInstallSource(e.target.value)}
              placeholder="https://github.com/you/my-plugin.git" aria-label="Plugin source" />
            <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="checkbox" checked={installLink} onChange={(e) => setInstallLink(e.target.checked)} />
              Link a local folder instead of copying it (for plugin development)
            </label>
            <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="checkbox" checked={installGlobal} onChange={(e) => setInstallGlobal(e.target.checked)} />
              Install for every project on this machine
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setInstallOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!installSource.trim() || busy !== null}>
                {busy ? "Installing…" : "Install"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branding Customization Modal */}
      {brandingOpen && brandingPlugin && (
        <div role="dialog" aria-modal="true" aria-label="Customize Plugin Branding" onClick={() => setBrandingOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: "16px" }}>Customize Branding: {brandingPlugin.name}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setBrandingOpen(false)}>✕</button>
            </div>

            {brandingPlugin.locked && (
              <div className="alert alert-warning" style={{ fontSize: "12px" }}>
                [LOCKED] This plugin is marked complete and locked against editing. Unlock it to change branding.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Wordmark Glyph / Tag</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="input"
                  value={brandingIcon}
                  onChange={(e) => setBrandingIcon(e.target.value)}
                  style={{ width: "90px", textAlign: "center", fontSize: "14px", fontFamily: "var(--font-mono)" }}
                  disabled={brandingPlugin.locked}
                />
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                  {["[TEL]", "[DNS]", "[SIGN]", "[GATE]", "[CLI]", "[LAW]", "[UI]", "[SMS]", "[FIND]", "[GIT]", "[OPS]", "[WARN]", "[CORE]"].map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "4px 6px", fontSize: "11px", fontFamily: "var(--font-mono)" }}
                      disabled={brandingPlugin.locked}
                      onClick={() => setBrandingIcon(glyph)}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Theme Color (Hex)</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="color"
                  value={brandingColor}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  style={{ width: "42px", height: "38px", border: "none", cursor: "pointer", background: "none" }}
                  disabled={brandingPlugin.locked}
                />
                <input
                  className="input"
                  value={brandingColor}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  style={{ flex: 1, fontFamily: "var(--font-mono)" }}
                  disabled={brandingPlugin.locked}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Domain Badge Text</label>
              <input
                className="input"
                value={brandingBadge}
                onChange={(e) => setBrandingBadge(e.target.value)}
                placeholder="e.g. Telephony, Quality, DNS"
                disabled={brandingPlugin.locked}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setBrandingOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveBranding}
                disabled={brandingPlugin.locked || busy !== null}
              >
                Save Branding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Plugin Recipe Modal */}
      {recipeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agent Plugin Recipe"
          onClick={() => setRecipeOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Agent Plugin Recipe</h3>
                <div style={{ ...muted, fontSize: "12px" }}>How your coding agent authors private or store plugins</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRecipeOpen(false)}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
              <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, marginBottom: "4px" }}>1. Command your agent</div>
                <div style={muted}>
                  Copy and send this instruction to your coding agent (Antigravity, Claude, Codex, DSH):
                </div>
                <pre style={{ ...mono, background: "rgba(0,0,0,0.4)", padding: "10px", borderRadius: "6px", marginTop: "8px", whiteSpace: "pre-wrap", overflowX: "auto", fontSize: "11px", color: "#a5b4fc" }}>
{AGENT_RECIPE_PROMPT}
                </pre>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => copyAgentPrompt()}>
                    Copy Agent Prompt
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, color: "#38bdf8", marginBottom: "4px" }}>🔒 Private Plugins</div>
                  <div style={{ ...muted, fontSize: "12px", lineHeight: 1.4 }}>
                    Store directly inside <code style={mono}>.agent/skills/total-recall/plugins/&lt;id&gt;</code> or link locally. Never shared outside this machine or project. Zero cloud exposure.
                  </div>
                </div>

                <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, color: "#a855f7", marginBottom: "4px" }}>🌐 Plugin Store Distribution</div>
                  <div style={{ ...muted, fontSize: "12px", lineHeight: 1.4 }}>
                    Deploy to the store via <code style={mono}>total-recall deploy-store &lt;id&gt;</code>. Cryptographically signed and distributed across the mesh for team consumption.
                  </div>
                </div>
              </div>

              <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                <div style={{ fontWeight: 600, color: "#10b981", marginBottom: "4px" }}>Quality Invariants Enforced</div>
                <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                  <li>Guaranteed Title, Brand Glyph, Version, and Settings drawer trigger on every card</li>
                  <li>Authentic domain tools only — zero fake audio equalizers or fake skins</li>
                  <li>Touch-first ergonomics with minimum 44px tap targets</li>
                </ul>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRecipeOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Plugin Detail & Interactive Preview Drawer */}
      {detail && (
        <div role="dialog" aria-modal="true" aria-label={detail.name} onClick={closeDetail}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "680px", height: "100%", overflowY: "auto", background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Drawer Header */}
            {(() => {
              const branding = resolvePluginBranding(detail)
              const hasPanel = pluginElements(detail).length > 0
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "10px",
                          background: `${branding.color}20`,
                          border: `1px solid ${branding.color}50`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "22px",
                          flexShrink: 0
                        }}
                      >
                        {branding.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700 }}>{detail.name}</div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                          <span style={{ ...mono, color: "var(--text-tertiary)" }}>{detail.id} · v{detail.version}</span>
                          <span className="badge" style={{ background: `${branding.color}15`, color: branding.color, borderColor: `${branding.color}40`, fontSize: "11px" }}>
                            {branding.badge}
                          </span>
                          {detail.locked && <span className="badge" style={{ background: "#2e1065", color: "#c084fc" }}>Locked</span>}
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={closeDetail} aria-label="Close">Close</button>
                  </div>

                  <div style={muted}>{detail.description}</div>

                  {!detail.valid && (
                    <div className="alert alert-error">
                      {detail.errors.map((e) => <div key={e}>{e}</div>)}
                    </div>
                  )}

                  {/* Drawer Navigation Tabs */}
                  <div role="tablist" style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
                    {hasPanel && (
                      <button
                        role="tab"
                        aria-selected={detailTab === "preview"}
                        className={`btn btn-sm ${detailTab === "preview" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setDetailTab("preview")}
                      >
                        Open {detail.name}
                      </button>
                    )}
                    {detail.cli && (
                      <button
                        role="tab"
                        aria-selected={detailTab === "run"}
                        className={`btn btn-sm ${detailTab === "run" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setDetailTab("run")}
                      >
                        Run CLI
                      </button>
                    )}
                    <button
                      role="tab"
                      aria-selected={detailTab === "details"}
                      className={`btn btn-sm ${detailTab === "details" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setDetailTab("details")}
                    >
                      Settings
                    </button>
                    <button
                      role="tab"
                      aria-selected={detailTab === "readme"}
                      className={`btn btn-sm ${detailTab === "readme" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setDetailTab("readme")}
                    >
                      README
                    </button>
                  </div>

                  {/* Plugin-owned interface */}
                  {detailTab === "preview" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <PluginPanel plugin={detail} />
                    </div>
                  )}

                  {/* Tab 2: CLI Command Runner */}
                  {detailTab === "run" && detail.cli && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <select className="select" value={subcommand} onChange={(e) => setSubcommand(e.target.value)} aria-label="Subcommand" style={{ paddingRight: "32px" }}>
                          {(detail.cli.subcommands.length ? detail.cli.subcommands : [{ name: "" }]).map((s) => (
                            <option key={s.name} value={s.name}>{s.name || "(default)"}</option>
                          ))}
                        </select>
                        <input className="input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="extra arguments" aria-label="Arguments" style={{ flex: 1, minWidth: "160px" }} />
                        <button className="btn btn-primary" onClick={runCommand} disabled={busy === `run:${detail.id}` || !detail.valid}>
                          {busy === `run:${detail.id}` ? "Running…" : "Run"}
                        </button>
                      </div>
                      <div style={{ ...muted, fontSize: "12px" }}>
                        {detail.cli.subcommands.find((s) => s.name === subcommand)?.description}
                        {" "}Same as <code style={mono}>npx total-recall {detail.cli.command} {subcommand} {args}</code>. Runs in a separate process.
                      </div>
                      {output && (
                        <pre style={{ ...mono, margin: 0, padding: "14px", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", border: `1px solid ${output.ok ? "var(--border)" : "var(--error)"}`, whiteSpace: "pre-wrap", maxHeight: "420px", overflow: "auto" }}>
                          {output.text}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Plugin Facts & Config Controls */}
                  {detailTab === "details" && (
                    <div>
                      <PluginSettings plugin={detail} />
                      <Fact label="Scope">{detail.scope}{detail.linked ? " (linked folder)" : ""}</Fact>
                      <Fact label="Source">{sourceLabel(detail)} — <span style={mono}>{detail.source.ref}</span></Fact>
                      <Fact label="Installed">{detail.installed_at ? new Date(detail.installed_at).toLocaleString() : "no install record"}</Fact>
                      <Fact label="Content sha256"><span style={mono}>{detail.sha256 || "—"}</span></Fact>
                      {detail.modified_since_install && <Fact label="At install"><span style={mono}>{detail.installed_sha256}</span></Fact>}
                      <Fact label="Files">{detail.file_count ?? "—"} · {formatBytes(detail.size_bytes)}</Fact>
                      <Fact label="Shared">{detail.shared ? "yes" : "no"}</Fact>
                      <Fact label="Lock Status">{detail.locked ? "Locked (Completed)" : "Unlocked (Editable)"}</Fact>
                      <Fact label="Store Status">{detail.store_deployed ? "Published in Plugin Store" : "Not yet deployed to store"}</Fact>
                      {detail.shared && <Fact label="Public link">{detail.share_url ? <input className="input" aria-label="Public plugin share link" readOnly value={detail.share_url} onFocus={(e) => e.currentTarget.select()} /> : "Set TR_PUBLIC_BASE_URL to your public HTTPS origin to create a link."}</Fact>}
                      <Fact label="Use cases">{detail.use_cases.join(", ") || "—"}</Fact>
                      {detail.author && <Fact label="Author">{detail.author}</Fact>}
                      {detail.license && <Fact label="License">{detail.license}</Fact>}
                      <Fact label="Location"><span style={mono}>{detail.dir}</span></Fact>
                      <Fact label="Agent context">{detail.has_generator ? "adds a block to compiled instructions" : "—"}</Fact>
                      <Fact label="Memory categories">
                        {detail.categories.length ? detail.categories.map((c) => c.name).join(", ") : "—"}
                      </Fact>
                      <Fact label="Scheduled tasks">
                        {detail.tasks.length === 0 ? "—" : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {detail.tasks.map((t) => (
                              <div key={t.command}>
                                <span style={mono}>{t.schedule}</span> {t.command} — {t.intent}
                                <div style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>last run: {t.last_run || "not yet"}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Fact>

                      {/* Config Actions Toolbar inside drawer */}
                      <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openBrandingModal(detail)}
                          disabled={detail.locked}
                        >
                          Customize Branding
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => doToggleLock(detail)}
                          disabled={busy === detail.id}
                        >
                          {detail.locked ? "Unlock Editing" : "Lock When Complete"}
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => doDeployStore(detail)}
                          disabled={busy === detail.id || !detail.valid}
                        >
                          {detail.store_deployed ? "✓ Deployed to Store" : "Deploy to Plugin Store"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy === detail.id || (!detail.valid && !detail.shared)}
                          onClick={() => doShare(detail, !detail.shared)}
                        >
                          {detail.shared ? "Stop sharing" : "Share"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy === detail.id}
                          onClick={() => doRemove(detail)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab 4: Markdown Readme */}
                  {detailTab === "readme" && (
                    <div style={{ fontSize: "14px", lineHeight: 1.6 }}>{readme ? renderMarkdown(readme) : <span style={muted}>Loading…</span>}</div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Floating Touch & Right-Click Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          aria-label="Plugin actions menu"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.max(12, Math.min(contextMenu.x, window.innerWidth - 264)),
            top: Math.max(12, Math.min(contextMenu.y, window.innerHeight - 380)),
            zIndex: 2000,
            width: "250px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
            padding: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            backdropFilter: "blur(12px)"
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: resolvePluginBranding(contextMenu.plugin).color }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {contextMenu.plugin.name}
              </div>
              <div style={{ ...mono, fontSize: "10px", color: "var(--text-tertiary)" }}>
                {contextMenu.plugin.id} · v{contextMenu.plugin.version}
              </div>
            </div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              openDetail(p, "preview")
            }}
          >
            Open UI Component
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              openDetail(p, "run")
            }}
          >
            Run CLI ({contextMenu.plugin.cli?.command || contextMenu.plugin.id})
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              openDetail(p, "details")
            }}
          >
            Configure &amp; Settings
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              openDetail(p, "readme")
            }}
          >
            View Documentation
          </button>

          <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              doShare(p, !p.shared)
            }}
          >
            {contextMenu.plugin.shared ? "Stop sharing on mesh" : "Share on mesh & link"}
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              doToggleLock(p)
            }}
          >
            {contextMenu.plugin.locked ? "Unlock editing" : "Lock for release"}
          </button>

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              void navigator.clipboard?.writeText(`npx total-recall ${p.cli?.command || p.id}`)
              setAlert({ type: "success", message: `Copied "npx total-recall ${p.cli?.command || p.id}" to clipboard` })
            }}
          >
            Copy CLI command
          </button>

          <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />

          <button
            className="btn btn-ghost btn-sm"
            style={{ justifyContent: "flex-start", width: "100%", padding: "8px 10px", fontSize: "12px", color: "var(--color-error, #f87171)", minHeight: "36px" }}
            onClick={() => {
              const p = contextMenu.plugin
              setContextMenu(null)
              doRemove(p)
            }}
          >
            Uninstall plugin
          </button>
        </div>
      )}
    </div>
  )
}
