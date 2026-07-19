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
}

export interface PairingInfo {
  port: number;
  protocol: string;
  preferred_url: string | null;
  endpoints: PairingEndpoint[];
  warnings: string[];
  listen_hosts: string[];
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
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = info?.endpoints?.find((e) => e.url === selectedUrl) || null;
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
              <QRCodeSVG value={selectedUrl} size={150} level="M" includeMargin />
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
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                {selected.reachable_hint}
              </p>
            )}

            {isLoopback && (
              <p
                data-testid="pairing-loopback-warning"
                style={{ fontSize: 12, color: '#f59e0b', margin: 0 }}
              >
                This address only works on this computer. Choose LAN or Tailscale for your phone.
              </p>
            )}
          </div>
        </div>
      )}

      {info?.warnings && info.warnings.length > 0 && (
        <ul
          data-testid="pairing-warnings"
          style={{
            margin: '16px 0 0',
            paddingLeft: 18,
            fontSize: 12,
            color: '#f59e0b',
          }}
        >
          {info.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-tertiary)' }}>
        After scanning, log in on the phone (same password/PAT as this dashboard). Listening:{' '}
        {(info?.listen_hosts || []).join(', ') || 'unknown'}
      </p>
    </div>
  );
}
