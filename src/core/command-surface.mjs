import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Composable commands as an instruction-surface projection.
 *
 * Every compile rewrites the "Composable Commands" section from the command
 * files themselves, so the surface always lists exactly the verbs that exist —
 * one line each, never duplicated, gone when the file is removed. Files are
 * parsed statically: compiling must never execute command code.
 */

const NAME = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_DESCRIPTION = 180;

function firstSentence(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentence = clean.match(/^(.{12,}?[.!?])(\s|$)/)?.[1];
  if (sentence && sentence.length <= MAX_DESCRIPTION) return sentence;
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION);
  const stop = cut.lastIndexOf('. ');
  return stop > 60 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/** Read description and risk from a command file without importing it. */
export function describeCommandFile(source, name) {
  const tag = (key) => source.match(new RegExp(`^\\s*//\\s*@${key}\\s+(.+)$`, 'm'))?.[1].trim() || null;
  let description = tag('description');
  const risk = tag('risk');

  // Plugin-generated wrappers carry `const description = "<json string>";`
  if (!description) {
    const literal = source.match(/^const description = ("(?:[^"\\]|\\.)*");$/m)?.[1];
    if (literal) { try { description = JSON.parse(literal) || null; } catch { /* ignore */ } }
  }

  // Hand-written files: `// Custom CLI command: <name> — <description>` header,
  // possibly continued on the following comment lines.
  if (!description) {
    const lines = source.split('\n');
    const i = lines.findIndex((l) => new RegExp(`^//.*CLI command: ${name}\\s+[—–-]\\s+`).test(l));
    if (i !== -1) {
      const parts = [lines[i].replace(/^.*?CLI command: \S+\s+[—–-]\s+/, '')];
      for (let j = i + 1; j < lines.length && lines[j].startsWith('//'); j++) parts.push(lines[j].replace(/^\/\/\s?/, ''));
      description = parts.join(' ');
    }
  }

  // Inline commands: the leading comment block of the run() body. A first line
  // that is a usage string (`total-recall <name> …`) is skipped.
  if (!description) {
    const body = source.split(/export async function run\([^)]*\)\s*\{/)[1] || '';
    const comments = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('const args = Array.isArray(argv)')) continue;
      if (!t.startsWith('//')) break;
      comments.push(t.replace(/^\/\/\s?/, ''));
    }
    const prose = comments.filter((c) => !c.startsWith(`total-recall ${name}`) && !c.startsWith('@'));
    if (prose.length) description = prose.join(' ');
  }

  return { description: description ? firstSentence(description) : null, risk };
}

/**
 * List commands from the given scope directories. Earlier dirs win on a name
 * clash (the dispatcher resolves project before global), and the shadowed
 * entry is reported so the surface can say so.
 */
export function listSurfaceCommands(dirs = []) {
  const seen = new Map();
  const out = [];
  const visited = new Set();
  for (const { scope, dir } of dirs) {
    if (!dir) continue;
    const real = path.resolve(dir);
    if (visited.has(real)) continue;
    visited.add(real);
    let files = [];
    try { files = fs.readdirSync(real).filter((f) => f.endsWith('.mjs')).sort(); } catch { continue; }
    for (const file of files) {
      const name = file.slice(0, -4);
      if (!NAME.test(name)) continue;
      const full = path.join(real, file);
      let source = '';
      try {
        if (!fs.statSync(full).isFile()) continue;
        source = fs.readFileSync(full, 'utf8');
      } catch { continue; }
      if (seen.has(name)) { seen.get(name).shadows.push(scope); continue; }
      const entry = { name, scope, ...describeCommandFile(source, name), shadows: [] };
      seen.set(name, entry);
      out.push(entry);
    }
  }
  return out;
}

export function buildCommandsSection(entries = []) {
  if (!entries.length) {
    return `\n\n## Composable Commands\n\nNo custom commands yet. When you run the same steps twice, make them a verb: \`npx total-recall command create <name> "<js>" --description "<when to use it>"\` (add \`--global\` for every project).`;
  }
  const lines = entries.map((c) => {
    const flags = [c.scope, c.risk ? `risk: ${c.risk}` : null, c.shadows.length ? `shadows ${c.shadows.join(', ')}` : null].filter(Boolean).join('; ');
    return `- \`npx total-recall ${c.name}\` (${flags})${c.description ? ` — ${c.description}` : ''}`;
  });
  return `\n\n## Composable Commands\n\nVerbs built on this CLI with \`command create\`. Use them instead of re-doing their steps by hand; run \`npx total-recall <name> --help\` first. Add a new one when you repeat a sequence (\`command create <name> "<js>" --description "…" [--global]\`); this list is rebuilt from the command files on every compile.\n\n${lines.join('\n')}`;
}

/** Hash of every file that feeds the surface besides the vault (commands, skills). */
export function surfaceInputsHash({ commandDirs = [], skillsDir } = {}) {
  const hash = crypto.createHash('sha256');
  const add = (file) => {
    try { const s = fs.statSync(file); hash.update(`${file}:${s.mtimeMs}:${s.size}\n`); } catch { /* missing */ }
  };
  for (const { dir } of commandDirs) {
    if (!dir) continue;
    try { fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().forEach((f) => add(path.join(dir, f))); } catch { /* none */ }
    hash.update(`dir:${dir}\n`);
  }
  if (skillsDir) {
    const references = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const file = path.join(dir, entry.name);
          if (entry.isFile()) add(file);
          else if (entry.isDirectory()) references(file);
        }
      } catch { /* no references */ }
    };
    try { fs.readdirSync(skillsDir).sort().forEach((e) => {
      add(path.join(skillsDir, e, 'SKILL.md'));
      references(path.join(skillsDir, e, 'references'));
    }); } catch { /* none */ }
  }
  return hash.digest('hex');
}
