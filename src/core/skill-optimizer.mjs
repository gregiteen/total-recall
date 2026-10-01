import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const MARKER = '<!-- total-recall:skill-router:v1 -->';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const normative = /\b(must|required|never|always|only|do not|mandatory|invariant|permission|authorization)\b/i;

// Headings inside examples are content, not routing boundaries.
export function splitSkill(text) {
  const front = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (!front || !/^name:\s*\S/m.test(front[0]) || !/^description:/m.test(front[0])) {
    throw new Error('Skill requires name and description frontmatter');
  }
  const body = text.slice(front[0].length);
  const sections = [];
  let start = 0, offset = 0, fence = null, title = 'Overview';
  for (const line of body.match(/[^\n]*(?:\n|$)/g) || []) {
    const trimmed = line.trim();
    const opening = trimmed.match(/^(`{3,}|~{3,})/);
    if (opening) {
      if (!fence) fence = opening[1];
      else if (opening[1][0] === fence[0] && opening[1].length >= fence.length && /^(`+|~+)\s*$/.test(trimmed)) fence = null;
    } else if (!fence && /^#{2,3}\s+/.test(line)) {
      if (offset > start) sections.push({ title, text: body.slice(start, offset) });
      start = offset;
      title = line.replace(/^#{2,3}\s+/, '').trim();
    }
    offset += line.length;
  }
  if (fence) throw new Error('Unclosed code fence; manual review required');
  if (start < body.length) sections.push({ title, text: body.slice(start) });
  return { frontmatter: front[0], body, sections };
}

function criticalParagraphs(body) {
  // Preserve fenced examples containing requirements too; never summarize them.
  return body.split(/\n\s*\n/).filter(p => normative.test(p)).join('\n\n');
}

function referenceText(text) {
  let fence = null;
  return text.split('\n').map(line => {
    const opening = line.trim().match(/^(`{3,}|~{3,})/);
    if (opening) {
      if (!fence) fence = opening[1];
      else if (opening[1][0] === fence[0] && opening[1].length >= fence.length && /^(`+|~+)\s*$/.test(line.trim())) fence = null;
      return line;
    }
    if (fence) return line;
    const rebase = target => /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(target) ? target : '../../' + target;
    return line.replace(/\]\(([^\s)]+)([^)]*)\)/g, (_, target, rest) => `](${rebase(target)}${rest})`)
      .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (_, prefix, target) => prefix + rebase(target));
  }).join('\n');
}

/** Default automation is lossless and conservative. Authored summaries are explicit inputs. */
export function planSkillOptimization(source, { maxTokens = 900, summary, metadata } = {}) {
  if (!Number.isInteger(maxTokens) || maxTokens < 100 || maxTokens > 10000) throw new Error('Budget must be an integer from 100 to 10000');
  const before = Math.ceil(source.length / 4);
  const parsed = splitSkill(source);
  if (source.includes(MARKER)) return { status: before > maxTokens ? 'review' : 'current', reason: before > maxTokens ? 'optimized-entrypoint-grew' : 'already-optimized', before, after: before, files: [] };
  if (before <= maxTokens && summary === undefined) return { status: 'current', reason: 'within-budget', before, after: before, files: [] };
  if (parsed.sections.length < 2 && summary === undefined) return { status: 'review', reason: 'no-task-boundaries', before, after: before, files: [] };
  // Managed content is preserved exactly in the entrypoint, never edited or hidden.
  const blocks = source.match(/<!-- BEGIN INJECTED[^\n]*-->[\s\S]*?<!-- END INJECTED[^\n]*-->/g) || [];
  if ((source.match(/<!-- BEGIN INJECTED/g) || []).length !== blocks.length) throw new Error('Malformed managed block');
  const cleanBody = blocks.reduce((body, block) => body.replace(block, ''), parsed.body);
  const overview = splitSkill(parsed.frontmatter + cleanBody).sections[0]?.text || '';
  const guidance = summary === undefined ? `${overview.trim()}\n\n${criticalParagraphs(cleanBody).replace(overview.trim(), '').trim()}` : summary.trim();
  if (!guidance) throw new Error('Routing summary cannot be empty');
  const files = parsed.sections.map((section, i) => ({
    path: `references/optimized/section-${String(i + 1).padStart(2, '0')}.md`,
    text: referenceText(section.text), title: section.title,
  }));
  const index = files.map(f => `- [${f.title.replace(/[\[\]]/g, '')}](${path.basename(f.path)})`).join('\n');
  files.push({ path: 'references/optimized/index.md', text: `# Task references\n\nRead only sections needed for the operation, including their prerequisites and constraints. Commands and plain paths assume the skill root. This index selects documentation, not permission or rule applicability.\n\n${index}\n` });
  files.push({ path: 'references/optimized/original.md', text: source });
  const frontmatter = metadata ? `---\n${YAML.stringify({ ...skillMetadata(source), ...metadata })}---` : parsed.frontmatter.trimEnd();
  const entrypoint = `${frontmatter}\n\n${MARKER}\n\n${guidance}\n\nBefore an operation, read its [task references](references/optimized/index.md), including prerequisites and constraints. If the applicable procedure is unclear, read the preserved original instead of guessing. Commands assume the skill root.\n${blocks.length ? '\n' + blocks.join('\n\n') + '\n' : ''}`;
  const after = Math.ceil(entrypoint.length / 4);
  try { splitSkill(entrypoint); } catch { return { status: 'review', reason: 'summary-needs-structural-review', before, after, files: [] }; }
  if (after > maxTokens || after >= before) return { status: 'review', reason: 'requirements-exceed-budget', before, after, files: [] };
  files.push({ path: 'references/optimized/manifest.json', text: JSON.stringify({ version: 1, source_sha256: hash(source), entrypoint_sha256: hash(entrypoint), sections: files.map(f => ({ path: f.path, sha256: hash(f.text) })) }, null, 2) + '\n' });
  return { status: 'candidate', before, after, saved: before - after, sourceHash: hash(source), entrypoint, files };
}

export function optimizeSkill(skillDir, options = {}) {
  const dir = path.resolve(skillDir);
  // Explicit paths can be aliases, but we always operate on their physical owner.
  const physical = fs.realpathSync(dir);
  if (physical.split(path.sep).some(s => /^(memory-vault|memory-derived|node_modules|\.git)$/.test(s))) throw new Error('Not an editable skill package');
  const file = path.join(physical, 'SKILL.md');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Entrypoint cannot be a symlink');
  const source = fs.readFileSync(file, 'utf8');
  const selected = options.profile?.[skillMetadata(source).name];
  const scoped = options.profileRole === 'repository' && !['project-management', 'start', 'cli-agents', 'meta-harness', 'plugins'].includes(skillMetadata(source).name);
  const effective = selected ? { ...options, summary: selected[1], metadata: { description: selected[0], repo_scoped: scoped, ...(scoped ? { repository_id: options.expectedRepository } : {}) } } : options;
  // A profile can propose new metadata for an unoptimized source, but must not
  // conceal incorrect ownership metadata already present in a routed entrypoint.
  if (source.includes(MARKER)) {
    const actual = auditSkillOwnership(physical, options);
    if (!actual.valid) return { path: dir, status: 'review', reason: actual.reason, ownership: actual, before: Math.ceil(source.length / 4), after: Math.ceil(source.length / 4), saved: 0 };
  }
  const ownership = auditSkillOwnership(physical, { ...effective, proposedMetadata: effective.metadata });
  if (!ownership.valid) return { path: dir, status: 'review', reason: ownership.reason, ownership, before: Math.ceil(source.length / 4), after: Math.ceil(source.length / 4), saved: 0 };
  if (source.includes(MARKER)) {
    const manifestFile = path.join(physical, 'references/optimized/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.sections)) throw new Error('Invalid optimizer manifest');
    for (const support of manifest.sections) {
      if (!/^references\/optimized\/(?:section-\d+\.md|index\.md|original\.md)$/.test(support.path)) throw new Error('Unsafe manifest path');
      const target = path.join(physical, support.path);
      if (fs.realpathSync(target) !== target) throw new Error('Reference escaped package');
      if (hash(fs.readFileSync(target, 'utf8')) !== support.sha256) throw new Error(`Reference drift: ${support.path}`);
    }
    if (hash(source) !== manifest.entrypoint_sha256) return { path: dir, status: 'review', reason: 'entrypoint-changed-since-optimization', before: Math.ceil(source.length / 4), after: Math.ceil(source.length / 4), saved: 0 };
  }
  const plan = planSkillOptimization(source, effective);
  const result = { path: dir, status: plan.status, reason: plan.reason, ownership, before: plan.before, after: plan.after, saved: plan.saved || 0 };
  if (plan.status !== 'candidate' || !options.apply) return result;
  const lock = path.join(physical, '.skill-optimizer.lock');
  const fd = fs.openSync(lock, 'wx');
  const created = [];
  const temp = file + `.optimizer-${crypto.randomUUID()}`;
  try {
    // Never overwrite an existing reference package, even an apparently stale one.
    const references = path.join(physical, 'references');
    if (fs.existsSync(references) && fs.lstatSync(references).isSymbolicLink()) throw new Error('Reference directory cannot be a symlink');
    const output = path.join(references, 'optimized');
    if (fs.existsSync(output)) throw new Error('Optimizer reference directory already exists; review before replacing');
    if (hash(fs.readFileSync(file, 'utf8')) !== plan.sourceHash) throw new Error('Source changed during optimization');
    fs.mkdirSync(references, { recursive: true });
    fs.mkdirSync(output); created.push(output);
    for (const support of plan.files) fs.writeFileSync(path.join(physical, support.path), support.text, { flag: 'wx' });
    fs.writeFileSync(temp, plan.entrypoint, { flag: 'wx', mode: fs.statSync(file).mode });
    if (hash(fs.readFileSync(file, 'utf8')) !== plan.sourceHash) throw new Error('Source changed during optimization');
    fs.renameSync(temp, file);
    return { ...result, status: 'applied' };
  } catch (error) {
    for (const own of created) fs.rmSync(own, { recursive: true });
    throw error;
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(fd); fs.unlinkSync(lock);
  }
}

function skillMetadata(source) {
  const { frontmatter } = splitSkill(source);
  return YAML.parse(frontmatter.replace(/^---\r?\n/, '').replace(/\r?\n---\r?\n?$/, ''));
}

export function auditSkillOwnership(skillDir, { repoRoot, globalRoot, proposedMetadata } = {}) {
  const owner = fs.realpathSync(skillDir);
  const source = fs.readFileSync(path.join(owner, 'SKILL.md'), 'utf8');
  const meta = { ...skillMetadata(source), ...proposedMetadata };
  if (!meta || typeof meta.name !== 'string' || typeof meta.description !== 'string') throw new Error('Invalid skill metadata');
  const under = root => { const r = fs.realpathSync(root); return owner === r || owner.startsWith(r + path.sep); };
  const global = globalRoot && under(globalRoot);
  const repo = repoRoot && under(repoRoot);
  if ((repoRoot || globalRoot) && !global && !repo) return { valid: false, reason: 'owner-outside-authorized-roots', owner };
  const brain = meta.name === 'total-recall' && !meta.repository_id;
  if (global && !brain && (meta.repo_scoped === true || meta.repository_id)) return { valid: false, reason: 'repo-specific-skill-in-global-root', owner };
  if (repo && !global && meta.repository_id) {
    const manifestFile = path.join(repoRoot, 'package.json');
    const name = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')).name : path.basename(path.resolve(repoRoot));
    if (meta.repository_id !== name) return { valid: false, reason: 'repository-identity-mismatch', owner, expected: name, actual: meta.repository_id };
  }
  if ((global || repo) && typeof meta.repo_scoped !== 'boolean') return { valid: false, reason: 'undeclared-skill-scope', owner };
  return { valid: true, role: brain ? 'brain-entrypoint' : global ? 'global-method' : meta.repo_scoped ? 'repository' : 'shared-method', owner, repository_id: meta.repository_id };
}

export function skillDirectories(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => path.join(root, e.name)).filter(dir => fs.existsSync(path.join(dir, 'SKILL.md')));
}

export function optimizeSkills(dirs, options = {}) {
  const seen = new Set();
  return dirs.flatMap(dir => {
    try {
      const owner = fs.realpathSync(dir);
      if (seen.has(owner)) return [];
      seen.add(owner);
      return [optimizeSkill(dir, options)];
    } catch (error) { return [{ path: dir, status: 'error', reason: error.message }]; }
  });
}
