import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  listApiKeys,
  issueApiKey,
  revokeApiKey,
  fetchSecretsCatalog,
  updateSecretMeta,
  rotateSecretValue,
  deleteProviderSecret,
  recordSecretUsage,
  scanEnvSecrets,
  importEnvSecrets,
  exportEnvFromSecrets,
  enqueueRotationDue,
  fetchWebAuthnStatus,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnAssertOptions,
  webauthnAssertVerify,
  webauthnPasswordStepUp,
  revealSecretValue,
  type IssuedApiKey,
  type SecretCatalog,
  type SecretCatalogKey,
  type WebAuthnStatus,
  fetchConfigJson,
  saveConfigJson,
  fetchGeminiModels,
  fetchClaudeModels,
  fetchOpenaiModels,
  fetchOpenRouterModels,
  addSecret,
  triggerSync,
  getSyncStatus,
  type SyncNodeStatus
} from '../api'
import type { ConfigJson, GeminiModelInfo } from '../types'
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import UsagePage from './UsagePage'
import './SecretsPage.css'

type Tab = 'catalog' | 'pats' | 'import' | 'cloud' | 'usage' | 'sync'

/** Form state — string inputs; converted on save */
type MetaEdit = {
  label: string
  provider: string
  repos: string
  subscription_tier: string
  monthly_cost_usd: string
  monthly_cap_usd: string
  api_docs_url: string
  headscale_url: string
  rotate_every_days: string
  auto_rotate: boolean
  notes: string
  project_path: string
}

function metaForm(k: SecretCatalogKey): MetaEdit {
  return {
    label: k.label || '',
    provider: k.provider || '',
    repos: (k.repos || []).join(', '),
    subscription_tier: k.subscription_tier || '',
    monthly_cost_usd: k.monthly_cost_usd != null ? String(k.monthly_cost_usd) : '',
    monthly_cap_usd: k.monthly_cap_usd != null ? String(k.monthly_cap_usd) : '',
    api_docs_url: k.api_docs_url || '',
    headscale_url: k.headscale_url || '',
    rotate_every_days: k.rotate_every_days != null ? String(k.rotate_every_days) : '',
    auto_rotate: !!k.auto_rotate,
    notes: k.notes || '',
    project_path: k.project_path || '',
  }
}

function groupKeysByProvider(keys: SecretCatalogKey[]) {
  const groups = new Map<string, { id: string; label: string; kind: 'provider'; keys: SecretCatalogKey[] }>()

  keys.forEach((k) => {
    let pStr = k.provider_name || k.provider;
    if (!pStr) {
      const kl = k.key.toLowerCase();
      if (kl.includes('smtp2go')) pStr = 'SMTP2GO';
      else if (kl.includes('stripe')) pStr = 'Stripe';
      else if (kl.includes('supabase')) pStr = 'Supabase';
      else if (kl.includes('openai')) pStr = 'OpenAI';
      else if (kl.includes('anthropic')) pStr = 'Anthropic';
      else if (kl.includes('github')) pStr = 'GitHub';
      else if (kl.includes('google')) pStr = 'Google';
      else if (kl.includes('aws')) pStr = 'AWS';
      else pStr = 'Unknown';
    }
    const provider = pStr.toLowerCase()
    if (!groups.has(provider)) {
      groups.set(provider, { id: provider, label: pStr.toUpperCase(), kind: 'provider', keys: [] })
    }
    groups.get(provider)!.keys.push(k)
  })

  return [...groups.values()].sort((a, b) => {
    if (a.id === 'unknown') return 1;
    if (b.id === 'unknown') return -1;
    return a.id.localeCompare(b.id);
  })
}

function ProviderLogo({ provider }: { provider?: string }) {
  const [error, setError] = useState(false);
  if (!provider) return null;
  const p = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
  const st = { width: 14, height: 14, flexShrink: 0, borderRadius: 2 };
  
  // Known colors
  const colors: Record<string, string> = {
    openai: '10a37f',
    anthropic: 'd97757',
    google: '4285F4',
    github: '181717',
    supabase: '3ECF8E',
    elevenlabs: '000000',
    sendgrid: '00B3E3',
    digitalocean: '0080FF',
    aws: '232F3E',
    gcp: '4285F4',
    stripe: '008CDD',
    mailcow: 'FFC107',
    resend: '000000'
  };

  const isKnown = p in colors;
  const c = colors[p] || '64748b'; // default slate color
  
  if (error || !isKnown) {
    return (
      <span style={{ ...st, background: '#' + c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 'bold', verticalAlign: 'middle' }}>
        {provider.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img 
      src={`https://cdn.simpleicons.org/${p}/${c}`} 
      style={{ ...st, verticalAlign: 'middle', display: 'inline-block' }} 
      alt={provider} 
      onError={() => setError(true)} 
    />
  );
}

export default function SecretsPage() {
  const [tab, setTab] = useState<Tab>('catalog')

  const [configData, setConfigData] = useState<ConfigJson | null>(null)
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([])
  const [claudeModels, setClaudeModels] = useState<GeminiModelInfo[]>([])
  const [openaiModels, setOpenaiModels] = useState<GeminiModelInfo[]>([])
  const [orModels, setOrModels] = useState<GeminiModelInfo[]>([])
  const [configSuccess, setConfigSuccess] = useState<string | null>(null)

  const [catalog, setCatalog] = useState<SecretCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [groupBy, setGroupBy] = useState<'repo' | 'api'>('repo')
  const [selected, setSelected] = useState<SecretCatalogKey | null>(null)
  const selectedKeyRef = useRef<string | null>(null)
  const [edit, setEdit] = useState<MetaEdit>({
    label: '',
    provider: '',
    repos: '',
    subscription_tier: '',
    monthly_cost_usd: '',
    monthly_cap_usd: '',
    api_docs_url: '',
    headscale_url: '',
    rotate_every_days: '',
    auto_rotate: false,
    notes: '',
    project_path: '',
  })
  const [rotateVal, setRotateVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  /** Accordion: which repo sections are open (default: error + first product only) */
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [sectionsInited, setSectionsInited] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showCostChart, setShowCostChart] = useState(false)
  const [webauthn, setWebauthn] = useState<WebAuthnStatus | null>(null)
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [revealPassword, setRevealPassword] = useState('')
  const [revealBusy, setRevealBusy] = useState(false)

  // PAT state
  const [pats, setPats] = useState<Awaited<ReturnType<typeof listApiKeys>>['keys']>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newlyIssued, setNewlyIssued] = useState<IssuedApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Import state
  const [scanCandidates, setScanCandidates] = useState<
    { key: string; masked: string; already_set?: boolean; provider: string | null; source_label: string }[]
  >([])
  const [importSel, setImportSel] = useState<Set<string>>(new Set())

  // Creation panel state
  const [isCreating, setIsCreating] = useState(false)
  const [newSecretKeyName, setNewSecretKeyName] = useState('')
  const [newSecretVal, setNewSecretVal] = useState('')

  // Sync state
  const [syncNodes, setSyncNodes] = useState<SyncNodeStatus[]>([])
  const [localChecksum, setLocalChecksum] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncLogs, setSyncLogs] = useState<{ time: string; event: string; status: 'info' | 'success' | 'error' }[]>([
    { time: new Date().toLocaleTimeString(), event: 'Secrets system initialized', status: 'info' }
  ])

  const loadSyncData = useCallback(async () => {
    try {
      const syncData = await getSyncStatus()
      setSyncNodes(syncData.nodes || [])
      setLocalChecksum(syncData.localChecksum)
    } catch (err: any) {
      setError(err.message || 'Failed to load sync status')
    }
  }, [])

  const handleTriggerSync = async () => {
    setSyncing(true)
    setError(null)
    const timeStr = new Date().toLocaleTimeString()
    setSyncLogs(prev => [{ time: timeStr, event: 'Initiating mesh secrets synchronization...', status: 'info' }, ...prev])
    try {
      const res = await triggerSync()
      const succeeded = res.results.filter(r => r.success).length
      const total = res.results.length
      const msg = `Mesh sync complete: ${succeeded}/${total} nodes responded successfully.`
      setSyncLogs(prev => [{ time: new Date().toLocaleTimeString(), event: msg, status: 'success' }, ...prev])

      await loadSyncData()
    } catch (err: any) {
      const msg = `Sync trigger failed: ${err.message || err}`
      setSyncLogs(prev => [{ time: new Date().toLocaleTimeString(), event: msg, status: 'error' }, ...prev])
      setError(err.message || 'Failed to trigger synchronization')
    } finally {
      setSyncing(false)
    }
  }

  const handleCreateSecret = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSecretKeyName.trim() || !newSecretVal.trim()) {
      setError('Key name and secret value are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const reposArr = edit.repos ? edit.repos.split(',').map(r => r.trim()).filter(Boolean) : []
      await addSecret(newSecretKeyName.trim(), newSecretVal.trim(), {
        provider: edit.provider || 'openai',
        scope: edit.repos ? 'project' : 'global',
        repos: reposArr,
        subscription_tier: edit.subscription_tier || undefined,
        monthly_cost_usd: edit.monthly_cost_usd ? parseFloat(edit.monthly_cost_usd) : undefined,
        monthly_cap_usd: edit.monthly_cap_usd ? parseFloat(edit.monthly_cap_usd) : undefined,
        api_docs_url: edit.api_docs_url || undefined,
        headscale_url: edit.provider.trim().toLowerCase() === 'headscale' ? edit.headscale_url || undefined : undefined,
        rotate_every_days: edit.rotate_every_days ? parseInt(edit.rotate_every_days, 10) : undefined,
        auto_rotate: !!edit.auto_rotate,
        notes: edit.notes || undefined,
        project_path: edit.project_path || undefined,
        label: edit.label || undefined,
      })
      setIsCreating(false)
      setNewSecretKeyName('')
      setNewSecretVal('')
      await loadCatalog()
    } catch (err: any) {
      setError(err.message || 'Failed to create secret')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (tab === 'sync') {
      void loadSyncData()
    }
  }, [tab, loadSyncData])

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      
    try {
      const config = await fetchConfigJson()
      if (!config.secrets) config.secrets = {}
      if (!config.brain) config.brain = {}
      setConfigData(config)

      const gem = await fetchGeminiModels().catch(() => [])
      setGeminiModels(gem)
      const cla = await fetchClaudeModels().catch(() => [])
      setClaudeModels(cla)
      const open = await fetchOpenaiModels().catch(() => [])
      setOpenaiModels(open)
      const or = await fetchOpenRouterModels().catch(() => [])
      setOrModels(or)
    } catch {
      // ignore fetching models error
    }

    const data = await fetchSecretsCatalog()
      setCatalog(data)
      const skey = selectedKeyRef.current
      if (skey) {
        const fresh = data.keys.find((k) => k.key === skey)
        setSelected(fresh || null)
        if (fresh) {
          setEdit(metaForm(fresh))
        } else {
          selectedKeyRef.current = null
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPats = useCallback(async () => {
    try {
      const r = await listApiKeys()
      setPats(r.keys || [])
    } catch {
      // ignore
    }
  }, [])

  const loadWebAuthn = useCallback(async () => {
    try {
      setWebauthn(await fetchWebAuthnStatus())
    } catch {
      setWebauthn(null)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line
    void loadCatalog()
     
    void loadPats()
     
    void loadWebAuthn()
  }, [loadCatalog, loadPats, loadWebAuthn])

  
  const updateSecretsProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      secrets: { ...configData.secrets, [prop]: value }
    });
  };

  const updateBrainProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      brain: { ...configData.brain, [prop]: value }
    });
  };

  const handleSaveConfig = async () => {
    if (!configData) return;
    setSaving(true);
    setError(null);
    setConfigSuccess(null);
    try {
      await saveConfigJson(configData);
      setConfigSuccess('Configuration saved successfully. Kernel will hot-reload settings.');
      setTimeout(() => setConfigSuccess(null), 4000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  // metaForm hoisted

  function openKey(k: SecretCatalogKey, sectionId?: string) {
    selectedKeyRef.current = k.key
    setSelected(k)
    setEdit(metaForm(k))
    setRotateVal('')
    setStatus('')
    setRevealedValue(null)
    setRevealPassword('')
    // Expand the section this key lives in so context stays visible
    if (sectionId) {
      setExpandedSections((prev) => {
        const next = new Set(prev)
        next.add(sectionId)
        return next
      })
    }
  }

  async function registerPasskey() {
    if (!browserSupportsWebAuthn()) {
      setError('This browser does not support passkeys / WebAuthn')
      return
    }
    setRevealBusy(true)
    setError(null)
    try {
      const options = await webauthnRegisterOptions()
      const attResp = await startRegistration({ optionsJSON: options as never })
      await webauthnRegisterVerify(attResp, 'Touch ID / platform')
      await loadWebAuthn()
      setStatus('Passkey registered — use it to reveal secret values')
    } catch (e: unknown) {
      setError((e as Error).message || 'Passkey registration cancelled')
    } finally {
      setRevealBusy(false)
    }
  }

  async function stepUpWithPasskey(): Promise<string> {
    const options = await webauthnAssertOptions()
    const authResp = await startAuthentication({ optionsJSON: options as never })
    const r = await webauthnAssertVerify(authResp)
    return r.step_up_token
  }

  async function stepUpWithPassword(): Promise<string> {
    if (!revealPassword.trim()) throw new Error('Enter dashboard password')
    const r = await webauthnPasswordStepUp(revealPassword)
    setRevealPassword('')
    return r.step_up_token
  }

  async function doReveal(method: 'passkey' | 'password') {
    if (!selected) return
    setRevealBusy(true)
    setError(null)
    setRevealedValue(null)
    try {
      const token = method === 'passkey' ? await stepUpWithPasskey() : await stepUpWithPassword()
      const r = await revealSecretValue(selected.key, token)
      setRevealedValue(r.value)
      setStatus(`Revealed ${selected.key} (auto-hides in 30s)`)
      window.setTimeout(() => setRevealedValue(null), 30_000)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setRevealBusy(false)
    }
  }

  async function doCopyRevealed() {
    if (!revealedValue) return
    try {
      await navigator.clipboard.writeText(revealedValue)
      setStatus('Copied to clipboard')
    } catch {
      setError('Clipboard copy failed')
    }
  }

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandOnly(id: string) {
    setExpandedSections(new Set([id]))
  }

  function expandAllSections(ids: string[]) {
    setExpandedSections(new Set(ids))
  }

  function collapseAllSections() {
    setExpandedSections(new Set())
  }

  async function saveMeta() {
    if (!selected) return
    setSaving(true)
    setStatus('')
    try {
      const reposList = edit.repos
        .split(/[,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (reposList.length > 1) {
        setError(
          `Each key may bind to only ONE repo (you entered ${reposList.length}: ${reposList.join(', ')}). ` +
            `Pick one product repo, or leave empty for Developer secrets (tooling).`,
        )
        setSaving(false)
        return
      }
      const patch = {
        label: edit.label.trim() || null,
        provider: edit.provider.trim() || null,
        repos: reposList,
        subscription_tier: edit.subscription_tier.trim() || null,
        monthly_cost_usd: edit.monthly_cost_usd.trim() === '' ? null : Number(edit.monthly_cost_usd),
        monthly_cap_usd: edit.monthly_cap_usd.trim() === '' ? null : Number(edit.monthly_cap_usd),
        api_docs_url: edit.api_docs_url.trim() || null,
        headscale_url: edit.provider.trim().toLowerCase() === 'headscale' ? edit.headscale_url.trim() || null : null,
        rotate_every_days:
          edit.rotate_every_days.trim() === '' ? null : Number(edit.rotate_every_days),
        auto_rotate: !!edit.auto_rotate,
        notes: edit.notes.trim() || null,
        project_path: edit.project_path.trim() || null,
      }
      await updateSecretMeta(selected.key, patch)
      setStatus('Metadata saved')
      await loadCatalog()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function doRotate() {
    if (!selected || !rotateVal) return
    setSaving(true)
    try {
      const r = await rotateSecretValue(selected.key, rotateVal, {
        export_env: true,
        export_all: true,
      })
      setRotateVal('')
      const n = r.exports?.filter((e) => e.ok).length ?? 0
      setStatus(
        n > 0
          ? `Rotated ${selected.key} · exported .env to ${n} target(s)`
          : `Rotated ${selected.key} · store updated (no project paths matched — bind --repo or Export .env)`,
      )
      await loadCatalog()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    if (!selected) return
    if (!confirm(`Delete secret ${selected.key}?`)) return
    try {
      await deleteProviderSecret(selected.key)
      setSelected(null)
      selectedKeyRef.current = null
      await loadCatalog()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  async function sampleUsage() {
    if (!selected) return
    try {
      await recordSecretUsage({
        key_ref: selected.key,
        provider: selected.provider || 'unknown',
        cost_usd: 0.01,
        model: 'manual-sample',
        source: 'dashboard',
      })
      setStatus('Sample usage event recorded ($0.01)')
      await loadCatalog()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  async function runScan() {
    try {
      const data = await scanEnvSecrets()
      setScanCandidates(data.candidates || [])
      setImportSel(new Set((data.candidates || []).filter((c) => !c.already_set).map((c) => c.key)))
      setTab('import')
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  async function runImport() {
    try {
      const r = await importEnvSecrets({ keys: [...importSel] })
      setStatus(`Imported ${r.imported_count}, skipped ${r.skipped_count}`)
      await loadCatalog()
      setTab('catalog')
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  const keys = (catalog?.keys || []).filter((k) => {
    if (!filter.trim()) return true
    const q = filter.toLowerCase()
    return (
      k.key.toLowerCase().includes(q) ||
      (k.provider || '').toLowerCase().includes(q) ||
      (k.repos || []).some((r) => r.toLowerCase().includes(q)) ||
      (k.label || '').toLowerCase().includes(q)
    )
  })

  /** Group filtered keys into repo sections (one key → one repo; multi = error; none = developer). */
  const repoSections = useMemo<{ id: string; label: string; kind: 'error' | 'developer' | 'repo' | 'provider'; keys: SecretCatalogKey[] }[]>(() => {
    if (!catalog?.keys) return []
    const f = filter.toLowerCase()
    const filtered = catalog.keys.filter(
      (k) =>
        k.key.toLowerCase().includes(f) ||
        (k.provider || '').toLowerCase().includes(f) ||
        (k.repos || []).some((r) => r.toLowerCase().includes(f)) ||
        (k.label || '').toLowerCase().includes(f)
    )
    return groupBy === 'api' ? groupKeysByProvider(filtered) : groupKeysByRepo(filtered)
  }, [catalog, filter, groupBy])

  // Default accordion: open errors + first product/developer section only
  useEffect(() => {
    if (sectionsInited || !repoSections.length) return
    const next = new Set<string>()
    for (const s of repoSections) {
      if (s.kind === 'error') next.add(s.id)
    }
    const first = repoSections.find((s) => s.kind !== 'error')
    if (first) next.add(first.id)
    // eslint-disable-next-line
    setExpandedSections(next)
     
    setSectionsInited(true)
  }, [repoSections, sectionsInited])

  const summary = catalog?.summary

  return (
    <div className="page" style={{ maxWidth: selected ? 1400 : 1100 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Secrets &amp; Access</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Provider keys (SSOT) · one key → one repo · empty repo = Developer secrets · PATs separate
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              try {
                const r = await exportEnvFromSecrets({ all_projects: true })
                const n = r.results?.filter((x) => x.ok).length ?? r.count ?? 0
                setStatus(`Exported .env to ${n} project(s) from secrets store`)
              } catch (e: unknown) {
                setError((e as Error).message)
              }
            }}
          >
            Export .env → projects
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                const r = (await enqueueRotationDue()) as {
                  due?: number
                  tasks?: { status: string; key: string }[]
                }
                const created = r.tasks?.filter((t) => t.status === 'created').length ?? 0
                const exists = r.tasks?.filter((t) => t.status === 'exists').length ?? 0
                setStatus(
                  `Rotation queue: ${r.due ?? 0} due · ${created} task(s) created · ${exists} already pending`,
                )
                await loadCatalog()
              } catch (e: unknown) {
                setError((e as Error).message)
              }
            }}
          >
            Enqueue rotations
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runScan()}>
            Migrate import
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadCatalog()}>
            Refresh
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 10, fontSize: 11 }}
        onClick={() => setShowHelp((v) => !v)}
      >
        {showHelp ? '▾ Hide model notes' : '▸ How secrets work'}
      </button>
      {showHelp && (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            borderColor: 'var(--border-accent)',
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>SSOT</strong> — keys in TR store; <strong>export-env</strong> writes repo <code>.env</code>.
            </li>
            <li>
              <strong>One key → one product repo</strong>; multi-repo is an error. Empty = Developer secrets (tooling).
            </li>
            <li>
              <strong>import-env</strong> = one-time migrate. <strong>PATs</strong> = brain API tokens only.
            </li>
          </ul>
        </div>
      )}

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 16, display: 'block', padding: 12 }}>
          {error}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {status && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#34d399' }}>{status}</div>
      )}

      {/* Summary cards */}
      {catalog?.store && (
        <div
          style={{
            marginBottom: 12,
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all',
          }}
        >
          Store (global SSOT — not filtered by brain selector): {catalog.store}
          {typeof catalog?.summary?.total_keys === 'number' ? ` · ${catalog.summary.total_keys} keys` : ''}
        </div>
      )}

      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard label="Keys" value={String(summary.total_keys)} accent="#60a5fa" />
          <SummaryCard label="Providers" value={String(summary.providers_active)} accent="#a78bfa" />
          <SummaryCard
            label="Planned / mo"
            value={`$${(summary.monthly_subscription_usd || 0).toFixed(0)}`}
            accent="#fbbf24"
          />
          <SummaryCard
            label="Usage 30d"
            value={`$${(summary.usage_30d?.cost_usd || 0).toFixed(2)}`}
            accent="#34d399"
          />
          <SummaryCard
            label="Usage 7d"
            value={`$${(summary.usage_7d?.cost_usd || 0).toFixed(2)}`}
            accent="#22d3ee"
          />
          <SummaryCard
            label="Rotate due"
            value={String(summary.rotation_overdue || 0)}
            accent={summary.rotation_overdue ? '#f87171' : '#64748b'}
          />
          <SummaryCard
            label="Multi-repo errors"
            value={String(summary.multi_repo_violations || 0)}
            accent={summary.multi_repo_violations ? '#f87171' : '#64748b'}
          />
          <SummaryCard
            label="Developer"
            value={String(summary.developer_keys || 0)}
            accent="#a78bfa"
          />
        </div>
      )}

      {(summary?.multi_repo_violations || 0) > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: 14,
            borderColor: 'rgba(248,113,113,0.5)',
            background: 'rgba(248,113,113,0.08)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: '#f87171' }}>Multi-repo binding error</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
            {summary?.multi_repo_violations} key(s) are bound to more than one repo. Each secret must be
            unique to a single product repo, or left unbound as a <strong>Developer secret</strong>{' '}
            (tooling / personal). Fix in the red “Needs fix” section below — set <em>one</em> repo or
            clear the field.
          </p>
        </div>
      )}

      {catalog?.by_provider && catalog.by_provider.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 8, fontSize: 11 }}
            onClick={() => setShowCostChart((v) => !v)}
          >
            {showCostChart ? '▾ Hide cost chart' : '▸ Cost by provider'}
          </button>
          {showCostChart && (
            <div className="card" style={{ marginBottom: 12, padding: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {catalog.by_provider.map((p) => {
                  const max = Math.max(
                    ...catalog.by_provider.map((x) => x.cost_30d + x.monthly_cost),
                    1,
                  )
                  const total = p.cost_30d + p.monthly_cost
                  const pct = Math.min(100, (total / max) * 100)
                  return (
                    <div
                      key={p.provider}
                      style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px', gap: 10, alignItems: 'center' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.provider}</span>
                      <div style={{ height: 6, background: 'rgba(148,163,184,0.12)', borderRadius: 99, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6, #22d3ee)',
                            borderRadius: 99,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>
                        ${total.toFixed(2)} · {p.keys}k
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(
          [
            { id: 'catalog' as Tab, label: 'Provider secrets (env)' },
            { id: 'import' as Tab, label: 'Import from env' },
            { id: 'cloud' as Tab, label: 'Cloud Models (API)' },
            { id: 'pats' as Tab, label: 'TR PATs (key generator)' },
            { id: 'sync' as Tab, label: 'Mesh Sync Status' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

{tab === 'usage' && (
        <div style={{ height: 'calc(100vh - 280px)', minHeight: 420, position: 'relative', overflowY: 'auto' }}>
          <UsagePage />
        </div>
      )}

      {tab === 'catalog' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            /* Keep list in a fixed viewport so editor never requires page-top scroll */
            height: 'calc(100vh - 280px)',
            minHeight: 420,
            marginRight: (selected || isCreating) ? 440 : 0,
            transition: 'margin 0.15s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
              <button
                onClick={() => setGroupBy('repo')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: 'pointer', border: 'none',
                  background: groupBy === 'repo' ? 'var(--bg-active)' : 'transparent',
                  color: groupBy === 'repo' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                By Repo
              </button>
              <button
                onClick={() => setGroupBy('api')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: 'pointer', border: 'none',
                  background: groupBy === 'api' ? 'var(--bg-active)' : 'transparent',
                  color: groupBy === 'api' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                By API
              </button>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter key, provider, repo, tier…"
              style={{
                flex: '1 1 200px',
                minWidth: 160,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 10, cursor: 'pointer' }}
              onClick={() => {
                setSelected(null)
                setIsCreating(true)
                setEdit({
                  label: '',
                  provider: 'openai',
                  repos: '',
                  subscription_tier: '',
                  monthly_cost_usd: '',
                  monthly_cap_usd: '',
                  api_docs_url: '',
                  headscale_url: '',
                  rotate_every_days: '',
                  auto_rotate: false,
                  notes: '',
                  project_path: ''
                })
                setNewSecretKeyName('')
                setNewSecretVal('')
              }}
            >
              + Create Secret
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => expandAllSections(repoSections.map((s) => s.id))}
            >
              Expand all
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={collapseAllSections}>
              Collapse all
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {keys.length} shown
              {selected ? ` · editing ${selected.key}` : ''}
            </span>
          </div>

          {/* Repo chips — click expands that section only */}
          {repoSections.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 8,
                flexShrink: 0,
                maxHeight: 72,
                overflowY: 'auto',
              }}
            >
              {repoSections.map((sec) => {
                const open = expandedSections.has(sec.id)
                return (
                  <button
                    key={`chip-${sec.id}`}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      background: open
                        ? sec.kind === 'error'
                          ? 'rgba(248,113,113,0.2)'
                          : 'rgba(59,130,246,0.18)'
                        : 'transparent',
                      borderColor:
                        sec.kind === 'error'
                          ? 'rgba(248,113,113,0.45)'
                          : open
                            ? 'var(--border-accent)'
                            : 'var(--border)',
                      color: sec.kind === 'error' ? '#f87171' : 'var(--text-primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    onClick={() => {
                      if (open && expandedSections.size === 1) {
                        expandAllSections(repoSections.map((s) => s.id))
                      } else {
                        expandOnly(sec.id)
                      }
                    }}
                    title={open ? 'Currently expanded' : 'Expand this repo only'}
                  >
                    {open ? '▾ ' : '▸ '}
                    {groupBy === 'api' && <ProviderLogo provider={sec.id} />}
                    {sec.label}
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>{sec.keys.length}</span>
                  </button>
                )
              })}
            </div>
          )}

          {loading && !catalog ? (
            <p style={{ color: 'var(--text-tertiary)' }}>Loading catalog…</p>
          ) : keys.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ marginBottom: 12 }}>
                No provider secrets in the global store
                {filter ? ` matching “${filter}”` : ''}.
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void runScan()}>
                Scan / migrate import
              </button>
            </div>
          ) : (
            <div
              className="card"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {repoSections.map((sec) => {
                const open = expandedSections.has(sec.id)
                return (
                  <section
                    key={sec.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background:
                        sec.kind === 'error'
                          ? 'rgba(248,113,113,0.04)'
                          : sec.kind === 'developer'
                            ? 'rgba(167,139,250,0.04)'
                            : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(sec.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: sec.kind === 'error' ? '#f87171' : 'var(--text-primary)',
                          }}
                        >
                          {open ? '▾' : '▸'} {groupBy === 'api' && <ProviderLogo provider={sec.id} />} {sec.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {sec.kind === 'error'
                            ? 'Fix: one repo only, or clear for Developer secrets'
                            : sec.kind === 'developer'
                              ? 'Tooling / unbound'
                              : sec.kind === 'provider'
                                ? [...new Set(sec.keys.flatMap(k => k.repos || []))].join(', ') || 'Global'
                                : 'Product repo'}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          flexShrink: 0,
                          padding: '2px 8px',
                          borderRadius: 99,
                          background:
                            sec.kind === 'error'
                              ? 'rgba(248,113,113,0.15)'
                              : 'rgba(148,163,184,0.12)',
                          color: sec.kind === 'error' ? '#f87171' : 'var(--text-secondary)',
                        }}
                      >
                        {sec.keys.length}
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: '0 8px 8px' }}>
                        {sec.keys.map((k) => (
                          <SecretKeyRow
                            key={`${sec.id}::${k.key}`}
                            k={k}
                            selected={selected?.key === k.key}
                            onOpen={() => openKey(k, sec.id)}
                            groupBy={groupBy}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          {/* Fixed viewport drawer — no scroll-to-top */}
          {(selected || isCreating) && (
            <div
              role="dialog"
              aria-label={selected ? `Edit ${selected.key}` : 'Create Secret'}
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 'min(420px, 100vw)',
                zIndex: 80,
                background: 'var(--bg-secondary, #0f1419)',
                borderLeft: '1px solid var(--border)',
                boxShadow: '-12px 0 40px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {selected ? 'Edit secret' : 'Create secret'}
                  </div>
                  <strong
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 13,
                      wordBreak: 'break-all',
                      display: 'block',
                      marginTop: 2,
                    }}
                  >
                    {selected ? selected.key : 'New Secret'}
                  </strong>
                  {selected && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {selected.masked || '••••'}
                      {selected.subscription_tier ? ` · ${selected.subscription_tier}` : ''}
                      {selected.monthly_cost_usd != null ? ` · $${selected.monthly_cost_usd}/mo` : ''}
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); selectedKeyRef.current = null; setIsCreating(false); }}>
                  ✕
                </button>
              </div>
               <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {isCreating && (
                  <form onSubmit={(e) => { void handleCreateSecret(e) }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <PanelSection title="Credentials">
                      <div>
                        <label htmlFor="secret-key-name" className="field-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Secret Key Name
                        </label>
                        <input
                          id="secret-key-name"
                          className="input font-mono"
                          placeholder="e.g. OPENAI_API_KEY"
                          value={newSecretKeyName}
                          onChange={e => setNewSecretKeyName(e.target.value)}
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            padding: '8px 12px',
                            borderRadius: 6,
                            outline: 'none',
                            fontSize: 13,
                            width: '100%',
                            marginTop: 4,
                            boxSizing: 'border-box'
                          }}
                          required
                        />
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <label htmlFor="secret-value" className="field-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Secret Value
                        </label>
                        <input
                          id="secret-value"
                          type="password"
                          className="input"
                          placeholder="Enter credential value"
                          value={newSecretVal}
                          onChange={e => setNewSecretVal(e.target.value)}
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            padding: '8px 12px',
                            borderRadius: 6,
                            outline: 'none',
                            fontSize: 13,
                            width: '100%',
                            marginTop: 4,
                            boxSizing: 'border-box'
                          }}
                          required
                        />
                      </div>
                    </PanelSection>

                    <PanelSection title="Identity">
                      <Field label="Label" value={edit.label} onChange={(v) => setEdit({ ...edit, label: v })} />
                      <Field label="Provider" value={edit.provider} onChange={(v) => setEdit({ ...edit, provider: v })} />
                    </PanelSection>

                    <PanelSection title="Binding (one repo max)">
                      <Field
                        label="Product repo (exactly one name, or empty = Developer secrets)"
                        value={edit.repos}
                        onChange={(v) => setEdit({ ...edit, repos: v })}
                      />
                      {edit.repos.split(/[,]+/).map((s) => s.trim()).filter(Boolean).length > 1 && (
                        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 10 }}>
                          Error: only one repo allowed. Remove extras before save.
                        </div>
                      )}
                      <Field label="Project path (optional)" value={edit.project_path} onChange={(v) => setEdit({ ...edit, project_path: v })} />
                    </PanelSection>

                    <PanelSection title="Subscription & cost">
                      <Field
                        label="Subscription level / tier"
                        value={edit.subscription_tier}
                        onChange={(v) => setEdit({ ...edit, subscription_tier: v })}
                        placeholder="e.g. free, pro, team, enterprise, payg"
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
                        <Field
                          label="Monthly cost $"
                          value={edit.monthly_cost_usd}
                          onChange={(v) => setEdit({ ...edit, monthly_cost_usd: v })}
                          placeholder="20"
                        />
                        <Field
                          label="Monthly cap $ (budget)"
                          value={edit.monthly_cap_usd}
                          onChange={(v) => setEdit({ ...edit, monthly_cap_usd: v })}
                          placeholder="100"
                        />
                      </div>
                    </PanelSection>

                    <PanelSection title="Docs & rotation">
                      {edit.provider.trim().toLowerCase() === 'headscale' && (
                        <Field
                          label="Headscale HTTPS URL"
                          value={edit.headscale_url}
                          onChange={(v) => setEdit({ ...edit, headscale_url: v })}
                          placeholder="https://headscale.example.com"
                        />
                      )}
                      <Field label="API docs URL" value={edit.api_docs_url} onChange={(v) => setEdit({ ...edit, api_docs_url: v })} />
                      <Field label="Rotate every (days)" value={edit.rotate_every_days} onChange={(v) => setEdit({ ...edit, rotate_every_days: v })} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={!!edit.auto_rotate}
                          onChange={(e) => setEdit({ ...edit, auto_rotate: e.target.checked })}
                        />
                        Auto-rotate when due
                      </label>
                      <Field label="Notes" value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} />
                    </PanelSection>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                        {saving ? 'Creating...' : 'Create Secret'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setIsCreating(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {selected && (
                  <>
                    <PanelSection
                      title="Reveal value (passkey)"
                      hint="Full secret values require step-up auth — passkey preferred, password fallback"
                    >
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Passkeys: {webauthn?.count ?? 0}
                  {!browserSupportsWebAuthn() && ' · browser unsupported'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={revealBusy || !browserSupportsWebAuthn()}
                    onClick={() => void registerPasskey()}
                  >
                    {webauthn?.has_passkeys ? 'Add another passkey' : 'Register passkey (Touch ID)'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={revealBusy || !webauthn?.has_passkeys}
                    onClick={() => void doReveal('passkey')}
                  >
                    Reveal with passkey
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,flex:1}}>
                      <input
                        type="password"
                        value={revealPassword}
                        onChange={(e) => setRevealPassword(e.target.value)}
                        placeholder="Or re-enter dashboard password"
                        style={{ ...inputStyle, width: '100%', marginTop: 0 }}
                      />
                    </form>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={revealBusy || !revealPassword}
                      onClick={() => void doReveal('password')}
                    >
                      Reveal
                    </button>
                  </div>
                </div>
                {revealedValue != null && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(52,211,153,0.08)',
                      border: '1px solid rgba(52,211,153,0.35)',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      PLAINTEXT (hides in 30s) — never paste into chat/vault
                    </div>
                    <code
                      style={{
                        fontSize: 11,
                        wordBreak: 'break-all',
                        display: 'block',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {revealedValue}
                    </code>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void doCopyRevealed()}>
                        Copy
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRevealedValue(null)}
                      >
                        Hide now
                      </button>
                    </div>
                  </div>
                )}
              </PanelSection>

              {selected.schema && (
                <div style={{ fontSize: 11, marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid var(--border-accent)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Schema</div>
                  <div>auth: {selected.schema.auth}</div>
                  {selected.schema.header && <div style={{ fontFamily: 'monospace' }}>{selected.schema.header}</div>}
                  {selected.schema_notes && <div style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>{selected.schema_notes}</div>}
                </div>
              )}

              <PanelSection title="Identity">
                <Field label="Label" value={edit.label} onChange={(v) => setEdit({ ...edit, label: v })} />
                <Field label="Provider" value={edit.provider} onChange={(v) => setEdit({ ...edit, provider: v })} />
              </PanelSection>

              <PanelSection title="Binding (one repo max)">
                <Field
                  label="Product repo (exactly one name, or empty = Developer secrets)"
                  value={edit.repos}
                  onChange={(v) => setEdit({ ...edit, repos: v })}
                />
                {edit.repos.split(/[,]+/).map((s) => s.trim()).filter(Boolean).length > 1 && (
                  <div style={{ fontSize: 11, color: '#f87171', marginBottom: 10 }}>
                    Error: only one repo allowed. Remove extras before save.
                  </div>
                )}
                {selected.multi_repo_error && selected.binding_error && (
                  <div style={{ fontSize: 11, color: '#f87171', marginBottom: 10 }}>
                    {selected.binding_error}
                  </div>
                )}
                <Field label="Project path (optional)" value={edit.project_path} onChange={(v) => setEdit({ ...edit, project_path: v })} />
              </PanelSection>

              <PanelSection
                title="Subscription & cost"
                hint="Plan level + what you pay monthly for this key/provider"
              >
                <Field
                  label="Subscription level / tier"
                  value={edit.subscription_tier}
                  onChange={(v) => setEdit({ ...edit, subscription_tier: v })}
                  placeholder="e.g. free, pro, team, enterprise, payg"
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {(selected.tiers?.length
                    ? selected.tiers
                    : DEFAULT_TIERS
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderColor:
                          edit.subscription_tier === t.id ? 'var(--border-accent)' : undefined,
                        background:
                          edit.subscription_tier === t.id ? 'rgba(59,130,246,0.15)' : undefined,
                      }}
                      onClick={() =>
                        setEdit({
                          ...edit,
                          subscription_tier: t.id,
                          monthly_cost_usd:
                            t.monthly_usd != null ? String(t.monthly_usd) : edit.monthly_cost_usd,
                        })
                      }
                    >
                      {t.label}
                      {t.monthly_usd != null ? ` $${t.monthly_usd}` : ''}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <Field
                    label="Monthly cost $"
                    value={edit.monthly_cost_usd}
                    onChange={(v) => setEdit({ ...edit, monthly_cost_usd: v })}
                    placeholder="20"
                  />
                  <Field
                    label="Monthly cap $ (budget)"
                    value={edit.monthly_cap_usd}
                    onChange={(v) => setEdit({ ...edit, monthly_cap_usd: v })}
                    placeholder="100"
                  />
                </div>
                {(edit.subscription_tier || edit.monthly_cost_usd) && (
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(251,191,36,0.08)',
                      border: '1px solid rgba(251,191,36,0.25)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Plan preview:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {edit.subscription_tier || '—'}
                    </strong>
                    {edit.monthly_cost_usd
                      ? ` · $${edit.monthly_cost_usd}/mo`
                      : ' · no monthly cost set'}
                    {edit.monthly_cap_usd ? ` · cap $${edit.monthly_cap_usd}` : ''}
                  </div>
                )}
              </PanelSection>

              <PanelSection title="Docs & rotation">
                {edit.provider.trim().toLowerCase() === 'headscale' && (
                  <Field
                    label="Headscale HTTPS URL"
                    value={edit.headscale_url}
                    onChange={(v) => setEdit({ ...edit, headscale_url: v })}
                    placeholder="https://headscale.example.com"
                  />
                )}
                <Field label="API docs URL" value={edit.api_docs_url} onChange={(v) => setEdit({ ...edit, api_docs_url: v })} />
                <Field label="Rotate every (days)" value={edit.rotate_every_days} onChange={(v) => setEdit({ ...edit, rotate_every_days: v })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!edit.auto_rotate}
                    onChange={(e) => setEdit({ ...edit, auto_rotate: e.target.checked })}
                  />
                  Auto-rotate when due (flag — use CLI/agent to supply new value)
                </label>
                <Field label="Notes" value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} />
              </PanelSection>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveMeta()}>
                  Save metadata
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void sampleUsage()}>
                  Record sample usage $0.01
                </button>
              </div>

              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Rotate value</div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}>
                  <input
                    type="password"
                    value={rotateVal}
                    onChange={(e) => setRotateVal(e.target.value)}
                    placeholder="New secret value"
                    style={inputStyle}
                  />
                </form>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 8, width: '100%' }}
                  disabled={!rotateVal || saving}
                  onClick={() => void doRotate()}
                >
                  Rotate + export .env
                </button>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  Browser assist CLI: <code>npx total-recall secret rotate-browser {selected.key}</code>
                </p>
                {selected.next_rotate_due && (
                  <div style={{ fontSize: 11, color: selected.rotation_overdue ? '#f87171' : 'var(--text-tertiary)', marginTop: 6 }}>
                    Next due: {new Date(selected.next_rotate_due).toLocaleDateString()}
                    {selected.rotation_overdue ? ' — overdue' : ''}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                30d usage: {selected.usage_30d?.events || 0} events · $
                {(selected.usage_30d?.cost_usd || 0).toFixed(4)}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {selected.console_url && (
                  <a href={selected.console_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Console
                  </a>
                )}
                {selected.pricing_url && (
                  <a href={selected.pricing_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Pricing
                  </a>
                )}
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#f87171', marginLeft: 'auto' }} onClick={() => void doDelete()}>
                  Delete
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                CLI: secret meta {selected.key} --repo my-app --tier pro --monthly-cost 25 --rotate-days 90
              </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'import' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 8 }}>One-time migrate (import-env)</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
            Pull legacy keys from local <code>.env</code> files into the TR store. Steady-state path is the opposite:{' '}
            <strong>export-env</strong> writes projections out from the store.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runScan()} style={{ marginBottom: 12 }}>
            Re-scan
          </button>
          {scanCandidates.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No candidates — click Re-scan or use onboarding paste.</p>
          ) : (
            <>
              {scanCandidates.map((c) => (
                <label key={c.key} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: c.already_set ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    disabled={!!c.already_set}
                    checked={importSel.has(c.key)}
                    onChange={() => {
                      setImportSel((prev) => {
                        const n = new Set(prev)
                        if (n.has(c.key)) n.delete(c.key)
                        else n.add(c.key)
                        return n
                      })
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.key}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.masked} · {c.source_label}</span>
                </label>
              ))}
              <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => void runImport()}>
                Import {importSel.size} key(s)
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'pats' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            <strong>Original Total Recall feature:</strong> issue Personal Access Tokens that authenticate to{' '}
            <code>this</code> brain (<code>Authorization: Bearer …</code> on <code>/api/*</code>). These are{' '}
            <em>not</em> OpenAI/Anthropic keys — they only unlock your TR API.
          </p>
          <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="PAT name"
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newKeyName.trim()}
              onClick={async () => {
                try {
                  const k = await issueApiKey(newKeyName.trim(), ['*'])
                  setNewlyIssued(k)
                  setNewKeyName('')
                  await loadPats()
                } catch (e: unknown) {
                  setError((e as Error).message)
                }
              }}
            >
              Issue PAT
            </button>
          </div>
          {newlyIssued && (
            <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(52,211,153,0.4)' }}>
              <strong>Copy now — shown once</strong>
              <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8, wordBreak: 'break-all' }}>{newlyIssued.token}</div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(newlyIssued.token)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {pats.filter((k) => !k.revoked).map((k) => (
            <div key={k.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{k.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{k.token_preview}… · {k.scopes?.join(', ')}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => void revokeApiKey(k.id).then(loadPats)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === 'cloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
             <button onClick={handleSaveConfig} disabled={saving} className="btn btn-primary" style={{ minWidth: 120 }}>
               {saving ? 'Saving...' : 'Save Configuration'}
             </button>
          </div>
          {configSuccess && (
            <div className="badge badge-success" style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
              ✓ {configSuccess}
            </div>
          )}
          <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Cloud & Search APIs</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bring your own cloud models</p>
                </div>
              </div>

              {/* Google Gemini API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="google_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Google Gemini API Key</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'gemini' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'gemini'} 
                      onChange={() => updateBrainProp('preferred_agent', 'gemini')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="google_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder="AIzaSy..."
                  value={configData?.secrets?.google_api_key || ''}
                  onChange={(e) => updateSecretsProp('google_api_key', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                /></form>
                
                <select
                  disabled={!configData?.secrets?.google_api_key}
                  value={configData?.brain?.gemini_model || ''}
                  onChange={(e) => updateBrainProp('gemini_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default Gemini Model</option>
                  {geminiModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - ${promptCost}/${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.google_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* Anthropic API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="anthropic_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Anthropic API Key (Claude)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'claude' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'claude'} 
                      onChange={() => updateBrainProp('preferred_agent', 'claude')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="anthropic_api_key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={configData?.secrets?.anthropic_api_key || ''}
                  onChange={(e) => updateSecretsProp('anthropic_api_key', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                /></form>
                
                <select
                  disabled={!configData?.secrets?.anthropic_api_key}
                  value={configData?.brain?.claude_model || ''}
                  onChange={(e) => updateBrainProp('claude_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default Claude Model</option>
                  {claudeModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - ${promptCost}/${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.anthropic_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* OpenAI API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="openai_api_key" style={{ fontSize: 13, fontWeight: 500 }}>OpenAI API Key (Codex)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'codex' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'codex'} 
                      onChange={() => updateBrainProp('preferred_agent', 'codex')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="openai_api_key"
                  type="password"
                  placeholder="sk-proj-..."
                  value={configData?.secrets?.openai_api_key || ''}
                  onChange={(e) => updateSecretsProp('openai_api_key', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                /></form>
                
                <select
                  disabled={!configData?.secrets?.openai_api_key}
                  value={configData?.brain?.openai_model || ''}
                  onChange={(e) => updateBrainProp('openai_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default OpenAI Model</option>
                  {openaiModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - ${promptCost}/${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.openai_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* OpenRouter API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="openrouter_api_key" style={{ fontSize: 13, fontWeight: 500 }}>OpenRouter API Key</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'openrouter' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'openrouter'} 
                      onChange={() => updateBrainProp('preferred_agent', 'openrouter')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="openrouter_api_key"
                  type="password"
                  placeholder="sk-or-..."
                  value={configData?.secrets?.openrouter_api_key || ''}
                  onChange={(e) => updateSecretsProp('openrouter_api_key', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                /></form>
                
                
                
                {loading && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '0 4px' }}>Fetching models...</div>}

                {!loading && orModels.length === 0 && configData?.secrets?.openrouter_api_key?.startsWith('sk-or-') && (
                  <div style={{ fontSize: 11, color: 'var(--accent-red)', padding: '0 4px' }}>Failed to fetch OpenRouter models.</div>
                )}
                {!loading && orModels.length > 0 && (
                  <select
                    id="openrouter_model"
                    value={configData?.brain?.openrouter_model || ''}
                    onChange={(e) => updateBrainProp('openrouter_model', e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      outline: 'none',
                      fontSize: 13,
                      marginTop: 4
                    }}
                  >
                    <option value="">Default OpenRouter Model</option>
                    {(() => {
                      const groups: Record<string, typeof orModels> = {};
                      orModels.forEach(m => {
                        const provider = m.id.split('/')[0].toUpperCase();
                        if (!groups[provider]) groups[provider] = [];
                        groups[provider].push(m);
                      });
                      
                      // Sort providers alphabetically
                      const sortedProviders = Object.keys(groups).sort((a, b) => a.localeCompare(b));
                      
                      return sortedProviders.map(provider => {
                        // Sort models within provider by ID alphabetically
                        const sortedModels = groups[provider].sort((a, b) => a.id.localeCompare(b.id));
                        return (
                        <optgroup key={provider} label={provider}>
                          {sortedModels.map(m => {
                            let costStr = '';
                            if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                              const promptCost = (parseFloat(m.pricing.prompt) * 1000000).toFixed(2);
                              const compCost = (parseFloat(m.pricing.completion) * 1000000).toFixed(2);
                              costStr = ` - ${promptCost}/${compCost} per 1M`;
                            }
                            return (
                              <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                            );
                          })}
                        </optgroup>
                        );
                      });
                    })()}
                  </select>
                )}
              </div>
              
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Mesh Secrets Sync Status</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Checksum of local encrypted secrets database. Sync pushes updates to all configured mesh nodes.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {localChecksum && (
                <div className="badge" style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                  Local Checksum: <code style={{ color: 'var(--accent)' }}>{localChecksum.slice(0, 8)}</code>
                </div>
              )}
              <button 
                onClick={handleTriggerSync} 
                disabled={syncing} 
                className="btn btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {syncing && (
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 12, height: 12, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.75s linear infinite' }} />
                )}
                {syncing ? 'Syncing...' : 'Trigger Sync'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {/* Sync Nodes List */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, margin: 0 }}>
                Mesh Nodes ({syncNodes.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                {syncNodes.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', margin: '20px 0' }}>
                    No mesh nodes configured or reachable.
                  </p>
                ) : (
                  syncNodes.map(node => (
                    <div key={node.hostname} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{node.hostname}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{node.ip}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {node.checksum && (
                          <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{node.checksum.slice(0, 8)}</code>
                        )}
                        <span 
                          style={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            background: node.status === 'synced' ? '#22c55e' : node.status === 'out_of_sync' ? '#eab308' : '#ef4444',
                            boxShadow: node.status === 'synced' ? '0 0 6px rgba(34,197,94,0.5)' : node.status === 'out_of_sync' ? '0 0 6px rgba(234,179,8,0.5)' : '0 0 6px rgba(239,68,68,0.5)'
                          }} 
                          title={node.status}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sync Logs */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 10, margin: 0 }}>
                Sync Activity Log
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                {syncLogs.map((log, idx) => (
                  <div key={idx} style={{ color: log.status === 'success' ? '#34d399' : log.status === 'error' ? '#f87171' : 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>[{log.time}]</span>
                    {log.event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}



      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text-tertiary)' }}>
        CLI: <code>secret catalog</code> · <code>secret meta KEY --repo app --tier pro --monthly-cost 25 --rotate-days 90</code> ·{' '}
        <code>secret rotation-due</code> · <code>secret usage</code> · <code>secret providers</code>
      </p>
    </div>
  )
}

const DEVELOPER_ID = '__developer__'
const MULTI_ERROR_ID = '__multi_repo_error__'

function groupKeysByRepo(keys: SecretCatalogKey[]): {
  id: string
  label: string
  keys: SecretCatalogKey[]
  kind: 'error' | 'repo' | 'developer'
}[] {
  const map = new Map<string, SecretCatalogKey[]>()
  const developer: SecretCatalogKey[] = []
  const multiError: SecretCatalogKey[] = []

  for (const k of keys) {
    const repos = (k.repos || []).map((r) => r.trim()).filter(Boolean)
    if (repos.length > 1 || k.multi_repo_error) {
      multiError.push(k)
      continue
    }
    if (!repos.length) {
      developer.push(k)
      continue
    }
    // Exactly one product repo
    const repo = repos[0]
    if (!map.has(repo)) map.set(repo, [])
    map.get(repo)!.push(k)
  }

  const sections: {
    id: string
    label: string
    keys: SecretCatalogKey[]
    kind: 'error' | 'repo' | 'developer'
  }[] = []

  // Errors first so they are impossible to miss
  if (multiError.length) {
    sections.push({
      id: MULTI_ERROR_ID,
      label: 'Needs fix — multi-repo binding',
      keys: multiError.slice().sort((a, b) => a.key.localeCompare(b.key)),
      kind: 'error',
    })
  }

  for (const [repo, list] of [...map.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )) {
    sections.push({
      id: repo.replace(/[^a-zA-Z0-9._-]+/g, '-'),
      label: repo,
      keys: list.slice().sort((a, b) => a.key.localeCompare(b.key)),
      kind: 'repo',
    })
  }

  if (developer.length) {
    sections.push({
      id: DEVELOPER_ID,
      label: 'Developer secrets',
      keys: developer.slice().sort((a, b) => a.key.localeCompare(b.key)),
      kind: 'developer',
    })
  }

  return sections
}

/** Compact single-line-ish row for long catalogs */
function SecretKeyRow({
  k,
  selected,
  onOpen,
  groupBy,
}: {
  k: SecretCatalogKey
  selected: boolean
  onOpen: () => void
  groupBy?: 'repo' | 'api'
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        marginBottom: 4,
        borderRadius: 8,
        border: `1px solid ${selected ? 'var(--border-accent)' : 'transparent'}`,
        background: selected
          ? 'rgba(59,130,246,0.14)'
          : k.multi_repo_error || k.rotation_overdue
            ? 'rgba(248,113,113,0.06)'
            : 'rgba(148,163,184,0.04)',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontWeight: 650,
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {k.key}
          {k.multi_repo_error && (
            <span style={{ marginLeft: 6, fontSize: 9, color: '#f87171' }}>MULTI</span>
          )}
          {k.rotation_overdue && (
            <span style={{ marginLeft: 6, fontSize: 9, color: '#f87171' }}>DUE</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {groupBy === 'api' 
            ? (k.repos?.length ? k.repos.join(', ') : 'Developer') 
            : (k.provider_name || k.provider || '—')} · {k.masked || '••••'}
          {k.multi_repo_error ? ` · ${k.repos.join(', ')}` : ''}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 0 }}>
        <span style={{ color: k.subscription_tier ? '#fbbf24' : 'var(--text-tertiary)' }}>
          {k.subscription_tier || 'no tier'}
        </span>
        {' · '}
        <span style={{ color: k.monthly_cost_usd != null ? '#34d399' : 'var(--text-tertiary)' }}>
          {k.monthly_cost_usd != null ? `$${k.monthly_cost_usd}/mo` : 'no $/mo'}
        </span>
        {' · '}
        <span style={{ color: k.usage_30d?.cost_usd > 0 ? '#22d3ee' : 'var(--text-tertiary)' }} title={`${k.usage_30d?.events || 0} events`}>
          {k.usage_30d?.cost_usd > 0 ? `$${k.usage_30d.cost_usd.toFixed(2)} used` : 'no usage'}
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>›</span>
    </button>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="card"
      style={{
        padding: '14px 16px',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

const DEFAULT_TIERS: { id: string; label: string; monthly_usd?: number | null }[] = [
  { id: 'free', label: 'Free', monthly_usd: 0 },
  { id: 'payg', label: 'Pay-as-you-go', monthly_usd: null },
  { id: 'pro', label: 'Pro', monthly_usd: 20 },
  { id: 'team', label: 'Team', monthly_usd: 30 },
  { id: 'business', label: 'Business', monthly_usd: 50 },
  { id: 'enterprise', label: 'Enterprise', monthly_usd: null },
]

function PanelSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-secondary)',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, marginTop: 4 }}
      />
    </label>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 12,
}
