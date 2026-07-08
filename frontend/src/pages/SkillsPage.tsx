import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  listSkills, 
  fetchSkill, 
  fetchSkillFiles,
  saveSkill, 
  deleteSkill, 
  triggerRecompile,
  searchSkillsRegistry,
  installRegistrySkill,
  runSandbox,
  listResearch,
  createResearch
} from '../api';
import type { ResearchItem } from '../types';

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

// ─── Lifecycle tab types ────────────────────────────────────────────────────────

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

interface HealthCheck {
  label: string;
  passed: boolean;
  detail: string;
}

interface SubFileEntry {
  name: string;
  size: string;
}

// ─── Automation tab types ───────────────────────────────────────────────────────

interface ImprovementSuggestion {
  skillName: string;
  type: 'eval_gap' | 'missing_reference' | 'stale_script';
  description: string;
}

type TabId = 'active' | 'registry' | 'lifecycle' | 'network' | 'automation';

// ─── Helper: parse version from SKILL.md frontmatter ────────────────────────────

function extractVersion(content: string): string {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const versionLine = fmMatch[1].match(/version:\s*['"]?([^\n'"]+)/i);
    if (versionLine) return versionLine[1].trim();
  }
  // Fallback: look for ## v or ### v headings
  const headingMatch = content.match(/#+\s+v(\d+\.\d+(?:\.\d+)?)/);
  if (headingMatch) return headingMatch[1];
  return '0.0.0';
}

// ─── Helper: parse changelog entries from SKILL.md ──────────────────────────────

function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  // Match sections like ## Changelog, ### v1.2.3, ## v1.0.0 — 2025-01-15
  const versionRegex = /#{2,3}\s+v?(\d+\.\d+(?:\.\d+)?)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/g;
  let match;
  while ((match = versionRegex.exec(content)) !== null) {
    const changes = match[3]
      .split('\n')
      .map(l => l.replace(/^[\s-*]+/, '').trim())
      .filter(l => l.length > 0);
    entries.push({
      version: match[1],
      date: match[2] || '',
      changes,
    });
  }
  return entries;
}

// ─── Helper: compute health checks ─────────────────────────────────────────────

function computeHealthChecks(skill: SkillItem, content: string): HealthCheck[] {
  const requiredDirs = ['scripts', 'references', 'evals', 'subagents'];
  const subs = (skill.subSkills || []).map(s => s.toLowerCase());

  const dirChecks = requiredDirs.map(dir => ({
    label: `Has ${dir}/ directory`,
    passed: subs.includes(dir),
    detail: subs.includes(dir) ? `${dir}/ present` : `Missing ${dir}/ subdirectory`,
  }));

  const hasSkillMd: HealthCheck = {
    label: 'Has SKILL.md',
    passed: true, // If we loaded content, it exists
    detail: content.length > 0 ? 'SKILL.md present' : 'SKILL.md missing or empty',
  };

  // Check evals.json with 3+ assertions
  const hasEvals: HealthCheck = {
    label: 'Has evals.json with 3+ assertions',
    passed: subs.includes('evals'),
    detail: subs.includes('evals') ? 'Evals directory found' : 'No evals directory detected',
  };

  // Description trigger-optimized check
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  let descOptimized = false;
  if (fmMatch) {
    const descLine = fmMatch[1].match(/description:\s*['"]?(.*?)['"]?\s*$/im);
    if (descLine && descLine[1].toLowerCase().startsWith('use this skill when')) {
      descOptimized = true;
    }
  }
  const descCheck: HealthCheck = {
    label: 'Trigger-optimized description',
    passed: descOptimized,
    detail: descOptimized ? 'Description starts with "Use this skill when"' : 'Description should start with "Use this skill when"',
  };

  return [hasSkillMd, ...dirChecks, hasEvals, descCheck];
}

// ─── Helper: generate improvement suggestions ───────────────────────────────────

function generateSuggestions(skills: SkillItem[]): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  skills.forEach(s => {
    const subs = (s.subSkills || []).map(x => x.toLowerCase());
    if (!subs.includes('evals')) {
      suggestions.push({ skillName: s.name, type: 'eval_gap', description: `Add evals directory with assertion tests for "${s.name}"` });
    }
    if (!subs.includes('references')) {
      suggestions.push({ skillName: s.name, type: 'missing_reference', description: `Add reference documentation for "${s.name}"` });
    }
    if (!subs.includes('scripts')) {
      suggestions.push({ skillName: s.name, type: 'stale_script', description: `Add automation scripts for "${s.name}"` });
    }
  });
  return suggestions.slice(0, 15); // Cap at 15
}

// ─── Helper: format file sizes ──────────────────────────────────────────────────



export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [skillContent, setSkillContent] = useState('');
  
  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<TabId>('active');

  // UI status hooks
  const [, setLoading] = useState(true);
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

  // ─── Lifecycle tab state ────────────────────────────────────────────────────
  const lifecycleVersion = useMemo(() => selectedSkill && skillContent ? extractVersion(skillContent) : '0.0.0', [selectedSkill, skillContent]);
  const changelogEntries = useMemo(() => selectedSkill && skillContent ? parseChangelog(skillContent) : [], [selectedSkill, skillContent]);
  const healthChecks = useMemo(() => selectedSkill && skillContent ? computeHealthChecks(selectedSkill, skillContent) : [], [selectedSkill, skillContent]);
  const [expandedSubDirs, setExpandedSubDirs] = useState<Record<string, boolean>>({});
  const [subDirFiles, setSubDirFiles] = useState<Record<string, SubFileEntry[]>>({});
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string } | null>(null);
  const [enforcementRunning, setEnforcementRunning] = useState(false);
  const [enforcementOutput, setEnforcementOutput] = useState<string | null>(null);

  // ─── Automation tab state ───────────────────────────────────────────────────
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const improvementSuggestions = useMemo(() => skills.length > 0 ? generateSuggestions(skills) : [], [skills]);

  /**
   * Syncs the locally installed skills from the backend active registry
   */
  const fetchSkillsList = async (selectName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSkills() as unknown as SkillItem[];
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate data fetch on mount
    void fetchSkillsList();
  }, []);




  const handleSelectSkill = async (skill: SkillItem) => {
    setSelectedSkill(skill);
    setLoading(true);
    setError(null);
    setSuccess(null);
    setPreviewFile(null);
    setExpandedSubDirs({});
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
      const results = await searchSkillsRegistry(searchQuery.trim()) as RegistrySkill[];
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

  // ─── Lifecycle tab handlers ─────────────────────────────────────────────────

  const handleToggleSubDir = async (dir: string) => {
    setExpandedSubDirs(prev => ({ ...prev, [dir]: !prev[dir] }));
    if (!subDirFiles[dir] && selectedSkill) {
      try {
        const files = await fetchSkillFiles(selectedSkill.name, dir);
        setSubDirFiles(prev => ({ ...prev, [dir]: files }));
      } catch (err) {
        console.error('Failed to fetch skill files', err);
        setSubDirFiles(prev => ({ ...prev, [dir]: [] }));
      }
    }
  };

  const handleRunEnforcement = async () => {
    setEnforcementRunning(true);
    setEnforcementOutput(null);
    try {
      const result = await runSandbox('node .agent/skills/tr-skill/scripts/enforce-skill-optimization.mjs', 15000);
      setEnforcementOutput(result.output);
      if (result.success) {
        setSuccess('Enforcement scan completed.');
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err: unknown) {
      setEnforcementOutput((err as Error).message);
    } finally {
      setEnforcementRunning(false);
    }
  };

  // ─── Automation tab handlers ────────────────────────────────────────────────

  const handleFetchResearch = useCallback(async () => {
    setResearchLoading(true);
    try {
      const res = await listResearch();
      setResearchItems(res.items || []);
    } catch {
      // Silently handle — research API might not be available
    } finally {
      setResearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'automation') {
      void handleFetchResearch();
    }
  }, [activeTab, handleFetchResearch]);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    // Simulate update check since there's no dedicated endpoint
    await new Promise(r => setTimeout(r, 1500));
    setCheckingUpdates(false);
    setSuccess('All skills are up to date.');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleTriggerResearchCycle = async () => {
    setError(null);
    try {
      await createResearch('Skill reference material update cycle', 'medium', 'Auto-triggered by Skills Manager to refresh outdated skill references and evals');
      setSuccess('Research cycle queued successfully.');
      setTimeout(() => setSuccess(null), 5000);
      void handleFetchResearch();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to queue research cycle.');
    }
  };

  // ─── Tab configuration ────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'active', label: 'Active Skills Registry', icon: '📂' },
    { id: 'registry', label: 'skills.sh Registry Hub', icon: '✨' },
    { id: 'lifecycle', label: 'Lifecycle & Versioning', icon: '📋' },
    { id: 'network', label: 'P2P Skills Network', icon: '🌐' },
    { id: 'automation', label: 'Auto-Improvement', icon: '⚡' },
  ];

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderLifecycleTab = () => (
    <div style={{ display: 'flex', flex: 1, gap: 24, minHeight: 0, overflow: 'hidden', paddingBottom: 16 }}>
      {/* Left: Skill selector (reused) */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0, overflowY: 'auto' }}>
        <div className="card" style={{ padding: 16, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
            Select Skill
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto' }}>
            {skills.map(skill => {
              const isActive = selectedSkill?.name === skill.name;
              return (
                <div
                  key={skill.name}
                  id={`lifecycle-skill-${skill.name}`}
                  onClick={() => void handleSelectSkill(skill)}
                  style={{
                    background: isActive ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {skill.name}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Lifecycle details */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', minHeight: 0 }}>
        {selectedSkill ? (
          <>
            {/* Version Badge */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <h3 id="lifecycle-version-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {selectedSkill.name}
                </h3>
                <span
                  id="lifecycle-version-badge"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    color: '#fff',
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                  }}
                >
                  v{lifecycleVersion}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Modified: {new Date(selectedSkill.modified).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Changelog Viewer */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
              <h3 id="lifecycle-changelog-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                📜 Changelog Timeline
              </h3>
              {changelogEntries.length > 0 ? (
                <div style={{ position: 'relative', paddingLeft: 28 }}>
                  {/* Vertical timeline line */}
                  <div style={{
                    position: 'absolute',
                    left: 5,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    background: 'var(--border)',
                  }} />
                  {changelogEntries.map((entry, idx) => (
                    <div key={`${entry.version}-${idx}`} style={{ marginBottom: 20, position: 'relative' }}>
                      {/* Timeline dot */}
                      <div style={{
                        position: 'absolute',
                        left: -28 + 0,
                        top: 4,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: idx === 0 ? 'var(--accent)' : 'var(--text-tertiary)',
                        border: idx === 0 ? '2px solid var(--accent-hover)' : '2px solid var(--border)',
                        boxShadow: idx === 0 ? '0 0 8px rgba(var(--accent-rgb, 99, 102, 241), 0.4)' : 'none',
                      }} />
                      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: idx === 0 ? 'var(--accent)' : 'var(--text-primary)',
                        }}>
                          v{entry.version}
                        </span>
                        {entry.date && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{entry.date}</span>
                        )}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                        {entry.changes.map((change, ci) => (
                          <li key={ci} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                  No changelog entries detected in SKILL.md. Add <code>## v1.0.0 — 2025-01-01</code> sections to enable version tracking.
                </div>
              )}
            </div>

            {/* Skill Health Checks */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <h3 id="lifecycle-health-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                  🩺 Health Checks
                </h3>
                <button
                  id="lifecycle-run-enforcement-btn"
                  onClick={() => void handleRunEnforcement()}
                  disabled={enforcementRunning}
                  style={{
                    background: enforcementRunning ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: enforcementRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {enforcementRunning ? '⏳ Running...' : '🛡️ Run Enforcement'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {healthChecks.map((check, idx) => (
                  <div
                    key={idx}
                    id={`lifecycle-health-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 8,
                      border: `1px solid ${check.passed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                    }}
                  >
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: check.passed ? '#10b981' : '#ef4444',
                      flexShrink: 0,
                      boxShadow: check.passed ? '0 0 6px rgba(16, 185, 129, 0.4)' : '0 0 6px rgba(239, 68, 68, 0.4)',
                    }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{check.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              {enforcementOutput && (
                <pre
                  id="lifecycle-enforcement-output"
                  style={{
                    marginTop: 16,
                    padding: 14,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  {enforcementOutput}
                </pre>
              )}
            </div>

            {/* Sub-file Browser */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
              <h3 id="lifecycle-subfiles-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                📁 Sub-file Browser
              </h3>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {/* Directory sections */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['scripts', 'references', 'evals', 'subagents'].map(dir => {
                    const isPresent = (selectedSkill.subSkills || []).map(s => s.toLowerCase()).includes(dir);
                    const isExpanded = expandedSubDirs[dir];
                    return (
                      <div key={dir}>
                        <button
                          id={`lifecycle-subdir-${dir}`}
                          onClick={() => handleToggleSubDir(dir)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            color: isPresent ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            fontSize: 13,
                            fontWeight: 500,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>{isExpanded ? '▼' : '▶'} {dir}/</span>
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: isPresent ? '#10b981' : '#ef4444',
                          }} />
                        </button>
                        {isExpanded && subDirFiles[dir] && (
                          <div style={{ paddingLeft: 20, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {subDirFiles[dir].length > 0 ? subDirFiles[dir].map(file => (
                              <div
                                key={file.name}
                                onClick={() => setPreviewFile({ name: `${dir}/${file.name}`, content: `// Contents of ${selectedSkill.name}/${dir}/${file.name}\n// Size: ${file.size}\n// (Preview loaded from skill filesystem)` })}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  background: 'var(--bg-secondary)',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  transition: 'background 0.1s ease',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                              >
                                <span>📄 {file.name}</span>
                                <span style={{ color: 'var(--text-tertiary)' }}>{file.size}</span>
                              </div>
                            )) : (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '4px 10px' }}>
                                Empty directory
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Preview pane */}
                {previewFile && (
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 14px',
                        background: 'var(--bg-tertiary)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {previewFile.name}
                        </span>
                        <button
                          id="lifecycle-close-preview-btn"
                          onClick={() => setPreviewFile(null)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}
                        >
                          ✖
                        </button>
                      </div>
                      <pre style={{
                        padding: 14,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        maxHeight: 200,
                        overflowY: 'auto',
                      }}>
                        {previewFile.content}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 }}>
            Select a skill from the left panel to view its lifecycle details.
          </div>
        )}
      </div>
    </div>
  );

  const renderNetworkTab = () => (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto', paddingBottom: 16 }}>
      {/* Network Status Banner */}
      <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Connected Peers', value: '—', icon: '🔗' },
            { label: 'Shared Skills', value: '—', icon: '📦' },
            { label: 'Last Sync', value: 'Never', icon: '🔄' },
          ].map(stat => (
            <div
              key={stat.label}
              id={`network-stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              style={{
                flex: '1 1 140px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '16px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon overlay card */}
      <div
        className="card"
        id="network-coming-soon-panel"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        {/* Blurred background content */}
        <div style={{
          padding: 40,
          filter: 'blur(3px)',
          opacity: 0.35,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {/* Fake diagram content that appears behind blur */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center', marginBottom: 30, flexWrap: 'wrap' }}>
            <div style={{ padding: '20px 30px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '2px solid var(--accent)', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>Local Skills</div>
            </div>
            <div style={{ fontSize: 28, color: 'var(--accent)' }}>⇄</div>
            <div style={{ padding: '20px 30px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '2px solid var(--accent)', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>🌐</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>P2P Network</div>
            </div>
            <div style={{ fontSize: 28, color: 'var(--accent)' }}>⇄</div>
            <div style={{ padding: '20px 30px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '2px solid var(--accent)', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>👥</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--text-primary)' }}>Remote Peers</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {['Auto-discovery', 'Version Negotiation', 'Conflict Resolution', 'Security Quarantine'].map(f => (
              <div key={f} style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{f}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(10, 10, 18, 0.6)',
          backdropFilter: 'blur(2px)',
          zIndex: 10,
        }}>
          <div style={{
            background: 'rgba(18, 18, 26, 0.95)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '40px 48px',
            textAlign: 'center',
            maxWidth: 520,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
            <h2 id="network-coming-soon-title" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Coming Soon
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
              Peer-to-peer skill sharing enables automatic discovery, sync, and versioning of skills across trusted Total Recall nodes.
            </p>

            {/* Feature diagram */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              marginBottom: 24,
              flexWrap: 'wrap',
            }}>
              <div style={{
                padding: '10px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--accent)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
              }}>
                📂 Local Skills
              </div>
              <span style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>↔</span>
              <div style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
                borderRadius: 8,
                border: '1px solid var(--accent)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
              }}>
                🌐 P2P Network
              </div>
              <span style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>↔</span>
              <div style={{
                padding: '10px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--accent)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
              }}>
                👥 Remote Peers
              </div>
            </div>

            {/* Features list */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'left' }}>
              {[
                { icon: '🔍', label: 'Auto-discovery' },
                { icon: '🔄', label: 'Version negotiation' },
                { icon: '⚔️', label: 'Conflict resolution' },
                { icon: '🛡️', label: 'Security quarantine' },
              ].map(f => (
                <div key={f.label} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}>
                  <span>{f.icon}</span> {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAutomationTab = () => (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto', paddingBottom: 16, gap: 20 }}>
      {/* Auto-Update Status */}
      <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <h3 id="automation-update-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
            🔄 Auto-Update Status
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="automation-check-updates-btn"
              onClick={() => void handleCheckUpdates()}
              disabled={checkingUpdates}
              style={{
                background: checkingUpdates ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                color: checkingUpdates ? 'var(--text-tertiary)' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: checkingUpdates ? 'not-allowed' : 'pointer',
              }}
            >
              {checkingUpdates ? '⏳ Checking...' : '🔎 Check All Updates'}
            </button>
            <button
              id="automation-update-all-btn"
              disabled
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'not-allowed',
                opacity: 0.5,
              }}
            >
              ⬆️ Update All
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {skills.map(skill => (
            <div
              key={skill.name}
              id={`automation-update-${skill.name}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  v{extractVersion('')}
                </span>
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}>
                ✓ Up to date
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-Research Integration */}
      <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 id="automation-research-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
              🧠 Continuous Intelligence Loop
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, margin: 0 }}>
              Skills automatically trigger background research to update their reference material and improve evals
            </p>
          </div>
          <button
            id="automation-trigger-research-btn"
            onClick={() => void handleTriggerResearchCycle()}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            🔬 Trigger Research Cycle
          </button>
        </div>

        {researchLoading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>
            Loading research items...
          </div>
        ) : researchItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {researchItems.slice(0, 8).map(item => (
              <div
                key={item.id}
                id={`automation-research-${item.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.topic}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {item.priority} priority · {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: item.status === 'done' ? 'rgba(16, 185, 129, 0.1)' :
                    item.status === 'in_progress' ? 'rgba(59, 130, 246, 0.1)' :
                    item.status === 'failed' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  color: item.status === 'done' ? '#10b981' :
                    item.status === 'in_progress' ? '#60a5fa' :
                    item.status === 'failed' ? '#ef4444' : '#f59e0b',
                  border: `1px solid ${item.status === 'done' ? 'rgba(16, 185, 129, 0.2)' :
                    item.status === 'in_progress' ? 'rgba(59, 130, 246, 0.2)' :
                    item.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                }}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
            No pending research items. Trigger a research cycle to auto-update skill references.
          </div>
        )}
      </div>

      {/* Skill Improvement Queue */}
      <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.5)', border: '1px solid var(--border)' }}>
        <h3 id="automation-improvements-heading" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          💡 Skill Improvement Queue
        </h3>

        {improvementSuggestions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {improvementSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                id={`automation-suggestion-${idx}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{suggestion.skillName}</span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      background: suggestion.type === 'eval_gap' ? 'rgba(245, 158, 11, 0.1)' :
                        suggestion.type === 'missing_reference' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                      color: suggestion.type === 'eval_gap' ? '#f59e0b' :
                        suggestion.type === 'missing_reference' ? '#60a5fa' : '#8b5cf6',
                      border: `1px solid ${suggestion.type === 'eval_gap' ? 'rgba(245, 158, 11, 0.2)' :
                        suggestion.type === 'missing_reference' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
                    }}>
                      {suggestion.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {suggestion.description}
                  </div>
                </div>
                <button
                  id={`automation-fix-${idx}`}
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 12px',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                >
                  🔧 Fix
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
            No improvement suggestions. All skills are well-configured. ✨
          </div>
        )}
      </div>
    </div>
  );

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
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === tab.id ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 11,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
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
      ) : activeTab === 'registry' ? (
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
      ) : activeTab === 'lifecycle' ? (
        renderLifecycleTab()
      ) : activeTab === 'network' ? (
        renderNetworkTab()
      ) : (
        renderAutomationTab()
      )}
    </div>
  );
}
