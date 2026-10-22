/**
 * src/core/cli-semantic-index.mjs
 *
 * Automatic semantic indexing and discovery across all Total Recall CLI verbs:
 *   - 68+ built-in core commands (CLI_COMMANDS)
 *   - 270+ plugin operations from discovered plugins (plugin.json)
 *   - Dynamic composed commands (commandScopeDirectories)
 *
 * Provides zero-cost embedding via local/mesh Ollama (nomic-embed-text:latest)
 * with incremental content-hash caching in memory-derived/cli-semantic-index.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { CLI_COMMANDS } from './cli-commands.mjs';
import { discoverPlugins } from './plugin-loader.mjs';
import { listSurfaceCommands, commandScopeDirectories } from './command-surface.mjs';
import { getEmbedding, cosineSimilarity } from './embeddings.mjs';
import { logger } from './logger.mjs';
import { atomicWrite } from './vault.mjs';
import { globalAgentDir } from './config.mjs';

/** Canonical descriptions and usage signatures for built-in core commands. */
const CORE_METADATA = {
  app: {
    description: 'Launch or inspect the Total Recall web application interface.',
    usage: 'total-recall app [options]',
    effect: 'read'
  },
  init: {
    description: 'Bootstrap global or project brain and openwiki documentation.',
    usage: 'total-recall init [--project]',
    effect: 'write'
  },
  setup: {
    description: 'Interactive terminal provision wizard for keys, models, and configuration.',
    usage: 'total-recall setup',
    effect: 'write'
  },
  start: {
    description: 'Start foreground brain server with local endpoints.',
    usage: 'total-recall start',
    effect: 'read'
  },
  startup: {
    description: 'Verify readiness checks or start missing local runtime services.',
    usage: 'total-recall startup [check|ensure]',
    effect: 'write'
  },
  deploy: {
    description: 'Deploy host runtime layers, daemon services, or launch browser setup.',
    usage: 'total-recall deploy [--ui]',
    effect: 'write'
  },
  doctor: {
    description: 'Health checks, file system integrity, and environment diagnostics.',
    usage: 'total-recall doctor',
    effect: 'read'
  },
  backup: {
    description: 'Create encrypted VFS backup of brain state.',
    usage: 'total-recall backup',
    effect: 'read'
  },
  dream: {
    description: 'Trigger memory consolidation sleep cycle.',
    usage: 'total-recall dream',
    effect: 'write'
  },
  lint: {
    description: 'Validate SSSS schemas and markdown frontmatter formatting.',
    usage: 'total-recall lint',
    effect: 'read'
  },
  daemon: {
    description: 'Background worker management: start, stop, or inspect status.',
    usage: 'total-recall daemon [start|stop|status]',
    effect: 'write'
  },
  restore: {
    description: 'Restore brain state from an encrypted backup archive.',
    usage: 'total-recall restore <path>',
    effect: 'write'
  },
  upgrade: {
    description: 'Kernel model swap and runtime migration helpers.',
    usage: 'total-recall upgrade',
    effect: 'write'
  },
  update: {
    description: 'Auto-download and propagate Total Recall and SSSS updates across repos.',
    usage: 'total-recall update [--all-brains] [--apply]',
    effect: 'write'
  },
  friction: {
    description: 'Watchdog latency and session friction analysis.',
    usage: 'total-recall friction',
    effect: 'read'
  },
  chat: {
    description: 'Interactive terminal chat against local brain models.',
    usage: 'total-recall chat',
    effect: 'read'
  },
  status: {
    description: 'Inspect health and active brain connection status.',
    usage: 'total-recall status',
    effect: 'read'
  },
  remember: {
    description: 'Write-path memory: save facts, rules, or invariants into the vault.',
    usage: 'total-recall remember <category> "<text>" [--global|--project]',
    effect: 'write'
  },
  forget: {
    description: 'Mark memory nodes inactive or archive outdated facts.',
    usage: 'total-recall forget <slug>',
    effect: 'write'
  },
  edit: {
    description: 'Directly edit a vault memory node in your editor.',
    usage: 'total-recall edit <slug>',
    effect: 'write'
  },
  recall: {
    description: 'Read-path hybrid vector and keyword memory search.',
    usage: 'total-recall recall "<query>" [--local]',
    effect: 'read'
  },
  context: {
    description: 'Generate task rule capsule before taking action.',
    usage: 'total-recall context "<task>" [--action <a>]',
    effect: 'read'
  },
  rules: {
    description: 'Inspect, audit, or draft rule curation policies.',
    usage: 'total-recall rules [audit|draft|apply]',
    effect: 'write'
  },
  search: {
    description: 'Query vault memory nodes via keyword and vector search.',
    usage: 'total-recall search "<query>"',
    effect: 'read'
  },
  research: {
    description: 'Manage long-horizon background research queues.',
    usage: 'total-recall research [queue|status|get]',
    effect: 'write'
  },
  proposals: {
    description: 'Review or apply memory optimizer proposals.',
    usage: 'total-recall proposals [list|apply|revert]',
    effect: 'write'
  },
  proposal: {
    description: 'Inspect or evaluate a specific memory proposal.',
    usage: 'total-recall proposal <id>',
    effect: 'read'
  },
  task: {
    description: 'Enqueue asynchronous daemon task envelope.',
    usage: 'total-recall task <command>',
    effect: 'write'
  },
  share: {
    description: 'Peer-to-peer capture to memory vault or research queue.',
    usage: 'total-recall share "<text>"',
    effect: 'write'
  },
  'generate-pat': {
    description: 'Generate personal access bearer token for APIs.',
    usage: 'total-recall generate-pat',
    effect: 'write'
  },
  key: {
    description: 'List, issue, or revoke dashboard and API access keys.',
    usage: 'total-recall key [list|issue|revoke]',
    effect: 'write'
  },
  keys: {
    description: 'List, issue, or revoke dashboard and API access keys.',
    usage: 'total-recall keys',
    effect: 'read'
  },
  pat: {
    description: 'Manage personal access bearer tokens.',
    usage: 'total-recall pat',
    effect: 'write'
  },
  'hash-password': {
    description: 'Hash an administrative password for the web dashboard.',
    usage: 'total-recall hash-password',
    effect: 'read'
  },
  'reset-password': {
    description: 'Reset the administrator password for the web dashboard.',
    usage: 'total-recall reset-password',
    effect: 'write'
  },
  compile: {
    description: 'Rebuild all instruction surfaces and vector indices.',
    usage: 'total-recall compile [--force]',
    effect: 'write'
  },
  rebuild: {
    description: 'Clean rebuild of instruction surfaces and memory caches.',
    usage: 'total-recall rebuild',
    effect: 'write'
  },
  snapshot: {
    description: 'Create instantaneous snapshot of current vault state.',
    usage: 'total-recall snapshot',
    effect: 'read'
  },
  migrate: {
    description: 'Run database or schema migrations on brain storage.',
    usage: 'total-recall migrate',
    effect: 'write'
  },
  backfill: {
    description: 'Backfill legacy records into modern SSSS format.',
    usage: 'total-recall backfill',
    effect: 'write'
  },
  ingest: {
    description: 'Ingest external Markdown files, session logs, or notes into vault.',
    usage: 'total-recall ingest <path>',
    effect: 'write'
  },
  import: {
    description: 'Import rule files from another brain or repository.',
    usage: 'total-recall import <path>',
    effect: 'write'
  },
  connect: {
    description: 'Wire IDE surfaces and clients to your brain.',
    usage: 'total-recall connect <client>',
    effect: 'write'
  },
  sync: {
    description: 'Synchronize remote brain instructions and vault changes.',
    usage: 'total-recall sync',
    effect: 'write'
  },
  relay: {
    description: 'Ship local sessions to remote brain worker.',
    usage: 'total-recall relay',
    effect: 'write'
  },
  uninstall: {
    description: 'Safely remove daemon hooks, launch agents, or local files.',
    usage: 'total-recall uninstall',
    effect: 'write'
  },
  map: {
    description: 'Visualize vault categories and knowledge graph links.',
    usage: 'total-recall map',
    effect: 'read'
  },
  brain: {
    description: 'Register, list, or inspect local and project brains.',
    usage: 'total-recall brain [list|ensure|register]',
    effect: 'write'
  },
  config: {
    description: 'Inspect or modify brain configuration settings.',
    usage: 'total-recall config [get|set <key>]',
    effect: 'write'
  },
  skill: {
    description: 'Manage skill registry, tracking, and multi-repo propagation.',
    usage: 'total-recall skill [track|deploy|list]',
    effect: 'write'
  },
  'project-id': {
    description: 'Display or generate the unique project identifier.',
    usage: 'total-recall project-id',
    effect: 'read'
  },
  api: {
    description: 'Direct CLI gateway for internal HTTP and RPC API routes.',
    usage: 'total-recall api <endpoint>',
    effect: 'read'
  },
  brief: {
    description: 'Generate session-start briefing with state, runtime, and trackers.',
    usage: 'total-recall brief',
    effect: 'read'
  },
  group: {
    description: 'Manage cross-project skill groups and access sets.',
    usage: 'total-recall group [list|add|remove]',
    effect: 'write'
  },
  groups: {
    description: 'List or inspect cross-project skill groups.',
    usage: 'total-recall groups',
    effect: 'read'
  },
  help: {
    description: 'Offline interactive help system and semantic command search.',
    usage: 'total-recall help [topic|command]',
    effect: 'read'
  },
  collab: {
    description: 'Launch collaborative sandbox server.',
    usage: 'total-recall collab',
    effect: 'read'
  },
  command: {
    description: 'Create or manage dynamic composed agent CLI commands.',
    usage: 'total-recall command [create|list|remove]',
    effect: 'write'
  },
  export: {
    description: 'Export memory vault as an OKF portable bundle.',
    usage: 'total-recall export <path>',
    effect: 'read'
  },
  harness: {
    description: 'Meta-harness orchestration, task dispatch, and council consensus.',
    usage: 'total-recall harness [dispatch|council|usage]',
    effect: 'write'
  },
  watch: {
    description: 'Watch vault directory and automatically recompile surfaces.',
    usage: 'total-recall watch',
    effect: 'read'
  },
  agent: {
    description: 'Process controller for spawning, monitoring, and terminating agents across the mesh.',
    usage: 'total-recall agent [spawn|list|logs|kill]',
    effect: 'write'
  },
  agents: {
    description: 'List and inspect mesh agent processes.',
    usage: 'total-recall agents',
    effect: 'read'
  },
  new: {
    description: 'Scaffold a new project with SSSS and Total Recall plugins as owned bricks.',
    usage: 'total-recall new <name> [--with <plugins>]',
    effect: 'write'
  },
  plugin: {
    description: 'Plugin manager: list, install, search, info, vendor, and remove plugins.',
    usage: 'total-recall plugin [list|install|info|vendor|remove]',
    effect: 'write'
  },
  plugins: {
    description: 'List and inspect installed plugin namespaces.',
    usage: 'total-recall plugins',
    effect: 'read'
  },
  scaffold: {
    description: 'Scaffold a new Total Recall plugin or project layout.',
    usage: 'total-recall scaffold <name>',
    effect: 'write'
  },
  'scaffold-plugin': {
    description: 'Scaffold an official Total Recall plugin with standard structure.',
    usage: 'total-recall scaffold-plugin <name>',
    effect: 'write'
  }
};

/** Compute a deterministic content hash for a harvested CLI verb. */
export function hashVerb(verb) {
  const payload = `${verb.id}|${verb.verb}|${verb.description || ''}|${verb.usage || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Harvest all available CLI verbs across core, plugins, and composed scopes. */
export function harvestAllCliVerbs({ projectRoot = process.cwd(), skillsDir = null } = {}) {
  const verbs = [];
  const seenIds = new Set();

  // 1. Built-in core commands
  for (const name of Object.keys(CLI_COMMANDS)) {
    const meta = CORE_METADATA[name] || {
      description: `Built-in command ${name}.`,
      usage: `total-recall ${name} [options]`,
      effect: 'read'
    };
    const id = `core:${name}`;
    seenIds.add(id);
    verbs.push({
      id,
      name,
      verb: `total-recall ${name}`,
      category: 'core',
      namespace: null,
      description: meta.description,
      usage: meta.usage,
      effect: meta.effect
    });
  }

  // 2. Plugin operations
  try {
    const plugins = discoverPlugins(projectRoot);
    for (const plugin of plugins) {
      const manifest = plugin.manifest || {};
      const ns = manifest.cli?.command || manifest.id;
      if (!ns) continue;

      // Root namespace command
      const rootId = `plugin:${manifest.id}:root`;
      if (!seenIds.has(rootId)) {
        seenIds.add(rootId);
        verbs.push({
          id: rootId,
          name: ns,
          verb: `total-recall ${ns}`,
          category: 'plugin',
          namespace: ns,
          description: manifest.description || `${manifest.name || ns} plugin gateway.`,
          usage: `total-recall ${ns} [command] [options]`,
          effect: 'read'
        });
      }

      // Subcommands
      const subcommands = manifest.cli?.subcommands || [];
      for (const sub of subcommands) {
        if (!sub?.name) continue;
        const subId = `plugin:${manifest.id}:${sub.name}`;
        if (seenIds.has(subId)) continue;
        seenIds.add(subId);

        const argsStr = sub.args ? ` ${sub.args}` : '';
        verbs.push({
          id: subId,
          name: sub.name,
          verb: `total-recall ${ns} ${sub.name}`,
          category: 'plugin',
          namespace: ns,
          description: sub.description || `${manifest.name || ns} ${sub.name} operation.`,
          usage: `total-recall ${ns} ${sub.name}${argsStr}`,
          effect: sub.effect || 'read'
        });
      }
    }
  } catch (err) {
    logger.warn('cli-index', `Error discovering plugins during harvest: ${err.message}`);
  }

  // 3. Composed commands
  try {
    const dirs = commandScopeDirectories(projectRoot, globalAgentDir);
    const composed = listSurfaceCommands(dirs);
    for (const cmd of composed) {
      const id = `composed:${cmd.name}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      verbs.push({
        id,
        name: cmd.name,
        verb: `total-recall ${cmd.name}`,
        category: 'composed',
        namespace: null,
        description: cmd.description || `Dynamic composed command ${cmd.name}.`,
        usage: `total-recall ${cmd.name} [options]`,
        effect: cmd.risk === 'write' ? 'write' : 'read'
      });
    }
  } catch (err) {
    logger.warn('cli-index', `Error listing composed commands during harvest: ${err.message}`);
  }

  return verbs.map(v => ({
    ...v,
    hash: hashVerb(v)
  }));
}

/**
 * Load existing cli-semantic-index.json from candidate directories.
 */
export function loadCliSemanticIndex(derivedDir = null) {
  const candidateDirs = [];
  if (derivedDir) candidateDirs.push(derivedDir);
  candidateDirs.push(path.join(process.cwd(), '.agent', 'skills', 'total-recall', 'memory-derived'));
  candidateDirs.push(path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'memory-derived'));

  for (const dir of candidateDirs) {
    const filePath = path.join(dir, 'cli-semantic-index.json');
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      } catch {
        /* try next directory */
      }
    }
  }
  return null;
}

/**
 * Build or refresh the CLI semantic index.
 * Content-hash incremental: skips unchanged verbs.
 */
export async function buildCliSemanticIndex({
  derivedDir,
  skillsDir = null,
  projectRoot = process.cwd(),
  force = false,
  semantic = true
} = {}) {
  if (!derivedDir) {
    throw new Error('derivedDir is required to build CLI semantic index');
  }

  const harvested = harvestAllCliVerbs({ projectRoot, skillsDir });
  const existing = force ? null : loadCliSemanticIndex(derivedDir);
  const existingMap = new Map();

  if (existing?.verbs && Array.isArray(existing.verbs)) {
    for (const item of existing.verbs) {
      if (item.id && Array.isArray(item.embedding) && item.embedding.length === 768) {
        existingMap.set(item.id, item);
      }
    }
  }

  let builtCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const processedVerbs = [];

  const allowSemantic = semantic && process.env.TR_EMBEDDINGS_DISABLED !== '1';

  // Process with concurrency batching
  const BATCH_SIZE = 8;
  for (let i = 0; i < harvested.length; i += BATCH_SIZE) {
    const batch = harvested.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (verb) => {
      const prior = existingMap.get(verb.id);
      if (prior && prior.hash === verb.hash && !force) {
        processedVerbs.push({
          ...verb,
          embedding: prior.embedding
        });
        skippedCount++;
        return;
      }

      if (!allowSemantic) {
        processedVerbs.push({
          ...verb,
          embedding: null
        });
        skippedCount++;
        return;
      }

      try {
        const textToEmbed = `${verb.verb}: ${verb.description || ''} (usage: ${verb.usage || ''})`;
        const vec = await getEmbedding(textToEmbed);
        if (Array.isArray(vec) && vec.length === 768) {
          processedVerbs.push({
            ...verb,
            embedding: vec
          });
          builtCount++;
        } else {
          processedVerbs.push({
            ...verb,
            embedding: null
          });
          failedCount++;
        }
      } catch (err) {
        logger.warn('cli-index', `Failed embedding CLI verb ${verb.verb}: ${err.message}`);
        processedVerbs.push({
          ...verb,
          embedding: null
        });
        failedCount++;
      }
    }));
  }

  const indexPayload = {
    version: 1,
    generated_at: new Date().toISOString(),
    total_verbs: processedVerbs.length,
    stats: {
      built: builtCount,
      skipped: skippedCount,
      failed: failedCount
    },
    verbs: processedVerbs
  };

  const targetPath = path.join(derivedDir, 'cli-semantic-index.json');
  atomicWrite(targetPath, JSON.stringify(indexPayload, null, 2));

  return {
    total: processedVerbs.length,
    built: builtCount,
    skipped: skippedCount,
    failed: failedCount
  };
}

/**
 * Query the CLI semantic index using hybrid vector similarity and token overlap.
 */
export async function queryCliSemanticIndex(query, {
  derivedDir = null,
  projectRoot = process.cwd(),
  limit = 5,
  minScore = 0.2,
  category = null
} = {}) {
  const cleanQuery = String(query || '').trim().toLowerCase();
  const indexData = loadCliSemanticIndex(derivedDir);
  let verbs = indexData?.verbs;

  if (!verbs || !verbs.length) {
    verbs = harvestAllCliVerbs({ projectRoot });
  }

  if (category) {
    verbs = verbs.filter(v => v.category === category);
  }

  if (!cleanQuery) {
    return verbs.slice(0, limit).map(v => ({
      id: v.id,
      verb: v.verb,
      name: v.name,
      category: v.category,
      namespace: v.namespace,
      description: v.description,
      usage: v.usage,
      effect: v.effect,
      score: 1.0,
      vectorScore: null,
      textScore: 1.0
    }));
  }

  // Tokenize query terms
  const terms = cleanQuery.match(/[\p{L}\p{N}_-]+/gu) || [];

  // Generate query vector if available
  let queryVec = null;
  if (process.env.TR_EMBEDDINGS_DISABLED !== '1') {
    try {
      queryVec = await getEmbedding(cleanQuery);
      if (!Array.isArray(queryVec) || queryVec.length !== 768) {
        queryVec = null;
      }
    } catch {
      queryVec = null;
    }
  }

  const scored = [];

  for (const verb of verbs) {
    const verbText = verb.verb.toLowerCase();
    const nameText = (verb.name || '').toLowerCase();
    const nsText = (verb.namespace || '').toLowerCase();
    const descText = (verb.description || '').toLowerCase();
    const usageText = (verb.usage || '').toLowerCase();

    // Check exact matches
    const exactVerb = verbText === cleanQuery || `total-recall ${cleanQuery}` === verbText;
    const exactName = nameText === cleanQuery;
    const exactNamespace = nsText === cleanQuery;

    // Token overlap
    let termMatches = 0;
    for (const term of terms) {
      if (verbText.includes(term) || descText.includes(term) || usageText.includes(term)) {
        termMatches++;
      }
    }
    const overlapRatio = terms.length > 0 ? termMatches / terms.length : 0;

    let textScore = overlapRatio * 0.5;
    if (exactVerb) textScore += 0.8;
    else if (exactName) textScore += 0.6;
    else if (exactNamespace) textScore += 0.5;

    textScore = Math.min(1.0, textScore);

    // Vector cosine similarity
    let vecSim = 0;
    if (queryVec && Array.isArray(verb.embedding) && verb.embedding.length === 768) {
      vecSim = Math.max(0, cosineSimilarity(queryVec, verb.embedding));
    }

    // Hybrid combination: 0.65 vector + 0.35 keyword
    const hybridScore = queryVec ? (0.65 * vecSim + 0.35 * textScore) : textScore;

    if (hybridScore >= minScore) {
      scored.push({
        id: verb.id,
        verb: verb.verb,
        name: verb.name,
        category: verb.category,
        namespace: verb.namespace,
        description: verb.description,
        usage: verb.usage,
        effect: verb.effect,
        score: Number(hybridScore.toFixed(3)),
        vectorScore: queryVec ? Number(vecSim.toFixed(3)) : null,
        textScore: Number(textScore.toFixed(3))
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
