import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { logger } from './logger.mjs';
import { addTask, resolveQueueDir } from './task-envelope.mjs';

const WATCHERS = new Map();

/**
 * Surface a conflict to the user.
 */
function surfaceConflict(brainDir, obsidianPath, vaultPath, message) {
  try {
    const queueDir = resolveQueueDir(brainDir);
    addTask(
      {
        intent: `Obsidian Sync Conflict: ${message}`,
        kind: 'system',
        priority: 'high',
        payload: { obsidianPath, vaultPath, conflict_message: message },
        origin: { agent: 'obsidian-sync' },
      },
      queueDir,
    );
    logger.warn({ subsystem: 'obsidian-sync', message: `Conflict task enqueued: ${message}` });
  } catch (err) {
    logger.error({ subsystem: 'obsidian-sync', message: `Failed to create conflict task: ${err.message}` });
  }
}

/**
 * Map Obsidian frontmatter to SSSS format.
 */
function mapObsidianToSSSS(obsidianYaml) {
  const mapped = { ...obsidianYaml };
  // aliases -> alternative_titles
  if (mapped.aliases) {
    mapped.alternative_titles = mapped.aliases;
    delete mapped.aliases;
  }
  // cssclasses -> tags
  if (mapped.cssclasses) {
    mapped.tags = mapped.tags || [];
    mapped.tags.push(...(Array.isArray(mapped.cssclasses) ? mapped.cssclasses : [mapped.cssclasses]));
    delete mapped.cssclasses;
  }
  return mapped;
}

/**
 * Map SSSS frontmatter to Obsidian format.
 */
function mapSSSSToObsidian(ssssYaml) {
  const mapped = { ...ssssYaml };
  // alternative_titles -> aliases
  if (mapped.alternative_titles) {
    mapped.aliases = mapped.alternative_titles;
    delete mapped.alternative_titles;
  }
  return mapped;
}

function processFrontmatter(content, mapper) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return content;
  
  try {
    const yaml = YAML.parse(match[1]) || {};
    const mapped = mapper(yaml);
    const newYaml = YAML.stringify(mapped).trim();
    return `---\n${newYaml}\n---\n${match[2]}`;
  } catch {
    return content;
  }
}

/**
 * Sync a single file from Obsidian to SSSS Vault.
 */
export function syncObsidianToVault(obsidianFile, vaultFile, brainDir) {
  try {
    const content = fs.readFileSync(obsidianFile, 'utf8');
    const ssssContent = processFrontmatter(content, mapObsidianToSSSS);
    
    // Check conflict
    if (fs.existsSync(vaultFile)) {
      const vStat = fs.statSync(vaultFile);
      const oStat = fs.statSync(obsidianFile);
      // If vault file is newer than the last sync, conflict
      if (vStat.mtimeMs > oStat.mtimeMs) {
        surfaceConflict(brainDir, obsidianFile, vaultFile, `Vault file modified more recently than Obsidian: ${vaultFile}`);
        return;
      }
    }
    
    fs.mkdirSync(path.dirname(vaultFile), { recursive: true });
    fs.writeFileSync(vaultFile, ssssContent, 'utf8');
    logger.info({ subsystem: 'obsidian-sync', message: `Synced to vault: ${vaultFile}` });
  } catch (err) {
    logger.error({ subsystem: 'obsidian-sync', message: `Sync to vault failed for ${obsidianFile}: ${err.message}` });
  }
}

/**
 * Register a watcher for the Obsidian directory.
 */
export function watchObsidianDirectory(obsidianDir, vaultDir, brainDir) {
  if (!fs.existsSync(obsidianDir)) {
    throw new Error(`Obsidian directory not found: ${obsidianDir}`);
  }
  
  if (WATCHERS.has(obsidianDir)) {
    return; // Already watching
  }
  
  const watcher = fs.watch(obsidianDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return;
    
    const obsidianFile = path.join(obsidianDir, filename);
    const vaultFile = path.join(vaultDir, filename);
    
    if (fs.existsSync(obsidianFile)) {
      syncObsidianToVault(obsidianFile, vaultFile, brainDir);
    }
  });
  
  WATCHERS.set(obsidianDir, watcher);
  logger.info({ subsystem: 'obsidian-sync', message: `Started bidirectional watch on ${obsidianDir}` });
}
