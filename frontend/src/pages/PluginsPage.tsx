import { useState, useEffect, useMemo, useCallback } from "react"
import { 
  fetchPlugins, 
  fetchPluginCatalog, 
  installPlugin, 
  removePlugin, 
  ratePlugin,
  type PluginInfo, 
  type CatalogPlugin 
} from "../api"
import { Link } from "react-router-dom"

interface PluginsPageProps {
  activeBrainId?: string | null
}

function StarRatingDisplay({ rating, reviewCount, installCount }: { rating: number; reviewCount?: number; installCount?: string }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
      <div style={{ display: "flex", color: "#fbbf24" }}>
        {stars.map((s) => (
          <span key={s} style={{ opacity: s <= Math.round(rating) ? 1 : 0.35 }}>
            ★
          </span>
        ))}
      </div>
      <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{rating.toFixed(1)}</span>
      {reviewCount !== undefined && (
        <span style={{ color: "var(--text-tertiary)" }}>({reviewCount})</span>
      )}
      {installCount && (
        <>
          <span style={{ color: "var(--text-tertiary)" }}>•</span>
          <span style={{ color: "var(--text-secondary)" }}>{installCount} installs</span>
        </>
      )}
    </div>
  )
}

function InteractiveRater({ 
  pluginId, 
  currentRating, 
  onRated 
}: { 
  pluginId: string; 
  currentRating?: number | null; 
  onRated: (score: number) => void 
}) {
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleRate = async (score: number) => {
    setSubmitting(true)
    const res = await ratePlugin(pluginId, score)
    setSubmitting(false)
    if (res.success) {
      onRated(score)
    }
  }

  const activeScore = hoverRating !== null ? hoverRating : (currentRating || 0)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
      <span style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>Rate:</span>
      <div style={{ display: "flex", gap: "2px", cursor: submitting ? "wait" : "pointer" }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            onClick={() => handleRate(star)}
            style={{
              fontSize: "14px",
              color: star <= activeScore ? "#fbbf24" : "var(--text-tertiary)",
              transition: "transform 0.1s ease",
              transform: hoverRating === star ? "scale(1.2)" : "scale(1)"
            }}
            title={`Rate ${star} star${star > 1 ? "s" : ""}`}
          >
            ★
          </span>
        ))}
      </div>
      {currentRating && (
        <span style={{ color: "var(--success)", fontSize: "11px", fontWeight: "600" }}>
          (You rated {currentRating}★)
        </span>
      )}
    </div>
  )
}

export default function PluginsPage({ activeBrainId }: PluginsPageProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"installed" | "catalog">("installed")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"rating" | "reviews" | "name">("rating")
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [manifestModalPlugin, setManifestModalPlugin] = useState<PluginInfo | null>(null)

  // Install Form State
  const [installSource, setInstallSource] = useState("")
  const [installLink, setInstallLink] = useState(false)
  const [installGlobal, setInstallGlobal] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [installedList, catalogList] = await Promise.all([
        fetchPlugins(),
        fetchPluginCatalog()
      ])
      setPlugins(installedList)
      setCatalog(catalogList)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, activeBrainId])

  const handleInstallSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!installSource.trim()) return

    setInstalling(true)
    setAlert(null)

    const res = await installPlugin({
      source: installSource.trim(),
      link: installLink,
      global: installGlobal
    })

    setInstalling(false)

    if (res.success) {
      setAlert({ type: "success", message: res.message || "Plugin installed successfully" })
      setInstallSource("")
      setInstallModalOpen(false)
      loadData()
    } else {
      setAlert({ type: "error", message: res.error || "Failed to install plugin" })
    }
  }

  const handleCatalogInstall = async (item: CatalogPlugin) => {
    setInstalling(true)
    setAlert(null)
    const res = await installPlugin({
      source: item.sourceUrl,
      link: item.sourceUrl.startsWith("./") || item.sourceUrl.startsWith("local:"),
      global: false
    })
    setInstalling(false)

    if (res.success) {
      setAlert({ type: "success", message: `Installed ${item.name} successfully` })
      loadData()
    } else {
      setAlert({ type: "error", message: res.error || `Failed to install ${item.name}` })
    }
  }

  const handleUninstall = async (plugin: PluginInfo) => {
    if (!window.confirm(`Are you sure you want to uninstall "${plugin.name}"?`)) return

    const res = await removePlugin(plugin.id)
    if (res.success) {
      setAlert({ type: "success", message: `Uninstalled ${plugin.name}` })
      loadData()
    } else {
      setAlert({ type: "error", message: res.error || "Failed to uninstall plugin" })
    }
  }

  const handlePluginRated = (id: string, score: number) => {
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, userRating: score } : p))
    setAlert({ type: "success", message: "Thank you! Your rating has been recorded." })
  }

  const filteredInstalled = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let list = plugins.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.cli?.command && p.cli.command.toLowerCase().includes(q))
    )

    if (sortBy === "rating") {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    } else if (sortBy === "reviews") {
      list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [plugins, searchQuery, sortBy])

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let list = catalog.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    )

    if (sortBy === "rating") {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    } else if (sortBy === "reviews") {
      list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [catalog, searchQuery, sortBy])

  return (
    <div style={{ padding: "32px 40px", maxWidth: "1280px", margin: "0 auto", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "700", margin: 0, letterSpacing: "-0.02em" }}>
              Plugins & Extensions
            </h1>
            <span style={{ 
              background: "var(--accent-muted)", 
              color: "var(--accent-hover)", 
              fontSize: "12px", 
              fontWeight: "600", 
              padding: "3px 10px", 
              borderRadius: "20px",
              border: "1px solid var(--border-accent)" 
            }}>
              {plugins.length} Installed
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
            Modular autonomous engines, scholarly daemons, and custom SSSS graph schemas extending your Total Recall brain.
          </p>
        </div>

        <button
          onClick={() => { setInstallModalOpen(true); setAlert(null); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 4px 14px var(--accent-glow)",
            transition: "all 0.15s ease"
          }}
          onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
          onMouseOut={(e) => (e.currentTarget.style.filter = "brightness(1.0)")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Install Plugin
        </button>
      </div>

      {/* Alert Banner */}
      {alert && (
        <div style={{
          padding: "12px 18px",
          borderRadius: "var(--radius-md)",
          marginBottom: "24px",
          fontSize: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: alert.type === "success" ? "var(--success-muted)" : "var(--error-muted)",
          border: `1px solid ${alert.type === "success" ? "var(--success)" : "var(--error)"}`,
          color: alert.type === "success" ? "var(--success)" : "var(--error)"
        }}>
          <span>{alert.message}</span>
          <button 
            onClick={() => setAlert(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs, Search & Sort Bar */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        borderBottom: "1px solid var(--border)", 
        paddingBottom: "16px",
        marginBottom: "24px",
        gap: "16px",
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setActiveTab("installed")}
            style={{
              background: activeTab === "installed" ? "var(--bg-elevated)" : "transparent",
              color: activeTab === "installed" ? "var(--text-primary)" : "var(--text-secondary)",
              border: activeTab === "installed" ? "1px solid var(--border-accent)" : "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>Installed</span>
            <span style={{ 
              background: "var(--bg-tertiary)", 
              padding: "2px 7px", 
              borderRadius: "10px", 
              fontSize: "12px",
              color: "var(--text-tertiary)"
            }}>
              {plugins.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("catalog")}
            style={{
              background: activeTab === "catalog" ? "var(--bg-elevated)" : "transparent",
              color: activeTab === "catalog" ? "var(--text-primary)" : "var(--text-secondary)",
              border: activeTab === "catalog" ? "1px solid var(--border-accent)" : "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>Discover Catalog</span>
            <span style={{ 
              background: "var(--accent-muted)", 
              color: "var(--accent-hover)", 
              padding: "2px 7px", 
              borderRadius: "10px", 
              fontSize: "12px" 
            }}>
              {catalog.length}
            </span>
          </button>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                padding: "6px 10px",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="rating">Highest Rated</option>
              <option value="reviews">Most Reviews</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>

          <div style={{ position: "relative", minWidth: "260px" }}>
            <input
              type="text"
              placeholder={activeTab === "installed" ? "Filter installed..." : "Search catalog..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 14px 8px 36px",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none"
              }}
            />
            <svg 
              width="15" 
              height="15" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="var(--text-tertiary)" 
              strokeWidth="2" 
              style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
          Loading plugins...
        </div>
      ) : activeTab === "installed" ? (
        filteredInstalled.length === 0 ? (
          <div style={{
            padding: "60px 20px",
            textAlign: "center",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--border)"
          }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🧩</div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>No Plugins Found</h3>
            <p style={{ margin: "0 0 20px 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              {searchQuery ? "No installed plugins match your search filter." : "You do not have any plugins installed in this brain."}
            </p>
            <button
              onClick={() => setActiveTab("catalog")}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-accent)",
                color: "var(--accent-hover)",
                padding: "8px 18px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px"
              }}
            >
              Browse Discovery Catalog
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "20px" }}>
            {filteredInstalled.map((p) => (
              <div 
                key={p.id}
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "8px",
                        background: "var(--accent-muted)",
                        color: "var(--accent-hover)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px"
                      }}>
                        🧩
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{p.name}</h3>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          {p.id}
                        </span>
                      </div>
                    </div>

                    <span style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: p.valid ? "var(--success-muted)" : "var(--error-muted)",
                      color: p.valid ? "var(--success)" : "var(--error)",
                      border: `1px solid ${p.valid ? "rgba(52, 211, 153, 0.2)" : "rgba(248, 113, 113, 0.2)"}`
                    }}>
                      v{p.version}
                    </span>
                  </div>

                  {/* Rating & Installs */}
                  <div style={{ marginBottom: "12px" }}>
                    <StarRatingDisplay 
                      rating={p.rating || 4.9} 
                      reviewCount={p.reviewCount || 1} 
                      installCount={p.installCount || "1k"} 
                    />
                  </div>

                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    {p.description}
                  </p>

                  {/* Badges / Features */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                    {p.cli?.command && (
                      <span style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px"
                      }}>
                        cli: total-recall {p.cli.command}
                      </span>
                    )}
                    {p.categories?.length > 0 && (
                      <span style={{
                        background: "var(--accent-muted)",
                        color: "var(--accent-hover)",
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px"
                      }}>
                        {p.categories.length} SSSS schemas
                      </span>
                    )}
                    {p.tasks?.length > 0 && (
                      <span style={{
                        background: "var(--bg-elevated)",
                        color: "var(--text-secondary)",
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px"
                      }}>
                        {p.tasks.length} tasks
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {/* User Rating Widget */}
                  <div style={{ 
                    background: "var(--bg-primary)", 
                    borderRadius: "var(--radius-sm)", 
                    padding: "8px 12px", 
                    marginBottom: "14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <InteractiveRater 
                      pluginId={p.id} 
                      currentRating={p.userRating} 
                      onRated={(score) => handlePluginRated(p.id, score)} 
                    />
                  </div>

                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    borderTop: "1px solid var(--border)", 
                    paddingTop: "14px" 
                  }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setManifestModalPlugin(p)}
                        style={{
                          background: "none",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "12px",
                          cursor: "pointer"
                        }}
                      >
                        Manifest
                      </button>
                      <Link
                        to={`/openwiki?plugin=${encodeURIComponent(p.id)}`}
                        style={{
                          background: "none",
                          border: "1px solid var(--border-accent)",
                          color: "var(--accent-hover)",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 10px",
                          fontSize: "12px",
                          textDecoration: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        Docs →
                      </Link>
                    </div>

                    <button
                      onClick={() => handleUninstall(p)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--error)",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: "5px 8px",
                        borderRadius: "var(--radius-sm)"
                      }}
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Catalog View */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "20px" }}>
          {filteredCatalog.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{item.name}</h3>
                      {item.verified && (
                        <span title="Verified Plugin" style={{ color: "var(--accent)", fontSize: "14px" }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {item.id} • by {item.author}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>
                    v{item.version}
                  </span>
                </div>

                {/* Rating display */}
                <div style={{ marginBottom: "12px" }}>
                  <StarRatingDisplay 
                    rating={item.rating} 
                    reviewCount={item.reviewCount} 
                    installCount={item.installCount} 
                  />
                </div>

                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                  {item.description}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
                  {item.tags.map((tag) => (
                    <span key={tag} style={{
                      background: "var(--bg-elevated)",
                      color: "var(--text-tertiary)",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "4px"
                    }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                {item.isInstalled ? (
                  <span style={{
                    color: "var(--success)",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}>
                    ✓ Installed
                  </span>
                ) : (
                  <button
                    disabled={installing}
                    onClick={() => handleCatalogInstall(item)}
                    style={{
                      background: "var(--accent)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "7px 16px",
                      fontSize: "13px",
                      fontWeight: "600",
                      cursor: installing ? "not-allowed" : "pointer"
                    }}
                  >
                    {installing ? "Installing..." : "Install"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Install Plugin Modal */}
      {installModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-accent)",
            borderRadius: "var(--radius-xl)",
            padding: "32px",
            width: "100%",
            maxWidth: "520px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
          }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: "700" }}>Install Plugin</h2>
            <p style={{ margin: "0 0 24px 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              Install a plugin from a local directory path or Git repository URL.
            </p>

            <form onSubmit={handleInstallSubmit}>
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-secondary)" }}>
                  Source (Local Directory or Git URL)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ./.agent/plugins/my-plugin or https://github.com/..."
                  value={installSource}
                  onChange={(e) => setInstallSource(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 14px",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={installLink}
                    onChange={(e) => setInstallLink(e.target.checked)}
                  />
                  <span>Link as Symlink (development mode — live edits sync without reinstalling)</span>
                </label>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={installGlobal}
                    onChange={(e) => setInstallGlobal(e.target.checked)}
                  />
                  <span>Install Globally (~/.agent/plugins across all projects)</span>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setInstallModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={installing || !installSource.trim()}
                  style={{
                    background: "var(--accent)",
                    border: "none",
                    color: "#ffffff",
                    padding: "8px 20px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: installing ? "not-allowed" : "pointer"
                  }}
                >
                  {installing ? "Installing..." : "Install Plugin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manifest Modal */}
      {manifestModalPlugin && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-accent)",
            borderRadius: "var(--radius-xl)",
            padding: "28px",
            width: "100%",
            maxWidth: "680px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>
                Manifest: {manifestModalPlugin.name} ({manifestModalPlugin.id})
              </h2>
              <button
                onClick={() => setManifestModalPlugin(null)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "20px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <pre style={{
              flex: 1,
              overflow: "auto",
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              color: "var(--accent-hover)",
              margin: 0
            }}>
              {JSON.stringify(manifestModalPlugin.manifest || manifestModalPlugin, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
