import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchNodes, fetchEnrollmentStatus, mintPreAuthKey, registerNode } from '../api/mesh';
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
  const [serverCopied, setServerCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // The control-server URL is the FIRST thing you need on the phone, and it is
  // config, not a property of a key. Reading it only off a minted key meant the
  // URL stayed invisible until a 15-minute countdown was already running.
  const [controlServer, setControlServer] = useState<string | null>(null);
  const [authId, setAuthId] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);

  useEffect(() => {
    fetchNodes()
      .then(setNodes)
      .catch((e) => setError(e?.message ?? 'could not load nodes'));
    fetchEnrollmentStatus()
      .then((st) => setControlServer(st.login_server))
      .catch(() => setControlServer(null));
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

  const approve = async () => {
    setApproving(true);
    setError(null);
    setApproved(null);
    try {
      // Accept a pasted whole command as well as a bare id — the device shows
      // the id inside `headscale nodes register --user X --key <id>`, and
      // making someone extract a substring by hand is a needless failure.
      const match = authId.match(/hskey-authreq-[A-Za-z0-9._-]+/);
      const res = await registerNode(match ? match[0] : authId.trim());
      setApproved(res.message);
      setAuthId('');
      setNodes(await fetchNodes().catch(() => nodes));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not approve device');
    } finally {
      setApproving(false);
    }
  };

  const expired = secondsLeft !== null && secondsLeft <= 0;
  const loginServer = controlServer ?? minted?.login_server ?? null;
  // `complete` is the resolver's own verdict: false when the login account is
  // unknown and the node would refuse you. No resolved access at all counts as
  // unknown too. (There is no `ssh_user` field — the account is `user`.)
  const unknownAccess = nodes.filter((n) => !n.self && n.access_resolved?.complete !== true);

  return (
    <section data-testid="tailnet-enroll" style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 4 }}>Add a device to the tailnet</h3>
      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 0 }}>
        Point the device at this control server, then authenticate it with a short-lived key.
      </p>

      {/*
        Instructions come BEFORE the key and are open by default. They used to
        live inside the `minted` branch behind a collapsed <details>, so the
        control-server URL -- step one, and the thing you cannot proceed
        without -- was invisible until a 15-minute countdown was already
        running. Nothing here is hardcoded: the URL is whatever the brain's
        config resolves to.
      */}
      <div
        data-testid="enroll-instructions"
        style={{ margin: '12px 0', padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div style={{ fontSize: 12, marginBottom: 10 }}>
          <strong>Control server</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <code data-testid="enroll-login-server" style={{ wordBreak: 'break-all', flex: 1 }}>
              {loginServer ?? 'not configured — set the Headscale URL in Secrets first'}
            </code>
            {loginServer && (
              <button
                type="button"
                data-testid="enroll-copy-server"
                onClick={() => { navigator.clipboard?.writeText(loginServer); setServerCopied(true); }}
              >
                {serverCopied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>

        {/*
          Approving an interactively-registered device is the ONLY route that
          works for iOS: the upstream Tailscale app refuses a pre-auth key when
          pointed at a custom control server, so a phone always lands on
          headscale's "run this command on the server" page. Until this panel
          existed, finishing that required SSH and a CLI -- on the machine you
          are not holding.
        */}
        <div
          data-testid="enroll-approve"
          style={{ margin: '0 0 12px', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}
        >
          <strong style={{ fontSize: 12 }}>Device waiting for approval?</strong>
          <p style={{ fontSize: 12, opacity: 0.75, margin: '4px 0 8px' }}>
            If a device shows “run the command below in the headscale server”, paste that whole line
            (or just the <code>hskey-authreq-…</code> part) here.
          </p>
          <p style={{ fontSize: 12, margin: '0 0 8px', color: '#f59e0b' }}>
            <strong>If the code on the device never changes</strong> between sign-in attempts, it is a stale
            one replayed from the iOS keychain and no amount of retrying will register it. Turn on{' '}
            <strong>Reset Keychain</strong>, force-quit, sign in again — the code must be different.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={authId}
              onChange={(e) => setAuthId(e.target.value)}
              placeholder="hskey-authreq-…"
              data-testid="enroll-authid"
              style={{ flex: 1, minWidth: 220, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <button
              type="button"
              onClick={approve}
              disabled={approving || !authId.trim()}
              data-testid="enroll-approve-btn"
            >
              {approving ? 'Approving…' : 'Approve device'}
            </button>
          </div>
          {approved && (
            <p data-testid="enroll-approved" style={{ fontSize: 12, color: '#10b981', margin: '8px 0 0' }}>
              {approved}
            </p>
          )}
        </div>

        <details open style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>On a phone (iOS)</summary>
          <ol style={{ paddingLeft: 18, lineHeight: 1.7, marginBottom: 6 }}>
            <li>Install <strong>Tailscale</strong> from the App Store — <strong>1.38.1 or newer</strong>, the first release that supports an alternate control server.</li>
            <li>
              <strong>Sign out of Tailscale first.</strong> The alternate-server setting is only read while
              the app is logged out.
            </li>
            <li>
              Open <strong>iOS Settings</strong>, scroll past Game Center and TV Provider to{' '}
              <strong>Tailscale</strong>, and put the control server above into{' '}
              <strong>Alternate Coordination Server URL</strong>.
            </li>
            <li>
              <strong>Turn on “Reset Keychain”.</strong> Treat this as required, not optional. The app keeps
              its node key in the iOS keychain and will otherwise replay an old registration id forever —
              force-quitting does not clear it, and the server rejects the stale id every time while the
              phone keeps showing a page that looks perfectly valid.
            </li>
            <li>Force-quit Tailscale from the app switcher, then reopen it — the setting is read at launch.</li>
            <li>Tap the plain <strong>Sign in</strong> option (not SSO). It should open this control server's page.</li>
            <li>
              The page will say <em>“run the command below in the headscale server”</em>. That is expected —
              copy the line it shows and paste it into <strong>Device waiting for approval?</strong> above.
              <strong> Do not use the enrollment key below on a phone:</strong> the Tailscale iOS app does not
              accept pre-auth keys against a custom control server, so interactive sign-in plus approval here
              is the only route that works.
            </li>
          </ol>
          <p style={{ opacity: 0.75, margin: 0 }}>
            The in-app route — account icon → <strong>Log in…</strong> → options menu →{' '}
            <strong>Use custom coordination server</strong> — reaches the same place when it works, but that
            menu has been reported unresponsive on some builds. The Settings route above is the reliable one.
          </p>
        </details>

        <details style={{ fontSize: 12, marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>On Android</summary>
          <ol style={{ paddingLeft: 18, lineHeight: 1.7, margin: '4px 0 0' }}>
            <li>Install Tailscale from Google Play and make sure it is signed out.</li>
            <li>Open the app, tap the account icon, then <strong>Log in…</strong>.</li>
            <li>Open the top-right options menu → <strong>Use custom coordination server</strong>.</li>
            <li>Enter the control server above. If it accepts the key below, use it; if it shows a
                “run this command” page instead, approve it above like iOS.</li>
          </ol>
        </details>
      </div>

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
          {busy ? 'Minting…' : minted ? 'Mint another key' : 'Get enrollment key (computers)'}
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
