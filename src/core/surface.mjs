import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadSkills, atomicWrite, walkMd } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import matter from './frontmatter.mjs';
import { logger } from './logger.mjs';
import {
  buildMemoryLayerIndex,
  inferMemoryLayer,
} from './memory-layers.mjs';
import { assemblePluginContexts } from './plugin-context.mjs';
import yaml from 'yaml';
import { brainDir as globalBrainDir, globalAgentDir } from './config.mjs';
import { listSurfaceCommands, buildCommandsSection, surfaceInputsHash, commandScopeDirectories } from './command-surface.mjs';
import { fileURLToPath } from 'url';
import { buildLocalSearchIndex } from './fast-recall.mjs';
import { selectRules, assembleContext, curatedRules } from './context-policy.mjs';
import { discoverPlugins } from './plugin-loader.mjs';
import { refreshPluginCatalog } from './plugin-catalog.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { CLI_QUICK_REFERENCE } from './cli-quick-reference.mjs';

// Long-lived processes (server, daemon, vault watcher) import this module once.
// If the rule builder is edited or upgraded after they start, their in-memory
// copy is stale and would overwrite fresh instruction surfaces with old logic.
const SURFACE_SOURCE = fileURLToPath(import.meta.url);
const sourceHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const LOADED_SURFACE_HASH = (() => { try { return sourceHash(SURFACE_SOURCE); } catch { return null; } })();

/** True when surface.mjs on disk differs from the copy this process loaded. */
export function isSurfaceCodeStale(file = SURFACE_SOURCE, loadedHash = LOADED_SURFACE_HASH) {
  if (!loadedHash) return false;
  try { return sourceHash(file) !== loadedHash; } catch { return false; }
}

/** Scope dirs searched for composable commands, in dispatcher order (project, then global). */
export function commandDirsFor(skillsDir) {
  const dirs = skillsDir ? commandScopeDirectories(path.dirname(path.dirname(skillsDir)), globalAgentDir) : [{ scope: 'global', dir: path.join(globalAgentDir, 'commands') }];
  // Compiling the global brain itself: its commands are the global ones.
  if (dirs.length === 2 && path.resolve(dirs[0].dir) === path.resolve(dirs[1].dir)) dirs.shift();
  return dirs;
}

/**
 * Extract [[slug]] wikilink references and relative Markdown link targets from body text.
 * Native TR link resolution; Obsidian renders them as graph edges.
 */
export function extractWikilinks(body) {
  if (!body) return [];
  const matches = body.match(/\[\[([^\]]+)\]\]/g) || [];
  const wikilinks = matches.map(m => m.slice(2, -2).split('|')[0].trim());

  const mdLinkMatches = body.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);
  const mdLinks = [];
  for (const match of mdLinkMatches) {
    const url = match[2].trim();
    if (/^https?:\/\//i.test(url)) {
      continue;
    }
    const base = path.basename(url);
    const targetSlug = base.endsWith('.md') ? base.slice(0, -3) : base;
    if (targetSlug) {
      mdLinks.push(targetSlug);
    }
  }

  return [...new Set([...wikilinks, ...mdLinks])];
}

/**
 * Generate an Obsidian Canvas JSON file from active vault nodes.
 * Written to memory-vault/graph.canvas; also readable by /api/graph.
 */
function generateCanvas(nodes, vaultDir) {
  const active = nodes.filter(n => n.status === 'active');
  if (active.length === 0) return;

  const CARD_W = 240, CARD_H = 60, GAP_X = 60, GAP_Y = 30;
  const cols = Math.max(1, Math.ceil(Math.sqrt(active.length)));

  const canvasNodes = active.map((n, i) => ({
    id: n.slug,
    x: (i % cols) * (CARD_W + GAP_X),
    y: Math.floor(i / cols) * (CARD_H + GAP_Y),
    width: CARD_W,
    height: CARD_H,
    type: 'text',
    text: `**${n.title}**\n_${n.category}_`
  }));

  const slugSet = new Set(canvasNodes.map(n => n.id));
  const seen = new Set();
  const canvasEdges = [];

  for (const n of active) {
    const targets = [...(n.related || []), ...extractWikilinks(n.body || '')];
    for (const target of targets) {
      if (!slugSet.has(target) || target === n.slug) continue;
      const key = `${n.slug}→${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      canvasEdges.push({
        id: `e${canvasEdges.length}`,
        fromNode: n.slug,
        toNode: target,
        fromSide: 'right',
        toSide: 'left'
      });
    }
  }

  const canvasPath = path.join(vaultDir, 'graph.canvas');
  atomicWrite(canvasPath, JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2));
}

// ─── Legacy injection markers (kept for cleanup of old files) ───
const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';
const INJECTION_END = '<!-- END INJECTED MEMORY -->';

export function replaceFirstManagedInjectionBlock(raw, injectionBlock) {
  const chunks = raw.match(/[^\n]*(?:\n|$)/g) || [];
  let inFence = false;
  let offset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === '') continue;
    const line = chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk;
    const trimmed = line.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      offset += chunk.length;
      continue;
    }

    if (!inFence && line === INJECTION_BEGIN) {
      let endOffset = offset + chunk.length;
      for (let j = i + 1; j < chunks.length; j++) {
        endOffset += chunks[j].length;
        const endLine = chunks[j].endsWith('\n') ? chunks[j].slice(0, -1) : chunks[j];
        if (endLine === INJECTION_END) {
          return `${raw.slice(0, offset)}${injectionBlock}\n${raw.slice(endOffset)}`;
        }
      }
      return null;
    }

    offset += chunk.length;
  }

  return null;
}

const DIRECTIVES_BEGIN = '<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->';
const DIRECTIVES_END = '<!-- END INJECTED ACTIVE DIRECTIVES -->';

function extractRuleContent(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf8');
  const parts = content.split('---');
  if (parts.length >= 3) {
    return parts.slice(2).join('---').trim();
  }
  return content.trim();
}

/**
 * Load cache of compacted rules.
 */
function loadCompactedRulesCache(derivedDir) {
  if (!derivedDir) return {};
  const cachePath = path.join(derivedDir, 'compacted-rules.json');
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save cache of compacted rules.
 */
function saveCompactedRulesCache(derivedDir, cache) {
  if (!derivedDir) return;
  const cachePath = path.join(derivedDir, 'compacted-rules.json');
  try {
    fs.mkdirSync(derivedDir, { recursive: true });
    atomicWrite(cachePath, JSON.stringify(cache, null, 2));
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Map a node's modality field to a compact marker for compiled shims.
 * Gives agents instant priority signal per OKF §4.1 typed-concept pattern.
 */
function modalityMarker(node) {
  const m = (node.modality || '').toLowerCase();
  if (m === 'must') return '[MUST]';
  if (m === 'must_not') return '[MUST NOT]';
  if (m === 'should') return '[SHOULD]';
  if (m === 'should_not') return '[SHOULD NOT]';
  // Fallback: infer from category
  if (node.category === 'invariants') return '[MUST]';
  if (node.category === 'anti-patterns') return '[CORRECTION]';
  if (node.category === 'preferences') return '[PREF]';
  return '';
}

/**
 * Heuristically summarize a memory node.
 * OKF-aligned: modality markers, no title/body duplication, sentence-boundary truncation.
 */
export function heuristicCompact(node) {
  const rawTitle = (node.title || '').trim();
  // Legacy prefix only — provenance is source.type / tags, not title text
  const title = rawTitle.replace(/^Self-captured memory:\s*/i, '').trim();
  const text = (node.body || node.content || '').trim();
  const marker = modalityMarker(node);
  const prefix = marker ? `${marker} ` : '';

  // Determine the best display text, avoiding title/body duplication.
  // Echo titles (legacy "Self-captured…" or title that is just a body prefix) use body only.
  const titleIsEcho = /^Self-captured memory:/i.test(rawTitle) ||
    (text && title.length > 20 && text.toLowerCase().startsWith(title.toLowerCase().replace(/\.\.\.$/, '').slice(0, 20)));

  if (node.category && ['invariants', 'preferences', 'anti-patterns'].includes(node.category)) {
    if (text) {
      if (titleIsEcho) {
        // Use body directly — title would duplicate it
        return `${prefix}${_truncateAtSentence(text, 300)}`;
      }
      const lines = text.split('\n');
      if (lines.length > 1) {
        return `${prefix}${title}:\n  ${lines.map(l => l.trim()).join('\n  ')}`;
      }
      return `${prefix}${title}: ${text}`;
    }
    return `${prefix}${title}`;
  }
  
  let summary = titleIsEcho && text ? text : title;
  if (text && !titleIsEcho) {
    const firstLine = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    if (firstLine && 
        !title.toLowerCase().includes(firstLine.toLowerCase()) && 
        !firstLine.toLowerCase().includes(title.toLowerCase())) {
      const separator = /[.!?]$/.test(title) ? ' ' : ' — ';
      summary = `${title}${separator}${firstLine}`;
    }
  }
  
  summary = summary.replace(/\s+/g, ' ');
  return `${prefix}${_truncateAtSentence(summary, 180)}`;
}

/**
 * Truncate text at the nearest sentence boundary before maxLen,
 * or at maxLen if no sentence boundary is found.
 */
function _truncateAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  // Look for sentence-ending punctuation before maxLen
  const slice = text.substring(0, maxLen);
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastSentence > maxLen * 0.4) {
    return text.substring(0, lastSentence + 1).trim() + ' (use recall to read more)';
  }
  return slice.trim() + '... (use recall to read more)';
}

/**
 * Compact a single memory node using LLM or heuristic fallback.
 * When force=true, bypass cache read but still write back (OKF augmentation pattern).
 */
async function compactNode(node, derivedDir, force = false) {
  const title = (node.title || '').trim();
  const body = (node.body || node.content || '').trim();
  const fullText = `${title}\n\n${body}`;
  const contentHash = crypto.createHash('sha256').update(fullText).digest('hex');

  // Load from cache if possible — skip when force=true to recompute from scratch.
  // Per OKF augmentation pattern: force bypasses cache *read* but preserves cache *write*.
  let cache = {};
  if (derivedDir && !force) {
    cache = loadCompactedRulesCache(derivedDir);
    if (cache[node.slug] && cache[node.slug].content_sha256 === contentHash) {
      return cache[node.slug].compacted;
    }
  }

  // Fallback default
  let compacted = heuristicCompact(node);

  // Save to cache — always merge into existing cache (OKF non-destructive augmentation).
  // When force=true we skipped cache loading above, so reload it now before writing
  // to avoid blowing away other nodes' cached compactions.
  if (derivedDir) {
    if (force) {
      cache = loadCompactedRulesCache(derivedDir);
    }
    cache[node.slug] = {
      compacted,
      content_sha256: contentHash,
      updated_at: new Date().toISOString()
    };
    saveCompactedRulesCache(derivedDir, cache);
  }

  return compacted;
}

const DEFAULT_RULE_BUDGET = { invariants: 9000, preferences: 4000, corrections: 8000 };

/** Rule-section budgets (characters) from surface.yml files and the environment. */
export function readRuleBudgets(skillsDir) {
  const out = {};
  const dirs = [skillsDir ? path.join(skillsDir, 'total-recall') : null, globalBrainDir].filter(Boolean);
  for (const dir of dirs.reverse()) {
    try {
      const cfg = yaml.parse(fs.readFileSync(path.join(dir, 'config', 'surface.yml'), 'utf8')) || {};
      for (const k of Object.keys(DEFAULT_RULE_BUDGET)) {
        const v = Number(cfg?.rules?.[`${k}_budget_chars`]);
        if (Number.isFinite(v) && v > 0) out[k] = v;
      }
    } catch {
      /* no surface.yml in this brain */
    }
  }
  try {
    Object.assign(out, JSON.parse(process.env.TR_RULE_BUDGET_CHARS || '{}'));
  } catch {
    /* ignore a malformed override */
  }
  return out;
}

const DEFAULT_CONTEXT_BUDGET = { total_tokens: 4000, bootstrap_total_tokens: 2500 };

/**
 * Instruction-surface token budget from surface.yml files and the environment.
 *
 * The rule-section budgets above are characters, so a brain whose required
 * rules are rich can need more text than the fixed token total allows and then
 * write no surface at all. A project brain overrides the global brain;
 * TR_CONTEXT_BUDGET_TOKENS overrides both, as JSON of the same keys.
 */
export function readContextBudget(skillsDir) {
  const out = {};
  const dirs = [skillsDir ? path.join(skillsDir, 'total-recall') : null, globalBrainDir].filter(Boolean);
  for (const dir of dirs.reverse()) {
    try {
      const cfg = yaml.parse(fs.readFileSync(path.join(dir, 'config', 'surface.yml'), 'utf8')) || {};
      for (const k of Object.keys(DEFAULT_CONTEXT_BUDGET)) {
        const v = Number(cfg?.budget?.[k]);
        if (Number.isFinite(v) && v > 0) out[k] = v;
      }
    } catch {
      /* no surface.yml in this brain */
    }
  }
  try {
    Object.assign(out, JSON.parse(process.env.TR_CONTEXT_BUDGET_TOKENS || '{}'));
  } catch {
    /* ignore a malformed override */
  }
  return { ...DEFAULT_CONTEXT_BUDGET, ...out };
}

export function legacyRuleContributions(skillsDir) {
  if (!skillsDir) return [];
  return ['invariants', 'preferences', 'corrections'].map(name => ({
    id: `legacy:${name}`, required: true,
    text: extractRuleContent(path.join(skillsDir, 'total-recall', 'rules', `${name}.md`)),
  })).filter(item => item.text);
}

const PLUGIN_OPERATIONS_SHOWN = 14;

export function buildInstalledPluginsSummary(projectRoot = process.cwd()) {
  try {
    const plugins = discoverPlugins(projectRoot).filter((p) => p.valid);
    if (!plugins.length) return '';
    const lines = [
      '## Installed Plugins & Capabilities\n',
      'Use Total Recall and plugins first. Discover operations with `total-recall plugin library --json`, inspect the owner CLI help, then use its CLI.\n',
      'Namespaces below run as `total-recall <namespace> [command]`; declarations do not prove provider readiness.\n'
    ];
    if (plugins.some(plugin => plugin.id === 'composable-cli')) lines.push('Composed commands: `total-recall composable-cli library --json`.\n');
    for (const p of plugins) {
      const cmd = p.manifest.cli?.command || p.id;
      const desc = (p.manifest.description || 'Plugin capability').replace(/\s+/g, ' ').slice(0, 30).trimEnd();
      const ops = (p.manifest.cli?.subcommands || []).map(sub => sub.name).filter(Boolean);
      const shown = ops.slice(0, PLUGIN_OPERATIONS_SHOWN).join(' | ');
      const more = ops.length > PLUGIN_OPERATIONS_SHOWN ? ` | +${ops.length - PLUGIN_OPERATIONS_SHOWN} more (\`${cmd} --help\`)` : '';
      lines.push(`- **${p.id}** v${p.manifest.version || 'unknown'} · ${pluginActivation(p).state} · \`total-recall ${cmd}\` ${shown ? `[${shown}${more}]` : '(no operations)'}: ${desc}`);
    }
    return lines.join('\n') + '\n';
  } catch {
    return '';
  }
}

export async function buildRulesBlock(skillsDir, nodes = [], {
  consumer = 'ide', derivedDir, vaultDir, projectRoot, actions = [], bootstrap = false, total,
} = {}) {
  const root = projectRoot || (skillsDir ? path.dirname(path.dirname(skillsDir)) : process.cwd());
  const budget = readContextBudget(skillsDir);
  const tokenBudget = total ?? (bootstrap ? budget.bootstrap_total_tokens : budget.total_tokens);
  const rules = selectRules(curatedRules(nodes), { actions, projectRoot: root, bootstrap });
  const contributions = [];
  const counts = category => rules.filter(n => n.category === category).length;
  const header = bootstrap ? `# 🔴 MANDATORY FIRST STEP: TOTAL RECALL CLI & TASK ROUTING

1. RUN TOTAL RECALL CLI HELP FIRST:
\`total-recall --help\`
(or in a source checkout: \`node bin/total-recall.mjs --help\`)
Inspect all core capabilities, installed plugins, and commands.

2. RUN TOTAL RECALL CONTEXT BEFORE ACTING:
\`total-recall context "task description" --action <actions>\`
Read the complete returned capsule and require ready:true. Unknown rule applicability is conservatively required. If it exits 2, stop: the required set exceeds its budget; inspect overflow and explicitly raise the budget or curate applicability before action.

Total Recall is the agent's working memory, toolset, and single source of truth across all decisions. Refresh at every changed task, action or project, and after a memory/skill edit. Do not infer applicability from semantic similarity. CLI retrieval is local and works without the server. Skills have compact entrypoints; load only relevant references. Canonical vault writes use the validated CLI.

DO NOT SKIP THIS. Run Total Recall CLI help and context first before doing anything else.

${CLI_QUICK_REFERENCE}` :
    `## Active Rules: ${counts('invariants')} invariants, ${counts('preferences')} preferences, ${counts('anti-patterns')} corrections`;
  contributions.push({ id: 'routing', text: header, required: true });
  const pluginsSummary = buildInstalledPluginsSummary(root);
  if (pluginsSummary) {
    contributions.push({ id: 'installed-plugins', text: pluginsSummary, required: true });
  }
  for (const node of rules) contributions.push({ id: `${node._layer || 'project'}:${node.slug}`, required: true,
    text: node._directive ? `[${node.slug}] ${node._directive}` : `### ${node.title || node.slug} [${node.slug}]\n\n${node.body || node.content || ''}` });
  contributions.push({ id: 'commands', text: buildCommandsSection(listSurfaceCommands(commandDirsFor(skillsDir))) });
  if (!bootstrap) {
    if (skillsDir) {
      contributions.push(...legacyRuleContributions(skillsDir));
      for (const skill of loadSkills(skillsDir)) contributions.push({ id: `skill:${skill.name}`,
        text: `Skill ${skill.name}: ${String(skill.description || '').slice(0, 200)} (${path.relative(root, skill.filepath)})` });
    }
    const plugin = await assemblePluginContexts({ projectRoot: root, vaultDir, nodes, derivedDir });
    contributions.push({ id: 'plugins', text: plugin });
  }
  const result = assembleContext(contributions, { total: tokenBudget });
  if (derivedDir) {
    fs.mkdirSync(derivedDir, { recursive: true });
    atomicWrite(path.join(derivedDir, bootstrap ? 'bootstrap-accounting.json' : 'context-accounting.json'), JSON.stringify({ ready: result.ready, ...result.stats }, null, 2));
  }
  if (!result.ready) throw new Error(`Required context exceeds budget by ${result.stats.overflow_tokens} estimated tokens; no instruction surface written. Raise total or explicitly curate context tags.`);
  return result.context;
}

function injectDirectives(fileContent, rulesBlock) {
  const beginIdx = fileContent.indexOf(DIRECTIVES_BEGIN);
  const endIdx = fileContent.indexOf(DIRECTIVES_END);
  
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    return fileContent.slice(0, beginIdx) + DIRECTIVES_BEGIN + '\n' + rulesBlock + '\n' + DIRECTIVES_END + fileContent.slice(endIdx + DIRECTIVES_END.length);
  }
  
  let content = fileContent.trimEnd();
  const baseline = '# 🔴 MANDATORY FIRST STEP ON EVERY TURN: TOTAL RECALL FIRST\n1. Run `total-recall --help` (or `node bin/total-recall.mjs --help`) to discover all tools, plugins, and commands.\n2. Read and follow .agent/skills/total-recall/SKILL.md before doing ANYTHING.\n3. Run `total-recall context "<task>"` and `total-recall recall "<topic>" --local` before any decision or action.\nTotal Recall is the mandatory working memory and toolset across all tasks and harnesses. Never skip this.';
  if (!content.includes('total-recall/SKILL.md')) {
    content = baseline + '\n\n' + content;
  }
  
  return content.trimEnd() + '\n\n' + DIRECTIVES_BEGIN + '\n' + rulesBlock + '\n' + DIRECTIVES_END + '\n';
}

/**
 * Write or update a platform instruction shim with the pointer and active rules.
 */
async function writeShim(shimPath, skillsDir, nodes = [], { vaultDir, derivedDir, force = false } = {}) {
  const shimDir = path.dirname(shimPath);
  const rulesBlock = await buildRulesBlock(skillsDir, nodes, { vaultDir, derivedDir, bootstrap: true });
  const baseline = '# 🔴 MANDATORY FIRST STEP ON EVERY TURN: TOTAL RECALL FIRST\n1. Run `total-recall --help` (or `node bin/total-recall.mjs --help`) to discover all tools, plugins, and commands.\n2. Read and follow .agent/skills/total-recall/SKILL.md before doing ANYTHING.\n3. Run `total-recall context "<task>"` and `total-recall recall "<topic>" --local` before any decision or action.\nTotal Recall is the mandatory working memory and toolset across all tasks and harnesses. Never skip this.\n';
  const mdcHeader = shimPath.endsWith('.mdc')
    ? '---\ndescription: "Total Recall — Auto-generated behavioral memory surface."\nglobs:\nalwaysApply: true\n---\n\n'
    : '';
  const fullContent = `${mdcHeader}${baseline}\n${DIRECTIVES_BEGIN}\n${rulesBlock}\n${DIRECTIVES_END}\n`;

  try {
    const stat = fs.lstatSync(shimPath, { throwIfNoEntry: false });
    if (stat) {
      if (stat.isSymbolicLink()) {
        const target = fs.realpathSync(shimPath);
        const root = fs.realpathSync(path.dirname(path.dirname(skillsDir)));
        const relative = path.relative(root, target);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Linked instruction target is outside the selected project');
        if (!fs.statSync(target).isFile()) throw new Error('Linked instruction target must be a regular file');
        // Preserve both the link and authored target text; replace only our block.
        const raw = fs.readFileSync(target, 'utf8');
        atomicWrite(target, injectDirectives(raw, rulesBlock));
        return true;
      } else {
        const raw = fs.readFileSync(shimPath, 'utf8');
        let cleaned = raw;
        if (raw.includes(INJECTION_BEGIN)) {
          const replaced = replaceFirstManagedInjectionBlock(raw, '');
          if (replaced !== null) cleaned = replaced;
        }
        
        const updated = injectDirectives(cleaned, rulesBlock);
        atomicWrite(shimPath, updated);
        return true;
      }
    } else {
      if (!fs.existsSync(shimDir)) {
        fs.mkdirSync(shimDir, { recursive: true });
      }
      atomicWrite(shimPath, fullContent);
      return true;
    }
  } catch (err) {
    throw new Error(`Cannot update instruction surface ${path.basename(shimPath)}: ${err.code || err.message}`);
  }
}

/**
 * Map of client names → shim file paths they require.
 */
const CLIENT_SHIMS = {
  cursor:             ['.cursor/rules/total-recall.mdc', '.cursorrules'],
  claude:             ['CLAUDE.md'],
  'claude-code':      ['CLAUDE.md'],
  cline:              ['.clinerules/total-recall.md'],
  roo:                ['.roo/rules/total-recall.md', '.clinerules/total-recall.md'],
  'roo-code':         ['.roo/rules/total-recall.md', '.clinerules/total-recall.md'],
  antigravity:        ['AGENTS.md', '.agents/rules/AGENTS.md'],
  gemini:             ['GEMINI.md', '.agents/rules/GEMINI.md'],
  codex:              ['AGENTS.md'],
  grok:               ['AGENTS.md'],
  replit:             ['replit.md'],
  lovable:            ['AGENTS.md'],
  openhands:          ['AGENTS.md'],
  zed:                ['AGENTS.md'],
  trae:               ['.trae/rules/total-recall.md', '.traerules'],
  goose:              ['.goosehints'],
  aider:              ['.aider.rules.md'],
  windsurf:           ['.windsurf/rules/total-recall.md', '.devin/rules/total-recall.md', '.windsurfrules'],
  devin:              ['.devin/rules/total-recall.md'],
  vscode:             ['.github/copilot-instructions.md', '.vscode/copilot-instructions.md'],
  githubCopilot:      ['.github/copilot-instructions.md'],
  pi:                 ['AGENTS.md'],
  hermes:             ['.hermes/memories/MEMORY.md'],
  'hermes-agent':     ['.hermes/memories/MEMORY.md'],
  dsh:                ['AGENTS.md'],
  'deepseek-harness': ['AGENTS.md'],
  openclaw:           ['MEMORY.md', 'AGENTS.md']
};

/**
 * Read the connected client config.
 */
function readConnectedClients(clientsPath) {
  try {
    if (!fs.existsSync(clientsPath)) return null;
    const raw = fs.readFileSync(clientsPath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    
    // Support object format: { clients: { gemini: {...} } }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.clients) {
      const keys = Object.keys(parsed.clients);
      if (keys.length === 0) return null;
      return new Set(keys);
    }
    
    // Support legacy array format just in case
    if (Array.isArray(parsed) && parsed.length > 0) {
      return new Set(parsed.map(String));
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Compile shims asynchronously.
 */
async function compilePointers(instructionsFile, skillsDir, nodes = [], { vaultDir, derivedDir, force = false } = {}) {
  const agentDir = path.dirname(instructionsFile);
  // `instructionsFile` is always `<agentDir>/INSTRUCTIONS.md`, so agentDir is
  // already the directory the surface belongs in. Do not derive it again.
  //
  // The old code stripped a trailing `.agent` unconditionally. That relocated
  // the GLOBAL brain's surface: rebuild.mjs (the command Greg actually runs)
  // sets agentDir to `resolveAgentDir('global')` = `<home>/.agent`, so the
  // basename IS `.agent`, baseDir became `<home>`, and every compile wrote
  // `<home>/INSTRUCTIONS.md` while `<home>/.agent/INSTRUCTIONS.md` -- the file
  // the harness reads -- stayed frozen at 2026-05-25, all while printing
  // "Post-build verification passed: 0 drift" and exiting 0.
  //
  // Both call shapes this repo uses already pass the true surface directory
  // (rebuild.mjs: `<agentDir>/INSTRUCTIONS.md` with skillsDir `<agentDir>/skills`;
  // plugin-store.mjs likewise), so the peel was never correct for either.
  const baseDir = agentDir;
  let injectedCount = 0;

  // Always write the canonical INSTRUCTIONS.md
  if (await writeShim(path.join(baseDir, 'INSTRUCTIONS.md'), skillsDir, nodes, { vaultDir, derivedDir, force })) {
    injectedCount++;
  }

  // Determine which client shims to write.
  // `baseDir/.agent/skills/...` only holds for a PROJECT brain. For the global
  // brain baseDir already IS the agent dir, so that path became
  // `~/.agent/.agent/skills/...` and clients.json was never found -- every
  // connected-client shim (CLAUDE.md, GEMINI.md, .cursorrules, ...) silently
  // stopped updating. Derive the brain dir from the caller's skillsDir instead,
  // which is correct for both layers. Fall back to the legacy guess only when
  // skillsDir was not supplied.
  const brainDirForConfig = skillsDir ? path.dirname(skillsDir) : path.join(baseDir, '.agent');
  const clientsPath = path.join(brainDirForConfig, 'skills', 'total-recall', 'config', 'clients.json');
  const connectedClients = readConnectedClients(clientsPath);

  // Client shims are written BESIDE INSTRUCTIONS.md, in the same directory, so
  // the surface directory is decided in exactly one place: `instructionsFile`.
  //
  // The two layers place that directory differently, and both are correct:
  //   global  -> ~/.agent/INSTRUCTIONS.md   (agentDir IS the workspace root)
  //   project -> <repo>/INSTRUCTIONS.md     (the repo root, not <repo>/.agent)
  // `plugin-store.mjs` and `rebuild.mjs` are responsible for passing the right
  // `instructionsFile`; this function must not re-derive or relocate it. Doing
  // so previously wrote every project shim into `<repo>/.agent/AGENTS.md`, where
  // no harness looks, while still reporting a successful compilation.
  if (connectedClients !== null) {
    // Only write shims for connected clients
    for (const client of connectedClients) {
      const files = CLIENT_SHIMS[client];
      if (!files) continue;
      for (const file of files) {
        if (await writeShim(path.join(baseDir, file), skillsDir, nodes, { vaultDir, derivedDir, force })) {
          injectedCount++;
        }
      }
    }
  }
  
  return injectedCount;
}

/**
 * Main surface compilation entry point.
 */
/**
 * The rule nodes a project's instruction surfaces are built from: the global
 * brain's rules plus the project's own. A project node with the same slug
 * wins, so a repo can override a global rule; everything else in the global
 * vault stays search-only. Without this every repo carried only its own vault,
 * and a rule saved with `remember --global` reached no repo at all.
 */
export function mergeGlobalRuleNodes(projectNodes, globalNodes) {
  const own = new Set(projectNodes.map((n) => n.slug));
  const inherited = globalNodes
    .filter((n) => RULE_CATEGORIES.has(n.category) && !own.has(n.slug))
    .map((n) => ({ ...n, _layer: 'global' }));
  return [...projectNodes, ...inherited];
}

const RULE_CATEGORIES = new Set(['invariants', 'preferences', 'anti-patterns']);

function globalVaultFor(vaultDir) {
  const globalVault = path.join(globalBrainDir, 'memory-vault');
  return path.resolve(globalVault) === path.resolve(vaultDir) ? null : globalVault;
}

export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force = false, semantic = true }) {
  if (isSurfaceCodeStale()) {
    logger.warn('surface', 'Surface compile skipped: this process runs an outdated copy of surface.mjs. Restart it (server/daemon) so instruction files are built with the current code.');
    return { nodesProcessed: 0, skillsInjected: 0, semanticIndexed: 0, semanticUnavailable: false, skipped: true, reason: 'stale-surface-code' };
  }
  const nodes = getNodes(vaultDir);
  const projectRoot = skillsDir ? path.dirname(path.dirname(skillsDir)) : path.resolve(vaultDir, '..', '..', '..', '..');
  const catalog = refreshPluginCatalog(derivedDir, projectRoot);
  const globalVault = globalVaultFor(vaultDir);
  const ruleNodes = globalVault && fs.existsSync(globalVault)
    ? mergeGlobalRuleNodes(nodes, getNodes(globalVault))
    : nodes;

  // ── Incremental compilation: vault content hash check ──
  // The global rules hash lives in its own file: vault-hash.txt is served by
  // /api/vault/hash and must keep describing this vault alone.
  const hashFile = path.join(derivedDir, 'vault-hash.txt');
  const currentHash = computeVaultHash(vaultDir);
  const globalHashFile = path.join(derivedDir, 'global-rules-hash.txt');
  const globalHash = globalVault && fs.existsSync(globalVault) ? computeVaultHash(globalVault) : '';
  // Commands and skills feed the surface too; a change to either must recompile
  // even when no memory node changed.
  const inputsHashFile = path.join(derivedDir, 'surface-inputs-hash.txt');
  const inputsHash = sourceHash(SURFACE_SOURCE) + catalog.fingerprint + surfaceInputsHash({ commandDirs: commandDirsFor(skillsDir), skillsDir });

  if (!force && fs.existsSync(hashFile)) {
    const storedHash = fs.readFileSync(hashFile, 'utf8').trim();
    const storedGlobal = fs.existsSync(globalHashFile) ? fs.readFileSync(globalHashFile, 'utf8').trim() : '';
    const storedInputs = fs.existsSync(inputsHashFile) ? fs.readFileSync(inputsHashFile, 'utf8').trim() : '';
    if (storedHash === currentHash && storedGlobal === globalHash && storedInputs === inputsHash) {
      return {
        nodesProcessed: nodes.length,
        skillsInjected: 0,
        semanticIndexed: 0,
        semanticUnavailable: false,
        skipped: true,
        reason: 'vault-hash-unchanged'
      };
    }
  }

  // 1. Write pointer and active rules to all instruction shims
  const skillsInjected = await compilePointers(instructionsFile, skillsDir, ruleNodes, { vaultDir, derivedDir, force });

  // 2. Build derived indexes (powers semantic search API)
  if (!fs.existsSync(derivedDir)) {
    fs.mkdirSync(derivedDir, { recursive: true });
  }

  const graphIndex = nodes.map(n => ({
    slug: n.slug,
    title: n.title,
    category: n.category,
    status: n.status,
    confidence: n.confidence,
    tags: Array.isArray(n.tags) ? n.tags : [],
    memory_layer: inferMemoryLayer(n),
    links: extractWikilinks(n.body || '')
  }));
  atomicWrite(path.join(derivedDir, 'graph-index.jsonl'), graphIndex.map(n => JSON.stringify(n)).join('\n'));
  atomicWrite(
      path.join(derivedDir, 'memory-layers.jsonl'),
      buildMemoryLayerIndex(nodes).map(n => JSON.stringify(n)).join('\n')
  );
  buildLocalSearchIndex(nodes, { derivedDir, vaultDir });

  // 3. Build the semantic embeddings index.
  //
  // This was fire-and-forget with a bare `.catch(() => {})`, and `semanticResult`
  // below was a hardcoded `{ indexed: 0, unavailable: true }` that no code path
  // could ever update. Three consequences, all silent:
  //   - `total-recall compile` exits before the detached build writes anything,
  //     so a CLI compile left the vector index EMPTY while printing
  //     "Rebuilt …", "Post-build verification passed: 0 drift" and exiting 0.
  //     (`rebuild` rm -rf's derivedDir first, so it actively destroyed the index.)
  //   - every embedding error was swallowed, so a dead provider looked identical
  //     to a healthy build.
  //   - the return value always claimed zero indexed and "unavailable", so no
  //     caller could detect any of it.
  // Awaiting is cheap in steady state: buildEmbeddingsIndex skips nodes whose
  // content hash is unchanged, so only genuinely new or edited nodes cost a call.
  let semanticResult = { indexed: 0, skipped: nodes.length, unavailable: true };
  if (!semantic || process.env.TR_EMBEDDINGS_DISABLED === '1') {
    logger.info('surface', 'Semantic embeddings explicitly disabled; local indexes updated.', { derivedDir });
  } else try {
    const { buildEmbeddingsIndex } = await import('./embeddings.mjs');
    // Forward `force`: the builder is content-hash incremental and skips a node
    // whose text is unchanged, so without this `compile --force` rebuilt nothing
    // and rows kept an outdated model label.
    const built = await buildEmbeddingsIndex(nodes, derivedDir, { force });
    semanticResult = {
      indexed: built.built,
      skipped: built.skipped,
      failed: built.failed,
      unavailable: false,
    };
    if (built.failed > 0) {
      logger.warn('surface', `Embedding build: ${built.failed} node(s) failed; vector search will be incomplete.`, { derivedDir });
    }
  } catch (err) {
    // Still non-fatal — a brain without vectors works, keyword-only — but it is
    // never again silent.
    logger.error('surface', `Embedding index build FAILED; vector search is OFF: ${err.message}`, { derivedDir });
    semanticResult = { indexed: 0, skipped: nodes.length, unavailable: true, error: err.message };
  }

  // 4. Generate Obsidian Canvas
  try {
    generateCanvas(nodes, vaultDir);
  } catch { /* non-fatal */ }

  // 5. Write vault hash + projection manifest
  atomicWrite(hashFile, currentHash);
  atomicWrite(globalHashFile, globalHash);
  atomicWrite(inputsHashFile, inputsHash);
  writeProjectionManifest(derivedDir, currentHash);

  // 6. Generate live OKF Index and Log
  try {
    const { generateLiveIndex, generateLiveLog } = await import('./okf-adapter.mjs');
    generateLiveIndex(vaultDir);
    generateLiveLog(vaultDir);
  } catch (err) {
    logger.warn('surface', `Failed to generate live OKF index/log: ${err.message}`);
  }

  return {
    nodesProcessed: nodes.length,
    skillsInjected,
    semanticIndexed: semanticResult.indexed,
    semanticSkipped: semanticResult.skipped,
    semanticFailed: semanticResult.failed || 0,
    semanticUnavailable: semanticResult.unavailable,
    semanticError: semanticResult.error || null,
  };
}

/**
 * Compute vault content hash.
 *
 * Exported so diagnostics can tell whether a compiled surface is still current
 * with the vault it was built from. A surface that stopped being rewritten is
 * invisible from the exit code, so this is what a freshness check compares.
 */
export function computeVaultHash(vaultDir) {
  const files = walkMd(vaultDir).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      hash.update(`${file}:${stat.mtimeMs}:${stat.size}\n`);
    } catch { /* skip unreadable files */ }
  }
  return hash.digest('hex');
}

/**
 * Write projection manifest.
 */
function writeProjectionManifest(derivedDir, vaultHash) {
  const manifest = {
    type: 'projection-manifest',
    generated_at: new Date().toISOString(),
    vault_hash: `sha256:${vaultHash}`,
    projections: [
      { file: 'graph-index.jsonl', disposable: true },
      { file: 'memory-layers.jsonl', disposable: true },
      { file: 'local-search.json', disposable: true },
      { file: 'embeddings.jsonl', disposable: true },
      { file: 'vault-hash.txt', disposable: true }
    ],
    rebuild_command: 'npx total-recall compile'
  };
  atomicWrite(path.join(derivedDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
}

// ─── Legacy exports (kept for backward compatibility) ───
export function routeNodesToSkills() { return []; }
export function injectSkills() {}
export async function compileTier1(nodes, instructionsFile) { await compilePointers(instructionsFile); }
