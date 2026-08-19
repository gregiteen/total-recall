import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchNodes, mintPreAuthKey } from '../api/mesh';
import type { MeshNode, PreAuthKey } from '../api/mesh';

/**
 * Add a device (phone, tablet, another machine) to the self-hosted tailnet.
 *
 * Enrolling a phone had no UI at all: `/api/mesh/enroll` only ever enrolls the
 * host the server runs on, so the only way to add a device was
 * `total-recall mesh preauthkey` — a CLI, which is exactly what you do not have
 * on the device you are trying to enroll.
 */
export function TailnetEnroll() {
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [minted, setMinted] = useState<PreAuthKey | null>(null);
  const [reusable, setReusable] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    fetchNodes()
      .then(setNodes)
      .catch((e) => setError(e?.message ?? 'could not load nodes'));
  }, []);

  // An enrollment key is a bearer credential with a short TTL. Show the time
  // remaining rather than leaving a dead key on screen looking usable.
  useEffect(() => {
    if (!minted) return undefined;
    const tick = () => {
      const ms = new Date(minted.expiration).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [minted]);

  const mint = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setMinted(await mintPreAuthKey({ reusable, ephemeral }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not mint an enrollment key');
    } finally {
      setBusy(false);
    }
  };

  const expired = secondsLeft !== null && secondsLeft <= 0;
  const loginServer = minted?.login_server ?? null;
  // `complete` is the resolver's own verdict: false when the login account is
  // unknown and the node would refuse you. No resolved access at all counts as
  // unknown too. (There is no `ssh_user` field — the account is `user`.)
  const unknownAccess = nodes.filter((n) => !n.self && n.access_resolved?.complete !== true);

  return (
    <section data-testid="tailnet-enroll" style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 4 }}>Add a device to the tailnet</h3>
      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 0 }}>
        Mints a short-lived enrollment key for a phone, tablet, or another machine.
      </p>

      {error && (
        <div
          role="alert"
          data-testid="tailnet-enroll-error"
          style={{ margin: '10px 0', padding: 10, borderRadius: 8, border: '1px solid #ef4444', color: '#ef4444', fontSize: 12 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={reusable} onChange={(e) => setReusable(e.target.checked)} data-testid="enroll-reusable" />
          Reusable (enroll more than one device)
        </label>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} data-testid="enroll-ephemeral" />
          Ephemeral (drops off the list when offline)
        </label>
        <button type="button" onClick={mint} disabled={busy} data-testid="enroll-mint" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Minting…' : minted ? 'Mint another key' : 'Get enrollment key'}
        </button>
      </div>

      {minted && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8 }} data-testid="enroll-qr">
            {expired ? (
              <div style={{ width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
                Key expired — mint another
              </div>
            ) : (
              <QRCodeSVG value={minted.key} size={150} level="M" includeMargin />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Control server</strong>
              <div><code data-testid="enroll-login-server">{loginServer ?? 'not configured'}</code></div>
            </div>

            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Enrollment key</strong>{' '}
              <span data-testid="enroll-ttl" style={{ opacity: 0.7 }}>
                {expired ? '(expired)' : `(expires in ${secondsLeft}s, ${minted.reusable ? 'reusable' : 'single-use'})`}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <code style={{ wordBreak: 'break-all', flex: 1, opacity: expired ? 0.4 : 1 }}>{minted.key}</code>
                <button
                  type="button"
                  disabled={expired}
                  onClick={() => { navigator.clipboard?.writeText(minted.key); setCopied(true); }}
                  data-testid="enroll-copy"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <details style={{ fontSize: 12, marginTop: 10 }}>
              <summary style={{ cursor: 'pointer' }}>On a phone (iOS / Android)</summary>
              <ol style={{ paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Install Tailscale (iOS needs 1.38.1 or newer).</li>
                <li>Account icon → <strong>Log in</strong> → options menu → <strong>Use custom coordination server</strong>.</li>
                <li>Enter <code>{loginServer ?? 'your control server URL'}</code>.</li>
                <li>Scan the QR or paste the key above when asked to authenticate.</li>
              </ol>
              <p style={{ opacity: 0.75 }}>
                If that menu does not respond (reported on some 2026 iOS builds), set the same URL under
                iOS Settings → Tailscale → <em>Alternate coordination server URL</em>.
              </p>
            </details>

            <details style={{ fontSize: 12, marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>On a computer</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`tailscale up --login-server ${loginServer ?? '<control-server>'} --authkey ${expired ? '<expired — mint another>' : minted.key}`}
              </pre>
              <p style={{ opacity: 0.75 }}>
                Always pass <code>--login-server</code> alongside any <code>--reset</code>, or the client
                silently repoints at the public Tailscale control plane.
              </p>
            </details>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h4 style={{ marginBottom: 6 }}>Nodes ({nodes.length})</h4>
        <ul data-testid="enroll-node-list" style={{ listStyle: 'none', padding: 0, fontSize: 12, margin: 0 }}>
          {nodes.map((n) => (
            <li key={`${n.hostname}-${n.ip ?? 'noip'}`} style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span title={n.online ? 'online' : 'offline'}>{n.online ? '🟢' : '⚪️'}</span>
              <strong>{n.hostname}</strong>
              <code style={{ opacity: 0.75 }}>{n.ip ?? '—'}</code>
              {n.self && <span style={{ opacity: 0.6 }}>(this host)</span>}
            </li>
          ))}
        </ul>
        {unknownAccess.length > 0 && (
          <p data-testid="enroll-access-warning" style={{ fontSize: 12, color: '#f59e0b', marginBottom: 0 }}>
            {unknownAccess.length} node(s) have no recorded login account — connecting to one fails as
            though it were unreachable. Run <code>total-recall mesh access import</code>.
          </p>
        )}
      </div>
    </section>
  );
}
