import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { listMemory, searchMemory, readMemory, fetchConflicts, resolveConflict, saveMemory, createMemory, deleteMemory } from "../api"
import type { MemoryNode } from "../types"

const CATEGORIES = [
  "all", "invariants", "preferences", "anti-patterns", "patterns",
  "decisions", "concepts", "facts", "lore"
]

function renderMarkdown(md: string) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  
  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, "<pre style=\"background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);font-family:monospace;overflow-x:auto;\"><code>$1</code></pre>");
  html = html.replace(/`(.*?)`/g, "<code style=\"background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-family:monospace;\">$1</code>");
  
  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, "<blockquote style=\"border-left:4px solid var(--purple-primary);padding-left:14px;color:var(--text-secondary);margin:16px 0;font-style:italic;\">$1</blockquote>");
  
  // Lists
  html = html.replace(/^\- (.*$)/gim, "<li style=\"margin-left:20px;list-style-type:disc;\">$1</li>");
  
  // Linebreaks
  html = html.replace(/\n/g, "<br />");
  
  return <div dangerouslySetInnerHTML={{ __html: html }} className="markdown-preview-block" />;
}

function markdownToHtml(md: string): string {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  
  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  
  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");
  
  // Lists
  html = html.replace(/^\- (.*$)/gim, "<li>$1</li>");
  
  // Newlines
  html = html.replace(/\n/g, "<br />");
  
  return html;
}

function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let md = html;
  
  // Replace <br> and <br /> with newline
  md = md.replace(/<br\s*\/?>/gi, "\n");
  
  // Headings
  md = md.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n");
  md = md.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n");
  md = md.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n");
  
  // Bold & Italic
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  
  // Blockquotes
  md = md.replace(/<blockquote>(.*?)<\/blockquote>/gi, "> $1\n");
  
  // Lists
  md = md.replace(/<li>(.*?)<\/li>/gi, "- $1\n");
  
  // Clean up any remaining HTML tags safely
  md = md.replace(/<[^>]+>/g, "");
  
  // Decode HTML entities
  md = md
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
    
  return md.trim();
}

export default function MemoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSlug = searchParams.get("slug")

  const [activeTab, setActiveTab] = useState<"vault" | "conflicts">("vault")
  const [nodes, setNodes] = useState<MemoryNode[]>([])
  const [selected, setSelected] = useState<MemoryNode | null>(null)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Conflicts state
  const [conflicts, setConflicts] = useState<any[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Rich inline editing states
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editSlug, setEditSlug] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editCategory, setEditCategory] = useState("invariants")
  const [editContent, setEditContent] = useState("")
  const [editStatus, setEditStatus] = useState("active")
  const [editPriority, setEditPriority] = useState("low")
  const [editModality, setEditModality] = useState("should")
  const [editConfidence, setEditConfidence] = useState(1.0)
  const [editImportance, setEditImportance] = useState(3)
  const [editTags, setEditTags] = useState("")
  const [editRelated, setEditRelated] = useState("")
  const [editContradicts, setEditContradicts] = useState("")
  const [editSupersedes, setEditSupersedes] = useState("")

  const editorRef = useRef<HTMLDivElement>(null)

  const execCommand = (command: string, value: string = "") => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    if (editorRef.current) {
      setEditContent(htmlToMarkdown(editorRef.current.innerHTML))
    }
  }

  useEffect(() => {
    if ((isEditing || isCreating) && editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(editContent)
    }
  }, [isEditing, isCreating])

  const fetchNodes = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (query.trim()) {
        const results = await searchMemory(query, category === "all" ? undefined : category)
        setNodes(results)
      } else {
        const results = await listMemory(category === "all" ? undefined : category)
        setNodes(results)
      }
    } catch (e) {
      setError((e as Error).message)
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [category, query])

  // Set edit state when selected changes
  useEffect(() => {
    if (selected) {
      setEditSlug(selected.slug || "")
      setEditTitle(selected.title || "")
      setEditCategory(selected.category || "invariants")
      setEditContent(selected.content || selected.body || "")
      setEditStatus(selected.status || "active")
      setEditPriority(selected.priority || "low")
      setEditModality(selected.modality || "should")
      setEditConfidence(selected.confidence ?? 1.0)
      setEditImportance(selected.importance ?? 3)
      setEditTags((selected.tags || []).join(", "))
      setEditRelated((selected.related || []).join(", "))
      setEditContradicts((selected.contradicts || []).join(", "))
      setEditSupersedes((selected.supersedes || []).join(", "))
    }
  }, [selected])

  const handleSave = async () => {
    if (!selected) return
    setLoading(true)
    setError("")
    try {
      const tagsArr = editTags.split(",").map(t => t.trim()).filter(Boolean)
      const relatedArr = editRelated.split(",").map(t => t.trim()).filter(Boolean)
      const contradictsArr = editContradicts.split(",").map(t => t.trim()).filter(Boolean)
      const supersedesArr = editSupersedes.split(",").map(t => t.trim()).filter(Boolean)

      const updated = await saveMemory(selected.slug, {
        title: editTitle,
        category: editCategory,
        content: editContent,
        status: editStatus,
        priority: editPriority,
        modality: editModality,
        confidence: editConfidence,
        importance: editImportance,
        tags: tagsArr,
        related: relatedArr,
        contradicts: contradictsArr,
        supersedes: supersedesArr
      })
      setSelected(updated)
      setIsEditing(false)
      fetchNodes()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!editSlug.trim() || !editTitle.trim() || !editContent.trim()) {
      setError("Slug, Title, and Content are required fields.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const tagsArr = editTags.split(",").map(t => t.trim()).filter(Boolean)
      const relatedArr = editRelated.split(",").map(t => t.trim()).filter(Boolean)
      const contradictsArr = editContradicts.split(",").map(t => t.trim()).filter(Boolean)
      const supersedesArr = editSupersedes.split(",").map(t => t.trim()).filter(Boolean)

      const created = await createMemory({
        slug: editSlug,
        title: editTitle,
        category: editCategory,
        content: editContent,
        status: editStatus,
        priority: editPriority,
        modality: editModality,
        confidence: editConfidence,
        importance: editImportance,
        tags: tagsArr,
        related: relatedArr,
        contradicts: contradictsArr,
        supersedes: supersedesArr
      })
      setIsCreating(false)
      setSelected(created)
      setSearchParams({ slug: created.slug })
      fetchNodes()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (slug: string) => {
    if (!window.confirm(`Are you sure you want to delete memory node "${slug}"?`)) return
    setLoading(true)
    setError("")
    try {
      await deleteMemory(slug)
      setSelected(null)
      setSearchParams({})
      fetchNodes()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const fetchConflictsList = useCallback(async () => {
    try {
      const res = await fetchConflicts()
      setConflicts(res.conflicts || [])
    } catch (e) {
      console.warn("Conflicts API error (enhanced features might be disabled):", e)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(fetchNodes, 300)
    return () => clearTimeout(timer)
  }, [fetchNodes])

  useEffect(() => {
    if (activeTab === "conflicts") {
      fetchConflictsList()
    }
  }, [activeTab, fetchConflictsList])

  useEffect(() => {
    if (urlSlug) {
      const loadUrlSlug = async () => {
        setLoading(true)
        setError("")
        try {
          const full = await readMemory(urlSlug)
          setSelected(full)
        } catch (e) {
          setError(`Failed to load memory node '${urlSlug}': ${(e as Error).message}`)
          setSelected(null)
        } finally {
          setLoading(false)
        }
      }
      loadUrlSlug()
    } else {
      setSelected(null)
    }
  }, [urlSlug])

  // Wire SSE Live Agent Monitor Streaming (Port 9111)
  useEffect(() => {
    const sseUrl = "http://localhost:9111/stream"
    const eventSource = new EventSource(sseUrl)

    eventSource.onmessage = (event) => {
      try {
        const logEntry = JSON.parse(event.data)
        // If a conflict-detector log, memory ingestion, or surface rebuild log arrives, hot-refresh!
        if (
          logEntry.subsystem === "conflict-detector" || 
          logEntry.subsystem === "rebuild" || 
          logEntry.subsystem === "session-watcher"
        ) {
          fetchNodes()
          fetchConflictsList()
        }
      } catch (err) {
        // ignore
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [fetchNodes, fetchConflictsList])

  const handleSelect = (node: MemoryNode) => {
    setSearchParams({ slug: node.slug })
  }

  const handleResolveConflict = async (conflictId: string, action: "keep" | "supersede", winnerSlug: string) => {
    setResolvingId(conflictId)
    setError("")
    try {
      await resolveConflict(conflictId, action, winnerSlug)
      await fetchConflictsList()
      await fetchNodes()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setResolvingId(null)
    }
  }

  const renderEditorForm = (onSubmit: () => void, onCancel: () => void, isNew: boolean) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Form fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Slug (kebab-case, matches filename)</label>
              <input
                type="text"
                placeholder="e.g. prefer-atomic-writes"
                value={editSlug}
                onChange={e => setEditSlug(e.target.value)}
                disabled={!isNew}
                style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Title (One-line description)</label>
              <input
                type="text"
                placeholder="e.g. Always write files atomically (write-then-rename)"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Category</label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  style={{ width: "100%", background: "rgba(15,23,42,0.9)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
                >
                  <option value="invariants">invariants</option>
                  <option value="patterns">patterns</option>
                  <option value="anti-patterns">anti-patterns</option>
                  <option value="preferences">preferences</option>
                  <option value="decisions">decisions</option>
                  <option value="concepts">concepts</option>
                  <option value="facts">facts</option>
                  <option value="lore">lore</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Modality</label>
                <select
                  value={editModality}
                  onChange={e => setEditModality(e.target.value)}
                  style={{ width: "100%", background: "rgba(15,23,42,0.9)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
                >
                  <option value="must">must</option>
                  <option value="must_not">must_not</option>
                  <option value="should">should</option>
                  <option value="should_not">should_not</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  style={{ width: "100%", background: "rgba(15,23,42,0.9)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                  <option value="deprecated">deprecated</option>
                  <option value="superseded">superseded</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Importance (1-5 Stars)</label>
                <select
                  value={editImportance}
                  onChange={e => setEditImportance(Number(e.target.value))}
                  style={{ width: "100%", background: "rgba(15,23,42,0.9)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
                >
                  <option value={1}>★ 1/5</option>
                  <option value={2}>★★ 2/5</option>
                  <option value={3}>★★★ 3/5</option>
                  <option value={4}>★★★★ 4/5</option>
                  <option value={5}>★★★★★ 5/5</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                Confidence: <strong>{Math.round(editConfidence * 100)}%</strong>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={editConfidence}
                onChange={e => setEditConfidence(Number(e.target.value))}
                style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Tags (comma separated)</label>
              <input
                type="text"
                placeholder="e.g. filesystem, reliability, writes"
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
              />
            </div>
          </div>
        </div>

        {/* Semantic Relationships */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Related Nodes (comma separated slugs)</label>
            <input
              type="text"
              placeholder="e.g. use-atomic-writes, git-wiping"
              value={editRelated}
              onChange={e => setEditRelated(e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Contradicts Nodes (comma separated slugs)</label>
            <input
              type="text"
              placeholder="e.g. write-anywhere-sync"
              value={editContradicts}
              onChange={e => setEditContradicts(e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Supersedes Nodes (comma separated slugs)</label>
            <input
              type="text"
              placeholder="e.g. prefer-atomic-writes-v1"
              value={editSupersedes}
              onChange={e => setEditSupersedes(e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "#fff" }}
            />
          </div>
        </div>

        {/* WYSIWYG visual HTML Editor - NO RAW CODE PREVIEW! EDIT Styled preview DIRECTLY */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visual WYSIWYG Memory Content Editor</label>
          <div style={{ background: "rgba(10,15,30,0.5)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {/* Rich Formatting Toolbar */}
            <div style={{ display: "flex", gap: 8, padding: 8, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("bold")} style={{ fontWeight: "bold", padding: "4px 10px" }}>B</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("italic")} style={{ fontStyle: "italic", padding: "4px 10px" }}>I</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("formatBlock", "<h1>")} style={{ padding: "4px 8px" }}>H1</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("formatBlock", "<h2>")} style={{ padding: "4px 8px" }}>H2</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("formatBlock", "<blockquote>")} style={{ padding: "4px 8px" }}>“ Quote</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("insertUnorderedList")} style={{ padding: "4px 8px" }}>• List</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => execCommand("removeFormat")} style={{ padding: "4px 8px", fontSize: 11 }}>Clear</button>
            </div>
            
            {/* Direct contentEditable Editor Pane */}
            <div
              ref={editorRef}
              contentEditable
              onInput={() => {
                if (editorRef.current) {
                  setEditContent(htmlToMarkdown(editorRef.current.innerHTML))
                }
              }}
              style={{ 
                minHeight: 300, 
                padding: 16, 
                color: "#fff", 
                background: "#090d16", 
                outline: "none", 
                fontSize: 14, 
                lineHeight: 1.6,
                overflowY: "auto"
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
          <button className="btn btn-ghost" type="button" onClick={onCancel} style={{ fontSize: 13 }}>Cancel</button>
          <button className="btn btn-purple" type="button" onClick={onSubmit} style={{ fontSize: 13 }}>
            {isNew ? "🚀 Create Memory Node" : "💾 Save Changes"}
          </button>
        </div>
      </div>
    )
  }

  const categoryCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] || 0) + 1
    return acc
  }, {})

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1>Memory Vault</h1>
          <p>Browse, audit, and resolve contradictions in your SSSS knowledge graph</p>
        </div>
        
        {/* Tab Selection */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
          <button 
            className={`btn btn-sm ${activeTab === "vault" ? "btn-purple" : "btn-ghost"}`}
            onClick={() => { setActiveTab("vault"); setSelected(null); setSearchParams({}); }}
            style={{ borderRadius: 6, fontSize: 12, padding: "6px 12px" }}
          >
            🧠 Active Nodes
          </button>
          <button 
            className={`btn btn-sm ${activeTab === "conflicts" ? "btn-cyan" : "btn-ghost"}`}
            onClick={() => { setActiveTab("conflicts"); setSelected(null); setSearchParams({}); }}
            style={{ borderRadius: 6, fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}
          >
            ⚠️ Quarantined Conflicts
            {conflicts.length > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 10, fontWeight: 700 }}>
                {conflicts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {error && <div className="badge badge-error" style={{ alignSelf: "flex-start", marginBottom: 15 }}>⚠️ {error}</div>}

      {activeTab === "vault" ? (
        <div className="memory-layout">
          <div className="memory-sidebar">
            <h3 style={{ margin: "0 0 12px 0" }}>Categories</h3>
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`category-btn ${category === c ? "active" : ""}`}
                onClick={() => { setCategory(c); setSearchParams({}); setIsCreating(false); setIsEditing(false); }}
              >
                <span>{c === "all" ? "📋 All Nodes" : c}</span>
                {c === "all"
                  ? <span className="category-count">{nodes.length}</span>
                  : categoryCounts[c]
                    ? <span className="category-count">{categoryCounts[c]}</span>
                    : null
                }
              </button>
            ))}
            
            <button
              className="btn btn-purple"
              style={{ width: "100%", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13 }}
              onClick={() => {
                setSelected(null);
                setSearchParams({});
                setIsCreating(true);
                setIsEditing(false);
                setEditSlug("");
                setEditTitle("");
                setEditCategory("invariants");
                setEditContent("");
                setEditStatus("active");
                setEditPriority("low");
                setEditModality("should");
                setEditConfidence(1.0);
                setEditImportance(3);
                setEditTags("");
                setEditRelated("");
                setEditContradicts("");
                setEditSupersedes("");
              }}
            >
              ➕ Create New Node
            </button>
          </div>
          <div className="memory-main">
            <div className="memory-search">
              <input
                id="memory-search"
                type="text"
                placeholder="Search memory nodes…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" onClick={fetchNodes}>Refresh</button>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)}
              </div>
            ) : isCreating ? (
              <div className="memory-detail" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{ margin: 0, color: "#fff" }}>Create New SSSS Memory Node</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsCreating(false)} style={{ fontSize: 12 }}>← Back to List</button>
                </div>
                {renderEditorForm(handleCreate, () => setIsCreating(false), true)}
              </div>
            ) : selected && isEditing ? (
              <div className="memory-detail" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{ margin: 0, color: "#fff" }}>Edit Memory Node</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)} style={{ fontSize: 12 }}>← Cancel Edit</button>
                </div>
                {renderEditorForm(handleSave, () => setIsEditing(false), false)}
              </div>
            ) : selected ? (
              <div className="memory-detail" style={{
                background: "rgba(15,23,42,0.45)", 
                backdropFilter: "blur(12px)",
                border: selected.modality === "must" 
                  ? "2px solid #10b981" 
                  : selected.modality === "must_not" 
                    ? "2px solid #ef4444" 
                    : selected.modality === "should" 
                      ? "1px solid #8b5cf6" 
                      : selected.modality === "should_not" 
                        ? "1px solid #f97316" 
                        : "1px solid var(--border)",
                boxShadow: selected.modality === "must" 
                  ? "0 0 16px rgba(16, 185, 129, 0.1)" 
                  : selected.modality === "must_not" 
                    ? "0 0 16px rgba(239, 68, 68, 0.1)" 
                    : undefined,
                borderRadius: 12,
                padding: 24,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})} style={{ fontSize: 12 }}>← Back to List</button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      onClick={() => {
                        setEditSlug(selected.slug || "");
                        setEditTitle(selected.title || "");
                        setEditCategory(selected.category || "invariants");
                        setEditContent(selected.content || selected.body || "");
                        setEditStatus(selected.status || "active");
                        setEditPriority(selected.priority || "low");
                        setEditModality(selected.modality || "should");
                        setEditConfidence(selected.confidence ?? 1.0);
                        setEditImportance(selected.importance ?? 3);
                        setEditTags((selected.tags || []).join(", "));
                        setEditRelated((selected.related || []).join(", "));
                        setEditContradicts((selected.contradicts || []).join(", "));
                        setEditSupersedes((selected.supersedes || []).join(", "));
                        setIsEditing(true);
                      }} 
                      style={{ fontSize: 12, border: "1px solid var(--border)" }}
                    >
                      ✏️ Edit Node
                    </button>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      onClick={() => handleDelete(selected.slug)} 
                      style={{ fontSize: 12, borderColor: "rgba(239,68,68,0.2)", color: "#fca5a5" }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ margin: 0, color: "#fff" }}>{selected.title}</h2>
                  {selected.modality && (
                    <span style={{ 
                      fontSize: 10, 
                      fontWeight: 700, 
                      textTransform: "uppercase", 
                      padding: "4px 10px", 
                      borderRadius: 6,
                      background: selected.modality === "must" 
                        ? "rgba(16, 185, 129, 0.15)" 
                        : selected.modality === "must_not" 
                          ? "rgba(239, 68, 68, 0.15)" 
                          : "rgba(255, 255, 255, 0.05)",
                      color: selected.modality === "must" 
                        ? "#10b981" 
                        : selected.modality === "must_not" 
                          ? "#ef4444" 
                          : "var(--text-secondary)",
                      border: selected.modality === "must" 
                        ? "1px solid rgba(16, 185, 129, 0.3)" 
                        : selected.modality === "must_not" 
                          ? "1px solid rgba(239, 68, 68, 0.3)" 
                          : "1px solid rgba(255, 255, 255, 0.1)"
                    }}>
                      {selected.modality}
                    </span>
                  )}
                </div>

                <dl className="frontmatter" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px 20px", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Slug</dt>
                  <dd style={{ margin: 0 }}><code>{selected.slug}</code></dd>

                  <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Category</dt>
                  <dd style={{ margin: 0, textTransform: "capitalize" }}>{selected.category}</dd>

                  {selected.status && (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Status</dt>
                      <dd style={{ margin: 0 }}>
                        <span className="badge badge-success" style={{ background: selected.status === "active" ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.05)", color: selected.status === "active" ? "#22c55e" : "var(--text-secondary)" }}>
                          {selected.status}
                        </span>
                      </dd>
                    </>
                  )}

                  {selected.confidence !== undefined && (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Confidence</dt>
                      <dd style={{ margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
                        <strong style={{ fontSize: 13 }}>{Math.round(selected.confidence * 100)}%</strong>
                        <div style={{ flex: 1, maxWidth: 150, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
                          <div style={{ width: `${Math.round(selected.confidence * 100)}%`, height: "100%", background: "linear-gradient(90deg, #8b5cf6, #06b6d4)", borderRadius: 3 }} />
                        </div>
                      </dd>
                    </>
                  )}

                  {selected.importance !== undefined && (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Importance</dt>
                      <dd style={{ margin: 0, color: "#fbbf24", display: "flex", gap: 2 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < (selected.importance || 0) ? "★" : "☆"}</span>
                        ))}
                      </dd>
                    </>
                  )}

                  {selected.tags?.length ? (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Tags</dt>
                      <dd style={{ margin: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {selected.tags.map(t => (
                          <span key={t} style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.03)" }}>
                            {t}
                          </span>
                        ))}
                      </dd>
                    </>
                  ) : null}

                  {selected.related?.length ? (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Related</dt>
                      <dd style={{ margin: 0 }}><code>{selected.related.join(", ")}</code></dd>
                    </>
                  ) : null}

                  {selected.contradicts?.length ? (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Contradicts</dt>
                      <dd style={{ margin: 0, color: "#fca5a5" }}><code>{selected.contradicts.join(", ")}</code></dd>
                    </>
                  ) : null}

                  {selected.supersedes?.length ? (
                    <>
                      <dt style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Supersedes</dt>
                      <dd style={{ margin: 0, color: "#93c5fd" }}><code>{selected.supersedes.join(", ")}</code></dd>
                    </>
                  ) : null}
                </dl>

                <div style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-tertiary)", letterSpacing: 0.5, marginBottom: 12 }}>Memory Content (SSSS Body)</h3>
                  <div style={{ background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: 20 }}>
                    {renderMarkdown(selected.body || selected.content || "")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="memory-list" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {nodes.length === 0 && !loading && (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                    {query ? "No matching nodes found." : "No memory nodes loaded. Is the backend running?"}
                  </div>
                )}
                {nodes.map(n => {
                  const borderStyle = n.modality === "must" 
                    ? "2px solid #10b981" 
                    : n.modality === "must_not" 
                      ? "2px solid #ef4444" 
                      : n.modality === "should" 
                        ? "1px solid #8b5cf6" 
                        : n.modality === "should_not" 
                          ? "1px solid #f97316" 
                          : "1px solid rgba(255, 255, 255, 0.08)";
                  
                  const glowStyle = n.modality === "must" 
                    ? "0 0 12px rgba(16, 185, 129, 0.15)" 
                    : n.modality === "must_not" 
                      ? "0 0 12px rgba(239, 68, 68, 0.15)" 
                      : undefined;

                  return (
                    <div 
                      key={n.slug} 
                      className="memory-node-card" 
                      onClick={() => handleSelect(n)}
                      style={{ 
                        border: borderStyle, 
                        boxShadow: glowStyle,
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        position: "relative"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <h4 style={{ margin: 0, color: "#fff", fontSize: 15 }}>{n.title}</h4>
                        {n.modality && (
                          <span style={{ 
                            fontSize: 9, 
                            fontWeight: 700, 
                            textTransform: "uppercase", 
                            padding: "2px 6px", 
                            borderRadius: 4,
                            background: n.modality === "must" 
                              ? "rgba(16, 185, 129, 0.15)" 
                              : n.modality === "must_not" 
                                ? "rgba(239, 68, 68, 0.15)" 
                                : "rgba(255, 255, 255, 0.05)",
                            color: n.modality === "must" 
                              ? "#10b981" 
                              : n.modality === "must_not" 
                                ? "#ef4444" 
                                : "var(--text-secondary)"
                          }}>
                            {n.modality}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                        <span>📂 {n.category}</span>
                        {n.importance !== undefined && (
                          <span style={{ color: "#fbbf24" }}>★ {n.importance}/5</span>
                        )}
                        {n.confidence !== undefined && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            🧠 {Math.round(n.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        // SSE-driven Quarantined Conflicts override panel
        <div style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3>Quarantined Contradiction Records</h3>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
              <span className="pulse" style={{ background: "#06b6d4" }} /> SSE Real-time Agent Monitor Connected
            </span>
          </div>

          {conflicts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px dashed var(--border)", color: "var(--text-tertiary)" }}>
              <span style={{ fontSize: 32, display: "block", marginBottom: 12 }}>🛡️</span>
              <h4 style={{ color: "#fff", marginBottom: 6 }}>All Clear!</h4>
              No memory conflicts enqueued or quarantined in `.agent/memory-inbox/conflicts/`.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {conflicts.map((c) => {
                const isQuarantined = c.status === "pending" || c.status === "quarantined";
                
                return (
                  <div 
                    key={c.conflict_id} 
                    style={{ 
                      background: "rgba(15,23,42,0.45)", 
                      backdropFilter: "blur(12px)",
                      border: isQuarantined ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(34, 197, 94, 0.2)",
                      borderRadius: 12,
                      padding: 24,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.15)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 16, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                          Conflict: <code>{c.conflict_id}</code>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isQuarantined ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: isQuarantined ? "#ef4444" : "#22c55e", textTransform: "uppercase" }}>
                            {c.status}
                          </span>
                        </h4>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Detected at: {new Date(c.detected_at).toLocaleString()}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, display: "block" }}>
                          Clash Similarity: {Math.round(c.similarity * 100)}%
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Modality polarity flip</span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, background: "rgba(239,68,68,0.03)", padding: "10px 14px", borderRadius: 6, borderLeft: "3px solid #ef4444", color: "#fca5a5", marginBottom: 20 }}>
                      <strong>Reason:</strong> {c.reason}
                    </p>

                    {/* Nodes Comparison Table */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                      {/* Existing Node */}
                      <div style={{ background: "rgba(255,255,255,0.02)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <h5 style={{ margin: "0 0 10px 0", color: "#a78bfa", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>✓ Existing Node In Vault</h5>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}><code>{c.existing_slug}</code></div>
                        <dl style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 4, margin: "0 0 12px 0", fontSize: 11, color: "var(--text-secondary)" }}>
                          <dt>Modality:</dt><dd><code>{c._existing_node?.modality || "must"}</code></dd>
                          <dt>Polarity:</dt><dd><code>{c._existing_node?.sentiment_polarity || "directive_must"}</code></dd>
                          <dt>Confidence:</dt><dd>{c._existing_node?.confidence !== undefined ? `${Math.round(c._existing_node.confidence * 100)}%` : "N/A"}</dd>
                        </dl>
                        <div style={{ fontSize: 12, fontStyle: "italic", background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 6, color: "var(--text-tertiary)", minHeight: 60, whiteSpace: "pre-wrap" }}>
                          {c._existing_node?.excerpt || c._existing_node?.body || "No preview content."}
                        </div>
                      </div>

                      {/* Candidate Node */}
                      <div style={{ background: "rgba(255,255,255,0.02)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <h5 style={{ margin: "0 0 10px 0", color: "#06b6d4", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>⚠ New Ingestion Candidate</h5>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}><code>{c.new_slug}</code></div>
                        <dl style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 4, margin: "0 0 12px 0", fontSize: 11, color: "var(--text-secondary)" }}>
                          <dt>Modality:</dt><dd><code>{c._new_node?.modality || "must_not"}</code></dd>
                          <dt>Polarity:</dt><dd><code>{c._new_node?.sentiment_polarity || "directive_must_not"}</code></dd>
                          <dt>Confidence:</dt><dd>{c._new_node?.confidence !== undefined ? `${Math.round(c._new_node.confidence * 100)}%` : "N/A"}</dd>
                        </dl>
                        <div style={{ fontSize: 12, fontStyle: "italic", background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 6, color: "var(--text-tertiary)", minHeight: 60, whiteSpace: "pre-wrap" }}>
                          {c._new_node?.excerpt || c._new_node?.body || "No preview content."}
                        </div>
                      </div>
                    </div>

                    {/* Resolution Actions */}
                    {isQuarantined ? (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={resolvingId !== null}
                          onClick={() => handleResolveConflict(c.conflict_id, "keep", c.existing_slug)}
                          style={{ borderColor: "rgba(255,255,255,0.1)", fontSize: 12 }}
                        >
                          {resolvingId === c.conflict_id ? "Processing..." : `Keep Existing Node (${c.existing_slug})`}
                        </button>
                        <button
                          className="btn btn-purple btn-sm"
                          disabled={resolvingId !== null}
                          onClick={() => handleResolveConflict(c.conflict_id, "supersede", c.new_slug)}
                          style={{ fontSize: 12 }}
                        >
                          {resolvingId === c.conflict_id ? "Processing..." : `Supersede with New (${c.new_slug})`}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#22c55e", background: "rgba(34,197,94,0.06)", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(34,197,94,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>✓ Resolved successfully. Choice: <strong>{c.resolution}</strong></span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Resolved at: {new Date(c.resolved_at).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
