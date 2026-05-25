import { useState, useEffect } from 'react';
import { 
  listSkills, 
  fetchSkill, 
  saveSkill, 
  deleteSkill, 
  triggerRecompile,
  searchSkillsRegistry,
  installRegistrySkill
} from '../api';

interface SkillItem {
  name: string;
  size: number;
  modified: string;
  isDirectory: boolean;
  subSkills: string[];
}

interface RegistrySkill {
  name: string;
  installs: number;
  installsStr: string;
  url: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [skillContent, setSkillContent] = useState('');
  
  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<'active' | 'registry'>('active');

  // UI status hooks
  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Skill scaffolds state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');

  // Registry Search & Installation states
  const [searchQuery, setSearchQuery] = useState('');
  const [registryResults, setRegistryResults] = useState<RegistrySkill[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [quarantineAlert, setQuarantineAlert] = useState<{ pkg: string; reason: string } | null>(null);

  /**
   * Syncs the locally installed skills from the backend active registry
   */
  const fetchSkillsList = async (selectName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSkills();
      setSkills(list || []);
      
      if (list && list.length > 0) {
        const target = selectName ? list.find((s: SkillItem) => s.name === selectName) : list[0];
        if (target) {
          setSelectedSkill(target);
          const skillDetails = await fetchSkill(target.name);
          setSkillContent(skillDetails.content || '');
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to fetch active skills list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSkillsList();
  }, []);

  const handleSelectSkill = async (skill: SkillItem) => {
    setSelectedSkill(skill);
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const details = await fetchSkill(skill.name);
      setSkillContent(details.content || '');
    } catch (err: unknown) {
      setError((err as Error).message || `Failed to fetch rules for skill "${skill.name}".`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSkill = async () => {
    if (!selectedSkill) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveSkill(selectedSkill.name, skillContent);
      setSuccess(`Skill "${selectedSkill.name}" rules sheet saved successfully!`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save skill changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecompile = async () => {
    setCompiling(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await triggerRecompile();
      setSuccess(result.message || 'Brain surfaces and shims recompiled successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Recompilation failed.');
    } finally {
      setCompiling(false);
    }
  };

  const handleDeleteSkill = async (skill: SkillItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete the skill "${skill.name}" and all its rules sheets?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteSkill(skill.name);
      setSuccess(`Skill "${skill.name}" successfully deleted.`);
      setTimeout(() => setSuccess(null), 5000);
      void fetchSkillsList();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to delete skill.');
    }
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    setError(null);
    setSuccess(null);
    
    // Normalize naming: alphanumeric and hyphens
    const cleanName = newSkillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    const initialContent = `---
type: skill
name: ${cleanName}
description: "${newSkillDesc.trim() || 'Custom system skill capability'}"
---

# ${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)} — custom system skill

Configure triggers, options, and prompts inside this rules sheet to hot-recompile IDE capabilities.
`;

    try {
      await saveSkill(cleanName, initialContent);
      setNewSkillName('');
      setNewSkillDesc('');
      setShowCreateForm(false);
      setSuccess(`Skill "${cleanName}" successfully created!`);
      setTimeout(() => setSuccess(null), 5000);
      void fetchSkillsList(cleanName);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create new skill.');
    }
  };

  /**
   * Performs search on the skills.sh registry sorted by absolute installs
   */
  const handleRegistrySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setRegistryLoading(true);
    setError(null);
    setQuarantineAlert(null);
    try {
      const results = await searchSkillsRegistry(searchQuery.trim());
      setRegistryResults(results || []);
    } catch (err: unknown) {
      setError((err as Error).message || 'Registry query failed. Is the server connected?');
    } finally {
      setRegistryLoading(false);
    }
  };

  /**
   * Installs, statically scans, and auto-compiles registry skills
   */
  const handleRegistryInstall = async (pkg: string) => {
    setInstallingPkg(pkg);
    setError(null);
    setSuccess(null);
    setQuarantineAlert(null);
    
    try {
      const res = await installRegistrySkill(pkg);
      
      if (res.success) {
        setSuccess(`✓ Skill "${res.skillName || pkg}" successfully installed, security audited, and compiled!`);
        setTimeout(() => setSuccess(null), 7000);
        // Refresh local installed skills registry list
        void fetchSkillsList(res.skillName);
      } else {
        if (res.reason && res.reason.includes('quarantined')) {
          setQuarantineAlert({
            pkg,
            reason: res.reason || 'Static security audit scanned critical dynamic string evaluations or commands injection vectors.'
          });
        } else {
          setError(`❌ Installation failed: ${res.reason || 'Unknown error'}`);
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Dynamic installation handler failed.');
    } finally {
      setInstallingPkg(null);
    }
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Sovereign Skills Manager</h1>
          <p>Read, write, edit, and organize system skill sheets and nested sub-skills dynamically</p>
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
          >
            {showCreateForm ? '✖ Cancel' : '➕ Create Custom Skill'}
          </button>
          
          <button
            className="btn btn-sm"
            onClick={handleRecompile}
            disabled={compiling}
            style={{
              background: compiling ? 'var(--bg-secondary)' : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
              color: '#fff',
              border: 'none',
              fontWeight: 500
            }}
          >
            {compiling ? '⏳ Compiling shims...' : '🔄 Hot-Recompile Shims'}
          </button>
        </div>
      </div>

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
          ✓ {success}
        </div>
      )}
      {quarantineAlert && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 16, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#f87171', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>🚨 SECURITY QUARANTINE PURGE ACTIVE!</div>
          <div style={{ fontSize: 12 }}>Installation of package <strong>{quarantineAlert.pkg}</strong> was blocked and files were hard purged.</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Reason: {quarantineAlert.reason}</div>
        </div>
      )}

      {/* Creation Modal Form Overlay */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: 24, padding: 24, background: 'rgba(18, 18, 26, 0.9)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>➕ Create New Sovereign Skill Capability</h3>
          <form onSubmit={handleCreateSkill} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="new_name" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Skill Name (kebab-case)</label>
              <input
                id="new_name"
                type="text"
                placeholder="e.g. security-audit"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                required
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: 12 }}
              />
            </div>
            <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="new_desc" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Brief Description / System Triggers</label>
              <input
                id="new_desc"
                type="text"
                placeholder="e.g. Audits security parameters, encryption costs, and Caddy forward gates"
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, outline: 'none', fontSize: 12 }}
              />
            </div>
            <button
              type="submit"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', padding: '8px 16px', borderRadius: 6, fontWeight: 500, border: 'none', fontSize: 12, cursor: 'pointer', height: 33 }}
            >
              🚀 Initialize Skill
            </button>
          </form>
        </div>
      )}

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeTab === 'active' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: activeTab === 'active' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 12,
            transition: 'all 0.15s ease'
          }}
        >
          📂 Active Skills Registry
        </button>
        <button
          onClick={() => setActiveTab('registry')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeTab === 'registry' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: activeTab === 'registry' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 12,
            transition: 'all 0.15s ease'
          }}
        >
          ✨ skills.sh Registry Hub
        </button>
      </div>

      {activeTab === 'active' ? (
        /* Original split layout: Active skills editor */
        <div style={{ display: 'flex', flex: 1, gap: 24, minHeight: 0, overflow: 'hidden', paddingBottom: 16 }}>
          
          {/* Left column: Skills Sidebar */}
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0, overflowY: 'auto' }}>
            <div className="card" style={{ padding: 16, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
                Active Skills Registry
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
                {skills.map((skill) => {
                  const isActive = selectedSkill?.name === skill.name;
                  return (
                    <div
                      key={skill.name}
                      onClick={() => void handleSelectSkill(skill)}
                      style={{
                        background: isActive ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                        padding: '12px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {skill.name}
                        </span>
                        {skill.name !== 'total-recall' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSkill(skill);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-tertiary)',
                              fontSize: 12,
                              cursor: 'pointer',
                              padding: '2px 6px'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ff6b6b')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                          >
                            ✖
                          </button>
                        )}
                      </div>
                      
                      {/* Sub Skills tags */}
                      {skill.subSkills && skill.subSkills.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {skill.subSkills.map(sd => (
                            <span key={sd} className="badge" style={{ fontSize: 9, padding: '1px 5px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                              🧩 {sd}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column: Editor and Details */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {selectedSkill ? (
              <div className="card" style={{ flex: 1, padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16, flexShrink: 0 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>📝 Editing Capability rules: {selectedSkill.name}/SKILL.md</h3>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Hot-recompiled rules preserve immutable instructions and custom shims</p>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSkill}
                    disabled={saving}
                    style={{
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                      color: '#fff',
                      fontWeight: 500,
                      borderRadius: 6,
                      padding: '8px 18px',
                      fontSize: 12
                    }}
                  >
                    {saving ? '⏳ Saving...' : '💾 Save rules'}
                  </button>
                </div>

                {/* Text Area Code Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <textarea
                    value={skillContent}
                    onChange={(e) => setSkillContent(e.target.value)}
                    style={{
                      flex: 1,
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      padding: 16,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      resize: 'none',
                      outline: 'none',
                      lineHeight: 1.6,
                      whiteSpace: 'pre',
                      overflowWrap: 'normal',
                      overflowX: 'auto'
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                No skill selected. Click a skill in the registry to manage its rules sheet.
              </div>
            )}
          </div>

        </div>
      ) : (
        /* Tab 2: skills.sh Registry Explorer Panel */
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto', paddingBottom: 16 }}>
          <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>🔍 Discover AI Agent Skills from skills.sh</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Query the absolute ratings list from the open-source registry. When you trigger installation, files are sandboxed, statically audited for command injection vulnerabilities, and automatically compiled.
            </p>

            <form onSubmit={handleRegistrySearch} style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                placeholder="Search skills (e.g. git, typescript, prd...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={registryLoading}
                style={{
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 24px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {registryLoading ? '⏳ Sifting...' : '🔎 Query Registry'}
              </button>
            </form>
          </div>

          {/* Registry Results List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {registryLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span>Searching packages in registry catalog...</span>
              </div>
            ) : registryResults.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {registryResults.map((item) => {
                  const isInstalling = installingPkg === item.name;
                  return (
                    <div
                      key={item.name}
                      style={{
                        background: 'rgba(18, 18, 26, 0.4)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 16
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#fff', wordBreak: 'break-all' }}>
                            {item.name}
                          </span>
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>
                            ⚡ {item.installsStr} installs
                          </span>
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          🔗 View Registry Repository
                        </a>
                      </div>

                      <button
                        onClick={() => void handleRegistryInstall(item.name)}
                        disabled={!!installingPkg}
                        style={{
                          width: '100%',
                          background: isInstalling
                            ? 'var(--bg-tertiary)'
                            : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                          color: isInstalling ? 'var(--text-secondary)' : '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '10px 16px',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: installingPkg ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isInstalling ? '🛡️ Auditing & Installing...' : '➕ Install Capability'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery.trim() ? (
              <div style={{ textAlign: 'center', padding: 40, border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-secondary)' }}>
                No matching skills found in the skills.sh registry. Try a different query like "git" or "prd".
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>
                Enter a search query above to browse portable capabilities from the cloud registry.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
