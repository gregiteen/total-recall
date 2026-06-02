import React, { useState, useEffect } from 'react';

export interface Group {
  id: string;
  name: string;
  code: string;
  owner: string;
  members: string[];
  created_at: string;
}

interface DashboardProps {
  token: string;
  username: string;
  onLogout: () => void;
  onSelectSandbox: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ token, username, onLogout, onSelectSandbox }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/groups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (err) {
      console.error('Failed to fetch groups', err);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [token]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create group');

      setSuccess(`Group "${data.name}" created!`);
      setNewGroupName('');
      fetchGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/groups/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: joinCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to join group');

      setSuccess(`Successfully joined group "${data.group.name}"!`);
      setJoinCode('');
      fetchGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyCodeToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', animation: 'fadeIn 0.4s ease-out' }}>
      {/* Header bar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 30px', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '20px' }}>Welcome back, <span style={{ color: 'var(--color-primary)' }}>{username}</span></h2>
          <p style={{ fontSize: '13px' }}>Manage your workspace groups & collaborate</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={onSelectSandbox} style={{ padding: '10px 18px' }}>
            🌐 Live Page Sandbox
          </button>
          <button className="btn-secondary" onClick={onLogout} style={{ padding: '10px 18px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            Logout
          </button>
        </div>
      </div>

      {/* Main dashboard forms & grids */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '30px' }}>
        {/* Left column: Joined Groups */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            My Collaboration Workspaces ({groups.length})
          </h3>

          {groups.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', border: '1px dashed var(--border-light)', borderRadius: '12px', color: 'var(--text-muted)' }}>
              <p>No active groups found.</p>
              <p style={{ fontSize: '13px', marginTop: '6px' }}>Create one or join via invite code on the right panel.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {groups.map((group) => (
                <div key={group.id} className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '16px', color: 'var(--text-bright)' }}>{group.name}</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Members: {group.members.length} • Owner: {group.owner === username ? 'You' : group.owner}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                      Code: {group.code}
                    </div>
                    <button className="btn-secondary" onClick={() => copyCodeToClipboard(group.code)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                      {copiedCode === group.code ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Create & Join workspace panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Join Group */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Join Group</h3>
            <form onSubmit={handleJoinGroup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Invite Code (e.g. 5b2e7d38)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={loading}
              />
              <button type="submit" className="btn-primary" style={{ padding: '10px' }} disabled={loading}>
                Join Team Workspace
              </button>
            </form>
          </div>

          {/* Create Group */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Create Group</h3>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Group Name (e.g. Tech Squad)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                disabled={loading}
              />
              <button type="submit" className="btn-primary" style={{ padding: '10px', background: 'var(--color-secondary)', boxShadow: '0 4px 14px 0 var(--color-secondary-glow)' }} disabled={loading}>
                Create Team Workspace
              </button>
            </form>
          </div>

          {/* Toast / Status messages */}
          {(error || success) && (
            <div className="glass-panel" style={{ padding: '16px', background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: error ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', fontSize: '13px', textAlign: 'center', color: error ? '#f87171' : '#34d399' }}>
              {error || success}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
