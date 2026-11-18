/**
 * OpenWiki generator runner using the operator's Claude Max subscription token
 * (`CLAUDE_CODE_OAUTH_TOKEN` from Total Recall Auth) via the `claude` CLI.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

function findClaudeBinary() {
  const home = os.homedir();
  const extraDirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const dirs = [...new Set([...(process.env.PATH || '').split(path.delimiter), ...extraDirs].filter(Boolean))];
  for (const dir of dirs) {
    const candidate = path.join(dir, 'claude');
    try {
      if (fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function main() {
  const cwd = process.cwd();
  const token = String(process.env.CLAUDE_CODE_OAUTH_TOKEN || '').trim();
  if (!token) {
    console.error('Missing CLAUDE_CODE_OAUTH_TOKEN in environment.');
    process.exit(1);
  }

  const claude = findClaudeBinary();
  if (!claude) {
    console.error('Claude Code CLI (`claude`) is not installed or not executable on PATH.');
    process.exit(1);
  }

  let head = '';
  try {
    head = execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`Failed to read git HEAD in ${cwd}: ${error.message}`);
    process.exit(1);
  }

  const wikiDir = path.join(cwd, 'openwiki');
  fs.mkdirSync(wikiDir, { recursive: true });
  const generation = readJson(path.join(wikiDir, '.generation.json'));
  const baseCommit = generation?.commit || null;
  const mode = process.env.OPENWIKI_MODE || 'update';
  const model = String(process.env.OPENWIKI_MODEL || '').trim();
  const timeoutMs = Number(process.env.OPENWIKI_TIMEOUT) || 900_000;

  let recentLog = '';
  try {
    const range = baseCommit ? `${baseCommit}..HEAD` : '-n 20';
    recentLog = execFileSync('git', ['-C', cwd, 'log', '--oneline', range, '--', '.', ':!openwiki'], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }).trim().split('\n').slice(0, 60).join('\n');
  } catch { /* ignore */ }

  const prompt = [
    `You are updating the OpenWiki documentation in ${wikiDir} for this repository (${cwd}).`,
    `Mode: ${mode}. Current HEAD: ${head}.${baseCommit ? ` Previous generation commit: ${baseCommit}.` : ''}`,
    recentLog ? `Recent commits to reflect:\n${recentLog}` : '',
    '',
    'Requirements:',
    '1. Inspect the real repository files (package.json, bin/, src/, openwiki/) before writing.',
    '2. Update/repair openwiki/README.md, openwiki/quickstart.md, openwiki/architecture.md, openwiki/index.md, and any referenced subpages so they accurately document the current codebase.',
    '3. Remove any placeholder text (such as "placeholder3") or broken internal markdown links (fix links to point to existing files or create/remove broken targets cleanly).',
    '4. Only write inside openwiki/. Do not edit source code, do not run git commit, and do not modify openwiki/.generation.json or openwiki/.last-update.json (the runner updates those).',
    '5. When finished, output a concise summary of the pages updated.',
  ].filter(Boolean).join('\n');

  const blankEnv = {
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_AUTH_TOKEN: '',
    ANTHROPIC_CUSTOM_HEADERS: '',
    ANTHROPIC_PROFILE: '',
    CLAUDE_CODE_USE_BEDROCK: '0',
    CLAUDE_CODE_USE_VERTEX: '0',
    CLAUDE_CODE_USE_FOUNDRY: '0',
  };
  const args = [
    '--settings', JSON.stringify({ apiKeyHelper: '', fastMode: false, env: blankEnv }),
    '--output-format', 'json',
    '--permission-mode', 'bypassPermissions',
    ...(model && model !== 'claude-max' ? ['--model', model] : []),
    '-p',
  ];

  const env = {
    ...process.env,
    ...blankEnv,
    CLAUDE_CODE_OAUTH_TOKEN: token,
  };

  const result = spawnSync(claude, args, {
    cwd,
    env,
    input: prompt,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    console.error(result.stderr || result.stdout || result.error?.message || `claude exited ${result.status}`);
    process.exit(result.status || 1);
  }

  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* plain text fallback */ }
  if (parsed?.is_error) {
    console.error(parsed.result || 'Claude returned an error.');
    process.exit(1);
  }

  const readmePath = path.join(wikiDir, 'README.md');
  if (!fs.existsSync(readmePath) || fs.readFileSync(readmePath, 'utf8').trim() === 'placeholder3') {
    console.error('OpenWiki README.md was not generated properly.');
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  writeJsonAtomic(path.join(wikiDir, '.generation.json'), {
    commit: head,
    completedAt: nowIso,
  });
  writeJsonAtomic(path.join(wikiDir, '.last-update.json'), {
    updatedAt: nowIso,
    command: mode,
    gitHead: head,
    model: model || 'claude-max',
    status: 'completed',
    language: 'en',
  });
  const runFile = path.join(wikiDir, '.run.json');
  const existingRun = readJson(runFile);
  if (existingRun && typeof existingRun === 'object') {
    writeJsonAtomic(runFile, {
      ...existingRun,
      phase: 'complete',
      completedAt: nowIso,
      targetGitHead: head,
    });
  }

  if (parsed?.result) console.log(parsed.result);
}

main();
