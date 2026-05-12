import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChat, createTask, listTasks, fetchTtsStatus, fetchTtsAudio, fetchChatHistory } from '../api'
import type { ChatMessage } from '../types'

let msgId = 0

export default function ChatPage() {
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

  const scrollToBottom = useCallback(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(scrollToBottom, [messages, scrollToBottom])

  // Load chat history on mount
  useEffect(() => {
    fetchChatHistory()
      .then(history => {
        if (history && history.length > 0) {
          setMessages(history as ChatMessage[]);
          // Update msgId to avoid collisions
          msgId = Math.max(msgId, history.length + 1);
        }
      })
      .catch(console.error)
  }, [])

  // Probe the Kokoro endpoint once when voice mode is turned on so we know
  // whether to call /api/tts or fall back to the browser engine.
  useEffect(() => {
    if (!voiceMode || kokoroEnabled !== null) return
    fetchTtsStatus().then(s => setKokoroEnabled(s.enabled)).catch(() => setKokoroEnabled(false))
  }, [voiceMode, kokoroEnabled])

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

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { id: String(++msgId), role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    abortControllerRef.current = new AbortController()

    // Auto-resize textarea back
    if (textareaRef.current) textareaRef.current.style.height = '44px'

    try {
      if (deepResearchMode) {
        setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: '🕵️ **Deep Research Agents dispatched.** Gathering facts across parallel web streams...', timestamp: Date.now() }]);
        
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
            setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: t.body || '', timestamp: Date.now() }]);
            speak(t.body || '');
          }
        }
        setLoading(false);
        return;
      }

      const historyToSend = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const reply = await sendChat(historyToSend, abortControllerRef.current.signal)
      const assistantMsg: ChatMessage = { id: String(++msgId), role: 'assistant', content: reply, timestamp: Date.now(), versions: [reply], currentVersionIndex: 0 }
      setMessages(prev => [...prev, assistantMsg])
      speak(reply)
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setMessages(prev => [...prev, { id: String(++msgId), role: 'assistant', content: '⛔ Generation stopped by user.', timestamp: Date.now(), versions: ['⛔ Generation stopped by user.'], currentVersionIndex: 0 }])
      } else {
        const errorMsg: ChatMessage = { id: String(++msgId), role: 'assistant', content: `⚠️ Error: ${(e as Error).message}`, timestamp: Date.now(), versions: [`⚠️ Error: ${(e as Error).message}`], currentVersionIndex: 0 }
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
      const reply = await sendChat(historyToSend, abortControllerRef.current.signal)
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
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
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
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = '44px'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10a9.96 9.96 0 0 1-4.644-1.142l-4.29 1.117a.85.85 0 0 1-1.04-1.04l1.116-4.29A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2z" />
            </svg>
            <h2>Total Recall Brain</h2>
            <p>Start a conversation with your sovereign AI.</p>
          </div>
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
      </div>
    </div>
  )
}
