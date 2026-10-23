#!/usr/bin/env node
/**
 * Auth CLI Handler
 * Executed via: npx total-recall auth <subcommand>
 * Subcommands: status, passkey, google, probe, session
 * Exit codes: 0 ok, 1 usage/error, 2 not configured
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolveTrPath() {
  const localTr = path.join(process.cwd(), 'bin', 'total-recall.mjs');
  if (fs.existsSync(localTr)) return localTr;
  const parentTr = path.join(process.cwd(), '..', 'total-recall', 'bin', 'total-recall.mjs');
  if (fs.existsSync(parentTr)) return parentTr;
  return null;
}

async function resolveSecret(key) {
  const { getSecret, defaultBrainDir } = await import('./src/secrets-store.mjs');
  const result = await getSecret(process.env.TR_SECRETS_BRAIN || defaultBrainDir(), key, { actor: 'auth-cli', action: 'use' });
  return result.found ? result.value : null;
}

function resolveBrainDir() {
  return process.env.TR_SECRETS_BRAIN || process.env.TR_BRAIN || path.join(process.env.HOME || '', '.agent', 'skills', 'total-recall');
}

async function listStoredPasskeys() {
  const { listPasskeys } = await import('./src/webauthn-store.mjs');
  return listPasskeys(resolveBrainDir());
}

async function handleStatus(json) {
  const passkeys = await listStoredPasskeys();
  const googleClientId = await resolveSecret('GOOGLE_CLIENT_ID');
  const googleClientSecret = await resolveSecret('GOOGLE_CLIENT_SECRET');
  const googleReady = Boolean(googleClientId && googleClientSecret);

  const status = {
    passkey: {
      enabled: true,
      registered_count: passkeys.length,
      credentials: passkeys.map((p) => ({
        id: p.id,
        label: p.label || 'Passkey',
        created_at: p.created_at || null,
        backed_up: Boolean(p.backedUp),
      })),
    },
    google_oauth2: {
      configured: googleReady,
      client_id: googleClientId ? `${googleClientId.slice(0, 12)}…` : null,
      has_secret: Boolean(googleClientSecret),
    },
    system: {
      status: 'local-configuration-read',
      providerVerified: false,
      brain_dir: resolveBrainDir(),
    },
  };

  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Total Recall Auth Engine');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Passkey WebAuthn : Enabled (${passkeys.length} credential${passkeys.length === 1 ? '' : 's'})`);
  if (passkeys.length > 0) {
    for (const p of passkeys) {
      console.log(`  • [${p.label || 'Passkey'}] ID: ${p.id.slice(0, 16)}… (${p.created_at || 'unknown date'})`);
    }
  } else {
    console.log('  • No passkeys registered in the vault');
  }

  console.log(`Google OAuth2    : ${googleReady ? 'Configured' : 'Not Configured'}`);
  if (googleClientId) {
    console.log(`  • Client ID    : ${googleClientId.slice(0, 16)}…`);
  } else {
    console.log('  • Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the secrets store');
  }
}

async function handlePasskey(subArgs, json) {
  const passkeys = await listStoredPasskeys();
  const action = subArgs[0] || 'list';

  if (action === 'list') {
    if (json) {
      console.log(JSON.stringify({ count: passkeys.length, passkeys }, null, 2));
      return;
    }
    console.log(`Registered Passkeys: ${passkeys.length}`);
    for (const p of passkeys) {
      console.log(`• ${p.label || 'Passkey'} [${p.id}]`);
    }
    return;
  }

  if (action === 'status') {
    const res = { enabled: true, count: passkeys.length };
    if (json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Passkey status: ${passkeys.length > 0 ? 'Active' : 'No credentials registered'}`);
    }
    return;
  }

  console.error(`Unknown passkey action: ${action}`);
  process.exitCode = 1;
}

async function handleGoogle(subArgs, json) {
  const { createGoogleOAuth } = await import('./src/google-oauth.mjs');
  const google = createGoogleOAuth({ brainDir: resolveBrainDir() });
  const action = subArgs[0] || 'status';
  if (action === 'accounts') { console.log(JSON.stringify({ accounts: google.status() })); return; }
  if (action === 'refresh' || action === 'disconnect') {
    if (!subArgs[1]) throw new Error('Google account identifier required');
    if (action === 'refresh') { await google.access(subArgs[1]); console.log(JSON.stringify({ accounts: google.status() })); }
    else console.log(JSON.stringify(await google.disconnect(subArgs[1])));
    return;
  }
  if (!['status', 'connect'].includes(action)) throw new Error('Use google status|connect|accounts|refresh|disconnect');
  let cfg;
  try { cfg = google.config(); } catch {
    console.log(JSON.stringify({ configured: false, error: 'Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in auth' })); process.exitCode = 2; return;
  }
  // Browser initiation sets its own HttpOnly state cookie; never manufacture a state-less consent URL in the CLI.
  const authUrl = new URL('/auth/google', cfg.redirectUri).href;
  const out = { configured: true, client_id: `${cfg.clientId.slice(0, 12)}…`, redirect_uri: cfg.redirectUri, auth_url: authUrl };
  console.log(json ? JSON.stringify(out) : `Open sign-in: ${authUrl}`);
}

async function handleProbe(json) {
  const host = process.env.TR_HOST || 'http://localhost:3000';
  const endpoints = ['/auth/status', '/auth/providers', '/health'];
  const results = [];

  for (const ep of endpoints) {
    const url = `${host}${ep}`;
    const startTime = Date.now();
    try {
      const res = await fetch(url);
      const latencyMs = Date.now() - startTime;
      results.push({
        endpoint: ep,
        url,
        status: res.status,
        ok: res.ok,
        latency_ms: latencyMs,
      });
    } catch (err) {
      results.push({
        endpoint: ep,
        url,
        status: 0,
        ok: false,
        error: err.message,
        latency_ms: Date.now() - startTime,
      });
    }
  }

  const allOk = results.every((r) => r.ok && r.status === 200);

  if (json) {
    console.log(JSON.stringify({ success: allOk, probes: results }, null, 2));
  } else {
    console.log('Auth Endpoint 200 Probes:');
    for (const r of results) {
      const badge = r.status === 200 ? ' 200 OK' : ` ${r.status || 'CONN_ERR'}`;
      console.log(`  ${badge} ${r.endpoint.padEnd(20)} (${r.latency_ms}ms)`);
    }
  }
  if (!allOk) process.exitCode = 1;
}

async function handleSession(json) {
  const brain = resolveBrainDir();
  const secretExists = Boolean(await resolveSecret('SESSION_SECRET'));

  const payload = {
    session_secret_configured: secretExists,
    mode: 'secure-http-only-cookie',
    ttl_hours: 24,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('Session Security Status:');
    console.log(`  Session Secret : ${secretExists ? 'Present' : 'Not generated yet'}`);
    console.log('  Cookie Policy  : HttpOnly, SameSite=Lax');
    console.log('  Token Format   : Signed JWT');
  }
}

async function handleSecret(subArgs, json) {
  const { default: secretCli } = await import('./src/cli-secret.mjs');
  const forwarded = json && !subArgs.includes('--json') ? [...subArgs, '--json'] : subArgs;
  await secretCli(forwarded);
}

async function handleAudit(json) {
  const brain = resolveBrainDir();
  const webauthnPath = path.join(brain, 'config', 'webauthn.json');
  const findings = [];

  // Check 1: WebAuthn file permissions
  if (fs.existsSync(webauthnPath)) {
    try {
      const stats = fs.statSync(webauthnPath);
      const mode = (stats.mode & 0o777).toString(8);
      if (mode !== '600' && mode !== '400') {
        findings.push({
          target: 'webauthn.json',
          severity: 'HIGH',
          message: `Permissions mode is ${mode}, expected 0600 (owner read/write only)`,
        });
      }
    } catch {
      // stat check fallback
    }
  }

  // Check 2: Session secret entropy
  const sessionSecret = await resolveSecret('SESSION_SECRET');
  if (!sessionSecret) {
    findings.push({
      target: 'SESSION_SECRET',
      severity: 'MEDIUM',
      message: 'SESSION_SECRET not stored in secrets store; session signing unavailable; initialize through auth',
    });
  } else if (sessionSecret.length < 32) {
    findings.push({
      target: 'SESSION_SECRET',
      severity: 'HIGH',
      message: 'SESSION_SECRET length is under 32 characters (insufficient entropy)',
    });
  }

  // Check 3: Google OAuth2 paired credentials
  const gId = await resolveSecret('GOOGLE_CLIENT_ID');
  const gSec = await resolveSecret('GOOGLE_CLIENT_SECRET');
  if (gId && !gSec) {
    findings.push({
      target: 'GOOGLE_CLIENT_SECRET',
      severity: 'CRITICAL',
      message: 'GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing',
    });
  }

  const passed = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0;
  const report = {
    audit: 'Total Recall Auth Security Baseline',
    passed,
    findings_count: findings.length,
    findings,
    timestamp: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Total Recall Auth Security Audit Report');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Status : ${passed ? ' PASSED' : ' ISSUES DETECTED'} (${findings.length} findings)`);
    if (findings.length === 0) {
      console.log('All auth credentials, WebAuthn stores, and session configurations pass baseline checks.');
    } else {
      for (const f of findings) {
        console.log(`  [${f.severity}] ${f.target}: ${f.message}`);
      }
    }
  }
  if (!passed) process.exitCode = 1;
}

async function handleRotate(subArgs, json) {
  const { createSessionCredentials } = await import('./src/session-credentials.mjs');
  const { defaultBrainDir } = await import('./src/secrets-store.mjs');
  const purpose = subArgs.includes('--collaboration') ? 'collaboration' : 'dashboard';
  const result = createSessionCredentials({ brainDir: process.env.TR_SECRETS_BRAIN || defaultBrainDir() }).rotateSession(purpose);
  console.log(json ? JSON.stringify(result) : 'Auth signing credential rotated; existing sessions are invalidated.');
}
async function handlePassword(args, json) {
  if (args[0] !== 'set' || !args.includes('--stdin') || args.slice(1).some(value => !['--stdin', '--force-reset'].includes(value))) throw new Error('Use auth password set --stdin');
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw new Error('Password input exceeds limit'); chunks.push(chunk); }
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  const { createSessionCredentials } = await import('./src/session-credentials.mjs');
  const result = await createSessionCredentials({ brainDir: resolveBrainDir() }).setDashboardPassword(password, { forcePasswordReset: args.includes('--force-reset') });
  console.log(json ? JSON.stringify(result) : 'Dashboard credential saved through auth; existing sessions invalidated.');
}

export async function run(argv = []) {
  let args = Array.isArray(argv) ? [...argv] : [];
  if (args[0] && args[0].endsWith('node')) args = args.slice(1);
  if (args[0] && (args[0].endsWith('cli.mjs') || args[0].endsWith('total-recall') || args[0] === 'auth')) args = args.slice(1);
  if (args[0] === 'auth') args = args.slice(1);

  const isJson = args.includes('--json') || args.includes('-j');
  const filteredArgs = args.filter((a) => a !== '--json' && a !== '-j');
  const command = filteredArgs[0] || 'status';
  const rest = filteredArgs.slice(1);

  switch (command) {
    case 'status':
      await handleStatus(isJson);
      break;
    case 'audit':
      await handleAudit(isJson);
      break;
    case 'rotate':
      await handleRotate(rest, isJson);
      break;
    case 'password':
      await handlePassword(rest, isJson);
      break;
    case 'passkey':
      await handlePasskey(rest, isJson);
      break;
    case 'key': {
      const { createKeyStore } = await import('./src/access-keys.mjs');
      const store = createKeyStore({ brainDir: resolveBrainDir() });
      const [action = 'list', id] = rest;
      const flag = name => { const at = rest.indexOf(name); return at < 0 ? undefined : rest[at + 1]; };
      let result;
      if (action === 'list') result = store.loadKeys().map(({ token_hash, ...key }) => key);
      else if (action === 'issue') result = store.issueKey(id, { scopes: flag('--scopes')?.split(','), role: flag('--role'), kind: flag('--kind'), expires_at: flag('--expires') });
      else if (action === 'revoke') result = store.revokeKey(id);
      else if (action === 'usage') result = store.listKeyUsage(id);
      else if (action === 'roles') result = store.loadRoles();
      else if (action === 'role-set') result = store.setRole(id, flag('--scopes')?.split(','));
      else throw new Error('Use auth key list|issue <name> --scopes <csv> [--role role] [--expires date]|revoke <id>|usage [id]|roles|role-set <name> --scopes <csv>');
      console.log(JSON.stringify(result)); break;
    }
    case 'agent': {
      // Sign in an agent CLI that authenticates on its own terminal. The pty lives in
      // scripts/agent-login-pty.py because Node has none and this plugin carries no pty library;
      // this routes the plugin's own surface to it.
      const { loginAgent, AGENT_LOGIN_PROFILES } = await import('./src/agent-login.mjs');
      const [action = 'list', name] = rest;
      const flag = (n) => { const at = rest.indexOf(n); return at < 0 ? undefined : rest[at + 1]; };
      if (action === 'list') {
        console.log(JSON.stringify(Object.keys(AGENT_LOGIN_PROFILES).map((id) => ({ id, ...AGENT_LOGIN_PROFILES[id] }))));
        break;
      }
      if (action !== 'login') throw new Error('Use auth agent list | auth agent login <agent> [--code <code>] [--code-file <path>] [--url-file <path>]');
      const result = await loginAgent({
        agent: name,
        code: flag('--code'),
        codeFile: flag('--code-file'),
        urlFile: flag('--url-file'),
        onEvent: (event) => { if (!isJson && event.event === 'url') console.log('\nOpen this URL and approve it:\n' + event.url + '\n'); },
      });
      if (isJson) console.log(JSON.stringify(result));
      else if (result.ok) console.log(result.alreadySignedIn ? `${name} is already signed in.` : `${name} signed in.`);
      else console.log(`${name} is not signed in. ${result.error || result.reason || ''} ${result.hint || ''}`.trim());
      if (!result.ok) process.exitCode = 2;
      break;
    }
    case 'google':
      await handleGoogle(rest, isJson);
      break;
    case 'probe':
      await handleProbe(isJson);
      break;
    case 'session':
      await handleSession(isJson);
      break;
    case 'secret':
    case 'secrets':
      await handleSecret(rest, isJson);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log('Usage: total-recall auth <command> [--json]');
      console.log('Commands:');
      console.log('  status   Show auth providers and security status');
      console.log('  audit    Audit permissions, session secrets, and credential integrity');
      console.log('  rotate   Generate and securely rotate SESSION_SECRET in store');
      console.log('  passkey  List or verify registered WebAuthn passkeys');
      console.log('  google status|connect|accounts|refresh <id>|disconnect <id>   Encrypted OAuth lifecycle');
      console.log('  probe    Execute HTTP 200 probe across auth endpoints');
      console.log('  session  Inspect session secret and security flags');
      console.log('  key list|issue|revoke|usage|roles|role-set   Scoped tokens and role policies');
      console.log('  secret   Inspect and manage Total Recall secrets store keys');
      console.log('  password set --stdin [--force-reset]   Set encrypted dashboard credential');
      console.log('  agent list|login <agent>   Sign in an agent CLI that authenticates on its own terminal');
      break;
    default:
      console.error(`Unknown subcommand: ${command}. Run 'total-recall auth --help' for guidance.`);
      process.exitCode = 1;
  }
}

export default run;

if (process.argv[1]?.endsWith('cli.mjs')) {
  run(process.argv).catch(() => { console.error(JSON.stringify({ error: 'Auth operation failed; verify store access and arguments. No success established.' })); process.exitCode = 1; });
}
