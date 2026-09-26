import { useState, useEffect, useMemo, useCallback, type CSSProperties, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import {
  fetchPlugins,
  fetchBundledPlugins,
  fetchPeerPlugins,
  installPlugin,
  removePlugin,
  setPluginShared,
  runPluginCommand,
  fetchPluginReadme,
  type PluginInfo,
  type BundledPlugin,
  type PeersResponse,
  type PeerNode
} from "../api"
import { renderMarkdown } from "../components/MarkdownUtils"

interface PluginsPageProps {
  activeBrainId?: string | null
}

type Tab = "installed" | "bundled" | "mesh"
type DetailTab = "run" | "readme" | "details"
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
  const [detailTab, setDetailTab] = useState<DetailTab>("run")
  const [subcommand, setSubcommand] = useState("")
  const [args, setArgs] = useState("")
  const [output, setOutput] = useState<{ text: string; ok: boolean } | null>(null)
  const [readme, setReadme] = useState("")

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

  const openDetail = async (p: PluginInfo) => {
    setDetail(p)
    setDetailTab(p.cli ? "run" : "details")
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

  // Keep an open detail panel in sync after share/remove/reload.
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
  const filteredBundled = bundled.filter(matches)

  const tabButton = (id: Tab, label: string, count?: number) => (
    <button
      key={id}
      role="tab"
      aria-selected={tab === id}
      className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-ghost"}`}
      onClick={() => setTab(id)}
    >
      {label}
      {count !== undefined && <span style={{ opacity: 0.75, fontWeight: 500 }}>{count}</span>}
    </button>
  )

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1>Plugins</h1>
          <p>
            Plugins shape Total Recall for a particular use — memory categories, agent context, commands and scheduled jobs.
            Share them directly with other users through a hash-pinned HTTPS link. Your mesh peers can use the same shared plugins.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setInstallOpen(true); setAlert(null) }}>
          Install from source…
        </button>
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
          {tabButton("installed", "Installed", installed.length)}
          {tabButton("bundled", "Bundled", bundled.length)}
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
        loading ? <div style={muted}>Loading…</div> :
        filteredInstalled.length === 0 ? (
          <Empty title={installed.length ? "No installed plugins match" : "No plugins installed"}>
            {!installed.length && <>Start with a <button className="btn btn-ghost btn-sm" onClick={() => setTab("bundled")}>bundled plugin</button> or see what your peers share.</>}
          </Empty>
        ) : (
          <div className="card-grid">
            {filteredInstalled.map((p) => (
              <div key={`${p.scope}:${p.id}`} className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                  <button onClick={() => openDetail(p)} style={{ background: "none", border: "none", padding: 0, color: "var(--text-primary)", fontWeight: 600, fontSize: "15px", cursor: "pointer", textAlign: "left" }}>
                    {p.name}
                  </button>
                  <span style={{ ...mono, color: "var(--text-tertiary)" }}>v{p.version}</span>
                </div>
                <div style={muted}>{p.description}</div>
                <UseCaseChips useCases={p.use_cases} />
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <span className="badge">{p.scope}</span>
                  <span className="badge">{sourceLabel(p)}</span>
                  {p.shared && <span className="badge badge-accent">shared</span>}
                  {!p.valid && <span className="badge badge-error">invalid manifest</span>}
                  {p.modified_since_install && <span className="badge badge-warning">changed since install</span>}
                </div>
                <div style={{ ...mono, color: "var(--text-tertiary)" }} title={p.sha256 || undefined}>sha256 {shortHash(p.sha256)}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "auto", flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDetail(p)}>Open</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === p.id || (!p.valid && !p.shared)} onClick={() => doShare(p, !p.shared)}>
                    {p.shared ? "Stop sharing" : "Share"}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === p.id} onClick={() => doRemove(p)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "bundled" && (
        loading ? <div style={muted}>Loading…</div> :
        filteredBundled.length === 0 ? <Empty title="No bundled plugins match" /> : (
          <>
            <p style={{ ...muted, marginBottom: "16px" }}>Shipped with this version of Total Recall, so they install on any node.</p>
            <div className="card-grid">
              {filteredBundled.map((p) => (
                <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, fontSize: "15px" }}>{p.name}</span>
                    <span style={{ ...mono, color: "var(--text-tertiary)" }}>v{p.version}</span>
                  </div>
                  <div style={muted}>{p.description}</div>
                  <UseCaseChips useCases={p.use_cases} />
                  <div style={{ ...muted, fontSize: "12px" }}>
                    {[
                      p.cli && `command: total-recall ${p.cli.command}`,
                      p.tasks.length > 0 && `${p.tasks.length} scheduled task${p.tasks.length > 1 ? "s" : ""}`,
                      p.categories.length > 0 && `${p.categories.length} memory categor${p.categories.length > 1 ? "ies" : "y"}`
                    ].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ marginTop: "auto" }}>
                    {p.installed
                      ? <span className="badge badge-success">installed</span>
                      : <button className="btn btn-primary btn-sm" disabled={busy === p.id} onClick={() => doInstall(p.id)}>
                          {busy === p.id ? "Installing…" : "Install"}
                        </button>}
                  </div>
                </div>
              ))}
            </div>
          </>
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

      {detail && (
        <div role="dialog" aria-modal="true" aria-label={detail.name} onClick={closeDetail}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "640px", height: "100%", overflowY: "auto", background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>{detail.name}</div>
                <div style={{ ...mono, color: "var(--text-tertiary)" }}>{detail.id} · v{detail.version}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeDetail} aria-label="Close">Close</button>
            </div>
            <div style={muted}>{detail.description}</div>
            {!detail.valid && (
              <div className="alert alert-error">
                {detail.errors.map((e) => <div key={e}>{e}</div>)}
              </div>
            )}
            <div role="tablist" style={{ display: "flex", gap: "8px" }}>
              {detail.cli && <button role="tab" aria-selected={detailTab === "run"} className={`btn btn-sm ${detailTab === "run" ? "btn-primary" : "btn-ghost"}`} onClick={() => setDetailTab("run")}>Run</button>}
              <button role="tab" aria-selected={detailTab === "details"} className={`btn btn-sm ${detailTab === "details" ? "btn-primary" : "btn-ghost"}`} onClick={() => setDetailTab("details")}>Details</button>
              <button role="tab" aria-selected={detailTab === "readme"} className={`btn btn-sm ${detailTab === "readme" ? "btn-primary" : "btn-ghost"}`} onClick={() => setDetailTab("readme")}>README</button>
            </div>

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

            {detailTab === "details" && (
              <div>
                <Fact label="Scope">{detail.scope}{detail.linked ? " (linked folder)" : ""}</Fact>
                <Fact label="Source">{sourceLabel(detail)} — <span style={mono}>{detail.source.ref}</span></Fact>
                <Fact label="Installed">{detail.installed_at ? new Date(detail.installed_at).toLocaleString() : "no install record"}</Fact>
                <Fact label="Content sha256"><span style={mono}>{detail.sha256 || "—"}</span></Fact>
                {detail.modified_since_install && <Fact label="At install"><span style={mono}>{detail.installed_sha256}</span></Fact>}
                <Fact label="Files">{detail.file_count ?? "—"} · {formatBytes(detail.size_bytes)}</Fact>
                <Fact label="Shared">{detail.shared ? "yes" : "no"}</Fact>
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
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy === detail.id || (!detail.valid && !detail.shared)} onClick={() => doShare(detail, !detail.shared)}>
                    {detail.shared ? "Stop sharing" : "Share"}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === detail.id} onClick={() => doRemove(detail)}>Remove</button>
                </div>
              </div>
            )}

            {detailTab === "readme" && (
              <div style={{ fontSize: "14px", lineHeight: 1.6 }}>{readme ? renderMarkdown(readme) : <span style={muted}>Loading…</span>}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
