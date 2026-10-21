/**
 * tr() — Composable CLI Composition Helper
 *
 * Calls a verb (subcommand, custom command, or built-in) and returns
 * a standard envelope { ok, exitCode, data }.
 *
 * v2 commands (export default function main(args, { tr, json, dryRun, log }))
 * run in-process with an isolated argv and no subprocess overhead.
 * Built-ins run as subprocesses with --json. Custom commands require native metadata.
 *
 * Secrets are passed only through stdin, never on argv.
 * Nested calls inherit dryRun from the parent; a nested risky call
 * without --yes fails the parent with exit 3.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { isV2Command } from './contract.mjs';
import { hasRiskGate, dryRunResult } from './risk.mjs';

const CLI_PATH = process.argv[1]; // total-recall bin

/**
 * Resolve a verb to find its source module.
 * Follows the same resolution order as the core dispatcher:
 * built-in → project custom → global custom → plugin.
 * Returns { source: 'builtin'|'project'|'global'|'plugin', path: string|null }
 */
function resolveVerb(verb) {
  // Try built-in resolution: the bin has a COMMANDS map
  // For now, we treat anything not found locally as needing subprocess

  // Project custom commands
  const projectCmdPath = path.join(process.cwd(), '.agent', 'commands', `${verb}.mjs`);
  if (fs.existsSync(projectCmdPath)) {
    return { source: 'project', path: projectCmdPath };
  }

  // Global custom commands
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const globalCmdPath = path.join(homeDir, '.agent', 'commands', `${verb}.mjs`);
    if (fs.existsSync(globalCmdPath)) {
      return { source: 'global', path: globalCmdPath };
    }
  }

  // Not found locally — use subprocess via the CLI itself
  return { source: 'builtin', path: null };
}

/**
 * Call a verb and return the envelope.
 *
 * @param {string} verb - The command to call (e.g. 'project-id')
 * @param {string[]} args - Arguments to pass
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - Inherited dry-run mode
 * @param {boolean} [options.json] - Force JSON output
 * @param {string} [options.stdin] - Piped stdin content (secrets only)
 * @param {object} [options.log] - Optional logger
 * @returns {Promise<{ok: boolean, exitCode: number, data: any}>}
 */
export async function tr(verb, args = [], options = {}) {
  const { dryRun = false, json = true, stdin, log } = options;

  const resolved = resolveVerb(verb);

  if (resolved.path && !isV2Command(resolved.path)) return { ok: false, exitCode: 1, error: `Command ${verb} requires native metadata; recreate it with composable-cli create` };

  // Execute native custom commands in process
  if (resolved.path && isV2Command(resolved.path)) {
    try {
      const mod = await import(resolved.path);
      const handler = mod.default || mod.main;
      if (typeof handler !== 'function') {
        throw new Error(`Command '${verb}' has no default/main export`);
      }

      // Check risk gate for nested calls
      let meta = {};
      try {
        const metaSrc = fs.readFileSync(resolved.path, 'utf8');
        const metaMatch = metaSrc.match(/export\s+const\s+meta\s*=\s*({[\s\S]*?});/);
        if (metaMatch) {
          meta = Function(`"use strict"; return (${metaMatch[1]})`)();
        }
      } catch { /* ignore parse errors */ }

      if (meta.risk && hasRiskGate(meta.risk) && !args.includes('--yes')) {
        // Dry run: return the plan
        const plan = await dryRunResult(handler, args, { verb, json, dryRun: true, log });
        return { ok: false, exitCode: 3, data: plan, _riskGated: true };
      }

      const result = await handler(args, { tr: (...a) => tr(...a, { ...options, dryRun }), json, dryRun, log });
      const exitCode = result?.exitCode ?? 0;
      return { ok: exitCode === 0, exitCode, data: result?.data ?? result ?? null };
    } catch (err) {
      return { ok: false, exitCode: err.exitCode ?? 1, error: err.message };
    }
  }

  // Fallback: subprocess with --json envelope
  const allArgs = [CLI_PATH, verb, ...args];
  if (json && !args.includes('--json')) {
    allArgs.push('--json');
  }

  const spawnOpts = {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  };

  if (stdin) {
    spawnOpts.input = stdin;
  }

  const child = spawnSync(process.execPath, allArgs, spawnOpts);
  const stdout = (child.stdout || '').toString().trim();
  const stderr = (child.stderr || '').toString().trim();

  if (child.error) {
    return { ok: false, exitCode: 1, error: child.error.message };
  }

  const exitCode = child.status ?? 1;

  if (json) {
    // Try to parse JSON envelope; last JSON line wins
    const lines = stdout.split('\n').filter(Boolean);
    const jsonLines = lines.filter((l) => {
      try { JSON.parse(l); return true; } catch { return false; }
    });
    if (jsonLines.length > 0) {
      const parsed = JSON.parse(jsonLines[jsonLines.length - 1]);
      return { ok: parsed.ok ?? exitCode === 0, exitCode, data: parsed.result ?? parsed.data ?? parsed, ...(parsed.error ? { error: parsed.error } : {}) };
    }
  }

  return { ok: exitCode === 0, exitCode, data: stdout || null, stderr: stderr || null };
}

export default tr;