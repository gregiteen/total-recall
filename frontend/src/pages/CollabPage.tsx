import React, { useState, useEffect, useRef } from 'react';

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface CollabGroup {
  id: string;
  name: string;
  code: string;
  owner: string;
  members: string[];
  created_at: string;
}

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

// ─── Component: AuthView ───────────────────────────────────────────────────────
function CollabAuthView({ onAuthSuccess }: { onAuthSuccess: (token: string, username: string) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    const endpoint = isLogin ? '/api/collab/auth/login' : '/api/collab/auth/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authentication failed');
      onAuthSuccess(data.token, data.username);
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '30px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '22px', marginBottom: '8px', textAlign: 'center' }}>Total Recall Collaboration</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>Sign in to connect with team workspaces</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} disabled={loading} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '8px 12px', borderRadius: '6px', width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '8px 12px', borderRadius: '6px', width: '100%' }} />
          </div>
          {error && <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>{error}</div>}
          <button type="submit" className="btn btn-purple" style={{ width: '100%', padding: '10px' }} disabled={loading}>
            {loading ? 'Processing...' : isLogin ? 'Access Collab Hub' : 'Register Collab Account'}
          </button>
        </form>
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px' }}>
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--purple-primary)', cursor: 'pointer' }}>
            {isLogin ? 'Create an account instead' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component: CollabDashboard ───────────────────────────────────────────────
function CollabDashboard({ token, username, onLogout, onSelectSandbox }: { token: string, username: string, onLogout: () => void, onSelectSandbox: () => void }) {
  const [groups, setGroups] = useState<CollabGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchGroups = async () => {
      try {
        const response = await fetch('/api/collab/groups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok && active) {
          setGroups(await response.json());
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchGroups();
    return () => { active = false; };
  }, [token, refreshTrigger]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setError(''); setSuccess('');
    try {
      const response = await fetch('/api/collab/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccess(`Group "${data.name}" created!`);
      setNewGroupName('');
      setRefreshTrigger(prev => prev + 1);
    } catch (err: unknown) { setError((err as Error).message); }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError(''); setSuccess('');
    try {
      const response = await fetch('/api/collab/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: joinCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccess(`Joined group "${data.group.name}"!`);
      setJoinCode('');
      setRefreshTrigger(prev => prev + 1);
    } catch (err: unknown) { setError((err as Error).message); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ fontSize: '18px' }}>Collab Spaces for <span style={{ color: 'var(--purple-primary)' }}>{username}</span></h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Share annotations and real-time page chat rooms</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-purple" onClick={onSelectSandbox}>🌐 Open Page Sandbox</button>
          <button className="btn btn-ghost" onClick={onLogout} style={{ color: '#f87171' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '20px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '16px' }}>My Workspaces ({groups.length})</h3>
          {groups.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No collaboration groups yet. Create or join one.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', color: '#fff' }}>{g.name}</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Members: {g.members.length} • Invite Code: <strong style={{ color: 'var(--purple-primary)' }}>{g.code}</strong></p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyCode(g.code)}>{copiedCode === g.code ? 'Copied' : 'Copy Code'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Join a Space</h3>
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Invite Code" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '13px' }} />
              <button type="submit" className="btn btn-purple btn-sm">Join Group</button>
            </form>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Create a Space</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Space Name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '13px' }} />
              <button type="submit" className="btn btn-purple btn-sm">Create Group</button>
            </form>
          </div>

          {(error || success) && <div style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: error ? '#f87171' : '#34d399', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '6px' }}>{error || success}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Component: CollabSandbox ─────────────────────────────────────────────────
function CollabSandbox({ token, username, onBack }: { token: string, username: string, onBack: () => void }) {
  const [groups, setGroups] = useState<CollabGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<CollabGroup | null>(null);
  const [simulatedUrl, setSimulatedUrl] = useState('https://news.ycombinator.com');
  const [activeUrl, setActiveUrl] = useState('https://news.ycombinator.com');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteExcerpt, setNoteExcerpt] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch('/api/collab/groups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setGroups(data);
          if (data.length > 0) setSelectedGroup(data[0]);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchGroups();
  }, [token]);  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchAnnotations = async () => {
      try {
        const response = await fetch(`/api/collab/annotations?url=${encodeURIComponent(activeUrl)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok && active) {
          setAnnotations(await response.json());
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchAnnotations();
    return () => { active = false; };
  }, [activeUrl, token, groups, refreshTrigger]);

  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProto}//${wsHost}/collab-ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', url: activeUrl }));
      setSystemLogs(prev => [...prev, `Subscribed to context channel: ${activeUrl}`]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CHAT_MESSAGE') {
          setChatMessages(prev => [...prev, data]);
        } else if (data.type === 'USER_JOINED') {
          setSystemLogs(prev => [...prev, `${data.username} joined this page`]);
          setActiveUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]);
        } else if (data.type === 'USER_LEFT') {
          setSystemLogs(prev => [...prev, `${data.username} left`]);
          setActiveUsers(prev => prev.filter(u => u !== data.username));
        } else if (data.type === 'ANNOTATION_ADDED') {
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error(err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setSystemLogs(prev => [...prev, 'Disconnected.']);
    };

    return () => { ws.close(); };
  }, [activeUrl, token]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, systemLogs]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedUrl.trim()) return;
    setChatMessages([]); setSystemLogs([]); setActiveUsers([]);
    setActiveUrl(simulatedUrl);
  };

  const handleAddAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !selectedGroup) return;
    try {
      const response = await fetch('/api/collab/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: activeUrl, groupCode: selectedGroup.code, text: noteText, excerpt: noteExcerpt }),
      });
      if (response.ok) {
        setNoteText(''); setNoteExcerpt('');
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'CHAT_MESSAGE', text: chatInput }));
    setChatInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back to Workspaces</button>
        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '10px', flex: '1', minWidth: '250px' }}>
          <input type="text" value={simulatedUrl} onChange={e => setSimulatedUrl(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 12px', borderRadius: '6px', flex: '1', fontFamily: 'monospace' }} />
          <button type="submit" className="btn btn-purple">Simulate Visit</button>
        </form>
        <div style={{ fontSize: '13px', color: wsConnected ? '#34d399' : '#f87171' }}>● {wsConnected ? 'Connected' : 'Disconnected'}</div>
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        Simulated browser context: <strong style={{ color: 'var(--purple-primary)', fontFamily: 'monospace' }}>{activeUrl}</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', height: '500px' }}>
        {/* Annotations */}
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: '1', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Persistent Notes on Web Page</h3>
            {annotations.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No notes pinned on this page context.</p>
            ) : (
              annotations.map(ann => (
                <div key={ann.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <span>By <strong>{ann.author}</strong></span>
                    <span>{new Date(ann.created_at).toLocaleTimeString()}</span>
                  </div>
                  {ann.excerpt && <blockquote style={{ borderLeft: '2px solid var(--purple-primary)', paddingLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 8px 0', background: 'rgba(0,0,0,0.1)', padding: '4px' }}>"{ann.excerpt}"</blockquote>}
                  <p style={{ fontSize: '13px', color: '#fff' }}>{ann.text}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddAnnotation} style={{ borderTop: '1px solid var(--border)', padding: '12px', background: 'rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={selectedGroup?.code || ''} onChange={e => setSelectedGroup(groups.find(g => g.code === e.target.value) || null)} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#fff', padding: '6px', borderRadius: '6px', fontSize: '12px' }}>
                {groups.map(g => <option key={g.code} value={g.code}>{g.name}</option>)}
              </select>
              <input type="text" placeholder="Excerpt (optional context)" value={noteExcerpt} onChange={e => setNoteExcerpt(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', flex: '1', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Add annotation comment..." value={noteText} onChange={e => setNoteText(e.target.value)} required style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', flex: '1', fontSize: '12px' }} />
              <button type="submit" className="btn btn-purple btn-sm" disabled={groups.length === 0}>Pin</button>
            </div>
          </form>
        </div>

        {/* Chat Panel */}
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '13px' }}>Live Web Room {activeUsers.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({activeUsers.join(', ')})</span>}</h3>
          </div>
          <div style={{ flex: '1', padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {systemLogs.map((log, idx) => <div key={idx} style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>ℹ️ {log}</div>)}
            {chatMessages.map((msg, idx) => {
              const isSelf = msg.username.toLowerCase() === username.toLowerCase();
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignSelf: isSelf ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', alignSelf: isSelf ? 'flex-end' : 'flex-start' }}>{msg.username} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div style={{ padding: '8px 12px', borderRadius: '8px', background: isSelf ? 'var(--purple-primary)' : 'rgba(255,255,255,0.04)', fontSize: '12px', color: '#fff', wordBreak: 'break-word', marginTop: '2px' }}>{msg.text}</div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} style={{ borderTop: '1px solid var(--border)', padding: '10px', display: 'flex', gap: '6px' }}>
            <input type="text" placeholder="Send chat..." value={chatInput} onChange={e => setChatInput(e.target.value)} required disabled={!wsConnected} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', flex: '1', fontSize: '12px' }} />
            <button type="submit" className="btn btn-purple btn-sm" disabled={!wsConnected}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Main Integrated CollabPage Component ─────────────────────────────────────
export default function CollabPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('collab_token'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('collab_username'));
  const [view, setView] = useState<'login' | 'dashboard' | 'sandbox'>(() => {
    const savedToken = localStorage.getItem('collab_token');
    const savedUser = localStorage.getItem('collab_username');
    return (savedToken && savedUser) ? 'dashboard' : 'login';
  });

  const handleAuthSuccess = (newToken: string, newUsername: string) => {
    localStorage.setItem('collab_token', newToken);
    localStorage.setItem('collab_username', newUsername);
    setToken(newToken);
    setUsername(newUsername);
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('collab_token');
    localStorage.removeItem('collab_username');
    setToken(null);
    setUsername(null);
    setView('login');
  };

  return (
    <div className="page" style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {view === 'login' && <CollabAuthView onAuthSuccess={handleAuthSuccess} />}
      {view === 'dashboard' && token && username && (
        <CollabDashboard
          token={token}
          username={username}
          onLogout={handleLogout}
          onSelectSandbox={() => setView('sandbox')}
        />
      )}
      {view === 'sandbox' && token && username && (
        <CollabSandbox
          token={token}
          username={username}
          onBack={() => setView('dashboard')}
        />
      )}
    </div>
  );
}
