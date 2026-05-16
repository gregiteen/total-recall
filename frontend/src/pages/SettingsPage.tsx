import { useState, useEffect } from 'react';
import { fetchConfig, saveConfig } from '../api';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'frontier.yml' | 'security.yml'>('frontier.yml');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadTab = async (file: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await fetchConfig(file);
      setContent(data);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTab(activeTab);
  }, [activeTab]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveConfig(activeTab, content);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <h1>Settings</h1>
        <p>Configuration management for your sovereign brain</p>
      </div>
      
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 16, flexShrink: 0 }}>
        <button 
          className={`btn ${activeTab === 'frontier.yml' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('frontier.yml')}
        >
          🌐 Frontier API (frontier.yml)
        </button>
        <button 
          className={`btn ${activeTab === 'security.yml' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('security.yml')}
        >
          🔒 Security (security.yml)
        </button>
      </div>

      {error && <div className="badge badge-warning" style={{ marginBottom: 16, alignSelf: 'flex-start' }}>⚠️ {error}</div>}
      {success && <div className="badge badge-accent" style={{ marginBottom: 16, alignSelf: 'flex-start', background: 'var(--success)', color: '#000' }}>✓ Saved successfully. Restart the backend to apply changes.</div>}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Loading configuration...</div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1,
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 14,
              padding: 16,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              whiteSpace: 'pre',
              overflowWrap: 'normal',
              overflowX: 'auto'
            }}
            spellCheck={false}
          />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, flexShrink: 0 }}>
        <button 
          className="btn btn-primary" 
          onClick={handleSave} 
          disabled={loading || saving}
          style={{ width: 120 }}
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>
    </div>
  );
}
