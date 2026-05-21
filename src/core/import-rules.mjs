/**
 * src/core/import-rules.mjs
 *
 * Detect and import existing agent rule files into the Total Recall vault.
 *
 * New users often have AGENTS.md, .cursorrules, CLAUDE.md, etc. already full
 * of their own rules. This module reads those files and writes each as a vault
 * memory node so 'compile' can re-emit them as part of the unified surface.
 *
 * Flow: detect → preview → confirm → writeNode → return results
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { writeNode, loadNodes } from './vault.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const VAULT_DIR = path.join(AGENT_DIR, 'memory-vault');

// ── Candidate rule files we look for ─────────────────────────────────────────
// Checked relative to the given directory (usually cwd or home).

const RULE_FILE_CANDIDATES = [
  { filename: 'AGENTS.md',        label: 'Generic agent rules',      ide: 'agents'    },
  { filename: 'AGENTS.override.md', label: 'Codex instructions override', ide: 'agents' },
  { filename: '.codex/AGENTS.md', label: 'Codex global rules',       ide: 'agents'    },
  { filename: '.codex/AGENTS.override.md', label: 'Codex global instructions override', ide: 'agents' },
  { filename: 'CLAUDE.md',        label: 'Claude Code rules',        ide: 'claude'    },
  { filename: '.claude/CLAUDE.md',label: 'Claude Code rules (alt)',  ide: 'claude'    },
  { filename: 'GEMINI.md',        label: 'Gemini CLI rules',         ide: 'gemini'    },
  { filename: '.gemini/GEMINI.md',label: 'Gemini global rules',       ide: 'gemini'    },
  { filename: '.gemini/system.md',label: 'Gemini system instructions', ide: 'gemini'  },
  { filename: 'system.md',        label: 'Project system instructions', ide: 'gemini' },
  { filename: '.cursorrules',     label: 'Cursor rules',             ide: 'cursor'    },
  { filename: '.clauderules',     label: 'Claude rules',             ide: 'claude'    },
  { filename: '.windsurfrules',   label: 'Windsurf rules',           ide: 'windsurf'  },
  { filename: '.aiderules',       label: 'Aider rules',              ide: 'aider'     },
  { filename: 'WINDSURF.md',      label: 'Windsurf rules (md)',      ide: 'windsurf'  },
  { filename: 'COPILOT.md',       label: 'GitHub Copilot rules',     ide: 'copilot'   },
  { filename: '.github/copilot-instructions.md', label: 'Copilot instructions', ide: 'copilot' },
  { filename: '.vscode/copilot-instructions.md', label: 'VS Code Copilot instructions', ide: 'copilot' },
  { filename: 'INSTRUCTIONS.md',  label: 'Custom instructions',      ide: 'generic'   },
  { filename: '.rules',           label: 'Generic rules',            ide: 'generic'   },
  { filename: 'RULES.md',         label: 'Generic rules (md)',       ide: 'generic'   },
];

// Candidates for directories containing modular rule/prompt files
const RULE_DIRECTORY_CANDIDATES = [
  { dirPath: '.claude/rules',     ext: '.md',  label: 'Claude modular rule',      ide: 'claude'   },
  { dirPath: '.cursor/rules',     ext: '.mdc', label: 'Cursor modular rule',       ide: 'cursor'   },
  { dirPath: '.agent/skills',     ext: '.md',  label: 'Antigravity/Gemini skill',  ide: 'gemini', recursive: true },
  { dirPath: '.vscode/prompts',   ext: '.md',  label: 'VS Code modular rule',     ide: 'copilot'  },
  { dirPath: '.windsurf/rules',   ext: '.md',  label: 'Windsurf modular rule',    ide: 'windsurf' },
  { dirPath: '.codex/rules',      ext: ['.md', '.rules'], label: 'Codex modular rule', ide: 'agents'   },
  { dirPath: '.github/instructions', ext: '.md', label: 'VS Code Copilot workspace instruction', ide: 'copilot' },
];

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Scan one or more directories for known rule files.
 * Returns a list of detected files with metadata (path, size, preview).
 *
 * @param {string[]} dirs  Directories to search (default: [cwd, homedir])
 * @returns {{ filename, label, ide, absolutePath, size, preview, alreadyImported }[]}
 */
export function detectRuleFiles(dirs) {
  const searchDirs = dirs?.length ? dirs : [process.cwd(), os.homedir()];
  const seen = new Set();
  const detected = [];

  // Load existing vault nodes to detect already-imported files
  let existingSlugs = new Set();
  try {
    existingSlugs = new Set(loadNodes(VAULT_DIR).map(n => n.slug));
  } catch { /* vault may not exist yet */ }

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    // 1. Check individual file candidates
    for (const candidate of RULE_FILE_CANDIDATES) {
      const absPath = path.resolve(dir, candidate.filename);
      if (seen.has(absPath)) continue;
      if (!fs.existsSync(absPath)) continue;
      seen.add(absPath);

      try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile() || stat.size === 0) continue;

        const content = fs.readFileSync(absPath, 'utf8').trim();
        if (!content || content.startsWith('# Generated at runtime by: npx total-recall compile')) continue;

        const slug = makeSlug(candidate.filename, absPath);
        detected.push({
          filename:        candidate.filename,
          label:           candidate.label,
          ide:             candidate.ide,
          absolutePath:    absPath,
          size:            stat.size,
          preview:         content.slice(0, 300),
          slug,
          alreadyImported: existingSlugs.has(slug),
        });
      } catch { /* unreadable */ }
    }

    // 2. Scan directories for modular rules
    for (const dirCandidate of RULE_DIRECTORY_CANDIDATES) {
      const absDirPath = path.resolve(dir, dirCandidate.dirPath);
      if (!fs.existsSync(absDirPath)) continue;

      try {
        const dirStat = fs.statSync(absDirPath);
        if (!dirStat.isDirectory()) continue;

        const scanDir = (currentPath) => {
          if (!fs.existsSync(currentPath)) return;
          const currentStat = fs.statSync(currentPath);
          if (!currentStat.isDirectory()) return;

          const entries = fs.readdirSync(currentPath);
          for (const entry of entries) {
            const entryPath = path.join(currentPath, entry);
            let entryStat;
            try {
              entryStat = fs.lstatSync(entryPath);
            } catch {
              continue; // Skip completely unreadable/broken entries
            }

            if (entryStat.isDirectory()) {
              if (dirCandidate.recursive) {
                scanDir(entryPath);
              }
              continue;
            }

            // Check extensions
            const extensions = Array.isArray(dirCandidate.ext) ? dirCandidate.ext : [dirCandidate.ext];
            const hasMatchingExt = extensions.some(ext => entry.endsWith(ext) || entry === 'SKILL.md');
            if (!hasMatchingExt) continue;

            if (seen.has(entryPath)) continue;
            seen.add(entryPath);

            try {
              let activePath = entryPath;
              let fileStat;
              try {
                fileStat = fs.statSync(entryPath);
              } catch (err) {
                if (entryStat.isSymbolicLink()) {
                  const target = fs.readlinkSync(entryPath);
                  const healedTarget = healSymlinkTarget(target);
                  if (fs.existsSync(healedTarget)) {
                    activePath = healedTarget;
                    fileStat = fs.statSync(healedTarget);
                  } else {
                    continue; // Skip broken symlink that couldn't be healed
                  }
                } else {
                  throw err;
                }
              }

              if (!fileStat.isFile() || fileStat.size === 0) continue;

              const content = fs.readFileSync(activePath, 'utf8').trim();
              if (!content || content.startsWith('# Generated at runtime by: npx total-recall compile')) continue;

              const relFilename = path.relative(dir, entryPath);
              const slug = makeSlug(relFilename, activePath);
              detected.push({
                filename:        relFilename,
                label:           `${dirCandidate.label} (${entry})`,
                ide:             dirCandidate.ide,
                absolutePath:    activePath,
                size:            fileStat.size,
                preview:         content.slice(0, 300),
                slug,
                alreadyImported: existingSlugs.has(slug),
              });
            } catch { /* skip this specific unreadable file, keep scanning others */ }
          }
        };

        scanDir(absDirPath);
      } catch { /* unreadable or unlisting directory */ }
    }
  }

  return detected;
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import a list of detected rule files into the vault as memory nodes.
 * Skips files already imported unless force=true.
 *
 * @param {object[]} files       Output of detectRuleFiles() (or a subset)
 * @param {{ force?: boolean, vaultDir?: string }} opts
 * @returns {{ imported: object[], skipped: object[], failed: object[] }}
 */
export function importRuleFiles(files, { force = false, vaultDir = VAULT_DIR } = {}) {
  const imported = [], skipped = [], failed = [];

  for (const file of files) {
    if (file.alreadyImported && !force) {
      skipped.push({ ...file, reason: 'already imported' });
      continue;
    }

    try {
      const content = fs.readFileSync(file.absolutePath, 'utf8').trim();
      if (!content) { skipped.push({ ...file, reason: 'empty' }); continue; }

      const node = {
        type:         'memory',
        slug:         file.slug,
        title:        `Imported rules: ${file.filename}`,
        category:     'instructions',
        status:       'active',
        confidence:   1.0,
        importance:   5,
        tags:         ['imported-rules', file.ide, path.basename(file.filename)],
        created:      new Date().toISOString(),
        updated:      new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        source: {
          type:          'import',
          file:          file.absolutePath,
          imported_at:   new Date().toISOString(),
        },
        body: content,
      };

      writeNode(node, vaultDir);
      imported.push({ slug: node.slug, title: node.title, file: file.absolutePath, size: file.size });
    } catch (err) {
      failed.push({ ...file, error: err.message });
    }
  }

  return { imported, skipped, failed };
}

/**
 * One-shot: detect + import. Returns full result summary.
 *
 * @param {{ dirs?: string[], force?: boolean, vaultDir?: string, dryRun?: boolean }} opts
 */
export function detectAndImport({ dirs, force = false, vaultDir = VAULT_DIR, dryRun = false } = {}) {
  const detected = detectRuleFiles(dirs);
  const toImport = detected.filter(f => !f.alreadyImported || force);

  if (dryRun) {
    return { detected, toImport, imported: [], skipped: detected.filter(f => f.alreadyImported && !force), failed: [], dryRun: true };
  }

  const { imported, skipped, failed } = importRuleFiles(toImport, { force, vaultDir });
  return { detected, imported, skipped, failed, dryRun: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSlug(filename, absPath) {
  const base = filename.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  // Include a short hash of the path so two files with the same name in different dirs don't collide
  const hash = crypto.createHash('sha1').update(absPath).digest('hex').slice(0, 6);
  return `imported-rules-${base}-${hash}`;
}

function healSymlinkTarget(target) {
  let healed = target.replace('/ultrachat/ultrachat-ai-powered/', '/ultrachat-ai-powered/');
  if (fs.existsSync(healed)) return healed;

  const skillMatch = healed.match(/\/(\.agents?)\/skills\/([^\/]+)\/(SKILL\.md)$/i);
  if (skillMatch) {
    const agentDirName = skillMatch[1];
    const skillName = skillMatch[2];
    const skillFile = skillMatch[3];
    
    const skillsDir = healed.substring(0, healed.indexOf(`/${agentDirName}/skills/`) + `/${agentDirName}/skills/`.length);
    if (fs.existsSync(skillsDir)) {
      try {
        const dirs = fs.readdirSync(skillsDir);
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetNorm = normalize(skillName);
        for (const d of dirs) {
          if (normalize(d) === targetNorm) {
            const possiblePath = path.join(skillsDir, d, skillFile);
            if (fs.existsSync(possiblePath)) {
              return possiblePath;
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return healed;
}
