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
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import {
  describeHeadscaleAvailability,
  headscaleFetchWithLegacyFallback,
  createHeadscalePreAuthKey,
  getHeadscalePolicy,
  setHeadscalePolicy,
  buildMeshSshPolicy,
} from '../core/headscale-client.mjs';
import { findMeshNode, listEnrichedMeshNodes, setMeshNodeAccess } from '../core/mesh.mjs';
import {
  buildSshArgs,
  formatAccessTarget,
  proposeAccessFromSshConfig,
  readSshConfig,
  resolveNodeAccess,
} from '../core/mesh-access.mjs';

function printHelp() {
  console.log(`
  total-recall mesh — control-server (headscale) administration

  Usage: total-recall mesh <command> [options]

    status                 Control-server reachability and credential state
    nodes                  List mesh nodes and how to reach each one
    ssh <node> [cmd…]      Open a session using the node's recorded access
    access <node>          Show resolved access for a node
    access <node> --user <u> [--port <n>] [--host <h>] [--identity <path>]
                           Record how to reach a node
    access import          Propose access from ~/.ssh/config (--apply to save)
    preauthkey             Mint an enrollment key for 'tailscale up --authkey'
                             --reusable   usable by more than one node
                             --ephemeral  node is removed when it goes offline
    policy get             Show the current ACL policy
    policy set --file <p>  Replace the policy from a file ("-" reads stdin)
    policy init-ssh        Write a policy enabling Tailscale SSH across the mesh
                             --allow-root  also permit SSH as root (discouraged)
                             --dry-run     print the policy without applying it

  Notes:
    Policy commands need the control server running with policy.mode: database.
    Mesh membership is the trust boundary — every node admitted to the tailnet
    inherits whatever the policy grants. Audit 'mesh nodes' before widening it.

    A node is only as reachable as its login account is known. The control
    server cannot supply that, so 'access' records it on the node entity where
    every machine and agent resolves it the same way.

  Examples:
    npx total-recall mesh nodes
    npx total-recall mesh access import
    npx total-recall mesh ssh macmini
    npx total-recall mesh ssh macmini 'uptime'
    npx total-recall mesh policy init-ssh
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
  // Node entities must be read and written in the brain the caller selected;
  // falling back to the default root silently splits one machine's facts
  // across two brains depending on which command touched it last.
  const vaultRoot = path.join(brainDir, 'memory-vault');
  const command = args.shift();

  try {
    if (command === 'status') {
      const info = await describeHeadscaleAvailability(brainDir);
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    if (command === 'nodes') {
      // The control server is the authoritative registry, but local discovery
      // plus the vault can already answer "what is on my mesh and how do I
      // reach it". Requiring a credential for that turns a routine listing
      // into a dead end whenever the secrets store is locked.
      let registry = null;
      try {
        const data = await headscaleFetchWithLegacyFallback(
          '/api/v1/node',
          '/api/v1/machine',
          {},
          brainDir,
        );
        registry = data?.nodes || data?.machines || [];
      } catch (err) {
        console.error(`⚠️  Control server unavailable: ${err.message}`);
        console.error('   Falling back to local discovery.\n');
      }

      // Access lives in the vault, not the control server, so the listing is
      // joined against local entities by address.
      const enriched = listEnrichedMeshNodes(vaultRoot);
      const byIp = new Map();
      for (const node of enriched) {
        if (node.ip) byIp.set(String(node.ip), node);
      }

      const rows = registry
        ? registry.map((node) => {
            const addresses = node.ipAddresses || [];
            return {
              id: node.id,
              name: node.name || node.givenName || '-',
              address: addresses[0] || null,
              entity: addresses.map((ip) => byIp.get(String(ip))).find(Boolean) || null,
            };
          })
        : enriched.map((node) => ({
            id: '-',
            name: node.hostname || '-',
            address: node.ip || null,
            entity: node,
          }));

      if (!rows.length) {
        console.log('No nodes found.');
        return;
      }

      let missing = 0;
      for (const row of rows) {
        const resolved = resolveNodeAccess(row.entity || { ip: row.address });
        if (!resolved.complete) missing += 1;
        console.log(
          `  ${String(row.id).padEnd(4)} ` +
            `${String(row.name).padEnd(38)} ` +
            `${String(row.address || '-').padEnd(16)} ` +
            `${formatAccessTarget(resolved)}`,
        );
      }

      if (missing) {
        console.log('');
        console.log(
          `${missing} node(s) have no recorded login account — connecting to one will fail`,
        );
        console.log("as though it were unreachable. Run 'total-recall mesh access import'.");
      }
      return;
    }

    // Connecting should not require the operator to remember, or rediscover,
    // which account a given machine uses.
    if (command === 'ssh') {
      const target = args.shift();
      if (!target) {
        fail('`ssh` requires a node name or address.', 'Run `total-recall mesh nodes`.');
        return;
      }
      const node = findMeshNode(target, vaultRoot);
      if (!node) {
        fail(`No mesh node matches "${target}".`, 'Run `total-recall mesh nodes` to list them.');
        return;
      }

      const resolved = resolveNodeAccess(node);
      if (!resolved.complete) {
        fail(
          `No login account recorded for ${node.hostname}.`,
          `Set one with: total-recall mesh access ${target} --user <login>`,
        );
        return;
      }

      const sshArgs = buildSshArgs(resolved, {
        command: args.length ? args.join(' ') : null,
      });
      const res = spawnSync('ssh', sshArgs, { stdio: 'inherit' });
      process.exitCode = res.status ?? 1;
      return;
    }

    if (command === 'access') {
      const target = args.shift();
      if (!target) {
        fail('`access` requires a node name, or `import`.');
        return;
      }

      if (target === 'import') {
        const nodes = listEnrichedMeshNodes(vaultRoot);
        const proposals = proposeAccessFromSshConfig(nodes, readSshConfig());
        if (!proposals.length) {
          console.log('No new access could be inferred from ~/.ssh/config.');
          return;
        }

        const apply = args.includes('--apply');
        let saved = 0;
        let failed = 0;
        for (const proposal of proposals) {
          console.log(
            `  ${String(proposal.hostname).padEnd(24)} ${proposal.access.ssh_user}` +
              `   (from Host ${proposal.matched_host})`,
          );
          if (apply) {
            const result = await setMeshNodeAccess(proposal.hostname, proposal.access, { vaultRoot });
            if (result.written) {
              saved += 1;
            } else {
              failed += 1;
              console.error(`   ⚠️  could not save: ${result.reason || 'write failed'}`);
            }
          }
        }

        console.log('');
        if (!apply) {
          console.log('Re-run with --apply to record these on the node entities.');
          return;
        }
        // Reporting a flat total here regardless of outcome is how a failed
        // write got announced as a success.
        console.log(`Recorded access for ${saved} of ${proposals.length} node(s).`);
        if (failed) {
          fail(`${failed} node(s) could not be saved.`);
        }
        return;
      }

      const readOption = (flag) => {
        const index = args.indexOf(flag);
        return index === -1 ? null : args[index + 1] || null;
      };
      const user = readOption('--user');
      const port = readOption('--port');
      const host = readOption('--host');
      const identity = readOption('--identity');

      if (!user && !port && !host && !identity) {
        const node = findMeshNode(target, vaultRoot);
        if (!node) {
          fail(`No mesh node matches "${target}".`);
          return;
        }
        console.log(JSON.stringify(resolveNodeAccess(node), null, 2));
        return;
      }

      const patch = { source: 'manual' };
      if (user) patch.ssh_user = user;
      if (port) patch.ssh_port = Number.parseInt(port, 10);
      if (host) patch.ssh_host = host;
      if (identity) patch.identity_file = identity;

      const result = await setMeshNodeAccess(target, patch, { vaultRoot });
      if (!result.written) {
        fail(
          `Could not record access for "${target}".`,
          result.reason === 'node-not-found'
            ? 'Run `total-recall mesh nodes` to see known nodes.'
            : 'The vault write was rejected.',
        );
        return;
      }
      console.log(`✅ Access recorded for ${target} (${result.path}).`);
      return;
    }

    // Enrolling a node otherwise means an interactive browser login against the
    // control server. A pre-auth key makes `tailscale up` a single
    // copy-pasteable command, which matters most on a machine you are standing
    // in front of precisely because you cannot reach it yet.
    if (command === 'preauthkey') {
      const reusable = args.includes('--reusable');
      const ephemeral = args.includes('--ephemeral');
      const { key, expiration } = await createHeadscalePreAuthKey(
        { reusable, ephemeral },
        brainDir,
      );
      console.log(key);
      console.error(`(expires ${expiration}${reusable ? ', reusable' : ', single-use'})`);
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
