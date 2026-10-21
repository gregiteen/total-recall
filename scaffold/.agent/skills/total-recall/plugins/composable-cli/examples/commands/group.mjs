/**
 * total-recall group <create|add|remove|list|tree|members|delete|show> …
 *
 * Manage groups of projects and groups of groups.
 * Groups are SSSS project_group documents in the global brain.
 *
 * v2 example demonstrating the composable CLI contract with meta export
 * and process.exitCode usage instead of process.exit().
 *
 * Run: total-recall group [--json] <subcommand> ...
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export const meta = {
  name: 'group',
  description: 'Manage groups of projects and groups of groups (create, add, remove, list, show, tree, members, delete)',
  risk: 'write',
  version: 2,
  background: false,
};

const DIR = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'groups');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function die(m, exitCode = 1) {
  process.exitCode = exitCode;
  return { ok: false, error: m, exitCode };
}

const load = () => {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => {
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const doc = {};
    for (const line of m[1].split('\n')) {
      const ci = line.indexOf(':');
      if (ci < 0) continue;
      const key = line.slice(0, ci).trim();
      let val = line.slice(ci + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      doc[key] = val;
    }
    if (doc.type !== 'project_group') return null;
    // Restore members array from YAML-like list
    const membersMatch = m[1].match(/members:\s*(\[[\s\S]*?\])\s*\n/);
    if (membersMatch) {
      try {
        doc.members = JSON.parse(membersMatch[1].replace(/'/g, '"'));
      } catch {
        doc.members = [];
      }
    } else {
      doc.members = [];
    }
    return doc;
  }).filter(Boolean);
};

function save(g, groups) {
  g.timestamp = new Date().toISOString();
  const body = `---\ntype: project_group\nid: ${g.id}\ntitle: ${g.title}\ndescription: "${(g.description || '').replace(/"/g, '\\"')}"\nmembers: ${JSON.stringify(g.members || [])}\ntimestamp: ${g.timestamp}\n---\n\n# ${g.title}\n\n${g.description || 'Project group.'}\n`;
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${g.id}.md`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body, { mode: 0o644 });
  fs.renameSync(tmp, file);
}

function flattenMembers(g, byId, seen = new Set()) {
  const out = new Map();
  if (seen.has(g.id)) return out;
  seen.add(g.id);
  for (const m of g.members || []) {
    if (m.type === 'project') out.set(m.id, m);
    else if (byId.has(m.id)) {
      for (const [k, v] of flattenMembers(byId.get(m.id), byId, seen)) out.set(k, v);
    }
  }
  return out;
}

function reaches(from, target, byId, seen = new Set()) {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (byId.get(from)?.members || []).some((m) => m.type === 'group' && reaches(m.id, target, byId, seen));
}

function findGroup(ref, groups) {
  return groups.find((g) => g.id === ref) || groups.filter((g) => g.title === ref).at(0) || null;
}

function findAll(ref, groups) {
  return groups.filter((g) => g.id === ref || g.title === ref);
}

function one(ref, groups) {
  const hits = findAll(ref, groups);
  if (hits.length > 1) return { error: `"${ref}" matches ${hits.length} groups — use the id`, group: null };
  if (!hits.length) return { error: `no group "${ref}"`, group: null };
  return { error: null, group: hits[0] };
}

async function printHelp(name) {
  console.log(`Usage: total-recall group <command> [--json]

  create <name> [--description "<text>"]   New group (random UUID id)
  add <group> <member…>                    Member = project UUID, or group name/UUID
  remove <group> <member…>                 Remove members
  list                                     All groups
  show <group>                             One group with direct members
  tree [<group>]                           Nested view (all roots if omitted)
  members <group> [--recursive]            Direct members, or every project reached through nested groups
  delete <group>                           Delete a group (refused while other groups contain it)

Groups are SSSS project_group documents in ${DIR}. Nesting is cycle-checked.`);
}

/**
 * v2 entry point — receives (args, context)
 */
export default async function main(args = [], context = {}) {
  const { json = false, tr, log } = context;

  const argl = Array.isArray(args) ? args : [];
  const asJson = json || argl.includes('--json');
  const recursive = argl.includes('--recursive') || argl.includes('-r');

  // Strip the verb itself from forwarded args
  const cleanArgs = argl.filter((a) => !['group', 'groups'].includes(a) && a !== '--json');
  const pos = cleanArgs.filter((a) => !a.startsWith('-'));
  const [sub, ...rest] = pos;

  if (!sub || sub === 'help' || cleanArgs.includes('--help') || cleanArgs.includes('-h')) {
    await printHelp(sub);
    return { ok: true, data: null };
  }

  fs.mkdirSync(DIR, { recursive: true });
  const groups = load();
  const byId = new Map(groups.map((g) => [g.id, g]));

  if (sub === 'create') {
    const name = rest.join(' ').trim();
    if (!name) return die('group create <name>');
    const di = cleanArgs.indexOf('--description');
    const g = { type: 'project_group', id: randomUUID(), title: name, description: di >= 0 ? cleanArgs[di + 1] : '', members: [] };
    save(g, groups);
    const result = { ok: true, group: g };
    if (asJson) return result;
    console.log(` group "${name}" ${g.id}`);
    return result;
  }

  if (sub === 'add' || sub === 'remove') {
    const { group: g, error: err } = one(rest[0], groups);
    if (err) return die(err);
    const refs = rest.slice(1);
    if (!refs.length) return die(`group ${sub} <group> <member…>`);
    const results = [];
    for (const ref of refs) {
      let member = null;
      if (UUID_RE.test(ref)) {
        member = { type: 'project', id: ref };
      } else {
        const g2 = findGroup(ref, groups);
        if (g2) member = { type: 'group', id: g2.id, name: g2.title };
      }
      if (!member) {
        results.push({ ref, ok: false, error: 'not a group or project UUID' });
        continue;
      }
      if (sub === 'add') {
        if (member.type === 'group' && reaches(member.id, g.id, byId)) {
          results.push({ ref, ok: false, error: 'cycle detected' });
          continue;
        }
        if ((g.members || []).some((x) => x.id === member.id)) {
          results.push({ ref, ok: true, note: 'already a member' });
          continue;
        }
        g.members = [...(g.members || []), member];
        results.push({ ref, ok: true, added: member });
      } else {
        const before = (g.members || []).length;
        g.members = (g.members || []).filter((x) => x.id !== member.id);
        results.push({ ref, ok: before !== g.members.length, removed: before !== g.members.length });
      }
    }
    save(g, groups);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    if (asJson) return { ok: !process.exitCode, group: g.id, results };
    results.forEach((r) => console.log(`${r.ok ? '' : ''} ${r.ref}${r.error ? ' — ' + r.error : r.note ? ' — ' + r.note : ''}`));
    return { ok: !process.exitCode, results };
  }

  if (sub === 'list') {
    const rows = groups.map((g) => ({ id: g.id, name: g.title, members: (g.members || []).length, projects: flattenMembers(g, byId).size }));
    if (asJson) return { ok: true, data: rows };
    if (rows.length) rows.forEach((r) => console.log(`▸ ${r.name}  ${r.id}  (${r.members} direct, ${r.projects} projects)`));
    else console.log('No groups yet — total-recall group create <name>');
    return { ok: true, data: rows };
  }

  if (sub === 'show') {
    const { group: g, error: err } = one(rest[0], groups);
    if (err) return die(err);
    if (asJson) return { ok: true, data: g };
    console.log(`▸ ${g.title}  ${g.id}`);
    (g.members || []).forEach((m) => console.log(`  ${m.type === 'group' ? '▸' : '•'} ${m.name || m.id}`));
    return { ok: true, data: g };
  }

  if (sub === 'tree') {
    if (rest[0]) {
      const { group: g, error: err } = one(rest[0], groups);
      if (err) return die(err);
      if (asJson) return { ok: true, data: g };
      console.log(`▸ ${g.title}  (${g.id})`);
      (g.members || []).forEach((m) => console.log(`  ${m.type === 'group' ? '▸' : '•'} ${m.name || m.id}`));
      return { ok: true, data: g };
    }
    const nested = new Set(groups.flatMap((g) => (g.members || []).filter((m) => m.type === 'group').map((m) => m.id)));
    const roots = groups.filter((g) => !nested.has(g.id));
    if (asJson) return { ok: true, data: roots.map((g) => g.id) };
    roots.forEach((g) => {
      console.log(`▸ ${g.title}  (${g.id})`);
      (g.members || []).forEach((m) => console.log(`  ${m.type === 'group' ? '▸' : '•'} ${m.name || m.id}`));
    });
    return { ok: true, data: roots.map((g) => g.id) };
  }

  if (sub === 'members') {
    const { group: g, error: err } = one(rest[0], groups);
    if (err) return die(err);
    const list = recursive ? [...flattenMembers(g, byId).values()] : (g.members || []);
    if (asJson) return { ok: true, data: list };
    list.forEach((m) => console.log(`${m.type === 'group' ? '▸' : '•'} ${m.name || m.id}`));
    return { ok: true, data: list };
  }

  if (sub === 'delete') {
    const { group: g, error: err } = one(rest[0], groups);
    if (err) return die(err);
    const parents = groups.filter((x) => (x.members || []).some((m) => m.type === 'group' && m.id === g.id));
    if (parents.length) return die(`"${g.title}" is inside ${parents.map((p) => p.title).join(', ')} — remove it there first`);
    fs.unlinkSync(path.join(DIR, `${g.id}.md`));
    if (asJson) return { ok: true, data: { deleted: g.id } };
    console.log(` deleted "${g.title}"`);
    return { ok: true, data: { deleted: g.id } };
  }

  return die(`unknown subcommand "${sub}" — total-recall group --help`);
}