/**
 * install-skill.mjs — safe wrapper around the Skills CLI installer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanDirectory, formatReport } from './scan-skill.mjs';

const BLOCKED_SOURCE_CHARS = /[\0\r\n;&|<>`$]/;

export function validateSkillSource(source) {
  if (typeof source !== 'string') return false;
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 500) return false;
  return !BLOCKED_SOURCE_CHARS.test(trimmed);
}

export function inferSkillName(source) {
  const trimmed = String(source || '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (!trimmed.startsWith('git@') && trimmed.includes('@')) {
    return trimmed.split('@').pop() || null;
  }
  const last = trimmed.split('/').filter(Boolean).pop();
  return last ? last.replace(/\.git$/i, '') : null;
}

function uniqueExistingDirs(paths) {
  const seen = new Set();
  const dirs = [];
  for (const candidate of paths) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
    seen.add(resolved);
    dirs.push(resolved);
  }
  return dirs;
}

export function installedSkillCandidates(source, { cwd = process.cwd(), agentDir = path.join(cwd, '.agent') } = {}) {
  const skillName = inferSkillName(source);
  if (!skillName) return [];
  return [
    path.join(agentDir, 'skills', skillName),
    path.join(cwd, '.agent', 'skills', skillName),
    path.join(cwd, '.agents', 'skills', skillName),
    path.join(cwd, '.claude', 'skills', skillName),
  ];
}

/**
 * Install a skill with the Skills CLI, then scan installed script files.
 *
 * @param {string} source skills add source, e.g. owner/repo@skill or URL
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.agentDir]
 * @param {boolean} [options.dryRun=false]
 * @returns {{ success: boolean, source: string, command?: string[], findings?: Array, error?: string }}
 */
export function installSkill(source, options = {}) {
  const cwd = options.cwd || process.cwd();
  const agentDir = options.agentDir || path.join(cwd, '.agent');
  const normalized = String(source || '').trim();

  if (!validateSkillSource(normalized)) {
    const error = 'Invalid skill source. Use a repository, URL, git source, local path, or owner/repo@skill without shell metacharacters.';
    console.error(`❌ ${error}`);
    return { success: false, source: normalized, error };
  }

  const command = ['npx', '-y', 'skills', 'add', normalized, '-y'];
  if (options.dryRun) {
    return { success: true, source: normalized, command };
  }

  // 1. Setup Quarantine Environment
  const quarantineBase = path.join(agentDir, '.quarantine');
  const quarantineId = `quarantine_${Date.now()}`;
  const quarantineCwd = path.join(quarantineBase, quarantineId);
  fs.mkdirSync(quarantineCwd, { recursive: true });

  console.log(`🛡️  Setting up safety gatekeeper in quarantine...`);
  console.log(`📦 Installing skill: ${normalized}`);
  
  // 2. Download into quarantine
  const child = spawnSync(command[0], command.slice(1), {
    cwd: quarantineCwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);

  if (child.error || child.status !== 0) {
    fs.rmSync(quarantineCwd, { recursive: true, force: true });
    const error = child.error?.message || `skills CLI exited with status ${child.status}`;
    console.error(`❌ Skill installation failed: ${error}`);
    return { success: false, source: normalized, command, error };
  }

  // 3. Find installed skills inside quarantine
  const quarantineAgentDir = path.join(quarantineCwd, '.agent');
  const installedDirs = uniqueExistingDirs(installedSkillCandidates(normalized, { cwd: quarantineCwd, agentDir: quarantineAgentDir }));
  
  // 4. Static Analysis / Scan
  console.log(`🔍 Running static analysis on quarantined files...`);
  const findings = installedDirs.flatMap(dir => scanDirectory(dir));
  const report = formatReport(findings);
  console.log(report.trimEnd());

  if (findings.some(f => f.severity === 'CRITICAL')) {
    const error = 'Installed skill contains critical scanner findings. Quarantine blocked promotion.';
    console.error(`❌ ${error}`);
    console.log(`🗑️  Cleaning up quarantine directory...`);
    fs.rmSync(quarantineCwd, { recursive: true, force: true });
    return { success: false, source: normalized, command, findings, error };
  }

  // 5. Promote passed skills to real destination
  console.log(`✅ Safety scan passed. Promoting to active skills registry...`);
  const promotedDirs = [];
  
  for (const qDir of installedDirs) {
    const skillName = path.basename(qDir);
    const destDir = path.join(agentDir, 'skills', skillName);
    
    // Move from quarantine to actual agentDir
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.renameSync(qDir, destDir);
    promotedDirs.push(destDir);
  }

  // Clean up empty quarantine
  fs.rmSync(quarantineCwd, { recursive: true, force: true });

  // 6. Trigger universal recompile
  console.log(`🔄 Triggering universal surface recompile...`);
  const compile = spawnSync('npx', ['total-recall', 'compile'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AGENT_DIR: agentDir },
  });
  if (compile.status !== 0) {
    console.warn('⚠️  Skill promoted, but surface recompilation returned a warning.');
  }

  return { success: true, source: normalized, command, findings, promotedDirs };
}
