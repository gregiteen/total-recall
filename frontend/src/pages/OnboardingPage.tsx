import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listMemory,
  createMemory,
  triggerRecompile,
  scanEnvSecrets,
  parseEnvPaste,
  importEnvSecrets,
  type EnvSecretCandidate,
} from '../api'
import BrandMark from '../components/brand/BrandMark'

const STORAGE_KEY = 'tr-onboarding-v1'

type StepId = 'welcome' | 'import-env' | 'remember' | 'connect' | 'dream' | 'done'

interface Step {
  id: StepId
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Total Recall',
    body: 'Portable personal memory for any IDE. Your rules and facts live as Markdown files on disk — not a locked vendor database.',
  },
  {
    id: 'import-env',
    title: 'Import your API keys',
    body: 'Scan the machine for keys already in .env files or the shell, or paste a .env block. Nothing is written until you choose what to import.',
  },
  {
    id: 'remember',
    title: 'Save your first memory',
    body: 'Write a fact or preference into the vault. This is the core write path: remember → compile → IDEs see it.',
  },
  {
    id: 'connect',
    title: 'Connect an IDE',
    body: 'Wire Claude Code, Cursor, Codex, Gemini, Aider, Obsidian, or any HTTP host. Injected blocks never overwrite your local rules outside TR markers.',
  },
  {
    id: 'dream',
    title: 'Dream consolidates memory',
    body: 'Dream is sleep for your vault: ingest sessions, conflict-check, recompile surfaces, prune. Run it anytime; no always-on LLM required.',
  },
  {
    id: 'done',
    title: "You're set",
    body: 'Default loop: init → connect → remember/recall → dream. Optional: task queue, skill track any repo, daemon in the background.',
  },
]

function loadProgress(): { step: number; fact?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return { step: 0 }
  }
}

function saveProgress(p: { step: number; fact?: string; complete?: boolean }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  if (p.complete) localStorage.setItem('tr-onboarding-complete', '1')
}

export function isOnboardingComplete(): boolean {
  return localStorage.getItem('tr-onboarding-complete') === '1'
}

export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('tr-onboarding-complete')
}

/** Client-side .env parse so we can re-send pairs on import without server holding paste. */
function parseEnvClient(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice(7).trim() : line
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    let val = body.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    } else {
      val = val.replace(/\s+#.*$/, '').trim()
    }
    if (key && val) out[key] = val
  }
  return out
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const initial = loadProgress()
  const [stepIdx, setStepIdx] = useState(initial.step || 0)
  const [fact, setFact] = useState(initial.fact || '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)

  // Env import state
  const [candidates, setCandidates] = useState<EnvSecretCandidate[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [pasteText, setPasteText] = useState('')
  const [pastePairs, setPastePairs] = useState<Record<string, string>>({})
  const [scanError, setScanError] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [importMode, setImportMode] = useState<'scan' | 'paste'>('scan')

  const step = STEPS[Math.min(stepIdx, STEPS.length - 1)]

  useEffect(() => {
    listMemory()
      .then((nodes) => {
        const list = nodes || []
        const profile = list.some(
          (n) =>
            n.slug === 'user-profile' ||
            n.slug === 'onboarding-first-memory' ||
            (n.tags || []).includes('onboarding'),
        )
        const established = profile || list.length >= 5
        setHasProfile(profile || established)
        if (established && !isOnboardingComplete()) {
          localStorage.setItem('tr-onboarding-complete', '1')
        }
      })
      .catch(() => {})
  }, [])

  // Auto-scan when entering import-env step
  useEffect(() => {
    if (step.id !== 'import-env' || importMode !== 'scan') return
    let cancelled = false
    setScanLoading(true)
    setScanError('')
    scanEnvSecrets()
      .then((data) => {
        if (cancelled) return
        setCandidates(data.candidates || [])
        const pick = new Set(
          (data.candidates || [])
            .filter((c) => !c.already_set)
            .map((c) => c.key),
        )
        setSelectedKeys(pick)
      })
      .catch((e) => {
        if (!cancelled) setScanError(e instanceof Error ? e.message : 'Scan failed')
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [step.id, importMode])

  function next() {
    const n = Math.min(stepIdx + 1, STEPS.length - 1)
    setStepIdx(n)
    saveProgress({ step: n, fact })
    setStatus('')
  }

  function back() {
    const n = Math.max(stepIdx - 1, 0)
    setStepIdx(n)
    saveProgress({ step: n, fact })
    setStatus('')
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllNew() {
    setSelectedKeys(
      new Set(candidates.filter((c) => !c.already_set).map((c) => c.key)),
    )
  }

  function selectNone() {
    setSelectedKeys(new Set())
  }

  async function handlePastePreview() {
    if (!pasteText.trim()) {
      setStatus('Paste a .env block first.')
      return
    }
    setBusy(true)
    setScanError('')
    try {
      const pairs = parseEnvClient(pasteText)
      setPastePairs(pairs)
      const data = await parseEnvPaste(pasteText)
      setCandidates(data.candidates || [])
      setSelectedKeys(
        new Set((data.candidates || []).filter((c) => !c.already_set).map((c) => c.key)),
      )
      setStatus(
        data.count
          ? `Found ${data.count} importable key(s) in paste.`
          : 'No known API key names in paste.',
      )
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setBusy(false)
    }
  }

  async function runImport() {
    const keys = [...selectedKeys]
    if (!keys.length) {
      setStatus('Select at least one key, or skip this step.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const result =
        importMode === 'paste' && Object.keys(pastePairs).length
          ? await importEnvSecrets({ keys, pairs: pastePairs, overwrite: false })
          : await importEnvSecrets({ keys, overwrite: false })
      setStatus(
        `Imported ${result.imported_count} secret(s)` +
          (result.skipped_count ? `, skipped ${result.skipped_count} already set` : '') +
          '.',
      )
      // refresh scan marks
      if (importMode === 'scan') {
        const data = await scanEnvSecrets()
        setCandidates(data.candidates || [])
        setSelectedKeys(new Set())
      } else {
        setCandidates((prev) =>
          prev.map((c) =>
            result.imported.some((i) => i.key === c.key)
              ? { ...c, already_set: true }
              : c,
          ),
        )
        setSelectedKeys(new Set())
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveFirstMemory() {
    if (!fact.trim()) {
      setStatus('Write a short fact or preference first.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await createMemory({
        slug: 'onboarding-first-memory',
        category: 'preferences',
        title: 'Onboarding first memory',
        content: fact.trim(),
        tags: ['onboarding'],
        importance: 4,
      } as Parameters<typeof createMemory>[0])
      try {
        await triggerRecompile()
      } catch {
        // optional
      }
      setStatus('Saved and queued surface compile.')
      saveProgress({ step: stepIdx, fact })
      next()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to save memory')
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    saveProgress({ step: STEPS.length - 1, fact, complete: true })
    navigate('/memory')
  }

  const pct = Math.round(((stepIdx + 1) / STEPS.length) * 100)

  return (
    <div className="onboarding-shell">
      {step.id === 'welcome' && (
        <div
          style={{
            marginBottom: 28,
            borderRadius: 16,
            padding: '16px 20px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #e8eef9 100%)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.7) inset, 0 16px 40px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(148,163,184,0.2)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <BrandMark variant="lockup" height={64} alt="Total Recall" />
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Onboarding · {stepIdx + 1}/{STEPS.length}
        </div>
        <div className="onboarding-progress">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          margin: '0 0 12px',
          letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #f8fafc 0%, #93c5fd 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {step.title}
      </h1>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 28px' }}>{step.body}</p>

      {step.id === 'welcome' && (
        <div className="loop-card" style={{ marginBottom: 24 }}>
          write&nbsp;&nbsp;→ remember / session ingest<br />
          sleep&nbsp;&nbsp;→ dream (consolidate, conflict, compile)<br />
          read&nbsp;&nbsp;&nbsp;→ recall + compiled surfaces<br />
          async&nbsp;&nbsp;→ daemon tasks (any intent under policy)
        </div>
      )}

      {step.id === 'import-env' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setImportMode('scan')}
              style={importMode === 'scan' ? tabActive : tabIdle}
            >
              Scan machine
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('paste')
                setCandidates([])
                setSelectedKeys(new Set())
              }}
              style={importMode === 'paste' ? tabActive : tabIdle}
            >
              Paste .env
            </button>
          </div>

          {importMode === 'paste' && (
            <div style={{ marginBottom: 14 }}>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'OPENAI_API_KEY=sk-...\nANTHROPIC_API_KEY=sk-ant-...\nGOOGLE_API_KEY=...'}
                rows={6}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  resize: 'vertical',
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={handlePastePreview}
                style={{ ...btnGhost, marginTop: 8 }}
              >
                Preview keys in paste
              </button>
            </div>
          )}

          {scanLoading && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Scanning env sources…</p>
          )}
          {scanError && (
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{scanError}</p>
          )}

          {!scanLoading && candidates.length === 0 && !scanError && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'rgba(148,163,184,0.06)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 12,
              }}
            >
              {importMode === 'scan'
                ? 'No known API keys found in process.env or common .env paths (~/.agent/.env, project .env, …). Paste a .env or continue and set keys later with secret set.'
                : 'Paste your .env and click Preview.'}
            </div>
          )}

          {candidates.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={selectAllNew} style={btnTiny}>Select new</button>
                <button type="button" onClick={selectNone} style={btnTiny}>Clear</button>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                  {selectedKeys.size} selected · values never shown raw
                </span>
              </div>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              >
                {candidates.map((c) => (
                  <label
                    key={c.key + c.source_label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: c.already_set ? 'default' : 'pointer',
                      opacity: c.already_set ? 0.55 : 1,
                      background: selectedKeys.has(c.key) ? 'rgba(59,130,246,0.08)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(c.key)}
                      disabled={!!c.already_set}
                      onChange={() => toggleKey(c.key)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                        {c.key}
                        {c.provider && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#93c5fd', fontWeight: 500 }}>
                            {c.provider}
                          </span>
                        )}
                        {c.already_set && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#34d399' }}>already set</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {c.masked} · {c.source_label}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || selectedKeys.size === 0}
                onClick={runImport}
                style={{
                  ...btnPrimary,
                  opacity: busy || selectedKeys.size === 0 ? 0.5 : 1,
                  cursor: busy || selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Importing…' : `Import ${selectedKeys.size} secret(s)`}
              </button>
            </>
          )}

          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>
            CLI: <code>npx total-recall secret import-env --all</code>
            {' · '}
            <Link to="/keys" style={{ color: 'var(--accent)' }}>Secrets page</Link>
          </p>
        </div>
      )}

      {step.id === 'remember' && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 8 }}>
            First memory (fact or preference)
          </label>
          <textarea
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            placeholder='e.g. "I prefer short answers and single quotes in JS."'
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              color: 'var(--text-primary)',
              fontSize: 14,
              resize: 'vertical',
            }}
          />
          <button type="button" disabled={busy} onClick={saveFirstMemory} style={{ ...btnPrimary, marginTop: 12 }}>
            {busy ? 'Saving…' : 'Save to vault & continue'}
          </button>
        </div>
      )}

      {step.id === 'connect' && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <code style={codeBlock}>npx total-recall connect claude-code</code>
          <code style={codeBlock}>npx total-recall connect cursor</code>
          <code style={codeBlock}>npx total-recall connect http-api --brain http://localhost:3000</code>
          <Link to="/integrations" style={{ fontSize: 13, color: 'var(--accent)' }}>Open Integrations page →</Link>
        </div>
      )}

      {step.id === 'dream' && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <code style={codeBlock}>npx total-recall dream</code>
          <code style={codeBlock}>npx total-recall daemon start   # optional background worker</code>
          <code style={codeBlock}>npx total-recall task add "Extract decisions from last session" --cap vault:write</code>
          <Link to="/tasks" style={{ fontSize: 13, color: 'var(--accent)' }}>Open Tasks page →</Link>
        </div>
      )}

      {step.id === 'done' && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            borderRadius: 12,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.25)',
            fontSize: 14,
            color: 'var(--text-secondary)',
          }}
        >
          {hasProfile
            ? 'Vault already has onboarding profile data — you can jump to Memory anytime.'
            : 'Optional: chat with the assistant to run the full preference interview (user-profile.md).'}
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/" style={btnSecondary}>Open Chat</Link>
            <Link to="/memory" style={btnSecondary}>Open Vault</Link>
            <Link to="/integrations" style={btnSecondary}>Connect IDE</Link>
          </div>
        </div>
      )}

      {status && (
        <p
          style={{
            fontSize: 13,
            color: status.startsWith('Saved') || status.startsWith('Imported') || status.startsWith('Found')
              ? '#22c55e'
              : '#f59e0b',
            marginBottom: 16,
          }}
        >
          {status}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button type="button" onClick={back} disabled={stepIdx === 0} style={btnGhost}>Back</button>
        <div style={{ display: 'flex', gap: 10 }}>
          {step.id !== 'done' && step.id !== 'remember' && (
            <button type="button" onClick={next} style={btnPrimary}>
              {step.id === 'import-env' ? 'Continue' : 'Continue'}
            </button>
          )}
          {step.id === 'import-env' && (
            <button type="button" onClick={next} style={btnGhost}>Skip for now</button>
          )}
          {step.id === 'remember' && (
            <button type="button" onClick={next} style={btnGhost}>Skip for now</button>
          )}
          {step.id === 'done' && (
            <button type="button" onClick={finish} style={btnPrimary}>Go to Memory</button>
          )}
        </div>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: 'var(--text-tertiary)' }}>
        CLI-first: <code>init → secret import-env --all → connect → remember → dream</code>
      </p>

      {stepIdx < STEPS.length - 1 && (
        <button type="button" onClick={finish} style={{ ...btnGhost, marginTop: 16, width: '100%' }}>
          Skip onboarding → Memory
        </button>
      )}
    </div>
  )
}

const codeBlock: CSSProperties = {
  display: 'block',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  overflowX: 'auto',
}

const btnPrimary: CSSProperties = {
  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 55%, #1d4ed8 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  padding: '11px 20px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
  boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px rgba(37, 99, 235, 0.28)',
}

const btnGhost: CSSProperties = {
  background: 'rgba(148, 163, 184, 0.06)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '11px 20px',
  cursor: 'pointer',
  fontSize: 14,
}

const btnSecondary: CSSProperties = {
  ...btnGhost,
  textDecoration: 'none',
  display: 'inline-block',
}

const btnTiny: CSSProperties = {
  ...btnGhost,
  padding: '5px 10px',
  fontSize: 11,
}

const tabActive: CSSProperties = {
  ...btnPrimary,
  padding: '8px 14px',
  fontSize: 12,
}

const tabIdle: CSSProperties = {
  ...btnGhost,
  padding: '8px 14px',
  fontSize: 12,
}
