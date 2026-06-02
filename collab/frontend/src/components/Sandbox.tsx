import React, { useState, useEffect, useRef } from 'react';
import type { Group } from './Dashboard';

interface Annotation {
  id: string;
  url: string;
  groupCode: string;
  author: string;
  text: string;
  excerpt: string;
  created_at: string;
}

interface ChatMessage {
  username: string;
  text: string;
  created_at: string;
}

interface SandboxProps {
  token: string;
  username: string;
  onBackToDashboard: () => void;
}

export const Sandbox: React.FC<SandboxProps> = ({ token, username, onBackToDashboard }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  
  // URL context
  const [simulatedUrl, setSimulatedUrl] = useState('https://news.ycombinator.com');
  const [activeUrl, setActiveUrl] = useState('https://news.ycombinator.com');
  
  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteExcerpt, setNoteExcerpt] = useState('');

  // Live Chat & Presence
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch groups on mount
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/groups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setGroups(data);
          if (data.length > 0) setSelectedGroup(data[0]);
        }
      } catch (err) {
        console.error('Failed to load groups for sandbox', err);
      }
    };
    fetchGroups();
  }, [token]);

  // Fetch annotations when activeUrl or groups changes
  const fetchAnnotations = async () => {
    if (!activeUrl) return;
    try {
      const response = await fetch(`http://localhost:3001/api/annotations?url=${encodeURIComponent(activeUrl)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAnnotations(data);
      }
    } catch (err) {
      console.error('Failed to fetch annotations', err);
    }
  };

  useEffect(() => {
    fetchAnnotations();
  }, [activeUrl, token, groups]);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    const wsUrl = `ws://localhost:3001?token=${token}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Subscribe to active URL
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', url: activeUrl }));
      setSystemLogs(prev => [...prev, `Connected. Subscribed to channel: ${activeUrl}`]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'CHAT_MESSAGE') {
          setChatMessages(prev => [...prev, {
            username: data.username,
            text: data.text,
            created_at: data.created_at
          }]);
        } else if (data.type === 'USER_JOINED') {
          setSystemLogs(prev => [...prev, `${data.username} arrived on this page`]);
          setActiveUsers(prev => {
            if (prev.includes(data.username)) return prev;
            return [...prev, data.username];
          });
        } else if (data.type === 'USER_LEFT') {
          setSystemLogs(prev => [...prev, `${data.username} left this page`]);
          setActiveUsers(prev => prev.filter(u => u !== data.username));
        } else if (data.type === 'ANNOTATION_ADDED') {
          // If the new annotation is for a group the user has access to, refetch
          fetchAnnotations();
        }
      } catch (err) {
        console.error('Failed to process message frame', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setSystemLogs(prev => [...prev, 'Disconnected from server.']);
    };

    return () => {
      ws.close();
    };
  }, [activeUrl, token]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, systemLogs]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedUrl.trim()) return;
    setChatMessages([]);
    setSystemLogs([]);
    setActiveUsers([]);
    setActiveUrl(simulatedUrl);
  };

  const handleAddAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !selectedGroup) return;

    try {
      const response = await fetch('http://localhost:3001/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: activeUrl,
          groupCode: selectedGroup.code,
          text: noteText,
          excerpt: noteExcerpt,
        }),
      });

      if (response.ok) {
        setNoteText('');
        setNoteExcerpt('');
        fetchAnnotations();
      }
    } catch (err) {
      console.error('Failed to add annotation', err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    socketRef.current.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      text: chatInput,
    }));
    setChatInput('');
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '30px 20px', display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      {/* Simulation Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onBackToDashboard} style={{ padding: '10px 16px' }}>
          ← Back to Dashboard
        </button>

        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '10px', flex: '1', minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Simulated URL (e.g. https://github.com)"
            value={simulatedUrl}
            onChange={(e) => setSimulatedUrl(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
            Simulate Browser Visit
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status:</span>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: wsConnected ? '#10b981' : '#ef4444' }}></span>
          <span style={{ fontSize: '13px', color: 'var(--text-bright)', fontWeight: '600' }}>
            {wsConnected ? 'Live Connection Active' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 8px' }}>
        <h3 style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
          Active Web Context: <span style={{ color: 'var(--color-secondary)', fontFamily: 'var(--font-mono)' }}>{activeUrl}</span>
        </h3>
      </div>

      {/* Main Workspace split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', height: '620px' }}>
        {/* Left Column: Persistent Pinned Annotations */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Scrollable Annotations List */}
          <div style={{ flex: '1', padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', color: 'var(--text-bright)' }}>Pinned Page Annotations</h3>
            
            {annotations.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '14px', border: '1px dashed var(--border-light)', borderRadius: '12px' }}>
                No annotations left on this page yet. Be the first to add one!
              </div>
            ) : (
              annotations.map((ann) => (
                <div key={ann.id} className="glass-panel" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '16px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    <span>By <strong style={{ color: 'var(--color-primary)' }}>{ann.author}</strong></span>
                    <span>{new Date(ann.created_at).toLocaleTimeString()}</span>
                  </div>
                  {ann.excerpt && (
                    <blockquote style={{ borderLeft: '3px solid var(--color-secondary)', paddingLeft: '12px', color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px 0', background: 'rgba(0,0,0,0.15)', padding: '8px' }}>
                      "{ann.excerpt}"
                    </blockquote>
                  )}
                  <p style={{ color: 'var(--text-bright)', fontSize: '14px' }}>{ann.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Add Annotation Form */}
          <div style={{ borderTop: '1px solid var(--border-light)', padding: '20px', background: 'rgba(0, 0, 0, 0.2)' }}>
            <form onSubmit={handleAddAnnotation} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: '1' }}>
                  <select 
                    value={selectedGroup?.code || ''} 
                    onChange={(e) => {
                      const group = groups.find(g => g.code === e.target.value);
                      if (group) setSelectedGroup(group);
                    }}
                    style={{ background: 'var(--bg-primary)' }}
                  >
                    {groups.map(g => (
                      <option key={g.code} value={g.code}>Share to: {g.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Text selection context (optional excerpt)"
                  value={noteExcerpt}
                  onChange={(e) => setNoteExcerpt(e.target.value)}
                  style={{ flex: '2' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Type your persistent note here..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary" style={{ padding: '0 20px', whiteSpace: 'nowrap' }} disabled={groups.length === 0}>
                  Pin Note
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Live WebSockets Chat room */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border-light)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', background: 'rgba(0, 0, 0, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--text-bright)' }}>
              Live Page Chat {activeUsers.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '6px' }}>({activeUsers.join(', ')})</span>}
            </h3>
            <span style={{ fontSize: '11px', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
              Channel Sync
            </span>
          </div>

          {/* Chat feed / logs */}
          <div style={{ flex: '1', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Logs/System Notifications */}
            {systemLogs.map((log, idx) => (
              <div key={idx} style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                ℹ️ {log}
              </div>
            ))}

            {/* Chat Messages */}
            {chatMessages.length === 0 && systemLogs.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
                No active messages in this channel room.
              </div>
            )}

            {chatMessages.map((msg, idx) => {
              const isSelf = msg.username.toLowerCase() === username.toLowerCase();
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignSelf: isSelf ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: isSelf ? 'flex-end' : 'flex-start', marginBottom: '2px' }}>
                    {msg.username} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div style={{ padding: '10px 14px', borderRadius: '12px', borderBottomRightRadius: isSelf ? '2px' : '12px', borderBottomLeftRadius: isSelf ? '12px' : '2px', background: isSelf ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', color: 'var(--text-bright)', fontSize: '13px', wordBreak: 'break-word' }}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Send Chat input */}
          <div style={{ borderTop: '1px solid var(--border-light)', padding: '16px', background: 'rgba(0, 0, 0, 0.1)' }}>
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Send message to this page..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                required
                disabled={!wsConnected}
              />
              <button type="submit" className="btn-primary" style={{ padding: '0 16px' }} disabled={!wsConnected}>
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
