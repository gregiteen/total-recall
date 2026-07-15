/**
 * Skills API — project skills by repo (excludes Total Recall / tr-* system skills).
 *
 * GET  /api/skills                 list skills grouped by registered project
 * GET  /api/skills/:name?repo=…    read SKILL.md
 * PUT  /api/skills/:name?repo=…    write SKILL.md
 * DELETE /api/skills/:name?repo=…  remove skill dir
 * GET  /api/skills/:name/files?repo=…&dir=…
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireAuth, requireScope } from '../auth.mjs';
import { logger } from '../../core/logger.mjs';
import { AGENT_DIR, SKILLS_DIR } from './_shared.mjs';
import { deploySkill } from '../../core/skills-registry.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Project-level skill roots mapped to IDEs that load them.
 * Sources: Claude Code docs (.claude/skills), Cursor docs (.cursor/skills + .agents/skills + compat),
 * Gemini CLI (.gemini/skills + .agents/skills), Codex (~/.codex/skills primarily; project .codex/skills),
 * Total Recall / agent (.agent/skills).
 */
const SKILL_ROOTS = [
  {
    rel: '.claude/skills',
    ide: 'claude-code',
    ide_label: 'Claude Code',
    docs: 'https://code.claude.com/docs/en/skills',
  },
  {
    rel: '.cursor/skills',
    ide: 'cursor',
    ide_label: 'Cursor',
    docs: 'https://cursor.com/docs/skills',
  },
  {
    rel: '.agents/skills',
    ide: 'agents-standard',
    ide_label: 'Agents standard (Cursor / Gemini)',
    docs: 'https://cursor.com/docs/skills',
  },
  {
    rel: '.gemini/skills',
    ide: 'gemini',
    ide_label: 'Gemini CLI',
    docs: 'https://geminicli.com/docs/cli/skills/',
  },
  {
    rel: '.codex/skills',
    ide: 'codex',
    ide_label: 'Codex',
    docs: 'https://developers.openai.com/codex/skills',
  },
  {
    rel: '.agent/skills',
    ide: 'total-recall',
    ide_label: 'Total Recall / Antigravity',
    docs: null,
  },
  {
    rel: '.grok/skills',
    ide: 'grok',
    ide_label: 'Grok Build',
    docs: 'https://x.ai/grok',
  },
  {
    rel: '.windsurf/skills',
    ide: 'windsurf',
    ide_label: 'Windsurf 2.0',
    docs: 'https://docs.windsurf.com',
  },
  {
    rel: '.github/skills',
    ide: 'copilot-workspace',
    ide_label: 'GitHub Copilot Workspace',
    docs: 'https://github.com/features/copilot',
  }
];

// Back-compat alias for older callers
const SKILL_DIR_CANDIDATES = SKILL_ROOTS.map((r) => r.rel);

/**
 * Exclude Total Recall core / product skills from the UI list.
 * User-facing Skills page should only show project/app skills.
 */
const TR_SKILL_EXCLUDE = new Set([
  'total-recall',
  'skill',
  'okf',
  'research',
  'cli-agents', // TR CLI agent registry package, not an app skill
]);

function isTrSkillName(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.toLowerCase();
  if (TR_SKILL_EXCLUDE.has(n)) return true;
  if (n.startsWith('total-recall')) return true;
  return false;
}

function rootMeta(rel) {
  return SKILL_ROOTS.find((r) => r.rel === rel) || {
    rel,
    ide: 'unknown',
    ide_label: rel,
    docs: null,
  };
}

function loadProjectRegistry() {
  const registryPath = path.join(
    os.homedir(),
    '.agent',
    'skills',
    'total-recall',
    'config',
    'project-registry.json',
  );
  if (!fs.existsSync(registryPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function listSubSkills(skillDir) {
  const subSkills = [];
  try {
    for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // nested skills/ folder OR common skill subdirs
      if (entry.name === 'skills') {
        const nested = path.join(skillDir, 'skills');
        try {
          for (const sd of fs.readdirSync(nested, { withFileTypes: true })) {
            if (sd.isDirectory()) subSkills.push(sd.name);
          }
        } catch {
          /* ignore */
        }
      } else {
        subSkills.push(entry.name);
      }
    }
  } catch {
    /* ignore */
  }
  return subSkills;
}

function scanSkillRoot(skillsRoot, repo, projectPath, rootInfo) {
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) return [];
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sourceRel = rootInfo.rel;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (isTrSkillName(ent.name)) continue;
    const skillDir = path.join(skillsRoot, ent.name);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const skillMdAlt = path.join(skillDir, 'skill.md');
    const hasSkillMd = fs.existsSync(skillMd) || fs.existsSync(skillMdAlt);
    let stats;
    try {
      stats = fs.statSync(skillDir);
    } catch {
      continue;
    }
    out.push({
      // Unique per repo + IDE path + name (same name can exist under multiple IDEs)
      id: `${repo}::${rootInfo.ide}::${ent.name}`,
      name: ent.name,
      repo,
      project_path: projectPath,
      source: sourceRel,
      ide: rootInfo.ide,
      ide_label: rootInfo.ide_label,
      skill_dir: skillDir,
      has_skill_md: hasSkillMd,
      size: stats.size,
      modified: stats.mtime,
      isDirectory: true,
      subSkills: listSubSkills(skillDir),
    });
  }
  return out;
}

/**
 * Collect skills for all registered projects, grouped by repo → IDE.
 * Excludes total-recall system skills.
 */
export function collectSkillsByRepo() {
  const registry = loadProjectRegistry();
  // Inject the global homedir so global skills are also scanned and managed
  registry.unshift({
    name: 'Global',
    path: os.homedir()
  });

  const byRepo = new Map();

  for (const entry of registry) {
    const projectPath = entry.path || entry.project_root;
    const repo = entry.name || (projectPath ? path.basename(projectPath) : null);
    if (!repo || !projectPath || !fs.existsSync(projectPath)) {
      if (repo) {
        byRepo.set(repo, {
          repo,
          path: projectPath || null,
          skills: [],
          ides: [],
          ok: false,
          error: 'path missing',
        });
      }
      continue;
    }

    const skills = [];
    const byIde = new Map();

    for (const rootInfo of SKILL_ROOTS) {
      const root = path.join(projectPath, rootInfo.rel);
      const found = scanSkillRoot(root, repo, projectPath, rootInfo);
      if (!found.length) continue;
      found.sort((a, b) => a.name.localeCompare(b.name));
      skills.push(...found);
      byIde.set(rootInfo.ide, {
        ide: rootInfo.ide,
        ide_label: rootInfo.ide_label,
        source: rootInfo.rel,
        docs: rootInfo.docs,
        skills: found,
        count: found.length,
      });
    }

    // Stable IDE order matching SKILL_ROOTS
    const ides = SKILL_ROOTS.map((r) => byIde.get(r.ide)).filter(Boolean);

    skills.sort((a, b) => {
      const ideCmp = (a.ide_label || '').localeCompare(b.ide_label || '');
      if (ideCmp !== 0) return ideCmp;
      return a.name.localeCompare(b.name);
    });

    byRepo.set(repo, {
      repo,
      path: projectPath,
      skills,
      ides,
      ok: true,
      count: skills.length,
    });
  }

  const repos = [...byRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo));
  const flat = repos.flatMap((r) => r.skills);
  return {
    repos,
    skills: flat,
    total: flat.length,
    ide_roots: SKILL_ROOTS.map(({ rel, ide, ide_label, docs }) => ({
      rel,
      ide,
      ide_label,
      docs,
    })),
    excluded_note: 'total-recall skills are hidden from this catalog',
  };
}

function resolveRegisteredProject(repoName) {
  if (!repoName) return null;
  const registry = loadProjectRegistry();
  const entry = registry.find(
    (p) => p.name === repoName || path.basename(p.path || p.project_root || '') === repoName,
  );
  if (!entry) return null;
  const projectPath = entry.path || entry.project_root;
  if (!projectPath || !fs.existsSync(projectPath)) return null;
  return { name: entry.name || repoName, path: path.resolve(projectPath) };
}

/**
 * Resolve skill directory under a registered project only.
 * @param {string} repoName
 * @param {string} skillName
 * @param {{ source?: string, ide?: string }} [opts]
 */
function resolveSkillDir(repoName, skillName, opts = {}) {
  if (!skillName || skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
    throw new Error('Invalid skill name');
  }
  if (isTrSkillName(skillName)) {
    throw new Error('Total Recall system skills are not managed on this page');
  }
  const project = resolveRegisteredProject(repoName);
  if (!project) {
    // Fallback: global SKILLS_DIR for backward compat (non-TR only)
    if (!repoName || repoName === 'global' || repoName === '_') {
      const globalDir = path.join(SKILLS_DIR, skillName);
      if (fs.existsSync(globalDir) && !isTrSkillName(skillName)) {
        return { skillDir: globalDir, repo: 'global', projectPath: AGENT_DIR };
      }
    }
    throw new Error(`Unknown repo: ${repoName || '(none)'}`);
  }

  const preferredSource =
    opts.source ||
    (opts.ide ? SKILL_ROOTS.find((r) => r.ide === opts.ide)?.rel : null);
  const roots = preferredSource
    ? [
        ...SKILL_ROOTS.filter((r) => r.rel === preferredSource),
        ...SKILL_ROOTS.filter((r) => r.rel !== preferredSource),
      ]
    : SKILL_ROOTS;

  for (const rootInfo of roots) {
    const skillDir = path.join(project.path, rootInfo.rel, skillName);
    if (fs.existsSync(skillDir) && fs.statSync(skillDir).isDirectory()) {
      const resolved = path.resolve(skillDir);
      if (!resolved.startsWith(project.path + path.sep) && resolved !== project.path) {
        throw new Error('Skill path escapes project root');
      }
      return {
        skillDir: resolved,
        repo: project.name,
        projectPath: project.path,
        source: rootInfo.rel,
        ide: rootInfo.ide,
      };
    }
  }
  throw new Error(`Skill "${skillName}" not found in repo ${project.name}`);
}

function resolveTrSkillScript(scriptName) {
  const candidates = [
    path.join(AGENT_DIR, 'skills', 'total-recall', 'modules', 'skill-deploy', 'scripts', scriptName),
    path.join(ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'modules', 'skill-deploy', 'scripts', scriptName),
    path.join(AGENT_DIR, 'skills', 'skill', 'scripts', scriptName),
    path.join(ROOT, 'scaffold', '.agent', 'skills', 'skill', 'scripts', scriptName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Could not find bundled skill helper "${scriptName}".`);
  }
  return found;
}

async function importTrSkillScript(scriptName) {
  return import(pathToFileURL(resolveTrSkillScript(scriptName)).href);
}

function serverError(res, err) {
  logger.error('skills', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

export const skillsRouter = express.Router();

skillsRouter.get('/api/skills', requireAuth, requireScope('files:read', 'ssss:read'), (_req, res) => {
  try {
    const catalog = collectSkillsByRepo();
    res.json(catalog);
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.get('/api/skills/search', requireAuth, requireScope('files:read', 'ssss:read'), async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.status(400).json({ error: 'Missing search query parameter `q`.' });
    }
    const { searchAndSort } = await importTrSkillScript('find-skills.mjs');
    const results = searchAndSort(q);
    res.json(results);
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.post('/api/skills/install', requireAuth, requireScope('files:write', 'ssss:write'), async (req, res) => {
  try {
    const { pkg } = req.body;
    if (!pkg) {
      return res.status(400).json({ error: 'Missing required `pkg` body parameter.' });
    }
    const { installSkill } = await importTrSkillScript('install-skill.mjs');
    const result = installSkill(pkg, { agentDir: AGENT_DIR });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.get('/api/skills/:name/files', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    const { name } = req.params;
    const repo = req.query.repo || req.query.project || '';
    const source = req.query.source || '';
    const ide = req.query.ide || '';
    let skillDir;
    try {
      ({ skillDir } = resolveSkillDir(String(repo), name, { source: source || undefined, ide: ide || undefined }));
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const dirParam = req.query.dir;
    let targetDir = skillDir;
    if (dirParam) {
      if (dirParam.includes('..') || dirParam.includes('/') || dirParam.includes('\\')) {
        return res.status(400).json({ error: 'Invalid dir parameter' });
      }
      targetDir = path.join(skillDir, dirParam);
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return res.json([]);
    }

    const files = fs
      .readdirSync(targetDir)
      .map((file) => {
        const stats = fs.statSync(path.join(targetDir, file));
        return {
          name: file,
          size: stats.isDirectory()
            ? 'DIR'
            : stats.size < 1024
              ? `${stats.size} B`
              : `${(stats.size / 1024).toFixed(1)} KB`,
          isDirectory: stats.isDirectory(),
        };
      })
      .filter((f) => !f.isDirectory);

    res.json(files);
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.get('/api/skills/:name', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    const { name } = req.params;
    const repo = req.query.repo || req.query.project || '';
    const source = req.query.source || '';
    const ide = req.query.ide || '';
    let skillDir;
    let resolved;
    try {
      resolved = resolveSkillDir(String(repo), name, {
        source: source || undefined,
        ide: ide || undefined,
      });
      skillDir = resolved.skillDir;
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    const skillPath = fs.existsSync(path.join(skillDir, 'SKILL.md'))
      ? path.join(skillDir, 'SKILL.md')
      : path.join(skillDir, 'skill.md');
    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: `SKILL.md not found for "${name}"` });
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    res.json({
      name,
      repo: String(repo),
      source: resolved.source,
      ide: resolved.ide,
      content,
      skill_dir: skillDir,
    });
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.put('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    const { content, repo: bodyRepo, source: bodySource, ide: bodyIde } = req.body || {};
    const repo = bodyRepo || req.query.repo || req.query.project || '';
    const source = bodySource || req.query.source || '';
    const ide = bodyIde || req.query.ide || '';
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid `content` field.' });
    }
    let skillDir;
    try {
      ({ skillDir } = resolveSkillDir(String(repo), name, {
        source: source || undefined,
        ide: ide || undefined,
      }));
    } catch (e) {
      // create under preferred IDE path (default Claude Code or .agent)
      const project = resolveRegisteredProject(String(repo));
      if (!project) return res.status(404).json({ error: e.message });
      if (isTrSkillName(name)) {
        return res.status(400).json({ error: 'Cannot create Total Recall system skills here' });
      }
      const createRel =
        source ||
        (ide ? SKILL_ROOTS.find((r) => r.ide === ide)?.rel : null) ||
        '.claude/skills';
      skillDir = path.join(project.path, createRel, name);
      fs.mkdirSync(skillDir, { recursive: true });
    }
    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, content, 'utf8');
    res.json({ success: true, message: `Skill "${name}" updated successfully`, repo: String(repo) });
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.delete('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    const repo = req.query.repo || req.query.project || '';
    const source = req.query.source || '';
    const ide = req.query.ide || '';
    let skillDir;
    try {
      ({ skillDir } = resolveSkillDir(String(repo), name, {
        source: source || undefined,
        ide: ide || undefined,
      }));
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }
    
    const baseAgentDir = path.dirname(path.dirname(skillDir));
    const trashDir = path.join(baseAgentDir, '.trash', 'skills');
    fs.mkdirSync(trashDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const trashPath = path.join(trashDir, `${name}_${timestamp}`);
    fs.renameSync(skillDir, trashPath);
    
    res.json({ success: true, message: `Skill "${name}" deleted (moved to trash) successfully` });
  } catch (err) {
    serverError(res, err);
  }
});

import { callLocalRuntime, loadRuntimeConfig } from '../../core/runtime.mjs';

skillsRouter.post('/api/skills/toggle', requireAuth, requireScope('ssss:write'), async (req, res) => {
  try {
    const { skillName, targetRepo, enabled } = req.body;
    if (!skillName || !targetRepo || targetRepo === 'Global') {
      return res.status(400).json({ error: 'Missing parameters or invalid target repo' });
    }

    const globalSkillPath = path.join(os.homedir(), '.agent', 'skills', skillName);
    const targetSkillPath = path.join(targetRepo, '.agent', 'skills', skillName);

    if (enabled) {
      if (!fs.existsSync(globalSkillPath)) {
        return res.status(400).json({ error: 'Global skill not found' });
      }
      
      const brainDir = path.join(AGENT_DIR, 'skills', 'total-recall');
      try {
        deploySkill(brainDir, skillName, {
          repo: targetRepo,
          agentSkillsDir: path.join(targetRepo, '.agent', 'skills'),
          adapt: true,
          force: true
        });
      } catch (err) {
        return res.status(500).json({ error: `Deploy failed: ${err.message}` });
      }
    } else {
      if (fs.existsSync(targetSkillPath)) {
        const baseAgentDir = path.dirname(path.dirname(targetSkillPath));
        const trashDir = path.join(baseAgentDir, '.trash', 'skills');
        fs.mkdirSync(trashDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const trashPath = path.join(trashDir, `${skillName}_${timestamp}`);
        fs.renameSync(targetSkillPath, trashPath);
      }
    }

    res.json({ success: true, message: `Skill ${skillName} ${enabled ? 'enabled' : 'disabled'} for ${targetRepo}` });
  } catch (err) {
    serverError(res, err);
  }
});

import matter from 'gray-matter';

skillsRouter.post('/api/skills/preview', requireAuth, requireScope('ssss:read'), async (req, res) => {
  try {
    const { skillName, targetRepo } = req.body;
    if (!skillName || !targetRepo || targetRepo === 'Global') {
      return res.status(400).json({ error: 'Missing parameters or invalid target repo' });
    }

    const globalSkillPath = path.join(os.homedir(), '.agent', 'skills', skillName);
    if (!fs.existsSync(globalSkillPath)) {
      return res.status(400).json({ error: 'Global skill not found' });
    }

    const skillMd = fs.existsSync(path.join(globalSkillPath, 'SKILL.md')) 
      ? path.join(globalSkillPath, 'SKILL.md') 
      : path.join(globalSkillPath, 'skill.md');
      
    if (!fs.existsSync(skillMd)) {
      return res.status(400).json({ error: 'SKILL.md not found in global template' });
    }

    const raw = fs.readFileSync(skillMd, 'utf8');
    const { data, content } = matter(raw);

    const repoRoot = path.resolve(targetRepo);
    const signals = [];
    
    // Simulate adapt logic
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) signals.push(`repo package: ${pkg.name}`);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const keys = Object.keys(deps || {}).slice(0, 12);
        if (keys.length) signals.push(`stack: ${keys.join(', ')}`);
      } catch {}
    }

    const openwikiDir = path.join(repoRoot, 'openwiki');
    if (fs.existsSync(openwikiDir)) {
      try {
        const pages = fs.readdirSync(openwikiDir).filter((f) => f.endsWith('.md')).slice(0, 5);
        if (pages.length) signals.push(`openwiki: ${pages.map((p) => p.replace(/\.md$/, '')).join(', ')}`);
      } catch {}
    }

    let adaptedContent = raw;
    if (signals.length) {
      const note = ` [Deployed for: ${signals.join(' | ')}]`;
      const desc = String(data.description || '');
      if (!desc.includes('[Deployed for:')) {
        data.description = (desc + note).slice(0, 500);
        adaptedContent = matter.stringify(content, data);
      }
    }

    res.json({ success: true, original: raw, preview: adaptedContent, signals });
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.post('/api/skills/audit', requireAuth, requireScope('ssss:read'), async (req, res) => {
  try {
    const { skillName, repoPath } = req.body;
    if (!skillName) return res.status(400).json({ error: 'skillName required' });

    let skillDir;
    try {
      ({ skillDir } = resolveSkillDir(repoPath || 'Global', skillName, {}));
    } catch (e) {
      return res.status(404).json({ error: e.message });
    }

    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return res.status(404).json({ error: 'SKILL.md not found' });

    const content = fs.readFileSync(skillPath, 'utf8');
    const prompt = `Analyze this AI Agent SKILL.md document.
Identify if it is outdated, incorrect, or problematic.
Propose specific updates to improve it.
If it looks perfect, say so.
Return a JSON object: { "outdated": boolean, "problematic": boolean, "reason": string, "proposed_changes": string }

SKILL DOCUMENT:
${content}`;

    const config = loadRuntimeConfig();
    const result = await callLocalRuntime(prompt, "You are an expert AI agent capabilities auditor. Always return valid JSON matching the requested schema.", config);

    // Extract JSON block
    const match = result.match(/\{[\s\S]*\}/);
    let auditData;
    try {
        auditData = JSON.parse(match ? match[0] : result);
    } catch (e) {
        auditData = { outdated: false, problematic: true, reason: 'Failed to parse AI response', proposed_changes: 'Check server logs. AI output was not valid JSON.' };
    }

    res.json({ success: true, audit: auditData });
  } catch (err) {
    serverError(res, err);
  }
});

skillsRouter.post('/api/skills/generate-expert', requireAuth, requireScope('files:write', 'ssss:write'), async (req, res) => {
  try {
    const { repoPath, force } = req.body;
    if (!repoPath) {
      return res.status(400).json({ error: 'Missing required `repoPath` body parameter.' });
    }

    // Verify the repo exists and is in the project registry
    const project = resolveRegisteredProject(path.basename(repoPath)) || { path: repoPath };
    const targetRoot = path.resolve(project.path || repoPath);

    if (!fs.existsSync(targetRoot)) {
      return res.status(404).json({ error: `Repository path not found: ${targetRoot}` });
    }

    const { generateRepoExpert, scanRepo } = await import('../../cli/repo-expert-generate.mjs');
    const result = generateRepoExpert(targetRoot, { force: !!force });

    res.json({
      success: true,
      message: `repo-expert generated for ${result.stats.name}`,
      ...result,
    });
  } catch (err) {
    serverError(res, err);
  }
});
