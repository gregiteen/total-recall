import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChat, createTask, listTasks, fetchTtsStatus, fetchTtsAudio, fetchChatHistory, fetchChatThreads, deleteChatThread, listMemory, listResearch, fetchHealth, fetchGeminiModels, shareToApi, fetchExtensionStatus } from '../api'
import type { ChatThread } from '../api'
import type { ChatMessage, MemoryNode, ResearchItem } from '../types'
import Graph3D from '../components/Graph3D'


let msgId = 0

function getCurrentTimestamp(): number {
  return Date.now()
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = getCurrentTimestamp() - timestamp
  if (diffMs < 60000) return 'just now'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default function ChatPage({ activeBrainId, onBrainChange }: { activeBrainId?: string; onBrainChange?: (id: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [voiceMode, setVoiceMode] = useState(false)
  const [kokoroEnabled, setKokoroEnabled] = useState<boolean | null>(null)
  const [deepResearchMode, setDeepResearchMode] = useState(false)
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)
  const [urlToast, setUrlToast] = useState<string | null>(null)

  // Extension banner state
  const [extensionStatus, setExtensionStatus] = useState<{ available: boolean; connected: boolean } | null>(null)
  const [extensionBannerDismissed, setExtensionBannerDismissed] = useState(
    () => localStorage.getItem('tr-ext-banner-dismissed') === 'true'
  )

  // Threads listing & session control state
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined)

  // Grounding nodes & suggested discussions state
  const [selectedGroundingNodes, setSelectedGroundingNodes] = useState<string[]>([])
  const [allMemoryNodes, setAllMemoryNodes] = useState<MemoryNode[]>([])
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([])
  const [showNodeSelector, setShowNodeSelector] = useState(false)
  const [nodeSearchQuery, setNodeSearchQuery] = useState('')
  const nodeSelectorRef = useRef<HTMLDivElement>(null)

  // Model Selector state
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem('selectedModel') || '')
  const [selectedSubModel, setSelectedSubModel] = useState<string>(() => localStorage.getItem('selectedSubModel') || '')
  const [geminiModels, setGeminiModels] = useState<{ id: string; displayName: string }[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(scrollToBottom, [messages, scrollToBottom])

  const refreshThreads = useCallback(() => {
    fetchChatThreads()
      .then(list => {
        setThreads(list)
      })
      .catch(console.error)

    listResearch()
      .then(res => setResearchItems(res.items || []))
      .catch(console.error)
  }, [])

  // Load threads list, suggestions, and health on mount
  useEffect(() => {
    fetchChatThreads()
      .then(list => {
        setThreads(list)
        if (list.length > 0) {
          setActiveThreadId(list[0].id)
          // Auto-switch brain to the most recent thread's brain
          if (list[0].brainId && onBrainChange) {
            onBrainChange(list[0].brainId)
          }
        }
      })
      .catch(console.error)

    listResearch()
      .then(res => setResearchItems(res.items || []))
      .catch(console.error)

    fetchHealth()
      .then(health => {
        const agents = health.cli_agents && health.cli_agents.length > 0
          ? health.cli_agents
          : ['antigravity', 'gemini', 'claude', 'codex'];
        setAvailableModels(agents);
        
        const saved = localStorage.getItem('selectedModel');
        if (saved && agents.includes(saved)) {
          setSelectedModel(saved);
        } else {
          const defaultAgent = agents.includes('gemini') ? 'gemini' : agents[0];
          setSelectedModel(defaultAgent);
          localStorage.setItem('selectedModel', defaultAgent);
        }
      })
      .catch(() => {
        const agents = ['antigravity', 'gemini', 'claude', 'codex'];
        setAvailableModels(agents);
        const saved = localStorage.getItem('selectedModel');
        if (saved && agents.includes(saved)) {
          setSelectedModel(saved);
        } else {
          setSelectedModel('gemini');
          localStorage.setItem('selectedModel', 'gemini');
        }
      })

    fetchGeminiModels()
      .then(models => {
        setGeminiModels(models)
        if (models && models.length > 0) {
          const savedSub = localStorage.getItem('selectedSubModel');
          const exists = models.some(m => m.id === savedSub);
          if (savedSub && exists) {
            setSelectedSubModel(savedSub);
          } else {
            setSelectedSubModel(models[0].id);
            localStorage.setItem('selectedSubModel', models[0].id);
          }
        }
      })
      .catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onBrainChange is stable from parent
  }, [])

  // Reload memory nodes when active selected brain changes
  useEffect(() => {
    listMemory(activeBrainId)
      .then(setAllMemoryNodes)
      .catch(console.error)
  }, [activeBrainId])

  // Click outside listener for grounding node selector popover and model selector dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (nodeSelectorRef.current && !nodeSelectorRef.current.contains(event.target as Node)) {
        setShowNodeSelector(false)
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [nodeSelectorRef, dropdownRef])

  // Load chat history when activeThreadId changes
  useEffect(() => {
    fetchChatHistory(activeThreadId)
      .then(history => {
        if (history) {
          setMessages(history as ChatMessage[])
          msgId = Math.max(msgId, history.length + 1)
        } else {
          setMessages([])
        }
      })
      .catch(err => {
        console.error(err)
        setMessages([])
      })
  }, [activeThreadId])


  // Probe the Kokoro endpoint once when voice mode is turned on so we know
  // whether to call /api/tts or fall back to the browser engine.
  useEffect(() => {
    if (!voiceMode || kokoroEnabled !== null) return
    fetchTtsStatus().then(s => setKokoroEnabled(s.enabled)).catch(() => setKokoroEnabled(false))
  }, [voiceMode, kokoroEnabled])

  // Check Chrome extension availability (once on mount)
  useEffect(() => {
    if (!extensionBannerDismissed) {
      fetchExtensionStatus().then(setExtensionStatus).catch(() => {})
    }
  }, [extensionBannerDismissed])

  const speakBrowser = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    utterance.pitch = 0.95
    window.speechSynthesis.speak(utterance)
  }

  const speak = async (text: string) => {
    if (!voiceMode || !text.trim()) return
    if (kokoroEnabled === false) { speakBrowser(text); return }
    try {
      const blob = await fetchTtsAudio(text)
      if (!blob) {
        // 503 → Kokoro not configured. Remember that and fall back.
        setKokoroEnabled(false)
        speakBrowser(text)
        return
      }
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => URL.revokeObjectURL(url)
      audio.play().catch(() => speakBrowser(text))
    } catch {
      speakBrowser(text)
    }
  }

  const handleNewChat = () => {
    const newId = `thread-${getCurrentTimestamp()}`
    setActiveThreadId(newId)
    setMessages([])
    setInput('')
    setSelectedGroundingNodes([])
    if (textareaRef.current) textareaRef.current.style.height = '44px'
  }

  const handleDeleteThread = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this conversation thread?')) return
    try {
      await deleteChatThread(id)
      if (activeThreadId === id) {
        const remaining = threads.filter(t => t.id !== id)
        if (remaining.length > 0) {
          setActiveThreadId(remaining[0].id)
        } else {
          setActiveThreadId(undefined)
          setMessages([])
        }
      }
      refreshThreads()
    } catch (err) {
      console.error('Failed to delete thread:', err)
    }
  }



  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const sessionId = activeThreadId || `thread-${getCurrentTimestamp()}`
    if (!activeThreadId) {
      setActiveThreadId(sessionId)
    }

    const userMsg: ChatMessage = { id: String(++msgId), role: 'user', content: text, timestamp: getCurrentTimestamp() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    abortControllerRef.current = new AbortController()

    // Auto-resize textarea back
    if (textareaRef.current) textareaRef.current.style.height = '44px'

    try {
      if (deepResearchMode) {
        setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: '🕵️ **Deep Research Agents dispatched.** Gathering facts across parallel web streams...', timestamp: getCurrentTimestamp() }]);
        
        const { slug } = await createTask('proactive-research', text, text);
        
        // Poll for task completion
        let taskCompleted = false;
        while (!taskCompleted) {
          await new Promise(r => setTimeout(r, 2000));
          const tasks = await listTasks();
          const t = tasks.find(x => x.slug === slug);
          if (t && (t.status === 'completed' || t.status === 'failed')) {
            taskCompleted = true;
            setMessages(prev => prev.filter(m => m.content !== '🕵️ **Deep Research Agents dispatched.** Gathering facts across parallel web streams...'));
            setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: t.body || '', timestamp: getCurrentTimestamp() }]);
            speak(t.body || '');
          }
        }
        setLoading(false);
        return;
      }

      const modelWithSubModel = ['gemini', 'antigravity'].includes(selectedModel) && selectedSubModel
        ? `${selectedModel}:${selectedSubModel}`
        : selectedModel

      const historyToSend = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const reply = await sendChat(historyToSend, abortControllerRef.current.signal, sessionId, selectedGroundingNodes, modelWithSubModel, activeBrainId)
      const assistantMsg: ChatMessage = { id: String(++msgId), role: 'assistant', content: reply, timestamp: getCurrentTimestamp(), versions: [reply], currentVersionIndex: 0 }
      setMessages(prev => [...prev, assistantMsg])
      speak(reply)
      refreshThreads()
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') {
        setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: '⛔ Generation stopped by user.', timestamp: getCurrentTimestamp(), versions: ['⛔ Generation stopped by user.'], currentVersionIndex: 0 }])
      } else {
        const errorMsg: ChatMessage = { id: String(++msgId), role: 'assistant', content: `⚠️ Error: ${(e as Error).message}`, timestamp: getCurrentTimestamp(), versions: [`⚠️ Error: ${(e as Error).message}`], currentVersionIndex: 0 }
        setMessages(prev => [...prev, errorMsg])
      }
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleRegenerate = async (msgIndex: number) => {
    if (loading) return;
    const historyToSend = messages.slice(0, msgIndex).map(m => ({ role: m.role, content: m.content }))
    setLoading(true)
    abortControllerRef.current = new AbortController()
    try {
      const modelWithSubModel = ['gemini', 'antigravity'].includes(selectedModel) && selectedSubModel
        ? `${selectedModel}:${selectedSubModel}`
        : selectedModel

      const reply = await sendChat(historyToSend, abortControllerRef.current.signal, activeThreadId, undefined, modelWithSubModel, activeBrainId)
      setMessages(prev => {
        const next = [...prev]
        const target = next[msgIndex]
        const versions = target.versions || [target.content]
        versions.push(reply)
        target.versions = versions
        target.currentVersionIndex = versions.length - 1
        target.content = reply
        return next
      })
      speak(reply)
      refreshThreads()
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(console.error)
  }

  const handleVersionSwitch = (msgIndex: number, delta: number) => {
    setMessages(prev => {
      const next = [...prev]
      const target = next[msgIndex]
      if (!target.versions) return prev
      const newIndex = Math.max(0, Math.min(target.versions.length - 1, (target.currentVersionIndex || 0) + delta))
      target.currentVersionIndex = newIndex
      target.content = target.versions[newIndex]
      return next
    })
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    const ta = e.target
    ta.style.height = '44px'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'

    // Detect URLs
    const urlMatch = value.match(/https?:\/\/[^\s]+/)
    setDetectedUrl(urlMatch ? urlMatch[0] : null)
  }

  const handleUrlAction = async (action: string) => {
    if (!detectedUrl) return
    try {
      await shareToApi({ url: detectedUrl, action })
      setUrlToast(`✅ URL sent to ${action}`)
      setDetectedUrl(null)
      setTimeout(() => setUrlToast(null), 3000)
    } catch (err) {
      console.error('Share API error:', err)
      setUrlToast('⚠️ Failed to process URL')
      setTimeout(() => setUrlToast(null), 3000)
    }
  }

  const filteredNodes = allMemoryNodes.filter(node => 
    node.title.toLowerCase().includes(nodeSearchQuery.toLowerCase()) ||
    node.slug.toLowerCase().includes(nodeSearchQuery.toLowerCase()) ||
    (node.category && node.category.toLowerCase().includes(nodeSearchQuery.toLowerCase()))
  )

  return (
    <div className="chat-layout">
      {/* Threads Sidebar */}
      <aside className="chat-threads-sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>
        </div>
        <div className="thread-list">
          {threads.map(t => (
            <div 
              key={t.id} 
              className={`thread-item ${activeThreadId === t.id ? 'active' : ''}`}
              onClick={() => {
                setActiveThreadId(t.id)
                // Auto-switch brain context when selecting a thread
                if (t.brainId && onBrainChange) {
                  onBrainChange(t.brainId)
                }
              }}
            >
              <div className="thread-info">
                <div className="thread-title" title={t.title}>{t.title}</div>
                <div className="thread-meta">
                  <span>{t.turns} {t.turns === 1 ? 'turn' : 'turns'}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(t.lastUpdated)}</span>
                </div>
              </div>
              <button 
                className="thread-delete-btn" 
                onClick={(e) => handleDeleteThread(e, t.id)}
                title="Delete chat thread"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="chat-container">
        <header className="chat-header animate-fade-in">
          <div className="chat-header-title">
            <h2>Chat Session</h2>
            {activeThreadId && (
              <span className="badge badge-accent" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '11px', padding: '2px 8px' }}>
                {activeThreadId}
              </span>
            )}
          </div>
          <div className="chat-header-model-selector" ref={dropdownRef}>
            <span className="selector-label">Model:</span>
            <div className="model-selector-dropdown-wrapper">
              <button 
                className={`model-selector-dropdown-btn ${showModelDropdown ? 'active' : ''}`}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                title="Select CLI agent model"
              >
                <span style={{ textTransform: 'capitalize' }}>{selectedModel || 'Select Model'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              {showModelDropdown && (
                <div className="model-selector-menu glass">
                  {availableModels.map(modelName => (
                    <div 
                      key={modelName} 
                      className={`model-selector-item ${selectedModel === modelName ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedModel(modelName)
                        localStorage.setItem('selectedModel', modelName)
                        setSelectedSubModel('')
                        localStorage.removeItem('selectedSubModel')
                        setShowModelDropdown(false)
                      }}
                    >
                      <div className="model-selector-item-info">
                        <span className="model-selector-item-name" style={{ textTransform: 'capitalize' }}>{modelName}</span>
                        <span className="model-selector-item-desc">
                          {modelName === 'antigravity' && 'Google Antigravity'}
                          {modelName === 'gemini' && 'Google Gemini CLI'}
                          {modelName === 'claude' && 'Anthropic Claude CLI'}
                          {modelName === 'codex' && 'Codex Coding Agent'}
                        </span>
                      </div>
                      <span className="model-selector-item-badge">CLI</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {['gemini', 'antigravity'].includes(selectedModel) && geminiModels.length > 0 && (
              <div className="chat-header-submodel-selector" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
                <span className="selector-label" style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Base:</span>
                <select
                  value={selectedSubModel}
                  onChange={(e) => {
                    setSelectedSubModel(e.target.value)
                    localStorage.setItem('selectedSubModel', e.target.value)
                  }}
                  className="submodel-select"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {geminiModels.map(m => (
                    <option key={m.id} value={m.id} style={{ background: '#12121a', color: 'var(--text-secondary)' }}>{m.displayName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </header>

        {/* Chrome Extension Banner — shows when available but not connected */}
        {extensionStatus?.available && !extensionStatus.connected && !extensionBannerDismissed && (
          <div style={{
            margin: '0 16px 0',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.12), rgba(99, 179, 237, 0.12))',
            border: '1px solid rgba(108, 92, 231, 0.3)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.3s ease'
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>🧩</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                Chrome Extension Available
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Browse with your brain — contextual memory, quick capture, and research from any page
              </div>
            </div>
            <a
              href="/api/extension/download"
              download
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                color: '#fff',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 12,
                textDecoration: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              ⬇ Download
            </a>
            <button
              onClick={() => {
                setExtensionBannerDismissed(true)
                localStorage.setItem('tr-ext-banner-dismissed', 'true')
              }}
              style={{
                flexShrink: 0,
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                fontSize: 16,
                padding: '0 2px',
                lineHeight: 1
              }}
              title="Dismiss"
            >✕</button>
          </div>
        )}

        <div className="chat-messages">
          {messages.length === 0 && (
            <Graph3D
              threads={threads}
              memoryNodes={allMemoryNodes}
              researchItems={researchItems}
              onOpenThread={(threadId) => setActiveThreadId(threadId)}
              onGroundMemoryNode={(slug) => {
                setSelectedGroundingNodes(prev =>
                  prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
                )
              }}
              selectedGroundingNodes={selectedGroundingNodes}
            />
          )}
          {messages.map((m, index) => (
            <div key={m.id} className={`message message-${m.role}`}>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{m.content}</div>
              {m.role === 'assistant' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)', alignItems: 'center', userSelect: 'none' }}>
                  {m.versions && m.versions.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 4 }}>
                      <button 
                        onClick={() => handleVersionSwitch(index, -1)} 
                        disabled={(m.currentVersionIndex || 0) === 0} 
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, opacity: (m.currentVersionIndex || 0) === 0 ? 0.3 : 1 }}
                      >◄</button>
                      <span>{(m.currentVersionIndex || 0) + 1} / {m.versions.length}</span>
                      <button 
                        onClick={() => handleVersionSwitch(index, 1)} 
                        disabled={(m.currentVersionIndex || 0) === m.versions.length - 1} 
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, opacity: (m.currentVersionIndex || 0) === m.versions.length - 1 ? 0.3 : 1 }}
                      >►</button>
                    </div>
                  )}
                  <button onClick={() => handleCopy(m.content)} title="Copy to clipboard" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                  <button onClick={() => speak(m.content)} title="Read Aloud" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                  </button>
                  <button onClick={() => handleRegenerate(index)} disabled={loading} title="Regenerate Response" style={{ background: 'none', border: 'none', color: 'inherit', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.3 : 1 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="message message-assistant">
              <span className="skeleton" style={{ display: 'inline-block', width: 180, height: 16 }} />
            </div>
          )}
          <div ref={messagesEnd} />
        </div>
        <div className="chat-input-bar">
          {selectedGroundingNodes.length > 0 && (
            <div className="grounding-pills">
              {selectedGroundingNodes.map(slug => {
                const node = allMemoryNodes.find(n => n.slug === slug);
                return (
                  <div key={slug} className="grounding-pill animate-fade-in">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    <span className="grounding-pill-title">{node?.title || slug}</span>
                    <button className="grounding-pill-remove" onClick={() => setSelectedGroundingNodes(prev => prev.filter(s => s !== slug))} title="Remove grounding context">×</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="chat-input-wrapper">
            <button 
              className={`btn btn-ghost ${voiceMode ? 'active' : ''}`} 
              style={{ width: 44, height: 44, padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: voiceMode ? 'var(--accent)' : 'var(--text-tertiary)', borderColor: voiceMode ? 'var(--accent)' : 'var(--border)' }}
              onClick={() => {
                setVoiceMode(!voiceMode)
                if (voiceMode && 'speechSynthesis' in window) window.speechSynthesis.cancel()
              }}
              title={voiceMode ? "Voice Mode On" : "Voice Mode Off"}
            >
              {voiceMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="8" x2="16" y1="22" y2="22"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <line x1="1" x2="23" y1="1" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.88"/><path d="M19 10v2a7 7 0 0 1-1.39 4.2M5 10v2a7 7 0 0 0 1.93 4.88"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="8" x2="16" y1="22" y2="22"/>
                </svg>
              )}
            </button>

            <button 
              className={`btn btn-ghost ${deepResearchMode ? 'active' : ''}`} 
              style={{ width: 44, height: 44, padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: deepResearchMode ? 'var(--accent)' : 'var(--text-tertiary)', borderColor: deepResearchMode ? 'var(--accent)' : 'var(--border)' }}
              onClick={() => setDeepResearchMode(!deepResearchMode)}
              title={deepResearchMode ? "Deep Research On" : "Deep Research Off"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </button>

            <div style={{ position: 'relative', display: 'flex' }} ref={nodeSelectorRef}>
              <button 
                className={`btn btn-ghost ${selectedGroundingNodes.length > 0 ? 'active' : ''}`} 
                style={{ width: 44, height: 44, padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: selectedGroundingNodes.length > 0 ? 'var(--accent)' : 'var(--text-tertiary)', borderColor: selectedGroundingNodes.length > 0 ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => setShowNodeSelector(!showNodeSelector)}
                title="Ground with brain nodes"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                {selectedGroundingNodes.length > 0 && (
                  <span className="grounding-count-badge">{selectedGroundingNodes.length}</span>
                )}
              </button>

              {showNodeSelector && (
                <div className="node-selector-popover glass">
                  <div className="node-selector-header">
                    <h4>Ground with Brain Nodes</h4>
                    <input 
                      type="text" 
                      placeholder="Search nodes..." 
                      value={nodeSearchQuery}
                      onChange={e => setNodeSearchQuery(e.target.value)}
                      className="node-search-input"
                      autoFocus
                    />
                  </div>
                  <div className="node-selector-list">
                    {filteredNodes.length === 0 ? (
                      <div className="node-selector-empty">No nodes found</div>
                    ) : (
                      filteredNodes.map(node => {
                        const isSelected = selectedGroundingNodes.includes(node.slug);
                        return (
                          <div 
                            key={node.slug} 
                            className={`node-selector-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedGroundingNodes(prev => prev.filter(s => s !== node.slug));
                              } else {
                                setSelectedGroundingNodes(prev => [...prev, node.slug]);
                              }
                            }}
                          >
                            <span className="node-selector-item-checkbox">
                              {isSelected ? '✓' : ''}
                            </span>
                            <div className="node-selector-item-info">
                              <span className="node-selector-item-title">{node.title}</span>
                              <span className="node-selector-item-meta">{node.category} • {node.status || 'active'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              id="chat-input"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message your brain…"
              rows={1}
              disabled={loading}
            />
            {loading ? (
              <button className="chat-send-btn" onClick={handleStop} id="chat-stop" style={{ background: 'var(--error)', color: '#fff' }} title="Stop Generation">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                  <rect x="6" y="6" width="12" height="12" rx="2" ry="2"/>
                </svg>
              </button>
            ) : (
              <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()} id="chat-send" title="Send Message">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </button>
            )}
          </div>
          {detectedUrl && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', background: 'var(--bg-secondary, #1e1e2e)', borderRadius: '8px', alignItems: 'center', fontSize: '0.85rem', marginTop: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>🔗 URL detected</span>
              <button className="btn btn-sm" onClick={() => handleUrlAction('research')}>🔬 Research</button>
              <button className="btn btn-sm" onClick={() => handleUrlAction('remember')}>📌 Remember</button>
            </div>
          )}
          {urlToast && (
            <div style={{ padding: '6px 12px', background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--success)', marginTop: 4, textAlign: 'center' }}>
              {urlToast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
