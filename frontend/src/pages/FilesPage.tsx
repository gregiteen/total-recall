import { useState, useEffect, useCallback } from "react"
import { listFiles, listSkills, listScripts, readScript, saveScript, runScript } from "../api"
import type { FileNode, ScriptFile } from "../types"

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export default function FilesPage() {
  const [activeTab, setActiveTab] = useState<"files" | "skills" | "scripts">("files")
  const [files, setFiles] = useState<FileNode[]>([])
  const [skills, setSkills] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Scripts Tab States
  const [scripts, setScripts] = useState<ScriptFile[]>([])
  const [selectedScript, setSelectedScript] = useState<string | null>(null)
  const [scriptContent, setScriptContent] = useState("")
  const [scriptLoading, setScriptLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState("")
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [newScriptName, setNewScriptName] = useState("")
  const [isCreatingScript, setIsCreatingScript] = useState(false)

  const fetchFilesData = useCallback(async () => {
    try {
      const [filesData, skillsData] = await Promise.all([
        listFiles(),
        listSkills()
      ])
      setFiles(filesData)
      setSkills(skillsData)
      setError("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchScriptsList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listScripts()
      setScripts(list)
    } catch (e) {
      setError(`Failed to list scripts: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "files" || activeTab === "skills") {
      void fetchFilesData()
    } else if (activeTab === "scripts") {
      void fetchScriptsList()
    }
  }, [activeTab, fetchFilesData, fetchScriptsList])

  const handleSelectScript = async (name: string) => {
    setSelectedScript(name)
    setScriptLoading(true)
    setTerminalOutput("")
    setExitCode(null)
    try {
      const data = await readScript(name)
      setScriptContent(data.content || "")
    } catch (e) {
      setError(`Failed to load script content: ${(e as Error).message}`)
    } finally {
      setScriptLoading(false)
    }
  }

  const handleSaveScript = async () => {
    if (!selectedScript) return
    setScriptLoading(true)
    try {
      await saveScript(selectedScript, scriptContent)
      setError("")
      alert(`Script "${selectedScript}" saved successfully!`)
      void fetchScriptsList()
    } catch (e) {
      setError(`Failed to save script: ${(e as Error).message}`)
    } finally {
      setScriptLoading(false)
    }
  }

  const handleRunScript = async () => {
    if (!selectedScript) return
    setRunning(true)
    setTerminalOutput("⚡ Spawning sandboxed executor process...\n")
    setExitCode(null)
    try {
      const res = await runScript(selectedScript)
      setTerminalOutput(res.output || "Script executed with no console output.")
      setExitCode(res.exitCode)
    } catch (e) {
      setTerminalOutput(`❌ Execution Error: ${(e as Error).message}`)
      setExitCode(1)
    } finally {
      setRunning(false)
    }
  }

  const handleCreateScript = async () => {
    if (!newScriptName.trim()) return
    const name = newScriptName.endsWith(".mjs") || newScriptName.endsWith(".js") || newScriptName.endsWith(".py") || newScriptName.endsWith(".sh")
      ? newScriptName
      : `${newScriptName}.mjs`
    
    setScriptLoading(true)
    try {
      const defaultCode = name.endsWith(".py")
        ? "#!/usr/bin/env python3\nprint('Hello from SSSS Sovereign Automation!')\n"
        : name.endsWith(".sh")
          ? "#!/bin/bash\necho 'Hello from SSSS Sovereign Automation!'\n"
          : "/**\n * SSSS Skills Automation Script\n */\nconsole.log(\"Hello from SSSS Sovereign Automation!\");\n"
          
      await saveScript(name, defaultCode)
      setNewScriptName("")
      setIsCreatingScript(false)
      await fetchScriptsList()
      await handleSelectScript(name)
    } catch (e) {
      setError(`Failed to create script: ${(e as Error).message}`)
    } finally {
      setScriptLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1>Storage & Automations</h1>
          <p>Manage sovereign files, runtime skills, and automation scripts</p>
        </div>
        
        {/* Navigation Tabs */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
          <button 
            className={`btn btn-sm ${activeTab === "files" ? "btn-purple" : "btn-ghost"}`}
            onClick={() => setActiveTab("files")}
            style={{ borderRadius: 6, fontSize: 12, padding: "6px 12px" }}
          >
            📁 Storage
          </button>
          <button 
            className={`btn btn-sm ${activeTab === "skills" ? "btn-purple" : "btn-ghost"}`}
            onClick={() => setActiveTab("skills")}
            style={{ borderRadius: 6, fontSize: 12, padding: "6px 12px" }}
          >
            🧩 Skills
          </button>
          <button 
            className={`btn btn-sm ${activeTab === "scripts" ? "btn-cyan" : "btn-ghost"}`}
            onClick={() => { setActiveTab("scripts"); setSelectedScript(null); }}
            style={{ borderRadius: 6, fontSize: 12, padding: "6px 12px" }}
          >
            ⚡ Scripts Editor
          </button>
        </div>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      {activeTab === "files" && (
        <div className="health-log" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8, color: "#fff" }}>Sovereign Files (~/.agent/files/)</h2>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Name</th>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Size</th>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}><div className="skeleton" style={{ height: 20, margin: "8px 0" }}/></td></tr>
              ) : files.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>Directory is empty</td></tr>
              ) : (
                files.map(f => (
                  <tr key={f.name}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "#fff" }}>
                      {f.isDirectory ? "📁 " : "📄 "}{f.name}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                      {f.isDirectory ? "-" : formatBytes(f.size)}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                      {new Date(f.modified).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "skills" && (
        <div className="health-log" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8, color: "#fff" }}>Agent Skills (~/.agent/skills/)</h2>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Name</th>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Size</th>
                <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}><div className="skeleton" style={{ height: 20, margin: "8px 0" }}/></td></tr>
              ) : skills.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>No skills found</td></tr>
              ) : (
                skills.map(f => (
                  <tr key={f.name}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "#fff" }}>
                      {f.isDirectory ? "🧩 " : "📄 "}{f.name}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                      {f.isDirectory ? "-" : formatBytes(f.size)}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                      {new Date(f.modified).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "scripts" && (
        <div className="memory-layout" style={{ display: "flex", gap: 20, height: "calc(100vh - 220px)" }}>
          {/* Left panel: scripts list */}
          <div className="memory-sidebar" style={{ width: 260, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: "rgba(15,23,42,0.3)", borderRadius: 8, padding: 16, border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: 14 }}>Scripts Directory</h3>
            
            {isCreatingScript ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <input 
                  type="text" 
                  placeholder="e.g. sync-rules.mjs" 
                  value={newScriptName}
                  onChange={e => setNewScriptName(e.target.value)}
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", color: "#fff", fontSize: 12 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-purple btn-sm" onClick={handleCreateScript} style={{ fontSize: 11, flex: 1 }}>Add</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsCreatingScript(false)} style={{ fontSize: 11, flex: 1 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button 
                className="btn btn-purple btn-sm" 
                onClick={() => setIsCreatingScript(true)} 
                style={{ width: "100%", fontSize: 12, marginBottom: 12 }}
              >
                ➕ Create Script
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {scripts.length === 0 ? (
                <div style={{ color: "var(--text-tertiary)", fontSize: 12, textAlign: "center", padding: 20 }}>No scripts found.</div>
              ) : (
                scripts.map(s => (
                  <button
                    key={s.name}
                    className={`category-btn ${selectedScript === s.name ? "active" : ""}`}
                    onClick={() => void handleSelectScript(s.name)}
                    style={{ justifyContent: "space-between", width: "100%" }}
                  >
                    <span>⚡ {s.name}</span>
                    <span style={{ fontSize: 9, opacity: 0.6 }}>{formatBytes(s.size)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel: script code editor & terminal runner */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
            {selectedScript ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
                {/* Script actions header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)", border: "1px solid var(--border)", padding: "12px 20px", borderRadius: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                      <code>{selectedScript}</code>
                      <span style={{ fontSize: 11, background: "rgba(6,182,212,0.15)", color: "#06b6d4", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Automation</span>
                    </h3>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button className="btn btn-ghost btn-sm" disabled={scriptLoading} onClick={handleSaveScript}>💾 Save Script</button>
                    <button className="btn btn-cyan btn-sm" disabled={running} onClick={handleRunScript}>
                      {running ? "⚡ Executing..." : "⚡ Run Script"}
                    </button>
                  </div>
                </div>

                {/* Editor textarea and Terminal outputs split screen */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 400 }}>
                  {/* Visual Dark Editor */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-tertiary)", letterSpacing: 0.5 }}>Source Code Editor</div>
                    <textarea
                      disabled={scriptLoading}
                      value={scriptContent}
                      onChange={e => setScriptContent(e.target.value)}
                      style={{ 
                        flex: 1, 
                        background: "#030712", 
                        border: "1px solid var(--border)", 
                        borderRadius: 8, 
                        padding: 16, 
                        color: "#10b981", 
                        fontFamily: "monospace", 
                        fontSize: 13, 
                        lineHeight: 1.6, 
                        resize: "none", 
                        outline: "none" 
                      }}
                    />
                  </div>

                  {/* Terminal stdout visual Console */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-tertiary)", letterSpacing: 0.5 }}>Dynamic Output Terminal</span>
                      {exitCode !== null && (
                        <span style={{ fontSize: 11, background: exitCode === 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: exitCode === 0 ? "#22c55e" : "#ef4444", padding: "1px 6px", borderRadius: 4 }}>
                          Exit Code: {exitCode}
                        </span>
                      )}
                    </div>
                    <pre style={{ 
                      flex: 1, 
                      background: "#020617", 
                      border: "1px solid #1e293b", 
                      borderRadius: 8, 
                      padding: 16, 
                      color: "#38bdf8", 
                      fontFamily: "monospace", 
                      fontSize: 13, 
                      lineHeight: 1.6, 
                      overflowY: "auto", 
                      margin: 0,
                      whiteSpace: "pre-wrap"
                    }}>
                      {terminalOutput || "Interactive runner ready. Click ⚡ Run Script to execute automations."}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-tertiary)" }}>
                <span style={{ fontSize: 40, marginBottom: 12 }}>⚡</span>
                <h3>Automations Hub</h3>
                <p>Select a script from the sidebar directory to edit, update, or run securely inside the local sandbox environment.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
