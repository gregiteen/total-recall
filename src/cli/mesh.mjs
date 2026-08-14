/**
 * total-recall mesh — control-server (headscale) mesh administration.
 *
 * Node and pre-auth-key management already existed over REST; this adds the
 * missing piece, the ACL policy, which is what turns the mesh from "a network"
 * into "a network that also authorises SSH". Without a policy, headscale routes
 * packets but every host still falls back to its own sshd and per-machine
 * authorized_keys — which defeats most of the point of running a control server.
 *
 * Policy management requires the control server to run with
 * `policy.mode: database`. In `file` mode the policy lives on the server's disk
 * and the API cannot manage it; the commands below say so explicitly rather
 * than failing obscurely.
 */

import fs from 'node:fs';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import {
  describeHeadscaleAvailability,
  headscaleFetchWithLegacyFallback,
  getHeadscalePolicy,
  setHeadscalePolicy,
  buildMeshSshPolicy,
} from '../core/headscale-client.mjs';

function printHelp() {
  console.log(`
  total-recall mesh — control-server (headscale) administration

  Usage: total-recall mesh <command> [options]

    status                 Control-server reachability and credential state
    nodes                  List registered mesh nodes
    policy get             Show the current ACL policy
    policy set --file <p>  Replace the policy from a file ("-" reads stdin)
    policy init-ssh        Write a policy enabling Tailscale SSH across the mesh
                             --allow-root  also permit SSH as root (discouraged)
                             --dry-run     print the policy without applying it

  Notes:
    Policy commands need the control server running with policy.mode: database.
    Mesh membership is the trust boundary — every node admitted to the tailnet
    inherits whatever the policy grants. Audit 'mesh nodes' before widening it.

  Examples:
    npx total-recall mesh status
    npx total-recall mesh policy init-ssh --dry-run
    npx total-recall mesh policy init-ssh
    npx total-recall mesh policy get
`);
}

function fail(message, hint) {
  console.error(`❌ ${message}`);
  if (hint) console.error(`   ${hint}`);
  process.exitCode = 1;
}

// A file-mode control server cannot accept an API-written policy. That is a
// server configuration problem, not a user error, so say what to change.
function reportPolicyModeError(err) {
  if (err.code === 'POLICY_MODE_FILE') {
    fail(
      'Control server is in file policy mode.',
      'Set `policy.mode: database` in the control server config and restart it.',
    );
    return true;
  }
  return false;
}

export default async function meshCli(argv = []) {
  const args = [...argv];
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const layer = parseLayerFlag(args);
  const brainDir = resolveBrainDir(layer);
  const command = args.shift();

  try {
    if (command === 'status') {
      const info = await describeHeadscaleAvailability(brainDir);
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    if (command === 'nodes') {
      const data = await headscaleFetchWithLegacyFallback(
        '/api/v1/node',
        '/api/v1/machine',
        {},
        brainDir,
      );
      const nodes = data?.nodes || data?.machines || [];
      if (!nodes.length) {
        console.log('No nodes registered.');
        return;
      }
      for (const node of nodes) {
        const addrs = (node.ipAddresses || []).join(', ');
        console.log(
          `  ${String(node.id).padEnd(4)} ${String(node.name || node.givenName || '-').padEnd(24)} ${addrs}`,
        );
      }
      return;
    }

    if (command !== 'policy') {
      fail(`Unknown mesh command: ${command}`, 'Run `total-recall mesh --help`.');
      return;
    }

    const sub = args.shift();

    if (sub === 'get') {
      let current;
      try {
        current = await getHeadscalePolicy(brainDir);
      } catch (err) {
        if (reportPolicyModeError(err)) return;
        throw err;
      }
      if (!current.configured) {
        console.log('No policy is set on the control server.');
        console.log('Run `total-recall mesh policy init-ssh` to enable Tailscale SSH.');
        return;
      }
      console.log(current.policy);
      return;
    }

    if (sub === 'set') {
      const fileIndex = args.indexOf('--file');
      if (fileIndex === -1 || !args[fileIndex + 1]) {
        fail('`policy set` requires --file <path> (or --file - for stdin).');
        return;
      }
      const source = args[fileIndex + 1];
      const body =
        source === '-'
          ? fs.readFileSync(0, 'utf8')
          : fs.readFileSync(source, 'utf8');
      if (!body.trim()) {
        fail('Refusing to write an empty policy.');
        return;
      }
      try {
        await setHeadscalePolicy(body, brainDir);
      } catch (err) {
        if (reportPolicyModeError(err)) return;
        throw err;
      }
      console.log('✅ Policy updated.');
      return;
    }

    if (sub === 'init-ssh') {
      const allowRoot = args.includes('--allow-root');
      const policy = buildMeshSshPolicy({ allowRoot });

      if (args.includes('--dry-run')) {
        console.log(JSON.stringify(policy, null, 2));
        return;
      }

      // Never silently clobber a policy someone deliberately wrote.
      let existing;
      try {
        existing = await getHeadscalePolicy(brainDir);
      } catch (err) {
        if (reportPolicyModeError(err)) return;
        throw err;
      }
      if (existing.configured && !args.includes('--force')) {
        fail(
          'A policy already exists on the control server.',
          'Review it with `mesh policy get`, then re-run with --force to replace it.',
        );
        return;
      }

      try {
        await setHeadscalePolicy(policy, brainDir);
      } catch (err) {
        if (reportPolicyModeError(err)) return;
        throw err;
      }

      console.log('✅ Mesh SSH policy applied.');
      if (allowRoot) console.log('⚠️  root SSH is permitted by this policy.');
      console.log('');
      console.log('Each node must now advertise SSH to accept mesh-authorised sessions:');
      console.log('  tailscale up --ssh   (re-run with the existing flags on that node)');
      return;
    }

    fail(`Unknown policy command: ${sub ?? '(none)'}`, 'Run `total-recall mesh --help`.');
  } catch (err) {
    fail(err.message, err.detail ? String(err.detail).slice(0, 200) : undefined);
  }
}
