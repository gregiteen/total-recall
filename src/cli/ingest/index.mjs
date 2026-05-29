/**
 * Google Takeout Ingestion — CLI entry point
 *
 * Orchestrates the ingestion of Google Takeout export data into the
 * Total Recall memory vault. Walks the Takeout directory, detects
 * available data types, runs parsers, deduplicates, and writes nodes.
 *
 * Usage:
 *   npx total-recall ingest google-takeout <path> [options]
 *
 * Options:
 *   --dry-run              Preview what would be ingested without writing
 *   --types <comma-list>   Only process specified data types
 *   --brain <id>           Target brain ID (default: auto-detect)
 *   --max-age <duration>   Only include entries newer than duration (e.g. 90d, 1y)
 *   --help, -h             Show help
 */

import fs from 'node:fs';
import path from 'node:path';
import { walkTakeoutDir } from './utils/takeout-walker.mjs';
import { dedup } from './utils/dedup.mjs';
import { parseSearchHistory } from './parsers/search-history.mjs';
import { parseChromeBookmarks } from './parsers/chrome-bookmarks.mjs';
import { parseGoogleKeep } from './parsers/google-keep.mjs';
import { parseYoutubeHistory } from './parsers/youtube-history.mjs';
import { writeNode, loadNodes } from '../../core/vault.mjs';
import { resolveBrainDir, parseLayerFlag, getBothBrains, defaultLayerForCategory } from '../../cli/agent-dir.mjs';

/**
 * Parser registry: maps data type names to their directory detection
 * signatures and parser functions.
 */
const PARSERS = {
  'search-history':   { detect: 'My Activity/Search',                   parser: parseSearchHistory },
  'chrome-bookmarks': { detect: 'Chrome/Bookmarks',                     parser: parseChromeBookmarks },
  'google-keep':      { detect: 'Keep',                                 parser: parseGoogleKeep },
  'youtube-history':  { detect: 'YouTube and YouTube Music/history',     parser: parseYoutubeHistory },
};

/**
 * Parse a human-readable duration string into a Date threshold.
 * Supports: 30d, 90d, 1y, 6m, etc.
 *
 * @param {string} duration
 * @returns {Date}
 */
function parseDuration(duration) {
  const match = duration.match(/^(\d+)\s*(d|m|y|w)$/i);
  if (!match) throw new Error(`Invalid duration format: "${duration}". Use e.g. 30d, 6m, 1y`);

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'd': now.setDate(now.getDate() - value); break;
    case 'w': now.setDate(now.getDate() - (value * 7)); break;
    case 'm': now.setMonth(now.getMonth() - value); break;
    case 'y': now.setFullYear(now.getFullYear() - value); break;
  }

  return now;
}

/**
 * Parse CLI arguments for the google-takeout ingest command.
 *
 * @param {string[]} args — CLI arguments after 'ingest google-takeout'.
 * @returns {{ takeoutPath: string|null, dryRun: boolean, types: string[]|null, brain: string|null, maxAge: Date|null, help: boolean, layer: string }}
 */
function parseArgs(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const opts = { takeoutPath: null, dryRun: false, types: null, brain: null, maxAge: null, help: false, layer };

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    const val = remainingArgs[i + 1];

    switch (arg) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--types':
        if (val) { opts.types = val.split(',').map(t => t.trim()); i++; }
        break;
      case '--brain':
        if (val) { opts.brain = val; i++; }
        break;
      case '--max-age':
        if (val) { opts.maxAge = parseDuration(val); i++; }
        break;
      case '--help': case '-h':
        opts.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !opts.takeoutPath) {
          opts.takeoutPath = arg;
        }
        break;
    }
  }

  return opts;
}

/**
 * Print help text for the google-takeout ingest command.
 */
function printHelp() {
  console.log(`
  total-recall ingest google-takeout — Ingest Google Takeout data

  Walks a Google Takeout export directory, detects available data types,
  parses them into SSSS memory nodes, deduplicates against the existing
  vault, and writes new nodes.

  Usage: total-recall ingest google-takeout <path> [options]

  Supported data types:
    search-history      Google Search history (My Activity/Search/)
    chrome-bookmarks    Chrome bookmarks (Chrome/Bookmarks.html or .json)
    google-keep         Google Keep notes (Keep/*.json)
    youtube-history     YouTube watch history (YouTube and YouTube Music/history/)

  Options:
    --dry-run              Preview what would be ingested without writing
    --types <comma-list>   Only process specified types (e.g. "search-history,google-keep")
    --brain <id>           Target brain ID
    --max-age <duration>   Only include entries newer than duration (30d, 6m, 1y)
    --global               Write to global brain
    --project              Write to project brain
    --help, -h             Show this help

  Examples:
    npx total-recall ingest google-takeout ~/Downloads/Takeout
    npx total-recall ingest google-takeout ~/Downloads/Takeout --dry-run
    npx total-recall ingest google-takeout ~/Downloads/Takeout --types search-history,google-keep
    npx total-recall ingest google-takeout ~/Downloads/Takeout --max-age 90d
`);
}

/**
 * Main ingestion function for Google Takeout data.
 *
 * @param {string} takeoutPath — Path to the Takeout export directory.
 * @param {object} options
 * @param {boolean} [options.dryRun=false] — Preview mode; don't write nodes.
 * @param {string[]|null} [options.types=null] — Filter to specific data types.
 * @param {string|null} [options.brain=null] — Target brain ID.
 * @param {Date|null} [options.maxAge=null] — Only include entries newer than this.
 * @param {string} [options.layer='auto'] — Brain layer target.
 * @returns {Promise<{ detected: number, parsed: number, deduplicated: number, written: number, stats: object }>}
 */
export async function ingestGoogleTakeout(takeoutPath, options = {}) {
  const { dryRun = false, types = null, maxAge = null, layer = 'auto' } = options;

  // Validate path exists
  const resolvedPath = path.resolve(takeoutPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Takeout directory not found: ${resolvedPath}`);
  }

  // Resolve brain target
  let effectiveLayer = layer;
  if (effectiveLayer === 'auto') {
    effectiveLayer = defaultLayerForCategory('facts');
    const project = getBothBrains().project;
    if (effectiveLayer === 'project' && !project) {
      effectiveLayer = 'global';
    }
  }

  const brainDir = resolveBrainDir(effectiveLayer);
  const vaultDir = path.join(brainDir, 'memory-vault');

  // Walk directory to detect available data types
  console.error('\n  🔍 Scanning Takeout directory...\n');
  const detected = walkTakeoutDir(resolvedPath);

  if (detected.length === 0) {
    console.error('  ⚠️  No recognized Takeout data types found.\n');
    return { detected: 0, parsed: 0, deduplicated: 0, written: 0, stats: {} };
  }

  // Filter by requested types
  const toProcess = types
    ? detected.filter(d => types.includes(d.type))
    : detected;

  if (toProcess.length === 0) {
    console.error('  ⚠️  No matching data types found for the specified filter.\n');
    return { detected: detected.length, parsed: 0, deduplicated: 0, written: 0, stats: {} };
  }

  console.error(`  📦 Detected ${detected.length} data type(s):`);
  for (const d of detected) {
    const included = toProcess.some(t => t.type === d.type);
    const icon = included ? '🟢' : '⚪';
    console.error(`     ${icon} ${d.type} → ${d.path}`);
  }
  console.error('');

  // Load existing vault nodes for dedup
  let existingNodes = [];
  if (fs.existsSync(vaultDir)) {
    existingNodes = loadNodes(vaultDir);
  }

  // Run parsers for each detected type
  const stats = {};
  let allNewNodes = [];

  for (const source of toProcess) {
    const parserEntry = PARSERS[source.type];
    if (!parserEntry) {
      stats[source.type] = { parsed: 0, error: 'No parser available' };
      continue;
    }

    console.error(`  ⏳ Parsing ${source.type}...`);
    try {
      const parserOpts = maxAge ? { maxAge } : {};
      const nodes = parserEntry.parser(source.path, parserOpts);
      stats[source.type] = { parsed: nodes.length };
      allNewNodes.push(...nodes);
      console.error(`     ✅ ${nodes.length} entries parsed`);
    } catch (err) {
      stats[source.type] = { parsed: 0, error: err.message };
      console.error(`     ❌ Error: ${err.message}`);
    }
  }

  // Dedup against existing vault
  console.error('\n  🔄 Deduplicating against existing vault...');
  const { unique, duplicateCount } = dedup(allNewNodes, existingNodes);
  console.error(`     Found ${duplicateCount} duplicate(s), ${unique.length} new node(s)\n`);

  // Write nodes
  let written = 0;
  if (dryRun) {
    console.error('  🏷️  DRY RUN — No nodes written.\n');
  } else {
    // Ensure vault directory exists
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    for (const node of unique) {
      try {
        writeNode(node, vaultDir);
        written++;
      } catch (err) {
        console.error(`  ⚠️  Failed to write ${node.slug}: ${err.message}`);
      }
    }
    console.error(`  ✅ Wrote ${written} node(s) to vault\n`);
  }

  // Print summary report
  const layerLabel = effectiveLayer === 'project' ? '[project]' : '[global]';
  console.error('  ═══════════════════════════════════════');
  console.error('  📊 Ingestion Summary');
  console.error('  ═══════════════════════════════════════');
  console.error(`  Brain:        ${layerLabel} ${brainDir}`);
  console.error(`  Detected:     ${detected.length} data type(s)`);
  console.error(`  Processed:    ${toProcess.length} data type(s)`);
  console.error(`  Parsed:       ${allNewNodes.length} total entries`);
  console.error(`  Duplicates:   ${duplicateCount}`);
  console.error(`  Written:      ${dryRun ? `${unique.length} (dry run)` : written}`);
  console.error('  ───────────────────────────────────────');
  for (const [type, info] of Object.entries(stats)) {
    const status = info.error ? `❌ ${info.error}` : `${info.parsed} entries`;
    console.error(`  ${type}: ${status}`);
  }
  console.error('  ═══════════════════════════════════════\n');

  return {
    detected: detected.length,
    parsed: allNewNodes.length,
    deduplicated: duplicateCount,
    written: dryRun ? 0 : written,
    stats,
  };
}

/**
 * CLI handler for `npx total-recall ingest google-takeout <path>`.
 *
 * @param {string[]} args — CLI arguments after 'ingest google-takeout'.
 */
export async function runGoogleTakeout(args) {
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    return;
  }

  if (!opts.takeoutPath) {
    console.error('  ❌ Error: No Takeout directory path specified.\n');
    printHelp();
    process.exit(1);
  }

  try {
    await ingestGoogleTakeout(opts.takeoutPath, {
      dryRun: opts.dryRun,
      types: opts.types,
      brain: opts.brain,
      maxAge: opts.maxAge,
      layer: opts.layer,
    });
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}
