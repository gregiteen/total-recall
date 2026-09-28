/**
 * total-recall group
 * Manage groups of projects and groups of groups (create, add, remove, list, show, tree, members --recursive, delete).
 * Built-in (ships with the package); was a machine-local composable command.
 */
export default async function (args = []) {
  // total-recall group <create|add|remove|list|tree|members|delete|show> …
// Groups of projects and groups of groups. Each group is an SSSS document
// (type: project_group) in the global brain: ~/.agent/skills/total-recall/groups/<uuid>.md
// Members are projects (random-UUID project ids) or other groups. Nesting is
// cycle-checked; a project or group may belong to several groups.
const fs = await import('node:fs');
const path = await import('node:path');
const os = await import('node:os');
const { randomUUID } = await import('node:crypto');
const { spawnSync } = await import('node:child_process');
const { createRequire } = await import('node:module');
const YAML = (await import('yaml')).default;

const argl = Array.isArray(args) ? args : [];
const asJson = argl.includes('--json');
const recursive = argl.includes('--recursive') || argl.includes('-r');
const pos = argl.filter((a) => !a.startsWith('-'));
const [sub, ...rest] = pos;
const DIR = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'groups');
fs.mkdirSync(DIR, { recursive: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const die = (m) => { process.exitCode = 1; if (asJson) console.log(JSON.stringify({ ok: false, error: m })); else console.error('✖ ' + m); };
const help = () => console.log(`Usage: total-recall group <command> [--json]

  create <name> [--description "<text>"]   New group (random UUID id)
  add <group> <member…>                    Member = repo path (→ its project id), project UUID, or group name/UUID
  remove <group> <member…>                 Remove members
  list                                     All groups
  show <group>                             One group with direct members
  tree [<group>]                           Nested view (all roots if omitted)
  members <group> [--recursive]            Direct members, or every project reached through nested groups
  delete <group>                           Delete a group (refused while other groups contain it)

Groups are SSSS project_group documents in ${DIR}. Nesting is cycle-checked.`);

const load = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  return m ? YAML.parse(m[1]) : null;
}).filter(Boolean);
const save = (g) => {
  g.timestamp = new Date().toISOString();
  const body = `---\n${YAML.stringify(g).trim()}\n---\n\n# ${g.title}\n\n${g.description || 'Project group.'}\n`;
  const file = path.join(DIR, `${g.id}.md`); const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body, { mode: 0o644 }); fs.renameSync(tmp, file);
};
const groups = load();
const byId = new Map(groups.map((g) => [g.id, g]));
const find = (ref) => groups.find((g) => g.id === ref) || groups.filter((g) => g.title === ref).at(0) || null;
const findAll = (ref) => groups.filter((g) => g.id === ref || g.title === ref);
const one = (ref) => { const hits = findAll(ref); if (hits.length > 1) { die(`"${ref}" matches ${hits.length} groups — use the id`); return null; } if (!hits.length) { die(`no group "${ref}"`); return null; } return hits[0]; };

const projectFromPath = (p) => {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  const r = spawnSync(process.execPath, [process.argv[1], 'project-id', '--json'], { cwd: abs, encoding: 'utf8' });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('{"project_id"'));
  if (r.status !== 0 || !line) return null;
  const j = JSON.parse(line);
  return { type: 'project', id: j.project_id, name: j.name, path: path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(j.config))))) };
};
const resolveMember = (ref) => {
  const g = find(ref); if (g) return { type: 'group', id: g.id, name: g.title };
  if (UUID.test(ref)) {
    // a bare UUID that is not a group: a project id (name/path unknown until added by path)
    for (const x of groups) for (const m of x.members || []) if (m.type === 'project' && m.id === ref) return { ...m };
    return { type: 'project', id: ref };
  }
  return projectFromPath(ref);
};
// does `from` (a group id) reach `target` (a group id) through nesting?
const reaches = (from, target, seen = new Set()) => {
  if (from === target) return true; if (seen.has(from)) return false; seen.add(from);
  return (byId.get(from)?.members || []).some((m) => m.type === 'group' && reaches(m.id, target, seen));
};
const flatten = (g, seen = new Set()) => {
  const out = new Map(); if (seen.has(g.id)) return out; seen.add(g.id);
  for (const m of g.members || []) {
    if (m.type === 'project') out.set(m.id, m);
    else if (byId.has(m.id)) for (const [k, v] of flatten(byId.get(m.id), seen)) out.set(k, v);
  }
  return out;
};
const label = (m) => m.type === 'group' ? `▸ ${byId.get(m.id)?.title || m.name || m.id}  (${m.id})` : `• ${m.name || '(project)'}  ${m.id}${m.path ? '  ' + m.path : ''}`;
const printTree = (g, depth = 0, seen = new Set()) => {
  console.log(`${'  '.repeat(depth)}▸ ${g.title}  (${g.id})`);
  if (seen.has(g.id)) return; seen.add(g.id);
  for (const m of g.members || []) {
    if (m.type === 'group' && byId.has(m.id)) printTree(byId.get(m.id), depth + 1, seen);
    else console.log(`${'  '.repeat(depth + 1)}${label(m)}`);
  }
};

if (!sub || sub === 'help' || argl.includes('--help') || argl.includes('-h')) { help(); return; }

if (sub === 'create') {
  const name = rest.join(' ').trim(); if (!name) return die('group create <name>');
  const di = argl.indexOf('--description');
  const g = { type: 'project_group', id: randomUUID(), title: name, description: di >= 0 ? argl[di + 1] : '', members: [] };
  save(g); return asJson ? console.log(JSON.stringify({ ok: true, group: g })) : console.log(`✔ group "${name}" ${g.id}`);
}
if (sub === 'add' || sub === 'remove') {
  const g = one(rest[0]); if (!g) return; const refs = rest.slice(1); if (!refs.length) return die(`group ${sub} <group> <member…>`);
  const results = [];
  for (const ref of refs) {
    const m = resolveMember(ref);
    if (!m) { results.push({ ref, ok: false, error: 'not a group, project UUID, or repo path with a project brain' }); continue; }
    if (sub === 'add') {
      if (m.type === 'group' && reaches(m.id, g.id)) { results.push({ ref, ok: false, error: `cycle: "${m.name}" already contains "${g.title}"` }); continue; }
      if ((g.members || []).some((x) => x.id === m.id)) { results.push({ ref, ok: true, note: 'already a member' }); continue; }
      g.members = [...(g.members || []), m]; results.push({ ref, ok: true, added: m });
    } else {
      const before = (g.members || []).length; g.members = (g.members || []).filter((x) => x.id !== m.id);
      results.push({ ref, ok: before !== g.members.length, removed: before !== g.members.length });
    }
  }
  save(g);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
  return asJson ? console.log(JSON.stringify({ ok: !process.exitCode, group: g.id, results })) : results.forEach((r) => console.log(`${r.ok ? '✔' : '✖'} ${r.ref}${r.error ? ' — ' + r.error : r.note ? ' — ' + r.note : ''}`));
}
if (sub === 'list') {
  const rows = groups.map((g) => ({ id: g.id, name: g.title, members: (g.members || []).length, projects: flatten(g).size }));
  return asJson ? console.log(JSON.stringify(rows)) : (rows.length ? rows.forEach((r) => console.log(`▸ ${r.name}  ${r.id}  (${r.members} direct, ${r.projects} projects)`)) : console.log('No groups yet — total-recall group create <name>'));
}
if (sub === 'show') { const g = one(rest[0]); if (!g) return; return asJson ? console.log(JSON.stringify(g)) : (console.log(`▸ ${g.title}  ${g.id}`), (g.members || []).forEach((m) => console.log('  ' + label(m)))); }
if (sub === 'tree') {
  if (rest[0]) { const g = one(rest[0]); if (!g) return; return asJson ? console.log(JSON.stringify(g)) : printTree(g); }
  const nested = new Set(groups.flatMap((g) => (g.members || []).filter((m) => m.type === 'group').map((m) => m.id)));
  const roots = groups.filter((g) => !nested.has(g.id));
  return asJson ? console.log(JSON.stringify(roots.map((g) => g.id))) : roots.forEach((g) => printTree(g));
}
if (sub === 'members') {
  const g = one(rest[0]); if (!g) return;
  const list = recursive ? [...flatten(g).values()] : (g.members || []);
  return asJson ? console.log(JSON.stringify(list)) : list.forEach((m) => console.log(label(m)));
}
if (sub === 'delete') {
  const g = one(rest[0]); if (!g) return;
  const parents = groups.filter((x) => (x.members || []).some((m) => m.type === 'group' && m.id === g.id));
  if (parents.length) return die(`"${g.title}" is inside ${parents.map((p) => p.title).join(', ')} — remove it there first`);
  fs.unlinkSync(path.join(DIR, `${g.id}.md`));
  return asJson ? console.log(JSON.stringify({ ok: true, deleted: g.id })) : console.log(`✔ deleted "${g.title}"`);
}
die(`unknown subcommand "${sub}" — total-recall group --help`);
}
