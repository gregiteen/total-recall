import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch, getApiBase } from '../api';

export interface PairingEndpoint {
  kind: string;
  label: string;
  ip: string;
  url: string;
  interface?: string | null;
  recommended: boolean;
  reachable_hint: string;
  /** null when the server could not observe its own sockets. */
  listening?: boolean | null;
}

export interface PairingInfo {
  port: number;
  protocol: string;
  preferred_url: string | null;
  endpoints: PairingEndpoint[];
  warnings: string[];
  listen_hosts: string[];
  /** 'actual' = observed sockets. 'derived' = a guess; do not render as fact. */
  listen_hosts_source?: 'actual' | 'derived';
  /** null means unknown — must not be shown as either working or broken. */
  reachable_from_other_devices?: boolean | null;
}

export function MobilePairing() {
  const [info, setInfo] = useState<PairingInfo | null>(null);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${getApiBase()}/api/pairing`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Pairing API error: ${res.status}`);
      }
      const data = (await res.json()) as PairingInfo;
      setInfo(data);
      const preferred =
        data.preferred_url ||
        data.endpoints?.find((e) => e.recommended)?.url ||
        data.endpoints?.[0]?.url ||
        '';
      setSelectedUrl(preferred);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load pairing endpoints');
      // Last-resort fallback — still better than nothing, but labeled
      const fallback = `${window.location.protocol}//${window.location.host}`;
      setSelectedUrl(fallback);
      setInfo({
        port: Number(window.location.port || 3000),
        protocol: window.location.protocol.replace(':', '') || 'http',
        preferred_url: fallback,
        endpoints: [
          {
            kind: 'browser',
            label: 'This browser URL (may not work on phone)',
            ip: window.location.hostname,
            url: fallback,
            recommended: true,
            reachable_hint: 'Fallback when pairing API is unavailable.',
          },
        ],
        warnings: ['Could not load live network endpoints from the brain.'],
        listen_hosts: [],
        listen_hosts_source: 'derived',
        reachable_from_other_devices: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => { void load(); }, 0);
  }, []);

  const selected = info?.endpoints?.find((e) => e.url === selectedUrl) || null;
  // Observed, not guessed. `undefined`/`null` means the server could not tell
  // us — that is not the same as broken, so it must not raise this banner.
  const unreachable = info?.reachable_from_other_devices === false;
  const isLoopback =
    selected?.kind === 'loopback' ||
    selectedUrl.includes('127.0.0.1') ||
    selectedUrl.includes('localhost');

  const copyUrl = async () => {
    if (!selectedUrl) return;
    try {
      await navigator.clipboard.writeText(selectedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard copy failed — select the URL text manually.');
    }
  };

  return (
    <div
      className="mobile-pairing"
      data-testid="mobile-pairing"
      style={{
        padding: '20px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
      }}
    >
      <h3 style={{ margin: '0 0 8px' }}>Mobile Device Pairing</h3>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '16px' }}>
        Scan with your phone to open this Total Recall dashboard. Prefer <strong>LAN</strong> on the same
        Wi‑Fi, or <strong>Tailscale/mesh</strong> if the phone is on your tailnet.
      </p>

      {unreachable && (
        <div
          role="alert"
          data-testid="pairing-unreachable"
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--text-primary)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            No other device can reach this brain
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            It is listening on{' '}
            <code>{info?.listen_hosts?.join(', ') || 'loopback'}</code> only, so every code on this
            card is a dead address — a phone that scans one will time out no matter how it is
            connected. This normally means the mesh client was still starting when the brain
            launched, so the brain never got a mesh address to bind.
            <div style={{ marginTop: 6 }}>
              <strong>Fix:</strong> restart the brain now that the mesh is up. It re-checks for a
              mesh address on its own for the first few minutes after launch, so a restart is
              usually all this needs.
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div data-testid="pairing-loading" style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
          Detecting reachable addresses…
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="pairing-error"
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            border: '1px solid #ef4444',
            color: '#ef4444',
            fontSize: 12,
          }}
        >
          {error}{' '}
          <button type="button" onClick={() => load()} style={{ marginLeft: 8, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div
            style={{
              background: '#fff',
              padding: '16px',
              borderRadius: '8px',
              display: 'inline-block',
            }}
            data-testid="pairing-qr"
          >
            {selectedUrl ? (
              <div style={{ position: 'relative' }}>
                {/* Greyed rather than hidden: the address is still the right one
                    to reach for once the bind is fixed. */}
                <div style={{ opacity: unreachable ? 0.15 : 1 }}>
                  <QRCodeSVG value={selectedUrl} size={150} level="M" includeMargin />
                </div>
                {unreachable && (
                  <div
                    data-testid="pairing-qr-dead"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      padding: 8,
                      color: '#b91c1c',
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1.4,
                    }}
                  >
                    Nothing is listening on this address
                  </div>
                )}
              </div>
            ) : (
              <div style={{ width: 150, height: 150 }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            {info && info.endpoints.length > 0 && (
              <div className="field-col" style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="pairing-endpoint">
                  Pairing address
                </label>
                <select
                  id="pairing-endpoint"
                  className="settings-select"
                  data-testid="pairing-endpoint-select"
                  value={selectedUrl}
                  onChange={(e) => setSelectedUrl(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {info.endpoints.map((ep) => (
                    <option key={ep.url} value={ep.url}>
                      {ep.label}
                      {ep.recommended ? ' ★' : ''} — {ep.url}
                      {ep.listening === false ? ' (not listening)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p
              data-testid="pairing-url"
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
                color: 'var(--text-primary)',
              }}
            >
              {selectedUrl || '—'}
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button type="button" className="btn-secondary" onClick={copyUrl} data-testid="pairing-copy">
                {copied ? 'Copied' : 'Copy URL'}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => load()}>
                Refresh
              </button>
            </div>

            {selected && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 6 }}>
                <strong>Connection Route:</strong> {selected.reachable_hint}
              </div>
            )}

            {isLoopback && (
              <div
                data-testid="pairing-loopback-warning"
                style={{ fontSize: 12, color: '#f59e0b', margin: '0 0 8px', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(245, 158, 11, 0.2)' }}
              >
                ⚠️ <strong>Loopback Only:</strong> <code>127.0.0.1</code> only works on this computer. To open on your phone, select your Mesh IP (<code>100.64.x.x</code>) or enable <strong>Allow Public Bind</strong> below to use local Wi-Fi.
              </div>
            )}
          </div>
        </div>
      )}

      {info?.warnings && info.warnings.length > 0 && (
        <div
          data-testid="pairing-warnings"
          style={{
            margin: '16px 0 0',
            padding: '10px 14px',
            fontSize: 12,
            color: '#fbbf24',
            background: 'rgba(251, 191, 36, 0.08)',
            borderRadius: 8,
            border: '1px solid rgba(251, 191, 36, 0.2)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Network Notice:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {info.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(59, 130, 246, 0.06)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.15)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>📱 How to connect your phone:</div>
        <div>
          <strong>Option A (WireGuard / Mesh — Recommended):</strong> The device has to be <em>on the tailnet</em>
          before a <code>100.64.x.x</code> address can reach anything — scanning this QR from a phone that has not
          joined will simply time out. Join it first in{' '}
          <strong>Add a device to the tailnet</strong>, directly below, which has the per-platform steps.
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            Short version: <strong>Android / ChromeOS</strong> take an enrollment key directly. <strong>iOS</strong>
            {' '}cannot — it needs the alternate coordination server set in iOS Settings, <em>Reset Keychain</em> turned
            on, and then approval from that card. Once joined, come back and scan the <code>100.64.x.x</code> code.
          </div>
        </div>
        <div style={{ marginTop: 4 }}><strong>Option B (Local Home Wi-Fi):</strong> Check <strong>Allow Public Bind</strong> in <em>Network & Binding</em> below, restart the server, and scan your local Wi-Fi LAN QR code (e.g. <code>192.168.x.x</code>).</div>
      </div>
    </div>
  );
}
