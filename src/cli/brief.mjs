/**
 * total-recall brief
 * Run first in every session (the global /start does): read-only brief of time, repo state, project id/groups, rules, commands, secrets health (counts only), tasks, trackers, and this repo's own start skill to follow next.
 * Built-in (ships with the package); was a machine-local composable command.
 */
export default async function (args = []) {
  // total-recall brief [--json] [--mesh]
// Session-start brief for the repo you are in: time, repo state, project identity and groups, rules, commands, secrets health (counts only), tasks, trackers, and this repo's own start skill.
const { spawn, spawnSync } = await import('node:child_process');
const fs = await import('node:fs');
const path = await import('node:path');

const argl = Array.isArray(args) ? args : [];
const asJson = argl.includes('--json');
const withMesh = argl.includes('--mesh');
if (argl.includes('--help') || argl.includes('-h')) {
  console.log(`Usage: total-recall brief [--json] [--mesh]

Read-only brief for the start of a session in the current repo. Composes:
project-id, group, command list, secret catalog/rotation-due/shared/tracking-health
(counts only, never values), task list, mesh status (--mesh adds mesh ping), git,
the compiled rules line, docs/projects trackers, openwiki, and the repo's own
.agent/skills/start/SKILL.md, which you follow next when it exists.`);
  return;
}

// Run a Total Recall verb (async, bounded). Output is parsed for counts only.
const tr = (verbArgs, ms = 45000) => new Promise((resolve) => {
  const child = spawn(process.execPath, [process.argv[1], ...verbArgs], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: null, out, err, timedOut: true }); }, ms);
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err, timedOut: false }); });
});
const jsonLine = (text) => {
  for (const line of text.split('\n').reverse()) {
    const t = line.trim();
    if ((t.startsWith('{') || t.startsWith('[')) && !t.includes('"subsystem"')) { try { return JSON.parse(t); } catch { /* next */ } }
  }
  try { return JSON.parse(text.slice(text.indexOf('{'))); } catch { return null; }
};
const num = (text, key) => { const m = text.match(new RegExp(`${key}=(\\d+)`)); return m ? Number(m[1]) : null; };
const git = (...a) => { const r = spawnSync('git', a, { cwd: process.cwd(), encoding: 'utf8' }); return r.status === 0 ? r.stdout.replace(/\r?\n$/, '') : null; };

const now = new Date();
const root = git('rev-parse', '--show-toplevel') || process.cwd();
const rel = (p) => path.relative(root, p) || '.';

const [pid, groupsRes, cmds, catalog, due, shared, tracking, tasks, secretList, mesh, ping] = await Promise.all([
  tr(['project-id', '--json']),
  tr(['group', 'list', '--json']),
  tr(['command', 'list', '--json']),
  tr(['secret', 'catalog']),
  tr(['secret', 'rotation-due']),
  tr(['secret', 'shared']),
  tr(['secret', 'tracking-health']),
  tr(['task', 'list']),
  tr(['secret', 'list']),
  tr(['mesh', 'status', '--json']),
  withMesh ? tr(['mesh', 'ping', '--json'], 60000) : Promise.resolve(null),
]);

// Project identity + the groups that contain it (recursively).
const project = jsonLine(pid.out);
const groups = [];
const groupList = jsonLine(groupsRes.out) || [];
if (project?.project_id && Array.isArray(groupList) && groupList.length) {
  const members = await Promise.all(groupList.map((g) => tr(['group', 'members', g.id, '--recursive', '--json'])));
  groupList.forEach((g, i) => {
    const list = jsonLine(members[i].out) || [];
    if (Array.isArray(list) && list.some((m) => m.id === project.project_id)) groups.push({ id: g.id, name: g.name });
  });
}

// Repo state.
const status = git('status', '--porcelain');
const repo = {
  root,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  dirty: status === null ? null : status.split('\n').filter(Boolean).length,
  last_commit: git('log', '-1', '--format=%h %s (%cr)'),
  upstream: git('rev-list', '--left-right', '--count', '@{upstream}...HEAD'),
};
if (repo.upstream) { const [behind, ahead] = repo.upstream.split(/\s+/).map(Number); repo.upstream = { ahead, behind, note: 'as of last fetch' }; }

// Compiled rules (whatever the IDE surface says is active).
let rules = null;
for (const f of ['CLAUDE.md', 'AGENTS.md', 'INSTRUCTIONS.md']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const m = fs.readFileSync(p, 'utf8').match(/Active Rules: (\d+) invariants, (\d+) preferences, (\d+) corrections/);
  if (m) { rules = { file: f, invariants: +m[1], preferences: +m[2], corrections: +m[3], compiled: fs.statSync(p).mtime.toISOString() }; break; }
}

// Trackers, skills, openwiki, repo start skill.
const dirList = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
const trackers = { in_progress: dirList(path.join(root, 'docs/projects/in-progress')), planned: dirList(path.join(root, 'docs/projects/planned')) };
const skillsDir = path.join(root, '.agent/skills');
const skills = dirList(skillsDir).filter((s) => fs.existsSync(path.join(skillsDir, s, 'SKILL.md')));
// A repo start skill is the repo's own; a deployed copy of the global one (repo_scoped: false) is not.
const startSkill = ['.agent/skills/start/SKILL.md', '.claude/skills/start/SKILL.md'].map((p) => path.join(root, p))
  .find((p) => { try { return !/^repo_scoped:\s*false/m.test(fs.readFileSync(p, 'utf8').split('\n---')[0]); } catch { return false; } }) || null;
// OpenWiki: the repo's own wiki (openwiki/) first, then the brain copy.
const openwiki = ['openwiki', '.agent/skills/total-recall/openwiki', '.agent/openwiki'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d)).map((d) => {
  const pages = fs.readdirSync(d).filter((f) => f.endsWith('.md'));
  const entry = ['quickstart.md', 'README.md'].find((f) => pages.includes(f)) || pages[0] || null;
  const newest = pages.reduce((t, f) => Math.max(t, fs.statSync(path.join(d, f)).mtimeMs), 0);
  return { dir: rel(d), pages: pages.length, entry: entry ? rel(path.join(d, entry)) : null, updated: newest ? new Date(newest).toISOString() : null };
}).filter((w) => w.pages > 0);

// Secrets: counts and exit codes only — never values or masked fragments.
const secrets = {
  keys: num(catalog.out, 'keys'),
  providers: num(catalog.out, 'providers'),
  rotation_due: /No secrets overdue/.test(due.out) ? 0 : (due.code === 0 ? num(catalog.out, 'rotate_due') : (num(due.out, 'due') ?? 'check')),
  shared_values: shared.code === 0 ? 0 : (num(shared.out, 'error_groups') ?? num(shared.out, 'groups') ?? 'check'),
  untracked: tracking.code === 0 ? 0 : (num(tracking.out, 'errors') ?? 'check'),
};
const cmdList = jsonLine(cmds.out) || [];
const taskLines = tasks.out.split('\n');
const taskCounts = { pending: taskLines.filter((l) => /^\s*\[pending\]/.test(l)).length, in_progress: taskLines.filter((l) => /^\s*\[in_progress\]/.test(l)).length };
const meshStatus = jsonLine(mesh.out);
const pingData = ping ? jsonLine(ping.out) : null;

// Domain: what this repo can reach and what runs on its own. Names only.
const os = await import('node:os');
const providers = [...new Set(secretList.out.split('\n').map((l) => l.match(/^\s*•\s+\S+\s+len=\s*\d+\s+(\S+)/)?.[1]).filter(Boolean))].sort();
const integrations = [];
for (const [scope, dir] of [['project', path.join(root, '.agent/skills/total-recall/integrations')], ['global', path.join(os.homedir(), '.agent/skills/total-recall/integrations')]]) {
  try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) integrations.push(`${f.slice(0, -3)} (${scope})`); } catch { /* none */ }
}
const repoName = path.basename(root);
const automations = [];
try {
  const la = path.join(os.homedir(), 'Library/LaunchAgents');
  for (const f of fs.readdirSync(la)) {
    if (!f.endsWith('.plist')) continue;
    const body = fs.readFileSync(path.join(la, f), 'utf8');
    if (body.includes(root + '/') || body.includes(root + '<') || f.includes(repoName)) automations.push(`launchd ${f.replace(/\.plist$/, '')}`);
  }
} catch { /* not macOS */ }
const cron = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
if (cron.status === 0) cron.stdout.split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes(root)).forEach((l) => automations.push(`cron ${l.trim().split(/\s+/).slice(0, 5).join(' ')}`));
let scripts = [];
try { scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {}); } catch { /* none */ }
const launchers = fs.readdirSync(root).filter((f) => { try { const st = fs.statSync(path.join(root, f)); return st.isFile() && (st.mode & 0o111) && !f.includes('.'); } catch { return false; } });
const domain = { providers, integrations, automations, launchers, npm_scripts: scripts };

const { inspectStartup } = await import('./startup.mjs');
const runtime = await inspectStartup().catch(() => ({ ready: false, status: 'unknown' }));
const { queryHarnessUsage } = await import('../core/meta-harness.mjs');
const harnesses = await queryHarnessUsage().catch(() => []);
const warnings = [];
if (!runtime.ready) warnings.push('Shared runtime readiness failed or unknown: total-recall startup check --json.');
if (!project?.project_id) warnings.push('No project brain here (total-recall init) — memory, secrets and rules are global-only.');
if (secrets.rotation_due && secrets.rotation_due !== 0) warnings.push(`Secrets overdue for rotation: ${secrets.rotation_due} (total-recall secret rotation-due).`);
if (secrets.shared_values && secrets.shared_values !== 0) warnings.push(`Credential values reused across keys/apps: ${secrets.shared_values} group(s) (total-recall secret shared).`);
if (secrets.untracked && secrets.untracked !== 0) warnings.push(`Secrets without usage/account tracking: ${secrets.untracked} (total-recall secret tracking-health).`);
if (rules && (now - new Date(rules.compiled)) > 7 * 86400000) warnings.push(`Instruction surfaces last compiled ${rules.compiled.slice(0, 10)} — run total-recall compile.`);
for (const w of openwiki) if (w.updated && (now - new Date(w.updated)) > 30 * 86400000) warnings.push(`OpenWiki ${w.dir} last updated ${w.updated.slice(0, 10)} — may be stale.`);
if (meshStatus && meshStatus.configured === false) warnings.push(`Mesh not configured: ${meshStatus.reason || 'unknown'}.`);
for (const [name, r] of Object.entries({ project_id: pid, catalog, tasks, mesh })) if (r?.timedOut) warnings.push(`${name} check timed out.`);
for (const h of harnesses) {
  if (h.available && !h.authed && h.authRoute?.includes('expired')) {
    warnings.push(`Harness ${h.name} (${h.id}) credentials expired; re-authenticate.`);
  }
}

const brief = {
  generated: { local: now.toString(), utc: now.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  project: project ? { id: project.project_id, name: project.name, groups } : null,
  repo, rules, skills, repo_start_skill: startSkill ? rel(startSkill) : null, openwiki, trackers,
  domain, runtime,
  harnesses: harnesses.map((h) => ({
    id: h.id,
    name: h.name,
    version: h.version,
    latestVersion: h.latestVersion,
    isCurrent: h.isCurrent,
    authRoute: h.authRoute,
    rolling5hRemainingPct: h.rolling5hRemainingPct,
    weeklyRemainingPct: h.weeklyRemainingPct,
    status: h.status
  })),
  commands: cmdList.map((c) => ({ name: c.name, scope: c.scope, risk: c.risk })),
  secrets, tasks: taskCounts,
  mesh: { configured: meshStatus?.configured ?? null, ping: pingData },
  warnings,
  next: startSkill
    ? [`Read and follow ${rel(startSkill)} — this repo's own start steps.`]
    : [`This repo has no start skill of its own: read ${openwiki[0]?.entry || 'the openwiki'}${skills.includes('repo-expert') ? ' and .agent/skills/repo-expert/SKILL.md' : ''} before changing code.`],
};

if (asJson) { console.log(JSON.stringify(brief, null, 2)); return; }

const L = [];
L.push(`# Brief — ${project?.name || path.basename(root)}`);
L.push(`Time: ${now.toLocaleString()} ${brief.generated.timezone} (UTC ${brief.generated.utc})`);
L.push(`Project id: ${project?.project_id || 'none'}${groups.length ? `  groups: ${groups.map((g) => g.name).join(', ')}` : ''}`);
L.push(`Repo: ${repo.branch || '?'}  dirty files: ${repo.dirty ?? '?'}  last: ${repo.last_commit || '?'}${repo.upstream ? `  ahead ${repo.upstream.ahead}/behind ${repo.upstream.behind} (last fetch)` : ''}`);
L.push(`Rules: ${rules ? `${rules.invariants} invariants, ${rules.preferences} preferences, ${rules.corrections} corrections (${rules.file}, compiled ${rules.compiled.slice(0, 16).replace('T', ' ')})` : 'no compiled surface'}`);
L.push(`Skills (${skills.length}): ${skills.join(', ') || 'none'}`);
L.push(`Commands (${cmdList.length}): ${cmdList.map((c) => c.name + (c.risk && !['read', 'write'].includes(c.risk) ? `[${c.risk}]` : '')).join(', ') || 'none'}`);
L.push(`Secrets: ${secrets.keys ?? '?'} keys / ${secrets.providers ?? '?'} providers; rotation due ${secrets.rotation_due}; shared ${secrets.shared_values}; untracked ${secrets.untracked}`);
L.push(`Providers with keys (${providers.length}): ${providers.join(', ') || 'none'}`);
L.push(`Integrations: ${integrations.join(', ') || 'none'}  | automations: ${automations.join(', ') || 'none'}`);
L.push(`Entry points: launchers ${launchers.map((f) => './' + f).join(' ') || 'none'}; npm scripts ${scripts.length}${scripts.length ? ` (${scripts.slice(0, 12).join(', ')}${scripts.length > 12 ? ', …' : ''})` : ''}`);
L.push(`Runtime: server ${runtime.server?.status || 'unknown'}; brain ${runtime.brain?.status || 'unknown'}; daemon ${runtime.daemon?.status || 'unknown'}; SSSS ${runtime.ssss?.status || 'unknown'}; app ${runtime.app?.status || 'unknown'}`);
const availableHarnesses = harnesses.filter((h) => h.available);
const authedHarnesses = availableHarnesses.filter((h) => h.authed);
if (availableHarnesses.length) {
  const hDesc = availableHarnesses.map((h) => {
    const verTag = h.isCurrent ? `v${h.version}` : `v${h.version} (update: v${h.latestVersion})`;
    return `${h.id} [${verTag}, 5h: ${h.rolling5hRemainingPct}, week: ${h.weeklyRemainingPct}]`;
  }).join('; ');
  L.push(`Harnesses (${authedHarnesses.length}/${availableHarnesses.length} authed): ${hDesc}`);
}
L.push(`Tasks: ${taskCounts.pending} pending, ${taskCounts.in_progress} in progress`);
L.push(`Mesh: ${meshStatus?.configured ? 'configured' : 'not configured'}${pingData ? ` — ping: ${JSON.stringify(pingData).slice(0, 300)}` : ' (add --mesh to ping nodes)'}`);
L.push(`Trackers in progress: ${trackers.in_progress.join(', ') || 'none'}${trackers.planned.length ? `  | planned: ${trackers.planned.join(', ')}` : ''}`);
L.push(`OpenWiki: ${openwiki.length ? openwiki.map((w) => `${w.entry} (${w.pages} pages, updated ${w.updated.slice(0, 10)})`).join('; ') : 'none'}`);
if (warnings.length) { L.push('', 'Warnings:'); warnings.forEach((w) => L.push(`- ${w}`)); }
L.push('', 'Next:'); brief.next.forEach((n) => L.push(`- ${n}`));
console.log(L.join('\n'));
}
